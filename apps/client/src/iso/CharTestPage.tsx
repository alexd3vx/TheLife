import { useEffect, useRef, useState } from "react";
import { DEFAULT_LOOK, type Look } from "../lab/looks";
import { PaperDoll } from "./paperdoll";

/** Developer view: the paper-doll character in every direction, standing and walking. */
export default function CharTestPage() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [look, setLook] = useState<Look>({ ...DEFAULT_LOOK });
  useEffect(() => {
    const canvas = ref.current!;
    const doll = new PaperDoll(look);
    let raf = 0;
    let t = 0;
    let last = performance.now();
    void doll.prepare(["Idle_Loop", "Walk_Loop"]);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      t += (now - last) / 1000;
      last = now;
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#d9c7a4";
      g.fillRect(0, 0, canvas.width, canvas.height);
      for (let d = 0; d < 8; d++) {
        for (const [row, clip, fps] of [[0, "Idle_Loop", 4], [1, "Walk_Loop", 10]] as const) {
          const n = doll.count(clip, d);
          if (!n) continue;
          const f = doll.frame(clip, d, Math.floor(t * fps) % n);
          if (!f) continue;
          const x = 80 + d * 130, y = 230 + row * 260;
          g.drawImage(f.img, x - f.ax / 1.5, y - f.ay / 1.5, f.w / 1.5, f.h / 1.5);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    (window as unknown as { __doll: PaperDoll; __setLook: (p: Partial<Look>) => void }).__doll = doll;
    (window as unknown as { __setLook: (p: Partial<Look>) => void }).__setLook = (p) => {
      setLook((l) => ({ ...l, ...p }));
      void doll.setLook(p).then(() => doll.prepare(["Idle_Loop", "Walk_Loop"]));
    };
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  void look;
  return <canvas ref={ref} width={1100} height={540} style={{ display: "block", margin: "0 auto", background: "#d9c7a4" }} />;
}
