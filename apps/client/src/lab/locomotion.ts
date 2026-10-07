/**
 * How a body moves, in one place: how fast it walks and runs, which clip plays at a given ground speed, and how fast that clip plays so the
 * feet do not slide. The home, the street, the buildings and other players all use these, so a person moves the same way everywhere.
 */
export const WALK_SPEED = 1.55; // metres per second
export const RUN_SPEED = 3.3;
/** Ground speed the walk and jog clips were authored for. */
export const WALK_CLIP_SPEED = 1.35;
export const JOG_CLIP_SPEED = 3.0;

export type LocomotionClip = "Idle_Loop" | "Walk_Loop" | "Jog_Fwd_Loop";

/** The clip for a ground speed. Jogging starts a little higher than it stops, so a speed hovering at the edge does not flicker. */
export function locomotionClip(speed: number, current?: string): LocomotionClip {
  if (speed < 0.2) return "Idle_Loop";
  const jogging = current === "Jog_Fwd_Loop" ? speed > 2.1 : speed > 2.6;
  return jogging ? "Jog_Fwd_Loop" : "Walk_Loop";
}

/** The playback rate that keeps the feet on the ground at this speed (1 for idle). */
export function locomotionRate(speed: number, clip: string): number {
  if (clip === "Idle_Loop" || speed < 0.2) return 1;
  const authored = clip === "Jog_Fwd_Loop" ? JOG_CLIP_SPEED : WALK_CLIP_SPEED;
  return Math.max(0.35, Math.min(1.7, speed / authored));
}
