import { useEffect, useRef } from "react";
import { DEFAULT_LOOK, type Look } from "../lab/looks";
import { LiveChar } from "./livechar";

/** Developer view (#/livetest): the live character big, so its look can be judged and tuned. window.__live.setLook({...}) and .yaw. */
export default function LiveTestPage() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext("2d")!;
    const live = new LiveChar({ ...DEFAULT_LOOK });
    const st = { yaw: Math.PI / 4, clip: "Idle_Loop", elev: 12 };
    (window as unknown as { __live: unknown }).__live = { st, live, setLook: (p: Partial<Look>) => live.setLook(p) };
    let raf = 0, last = performance.now();
    void live.load();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      g.fillStyle = "#cdd9ea";
      g.fillRect(0, 0, canvas.width, canvas.height);
      if (!live.ready) return;
      live.play(st.clip);
      live.tick(dt);
      const k = Math.min(canvas.height / 250, canvas.width / 190);
      const f = live.draw(st.yaw, k, st.elev);
      if (f) g.drawImage(f.img, canvas.width / 2 - f.ax * k, canvas.height * 0.86 - f.ay * k, f.w * k, f.h * k);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={600} height={800} style={{ width: 600, height: 800, display: "block" }} />;
}
