import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { IsoHero } from "../ui/IsoHero";
import { createCityScene } from "./layout";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function isSmallScreen(): boolean {
  return window.matchMedia("(max-width: 860px)").matches;
}

/** Realistic 3D street scene that slowly drifts around. Falls back to the flat SVG art if WebGL isn't available. */
export default function HeroCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    const small = isSmallScreen();
    let pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
    container.appendChild(renderer.domElement);

    const buildStart = performance.now();
    const city = createCityScene({ shadowMapSize: small ? 1024 : 2048 });
    if (import.meta.env.DEV) console.info(`[world3d] scene built in ${Math.round(performance.now() - buildStart)} ms`);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
    const target = new THREE.Vector3(14, 5, -1);
    const pointer = { x: 0, y: 0 };
    const reducedMotion = window.matchMedia(REDUCED_MOTION).matches;

    function resize() {
      const { clientWidth, clientHeight } = container!;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.fov = camera.aspect < 1.1 ? 56 : 42;
      camera.updateProjectionMatrix();
    }

    function placeCamera(time: number) {
      // Stand in the street and look down it, drifting slowly side to side.
      const drift = Math.sin(time * 0.08);
      camera.position.set(-52 + drift * 6 + pointer.x * 2, 5.4 - pointer.y * 0.8, 3.2 + Math.sin(time * 0.05) * 2);
      camera.lookAt(target.x + pointer.x * 4, target.y, target.z + drift * 2);
    }

    function onPointerMove(event: PointerEvent) {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    }

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion) renderOnce();
    });
    observer.observe(container);

    const clock = new THREE.Clock();
    let elapsed = 0;
    let frame = 0;
    let slowFrames = 0;
    let rafId = 0;
    let stopped = false;

    function renderOnce() {
      city.update(0, camera);
      placeCamera(elapsed);
      renderer.render(city.scene, camera);
    }

    function loop() {
      if (stopped) return;
      rafId = requestAnimationFrame(loop);
      if (document.hidden) {
        clock.getDelta();
        return;
      }
      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      frame++;

      // If the device struggles, drop resolution once instead of stuttering forever.
      if (frame > 30 && frame < 150 && delta > 0.034) slowFrames++;
      if (frame === 150 && slowFrames > 45 && pixelRatio > 1) {
        pixelRatio = 1;
        renderer.setPixelRatio(1);
        resize();
      }

      city.update(delta, camera);
      placeCamera(elapsed);
      renderer.render(city.scene, camera);
    }

    if (reducedMotion) {
      elapsed = 4;
      renderOnce();
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      loop();
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      observer.disconnect();
      city.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (failed) return <IsoHero />;
  return <div ref={containerRef} className="hero-canvas" />;
}
