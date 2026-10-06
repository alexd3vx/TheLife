// The animations baked into sprites, and in how many directions and frames.

export interface ClipSpec {
  name: string;
  frames: number;
  /** Which of the 8 directions (0 = facing the camera's south, turning through 1 = south-west...). */
  dirs: number[];
  /** Played once from start to end (sitting down) rather than looped. */
  once?: boolean;
}

const all = [0, 1, 2, 3, 4, 5, 6, 7];
const four = [0, 2, 4, 6];

/** In the order they are needed: standing and walking first, then the rest are baked in the background. */
export const CHAR_CLIPS: ClipSpec[] = [
  { name: "Idle_Loop", frames: 8, dirs: all },
  { name: "Walk_Loop", frames: 8, dirs: all },
  { name: "Sitting_Enter", frames: 8, dirs: all, once: true },
  { name: "Sitting_Exit", frames: 8, dirs: all, once: true },
  { name: "Sitting_Idle_Loop", frames: 6, dirs: all },
  { name: "Life_Cook_Loop", frames: 8, dirs: all },
  { name: "Life_Eat_Loop", frames: 8, dirs: all },
  { name: "Life_Sleep_Loop", frames: 6, dirs: four },
  { name: "Life_Type_Loop", frames: 8, dirs: all },
  { name: "Life_Brush_Loop", frames: 8, dirs: all },
  { name: "Life_Wash_Loop", frames: 8, dirs: all },
  { name: "Life_Read_Loop", frames: 6, dirs: all },
  { name: "Jog_Fwd_Loop", frames: 8, dirs: all },
  { name: "Life_Eat_Standing_Loop", frames: 8, dirs: all },
  { name: "Dance_Loop", frames: 8, dirs: all },
];
