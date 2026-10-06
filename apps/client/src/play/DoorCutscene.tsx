import { useEffect, useState } from "react";
import "./door.css";

type Tier = "lapo" | "middle" | "nepo";

/**
 * Covers the house while it builds itself: the player sees a short cinematic at their own front door (the door swings open on a warm
 * room and the camera pushes in), never a loading message. It lasts at least a few seconds, stays on the open door while the house is
 * still being built, and fades away when it is ready.
 */
export default function DoorCutscene({ ready, tier, offline, detail, onRetry }: { ready: boolean; tier: Tier; offline?: boolean; detail?: string; onRetry?(): void }) {
  const [minDone, setMinDone] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMinDone(true), 3300);
    return () => window.clearTimeout(t);
  }, []);
  const leaving = ready && minDone;
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setGone(true), 900);
    return () => window.clearTimeout(t);
  }, [leaving]);
  if (gone) return null;
  return (
    <div className={`door door-${tier}${leaving ? " is-leaving" : ""}`} role="presentation">
      <div className="door-sky" />
      <div className="door-camera">
        <div className="door-wall">
          <div className="door-frame">
            <div className="door-room" />
            <div className="door-leaf">
              <span className="door-panel" />
              <span className="door-panel" />
              <span className="door-handle" />
            </div>
          </div>
          <span className="door-bulb" />
        </div>
        <div className="door-ground" />
      </div>
      <div className="door-spill" />
      <div className="door-bars top" />
      <div className="door-bars bottom" />
      {offline && (
        <div className="door-offline">
          <span>{detail || "Can't reach the world right now."}</span>
          <button className="btn btn-primary" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  );
}
