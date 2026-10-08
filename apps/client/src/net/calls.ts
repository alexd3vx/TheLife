import { useSyncExternalStore } from "react";
import type { ServerMessage } from "@thelife/shared";
import { world } from "./world";

// Voice calls between players. The game server only introduces the two phones (it passes the "ring", "answer" and connection details
// between them, and bills the caller's airtime); the voice itself goes straight from phone to phone over WebRTC. Free public STUN
// servers help the phones find each other; there is no relay, so on a few strict mobile networks a call cannot connect, and then it says so.

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const RING_SECONDS = 40;
const CONNECT_SECONDS = 20;

export type CallPhase = "idle" | "calling" | "incoming" | "connecting" | "active" | "ended";

interface Data {
  k?: string;
  call?: string;
  why?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const newCallId = (): string => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join("");

class Calls {
  phase: CallPhase = "idle";
  callId = "";
  peerUid = "";
  peerName = "";
  /** The other phone's connection id on the server (where answers are sent). */
  private peerSession = "";
  muted = false;
  seconds = 0;
  /** Why the last call ended, shown for a moment. */
  why = "";
  version = 0;
  private incomingIsMine = false;
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private tick: number | null = null;
  private connectTimer: number | null = null;
  private ringTimer: number | null = null;
  private ringStop: (() => void) | null = null;
  private started = false;
  private readonly listeners = new Set<() => void>();

