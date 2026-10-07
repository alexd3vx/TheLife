import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef, useState } from "react";
import { ATM_FEE, PLAYER, SAVINGS, balance, counterOpen, loanLimit, type Landmark } from "@thelife/game-core";
import { Avatar } from "../lab/avatar";
import { loadSavedLook, parseLook } from "../lab/looks";
import { loadManifest } from "../lab/manifest";
import { randomNpcLook } from "../lab/npcLooks";
import { bubbleSprite } from "../map/remotePlayers";
import type { GameSession } from "../play/gameSession";
import { bankBorrow, bankDeposit, bankRepay, bankWithdraw, plug } from "../phone/remote";
import { GameIcon } from "../ui/icons";
import { buildBankRoom } from "./bankScene";
import "./place.css";

const naira = (n: number) => `₦${n.toLocaleString()}`;
type Window = "teller" | "atm";

/**
 * Inside a bank branch: the lobby with a teller behind the glass and cash machines on the wall. The counter does savings and loans in
 * office hours; the machines take and give cash any time for a small fee. It runs on the same savings and loan as the phone's LifePay,
 * so a player with a basic phone does their banking here.
 */
export default function PlaceInterior({ place, session, onClose }: { place: Landmark; session: GameSession; onClose(): void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const tellerRef = useRef<{ say(text: string): void } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<Window>("teller");
  const [amount, setAmount] = useState("5000");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [, bump] = useState(0);
  const state = session.sim.state;
  const cash = balance(state.ledger, PLAYER);
  const saved = balance(state.ledger, SAVINGS);
  const loan = state.phone.loan?.owed ?? 0;
  const counter = counterOpen(state);
  const value = Math.floor(Number(amount) || 0);

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
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#cfe0fa");
      const room = buildBankRoom(place.name);
      scene.add(room.group);
      scene.add(new THREE.HemisphereLight("#eaf2ff", "#8fa6d0", 1.1));
      const sun = new THREE.DirectionalLight("#ffffff", 2.2);
      sun.position.set(3, 6, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 0.5, far: 20 });
      scene.add(sun);

      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
      camera.position.set(0.6, 3.6, 6.6);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0.2, 1.0, -1.4);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minDistance = 4;
      controls.maxDistance = 9;
      controls.minPolarAngle = 0.9;
      controls.maxPolarAngle = 1.5;
      controls.minAzimuthAngle = -0.9;
      controls.maxAzimuthAngle = 0.9;
      controls.update();
      const fit = () => {
        const w = box.clientWidth, h = box.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.fov = camera.aspect < 0.8 ? 62 : 40;
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(box);
      cleanups.push(() => ro.disconnect());

      const manifest = await loadManifest();
      const look = state.look ? parseLook(state.look) : loadSavedLook();
      const me = new Avatar(manifest, look);
      const teller = new Avatar(manifest, randomNpcLook());
      await Promise.all([me.load(), teller.load()]);
      if (gone) return;
      me.root.position.copy(room.playerAt);
      me.root.rotation.y = Math.PI;
      teller.root.position.copy(room.tellerAt);
      scene.add(me.root, teller.root);
      me.play("Idle_Loop", 0);
      teller.play("Life_Type_Loop", 0);
      let bubble: { sprite: THREE.Sprite; until: number } | null = null;
      tellerRef.current = {
        say(text) {
          if (bubble) {
            teller.root.remove(bubble.sprite);
            bubble.sprite.material.map?.dispose();
            bubble.sprite.material.dispose();
          }
          const sprite = bubbleSprite(text);
          sprite.position.y = 2.15;
          teller.root.add(sprite);
          bubble = { sprite, until: performance.now() / 1000 + 4 + Math.min(5, text.length * 0.05) };
        },
      };
      tellerRef.current.say(`Welcome to ${place.name}. How can I help?`);
      const clock = new THREE.Clock();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, clock.getDelta());
        me.update(dt);
        teller.update(dt);
        controls.update();
        if (bubble && performance.now() / 1000 > bubble.until) {
          teller.root.remove(bubble.sprite);
          bubble = null;
        }
        renderer.render(scene, camera);
      };
      loop();
      setReady(true);
      cleanups.push(() => {
        me.dispose();
        teller.dispose();
      });
    })().catch((e) => !gone && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      tellerRef.current = null;
      for (const c of cleanups) c();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (fn: () => { ok: boolean; text?: string; reason?: string }) => {
    const r = fn();
    const text = r.ok ? (r.text ?? "Done.") : (r.reason ?? "That didn't work.");
    setNote({ ok: r.ok, text });
    tellerRef.current?.say(r.ok ? "Done. Anything else?" : text.length < 70 ? text : "Sorry, I can't do that.");
    session.notice(text);
    bump((n) => n + 1);
  };
  const atm = win === "atm";
  const closed = !atm && !counter.open;
  const chips = [1000, 5000, 10000, 50000];

  return (
    <div className="place" role="dialog" aria-label={place.name}>
      <div className="place-stage" ref={boxRef}>
        {!ready && !error && <div className="place-wait">Going in…</div>}
        {error && <div className="place-wait">{error}</div>}
        <button className="place-leave" onClick={onClose}><GameIcon name="left" size={14} /> Leave</button>
        <div className="place-title">
          <b>{place.name}</b>
          <small className={counter.open ? "is-open" : ""}>{counter.open ? "Counter open" : `Counter closed · ${counter.text}`}</small>
        </div>
      </div>

      <section className="place-sheet">
        <div className="place-money">
          <span><small>Cash</small><b>{naira(cash)}</b></span>
          <span><small>Savings</small><b>{naira(saved)}</b></span>
          <span className={loan ? "is-owe" : ""}><small>Loan</small><b>{loan ? naira(loan) : "None"}</b></span>
        </div>
        <nav className="place-tabs">
          <button className={win === "teller" ? "is-on" : ""} onClick={() => setWin("teller")}>Teller</button>
          <button className={win === "atm" ? "is-on" : ""} onClick={() => setWin("atm")}>Cash machine</button>
        </nav>

        <label className="place-amount">
          <span>Amount</span>
          <i>₦</i>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))} aria-label="Amount in naira" />
        </label>
        <div className="place-chips">
          {chips.map((c) => <button key={c} onClick={() => setAmount(String(c))}>{naira(c)}</button>)}
          <button onClick={() => setAmount(String(Math.max(0, atm ? saved : saved)))}>All savings</button>
        </div>

        {closed && <p className="place-note is-bad">The counter is closed ({counter.text}). The cash machine works any time{`, for ₦${ATM_FEE} each time`}.</p>}
        {atm && <p className="place-note">The machine charges {naira(ATM_FEE)} each time. It cannot lend.</p>}

        <div className="place-actions">
          <button disabled={closed || value < 100} onClick={() => run(() => bankDeposit(state, value, atm))}>Save {value >= 100 ? naira(value) : ""}</button>
          <button disabled={closed || value < 100} onClick={() => run(() => bankWithdraw(state, value, atm))}>Take out {value >= 100 ? naira(value) : ""}</button>
          {!atm && <button disabled={closed || value < 100 || !!loan} onClick={() => run(() => bankBorrow(state, value))}>Borrow {value >= 100 ? naira(value) : ""}</button>}
          {!atm && <button disabled={closed || value < 100 || !loan} onClick={() => run(() => bankRepay(state, value))}>Repay loan</button>}
        </div>
        {!atm && <p className="place-note">You can borrow up to {naira(loanLimit(state.profile))} at 10%. Savings earn interest every week, here and on your phone.</p>}

        <button className="place-charge" disabled={state.phone.battery >= 100} onClick={() => run(() => plug(state, "wall"))}>
          <GameIcon name="charging" size={15} /> {state.phone.battery >= 100 ? "Phone is full" : `Charge your phone (${Math.round(state.phone.battery)}%)`}
        </button>
        {note && <p className={`place-result${note.ok ? "" : " is-bad"}`} role="status">{note.text}</p>}
      </section>
    </div>
  );
}
