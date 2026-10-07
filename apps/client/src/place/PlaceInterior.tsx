import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import { counterOpen, serviceOn, shopOpen, type Faith, type Landmark } from "@thelife/game-core";
import { input } from "../controls/input";
import TouchControls, { useTouchControlsVisible } from "../controls/TouchControls";
import { Avatar } from "../lab/avatar";
import { loadSavedLook, parseLook } from "../lab/looks";
import { loadManifest } from "../lab/manifest";
import { randomNpcLook } from "../lab/npcLooks";
import { bubbleSprite } from "../map/remotePlayers";
import type { GameSession } from "../play/gameSession";
import { GameIcon } from "../ui/icons";
import BankPanel from "./BankPanel";
import HospitalPanel from "./HospitalPanel";
import PolicePanel from "./PolicePanel";
import ShopPanel from "./ShopPanel";
import WorshipPanel from "./WorshipPanel";
import { buildBankRoom } from "./bankScene";
import { buildHospitalRoom } from "./hospitalScene";
import { ChargeButton, type Outcome } from "./panel";
import { buildPoliceRoom } from "./policeScene";
import type { PlaceRoom, Spot } from "./roomKit";
import { buildShopRoom } from "./shopScene";
import { Visitor, Walker } from "./walker";
import { buildWorshipRoom } from "./worshipScene";
import "./place.css";

/** The kinds of place with an inside you can walk into. */
export const INSIDE_KINDS = ["bank", "hospital", "market", "fuel", "police", "church", "mosque"];

/**
 * Inside a place you walked into: a 3D room you move around in (stick, arrow keys or WASD), with staff at their counters and other
 * people wandering about. Stand at a counter, a machine, an altar or a socket and a button appears; tap it (or press E) and that
 * place's menu opens over the room. `place.kind` picks the room and the menu. Walk back through the doorway, or tap Leave, to go out.
 */
