import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef, useState } from "react";
import { counterOpen, shopOpen, type Landmark } from "@thelife/game-core";
import { Avatar } from "../lab/avatar";
import { loadSavedLook, parseLook } from "../lab/looks";
import { loadManifest } from "../lab/manifest";
import { randomNpcLook } from "../lab/npcLooks";
import { bubbleSprite } from "../map/remotePlayers";
import type { GameSession } from "../play/gameSession";
import { GameIcon } from "../ui/icons";
import BankPanel from "./BankPanel";
import HospitalPanel from "./HospitalPanel";
import ShopPanel from "./ShopPanel";
import { buildBankRoom } from "./bankScene";
import { buildHospitalRoom } from "./hospitalScene";
import { buildShopRoom } from "./shopScene";
import type { Outcome } from "./panel";
import "./place.css";

/**
 * Inside a place you can walk into: a 3D room with a member of staff, and a service sheet under it. The bank's counter does savings and
 * loans and its machines give cash; the hospital mends needs for a price. Both run on the same rules as the phone, so a player with a
 * basic phone does their business here. `place.kind` picks the room and the sheet.
 */
export default function PlaceInterior({ place, session, onClose }: { place: Landmark; session: GameSession; onClose(): void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const staffRef = useRef<{ say(text: string): void } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [, bump] = useState(0);
  const state = session.sim.state;
  const scale = session.sim.traits.groceries ?? 1;
  const hospitalKind = place.kind === "hospital";
  const shopKind = place.kind === "market" || place.kind === "fuel" ? place.kind : null;
  const counter = counterOpen(state);

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
      scene.background = new THREE.Color(hospitalKind ? "#d6eef0" : shopKind === "market" ? "#f1e3c6" : "#cfe0fa");
      const room = hospitalKind ? buildHospitalRoom(place.name) : shopKind ? buildShopRoom(place.name, shopKind) : buildBankRoom(place.name);
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
      const staff = new Avatar(manifest, randomNpcLook());
      await Promise.all([me.load(), staff.load()]);
      if (gone) return;
      me.root.position.copy(room.playerAt);
      me.root.rotation.y = Math.PI;
      staff.root.position.copy(room.staffAt);
      scene.add(me.root, staff.root);
      me.play("Idle_Loop", 0);
      staff.play(hospitalKind || shopKind ? "Idle_Loop" : "Life_Type_Loop", 0);
      let bubble: { sprite: THREE.Sprite; until: number } | null = null;
      staffRef.current = {
        say(text) {
          if (bubble) {
            staff.root.remove(bubble.sprite);
            bubble.sprite.material.map?.dispose();
            bubble.sprite.material.dispose();
          }
          const sprite = bubbleSprite(text);
          sprite.position.y = 2.15;
          staff.root.add(sprite);
          bubble = { sprite, until: performance.now() / 1000 + 4 + Math.min(5, text.length * 0.05) };
        },
      };
      staffRef.current.say(hospitalKind ? `Welcome to ${place.name}. What is the matter?` : shopKind ? "Welcome, welcome! What will you buy?" : `Welcome to ${place.name}. How can I help?`);
      const clock = new THREE.Clock();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, clock.getDelta());
        me.update(dt);
        staff.update(dt);
        controls.update();
        if (bubble && performance.now() / 1000 > bubble.until) {
          staff.root.remove(bubble.sprite);
          bubble = null;
        }
        renderer.render(scene, camera);
      };
      loop();
      setReady(true);
      cleanups.push(() => {
        me.dispose();
        staff.dispose();
      });
    })().catch((e) => !gone && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      staffRef.current = null;
      for (const c of cleanups) c();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (fn: () => Outcome) => {
    const r = fn();
    const text = r.ok ? (r.text ?? "Done.") : (r.reason ?? "That didn't work.");
    setNote({ ok: r.ok, text });
    staffRef.current?.say(r.ok ? (hospitalKind ? "There you go. Take care." : shopKind ? "Thank you! Anything else?" : "Done. Anything else?") : text.length < 70 ? text : "Sorry, I can't do that.");
    session.notice(text);
    bump((n) => n + 1);
  };
  return (
    <div className="place" role="dialog" aria-label={place.name}>
      <div className="place-stage" ref={boxRef}>
        {!ready && !error && <div className="place-wait">Going in…</div>}
        {error && <div className="place-wait">{error}</div>}
        <button className="place-leave" onClick={onClose}><GameIcon name="left" size={14} /> Leave</button>
        <div className="place-title">
          <b>{place.name}</b>
          {hospitalKind
            ? <small className="is-open">Open all day and night</small>
            : shopKind
            ? <small className={shopOpen(state, shopKind).open ? "is-open" : ""}>{shopOpen(state, shopKind).open ? "Open now" : `Closed · ${shopOpen(state, shopKind).text}`}</small>
            : <small className={counter.open ? "is-open" : ""}>{counter.open ? "Counter open" : `Counter closed · ${counter.text}`}</small>}
        </div>
      </div>

      <section className={`place-sheet${hospitalKind ? " is-hospital" : ""}`}>
        {hospitalKind ? <HospitalPanel state={state} run={run} note={note} scale={scale} />
          : shopKind ? <ShopPanel kind={shopKind} state={state} run={run} note={note} scale={scale} />
          : <BankPanel state={state} run={run} note={note} scale={scale} />}
      </section>
    </div>
  );
}