  start(): void {
    if (this.started) return;
    this.started = true;
    world.onMessage((m) => void this.on(m));
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private changed(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get busy(): boolean {
    return this.phase !== "idle" && this.phase !== "ended";
  }

  /** Rings another player (by their player ID). Needs the microphone, so it is called from a tap. */
  async call(uid: string, name: string): Promise<string | null> {
    if (this.busy) return "You are already on a call.";
    if (world.status !== "online") return "You are not connected to the game right now.";
    const mic = await this.openMic();
    if (typeof mic === "string") return mic;
    this.reset();
    this.stream = mic;
    this.callId = newCallId();
    this.peerUid = uid;
    this.peerName = name;
    this.incomingIsMine = true;
    this.phase = "calling";
    this.why = "";
    world.send({ t: "rtc", to: uid, data: { k: "invite", call: this.callId } });
    this.ringTimer = window.setTimeout(() => this.finish("No answer."), (RING_SECONDS + 2) * 1000);
    this.ringStop = ringTone("out");
    this.changed();
    return null;
  }

  /** Picks up an incoming call. */
  async answer(): Promise<void> {
    if (this.phase !== "incoming") return;
    const mic = await this.openMic();
    if (typeof mic === "string") {
      this.send("decline");
      this.finish(mic);
      return;
    }
    if (this.phase !== "incoming") {
      mic.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stopRing();
    this.stream = mic;
    this.phase = "connecting";
    this.makePeer();
    this.send("accept");
    this.armConnect();
    this.changed();
  }

  decline(): void {
    if (this.phase === "incoming") {
      this.send("decline");
      this.finish("");
    }
  }

  hangUp(): void {
    if (this.phase === "calling") this.send("cancel");
    else if (this.phase === "connecting" || this.phase === "active") this.send("end");
    else if (this.phase === "incoming") return this.decline();
    this.finish("");
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
    this.changed();
  }

  /** How many bytes of the other person's voice have arrived (for tests and the connection check). */
  async receivedBytes(): Promise<number> {
    if (!this.pc) return 0;
    let n = 0;
    (await this.pc.getStats()).forEach((r) => {
      if (r.type === "inbound-rtp" && r.kind === "audio") n += r.bytesReceived ?? 0;
    });
    return n;
  }

  /** Clears the "call ended" notice. */
  dismiss(): void {
    if (this.phase === "ended") {
      this.phase = "idle";
      this.changed();
    }
  }

  // ------------------------------------------------------------------ the line

  private send(k: string, extra: Record<string, unknown> = {}): void {
    world.send({ t: "rtc", to: this.peerSession || this.peerUid, data: { k, call: this.callId, ...extra } });
  }

  private async on(m: ServerMessage): Promise<void> {
    if (m.t !== "rtc") return;
    const d = (m.data ?? {}) as Data;
    if (d.k === "invite") {
      if (this.busy || !d.call) {
        world.send({ t: "rtc", to: m.from, data: { k: "decline", call: d.call ?? "" } });
        return;
      }
      this.reset();
      this.callId = d.call;
      this.peerSession = m.from;
      this.peerUid = m.fromUid ?? "";
      this.peerName = m.name ?? "Someone";
      this.incomingIsMine = false;
      this.phase = "incoming";
      this.why = "";
      this.ringStop = ringTone("in");
      this.ringTimer = window.setTimeout(() => this.phase === "incoming" && this.finish("Missed call."), RING_SECONDS * 1000);
      this.changed();
      return;
    }
    if (d.call !== this.callId || this.phase === "idle") return;
    if (m.from !== "server") this.peerSession = m.from;
    switch (d.k) {
      case "accept":
        if (this.phase !== "calling") return;
        this.stopRing();
        this.phase = "connecting";
        this.makePeer();
        this.armConnect();
        this.changed();
        {
          const offer = await this.pc!.createOffer();
          await this.pc!.setLocalDescription(offer);
          this.send("offer", { sdp: { type: offer.type, sdp: offer.sdp } });
        }
        return;
      case "offer":
        if (!this.pc || !d.sdp) return;
        await this.pc.setRemoteDescription(d.sdp);
        await this.drainIce();
        {
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.send("answer", { sdp: { type: answer.type, sdp: answer.sdp } });
        }
        return;
      case "answer":
        if (!this.pc || !d.sdp) return;
        await this.pc.setRemoteDescription(d.sdp);
        await this.drainIce();
        return;
      case "ice":
        if (!d.candidate) return;
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(d.candidate).catch(() => undefined);
        else this.pendingIce.push(d.candidate);
        return;
      case "end":
        this.finish(d.why ?? "The call ended.");
        return;
      default:
    }
  }

  private async drainIce(): Promise<void> {
    const list = this.pendingIce.splice(0);
    for (const c of list) await this.pc?.addIceCandidate(c).catch(() => undefined);
  }

  private makePeer(): void {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    for (const track of this.stream?.getTracks() ?? []) pc.addTrack(track, this.stream!);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send("ice", { candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (!this.audio) {
        this.audio = document.createElement("audio");
        this.audio.autoplay = true;
        this.audio.setAttribute("playsinline", "");
        document.body.appendChild(this.audio);
      }
      this.audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void this.audio.play().catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === "connected" && this.phase === "connecting") {
        if (this.connectTimer) window.clearTimeout(this.connectTimer);
        this.connectTimer = null;
        this.phase = "active";
        this.seconds = 0;
        this.tick = window.setInterval(() => {
          this.seconds++;
          this.changed();
        }, 1000);
        this.changed();
      } else if ((pc.connectionState === "failed" || pc.connectionState === "closed") && this.busy) {
        this.send("end");
        this.finish("The line dropped.");
      }
    };
  }

  private armConnect(): void {
    this.connectTimer = window.setTimeout(() => {
      if (this.phase === "connecting") {
        this.send("end");
        this.finish("Couldn't connect the voice. Your network may block direct calls.");
      }
    }, CONNECT_SECONDS * 1000);
  }

  private async openMic(): Promise<MediaStream | string> {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") return "This browser can't make voice calls.";
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch {
      return "Allow the microphone to make or take calls.";
    }
  }

  private stopRing(): void {
    this.ringStop?.();
    this.ringStop = null;
    if (this.ringTimer) window.clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  private reset(): void {
    this.stopRing();
    if (this.tick) window.clearInterval(this.tick);
    if (this.connectTimer) window.clearTimeout(this.connectTimer);
    this.tick = this.connectTimer = null;
    this.pc?.close();
    this.pc = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.audio) {
      this.audio.srcObject = null;
      this.audio.remove();
      this.audio = null;
    }
    this.pendingIce = [];
    this.muted = false;
    this.seconds = 0;
    this.peerSession = "";
  }

  /** Ends the call on this phone, and shows why for a moment. */
  private finish(why: string): void {
    const had = this.phase !== "idle";
    this.reset();
    this.callId = "";
    if (!had) return;
    this.why = why;
    this.phase = why ? "ended" : "idle";
    this.changed();
    if (why) window.setTimeout(() => this.dismiss(), 3500);
  }
}

export const calls = new Calls();
if (import.meta.env.DEV) (window as unknown as { __calls: Calls }).__calls = calls;

export function useCalls(): Calls {
  calls.start();
  useSyncExternalStore(calls.subscribe, () => calls.version);
  return calls;
}

/** A ringing sound made with the audio chip (no sound file): the double ring of an incoming call, or the slower tone of calling out. Returns a stop function. */
function ringTone(kind: "in" | "out"): () => void {
  let stopped = false;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    return () => undefined;
  }
  const c = ctx;
  const beep = (at: number, freq: number, len: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(kind === "in" ? 0.18 : 0.1, at + 0.02);
    g.gain.setValueAtTime(kind === "in" ? 0.18 : 0.1, at + len - 0.03);
    g.gain.linearRampToValueAtTime(0, at + len);
    o.connect(g).connect(c.destination);
    o.start(at);
    o.stop(at + len + 0.02);
  };
  const cycle = () => {
    if (stopped) return;
    const t = c.currentTime + 0.05;
    if (kind === "in") {
      for (const off of [0, 0.5]) {
        beep(t + off, 880, 0.3);
        beep(t + off, 660, 0.3);
      }
      navigator.vibrate?.([300, 150, 300]);
    } else {
      beep(t, 440, 1);
      beep(t, 480, 1);
    }
  };
  void c.resume().catch(() => undefined);
  cycle();
  const timer = window.setInterval(cycle, kind === "in" ? 2500 : 3500);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    void c.close().catch(() => undefined);
  };
}