export default function PlaceInterior({ place, session, onClose }: { place: Landmark; session: GameSession; onClose(): void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const staffRef = useRef<{ say(text: string): void } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [near, setNear] = useState<Spot | null>(null);
  const [open, setOpen] = useState<Spot | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [, bump] = useState(0);
  const nearRef = useRef<Spot | null>(null);
  const openRef = useRef<Spot | null>(null);
  const leavingRef = useRef(false);
  const walkerRef = useRef<Walker | null>(null);
  const touchOn = useTouchControlsVisible();
  const state = session.sim.state;
  const scale = session.sim.traits.groceries ?? 1;
  const kind = place.kind;
  const faith: Faith | null = kind === "church" || kind === "mosque" ? kind : null;
  const shopKind = kind === "market" || kind === "fuel" ? kind : null;
  openRef.current = open;

  const leave = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(onClose, 240);
  };
  const openSpot = (s: Spot) => {
    if (openRef.current || leavingRef.current) return;
    walkerRef.current?.face(s.face);
    setNote(null);
    setOpen(s);
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let gone = false;
    let raf = 0;
    const cleanups: (() => void)[] = [];
    (async () => {
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
      box.appendChild(renderer.domElement);
      cleanups.push(() => {
        renderer.dispose();
        renderer.domElement.remove();
      });
      const busy = faith ? serviceOn(state, faith).on : false;
      const room: PlaceRoom = faith ? buildWorshipRoom(place.name, faith, busy) : kind === "hospital" ? buildHospitalRoom(place.name) : kind === "police" ? buildPoliceRoom(place.name) : shopKind ? buildShopRoom(place.name, shopKind) : buildBankRoom(place.name);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(faith ? "#e8dfcb" : kind === "hospital" ? "#d6eef0" : kind === "police" ? "#d3dbe9" : kind === "market" ? "#f1e3c6" : "#cfe0fa");
      scene.add(room.group);
      scene.add(new THREE.HemisphereLight("#f3f6ff", "#9aa8c4", 1.15));
      const sun = new THREE.DirectionalLight("#ffffff", 2.0);
      sun.position.set(3, 7, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, near: 0.5, far: 24 });
      scene.add(sun);

      // a ring on the floor at every place you can stand to use something
      const rings: { mesh: THREE.Mesh; spot: Spot }[] = [];
      for (const spot of room.spots) {
        const mesh = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 36), new THREE.MeshBasicMaterial({ color: "#5b9bff", transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(spot.x, 0.03, spot.z);
        scene.add(mesh);
        rings.push({ mesh, spot });
      }
      // the pavement outside the doorway, so the bottom of the screen is not empty
      const pave = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: faith ? "#b8ad98" : "#aeb7c6", roughness: 0.95 }));
      pave.rotation.x = -Math.PI / 2;
      pave.position.set(0, -0.01, room.bounds.maxZ + 15.4);
      pave.receiveShadow = true;
      scene.add(pave);
      // the doorway mat
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(room.door.maxX - room.door.minX, 0.9), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false }));
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(0, 0.02, room.bounds.maxZ - 0.25);
      scene.add(mat);

      const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
      const fit = () => {
        const w = box.clientWidth, h = box.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.fov = camera.aspect < 0.8 ? 58 : 44;
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(box);
      cleanups.push(() => ro.disconnect());

      const manifest = await loadManifest();
      const look = state.look ? parseLook(state.look) : loadSavedLook();
      const me = new Avatar(manifest, look);
      const staff = room.staff.map(() => new Avatar(manifest, randomNpcLook()));
      const crowd = Array.from({ length: room.visitors }, () => new Avatar(manifest, randomNpcLook()));
      await Promise.all([me.load(), ...staff.map((a) => a.load()), ...crowd.map((a) => a.load())]);
      if (gone) return;
      scene.add(me.root);
      const walker = new Walker(me, room);
      walkerRef.current = walker;
      if (import.meta.env.DEV) (window as unknown as { __place: unknown }).__place = { walker, room };
      room.staff.forEach((spec, i) => {
        const a = staff[i]!;
        a.root.position.set(spec.x, spec.y ?? 0, spec.z);
        a.root.rotation.y = spec.yaw;
        a.play(spec.clip, 0);
        scene.add(a.root);
      });
      const visitors = crowd.map((a, i) => {
        const start = room.waypoints[(i * 2) % room.waypoints.length]!;
        scene.add(a.root);
        a.play("Idle_Loop", 0);
        return new Visitor(a, room, [start[0] + (i % 2 ? 0.25 : -0.25), start[1]]);
      });

      let bubble: { sprite: THREE.Sprite; until: number } | null = null;
      const talker = staff[0]!;
      const say = (text: string) => {
        if (bubble) {
          talker.root.remove(bubble.sprite);
          bubble.sprite.material.map?.dispose();
          bubble.sprite.material.dispose();
        }
        const sprite = bubbleSprite(text);
        sprite.position.y = 2.15;
        talker.root.add(sprite);
        bubble = { sprite, until: performance.now() / 1000 + 4 + Math.min(5, text.length * 0.05) };
      };
      staffRef.current = { say };
      let greeted = false;

      const camTarget = new THREE.Vector3();
      const camPos = new THREE.Vector3();
      const want = new THREE.Vector3();
      const follow = (dt: number, snap: boolean) => {
        const b = room.bounds;
        camTarget.set(THREE.MathUtils.clamp(walker.pos.x * 0.6, -2.4, 2.4), 0.5, THREE.MathUtils.clamp(walker.pos.z - 1.2, b.minZ + 1.5, b.maxZ - 2.5));
        const portrait = camera.aspect < 0.8;
        want.set(camTarget.x, portrait ? 5.4 : 4.3, camTarget.z + (portrait ? 8.6 : 6.4));
        if (snap) camPos.copy(want);
        else camPos.lerp(want, 1 - Math.exp(-5 * dt));
        camera.position.copy(camPos);
        camera.lookAt(camTarget);
      };
      follow(0, true);

      const clock = new THREE.Clock();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, clock.getDelta());
        const frozen = !!openRef.current || leavingRef.current;
        walker.update(dt, frozen ? { x: 0, y: 0, m: 0 } : input.move(), !frozen && input.running());
        me.update(dt);
        for (const a of staff) a.update(dt);
        for (const v of visitors) {
          v.update(dt);
          v.avatar.update(dt);
        }
        const sp = frozen ? nearRef.current : walker.spot();
        if ((sp?.id ?? null) !== (nearRef.current?.id ?? null)) {
          nearRef.current = sp;
          setNear(sp);
          if (sp && !greeted && sp.id !== "socket") {
            greeted = true;
            say(room.staff[0]!.greeting);
          }
        }
        const t = performance.now() / 1000;
        for (const r of rings) {
          const on = nearRef.current?.id === r.spot.id;
          (r.mesh.material as THREE.MeshBasicMaterial).opacity = on ? 0.9 : 0.35 + 0.2 * Math.sin(t * 2.4 + r.spot.x);
          r.mesh.scale.setScalar(on ? 1.25 + 0.08 * Math.sin(t * 5) : 1);
        }
        if (bubble && t > bubble.until) {
          talker.root.remove(bubble.sprite);
          bubble = null;
        }
        if (!leavingRef.current && walker.atDoor()) leave();
        follow(dt, false);
        renderer.render(scene, camera);
      };
      loop();
      setReady(true);
      cleanups.push(() => {
        me.dispose();
        for (const a of staff) a.dispose();
        for (const a of crowd) a.dispose();
      });
    })().catch((e) => !gone && setError(e instanceof Error ? e.message : String(e)));

    const offPress = input.onPress((a) => {
      if (a === "interact" && nearRef.current && !openRef.current) openSpot(nearRef.current);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (openRef.current) setOpen(null);
        else leave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      staffRef.current = null;
      walkerRef.current = null;
      offPress();
      window.removeEventListener("keydown", onKey);
      for (const c of cleanups) c();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (fn: () => Outcome) => {
    const r = fn();
    const text = r.ok ? (r.text ?? "Done.") : (r.reason ?? "That didn't work.");
    setNote({ ok: r.ok, text });
    const thanks = kind === "hospital" ? "There you go. Take care." : kind === "police" ? "Noted. Stay safe." : shopKind ? "Thank you! Anything else?" : faith ? "God bless you." : "Done. Anything else?";
    staffRef.current?.say(r.ok ? thanks : text.length < 70 ? text : "Sorry, I can't do that.");
    session.notice(text);
    bump((n) => n + 1);
  };

  const hours = kind === "bank" ? counterOpen(state) : shopKind ? shopOpen(state, shopKind) : null;
  const sv = faith ? serviceOn(state, faith) : null;
  const headline = sv ? (sv.on ? "Service is on" : `Service ${sv.text}`) : hours ? (hours.open ? (kind === "bank" ? "Counter open" : "Open now") : `Closed · ${hours.text}`) : "Open all day and night";
  const headlineOpen = sv ? sv.on : hours ? hours.open : true;

  const panelProps = { state, run, note, scale, focus: open?.focus };
  const panel = !open ? null : open.focus === "charge" ? (
    <>
      <ChargeButton state={state} run={run} />
      {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
    </>
  ) : faith ? <WorshipPanel faith={faith} {...panelProps} />
    : kind === "hospital" ? <HospitalPanel {...panelProps} />
    : kind === "police" ? <PolicePanel {...panelProps} />
    : shopKind ? <ShopPanel kind={shopKind} {...panelProps} />
    : <BankPanel {...panelProps} />;

  return (
    <div className={`place${leaving ? " is-leaving" : ""}${open ? " has-sheet" : ""}`} role="dialog" aria-label={place.name}>
      <div className="place-stage" ref={boxRef}>
        {!ready && !error && <div className="place-wait">Going in…</div>}
        {error && <div className="place-wait">{error}</div>}
        <button className="place-leave" onClick={leave}><GameIcon name="left" size={14} /> Leave</button>
        <div className="place-title">
          <b>{place.name}</b>
          <small className={headlineOpen ? "is-open" : ""}>{headline}</small>
        </div>
        {ready && !open && !near && <p className="place-tip">Walk up to a counter to use it</p>}
        {ready && !open && near && (
          <button className="place-prompt" onClick={() => openSpot(near)}>
            <GameIcon name="hand" size={16} /> {near.label}
          </button>
        )}
      </div>
      {touchOn && ready && !open && <TouchControls nearLabel={near?.label ?? null} />}

      {open && (
        <section className="place-sheet" aria-label={open.label}>
          <header className="place-sheet-head">
            <b>{open.label}</b>
            <button onClick={() => setOpen(null)}>Done</button>
          </header>
          {panel}
        </section>
      )}
    </div>
  );
}
