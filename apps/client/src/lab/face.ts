import type * as THREE from "three";
import type { MorphBody } from "./bodyMorph";

/**
 * A face that can move: expressions built from face units (blink, brows, jaw, smile ...), blinking by itself, moods, and a mouth that can
 * be driven by speech. The units are real morph targets on the face meshes (see MorphBody.enableFace).
 */

export type Unit =
  | "fu_blinkL" | "fu_blinkR" | "fu_eyeWide" | "fu_eyeSlit" | "fu_browDown" | "fu_browUp" | "fu_browInner" | "fu_browOuter" | "fu_browUpL"
  | "fu_jawOpen" | "fu_smile" | "fu_frown" | "fu_lipRaise" | "fu_pucker" | "fu_press" | "fu_protrude" | "fu_stretch" | "fu_noseWrinkle" | "fu_nostrils" | "fu_chinDown";

export type Mood = "neutral" | "happy" | "laugh" | "sad" | "angry" | "surprised" | "scared" | "disgusted" | "tired" | "smirk" | "worried" | "kiss";

type Weights = Partial<Record<Unit, number>>;

export const MOODS: Record<Mood, Weights> = {
  neutral: {},
  happy: { fu_smile: 0.75, fu_lipRaise: 0.15, fu_eyeSlit: 0.25, fu_browUp: 0.1 },
  laugh: { fu_smile: 1, fu_jawOpen: 0.55, fu_eyeSlit: 0.6, fu_lipRaise: 0.35, fu_browUp: 0.2, fu_noseWrinkle: 0.2 },
  sad: { fu_frown: 0.8, fu_browInner: 0.85, fu_browDown: 0.15, fu_chinDown: 0.3, fu_eyeSlit: 0.15 },
  angry: { fu_browDown: 1, fu_press: 0.6, fu_eyeSlit: 0.35, fu_noseWrinkle: 0.5, fu_nostrils: 0.5, fu_frown: 0.25 },
  surprised: { fu_browUp: 1, fu_eyeWide: 1, fu_jawOpen: 0.55, fu_browOuter: 0.3 },
  scared: { fu_browInner: 0.9, fu_browUp: 0.6, fu_eyeWide: 0.9, fu_jawOpen: 0.35, fu_stretch: 0.5 },
  disgusted: { fu_noseWrinkle: 1, fu_lipRaise: 0.8, fu_browDown: 0.5, fu_eyeSlit: 0.4, fu_frown: 0.4 },
  tired: { fu_blinkL: 0.45, fu_blinkR: 0.45, fu_browDown: 0.2, fu_frown: 0.2, fu_chinDown: 0.1 },
  smirk: { fu_smile: 0.5, fu_browUpL: 0.7, fu_eyeSlit: 0.2 },
  worried: { fu_browInner: 0.7, fu_browUp: 0.3, fu_frown: 0.35, fu_press: 0.25 },
  kiss: { fu_pucker: 1, fu_protrude: 0.6, fu_browUp: 0.2, fu_blinkL: 0.3, fu_blinkR: 0.3 },
};

/** Mouth shapes for speech: how open the jaw is and what the lips do. */
export const VISEMES: Record<string, Weights> = {
  rest: {},
  aa: { fu_jawOpen: 0.85, fu_stretch: 0.1 },
  ee: { fu_jawOpen: 0.25, fu_stretch: 0.75, fu_smile: 0.3 },
  oh: { fu_jawOpen: 0.45, fu_pucker: 0.75, fu_protrude: 0.35 },
  oo: { fu_jawOpen: 0.15, fu_pucker: 1, fu_protrude: 0.7 },
  mm: { fu_press: 0.9 },
  ff: { fu_jawOpen: 0.12, fu_lipRaise: 0.5 },
};
const SPEECH_SHAPES = ["aa", "ee", "oh", "oo", "mm", "aa", "ee", "ff"];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** The face units are gentle at 1: expressions overdrive them a little so they read from a few metres away. */
const GAIN = 1.45;

export class FaceRig {
  private targets: Map<string, { mesh: THREE.SkinnedMesh; index: number }[]>;
  private current = new Map<string, number>();
  private mood: Mood = "neutral";
  private moodAmount = 1;
  private viseme: Weights = {};
  private speaking = 0;
  private speechClock = 0;
  private blinkClock = 0;
  private nextBlink = 2.2;
  private wink = 0;

  constructor(morph: MorphBody) {
    this.targets = morph.enableFace();
  }

  get units(): string[] {
    return [...this.targets.keys()];
  }

  setMood(mood: Mood, amount = 1): void {
    this.mood = mood;
    this.moodAmount = amount;
  }

  /** Holds a mouth shape (a viseme) or lets go with "rest". Speech overrides it while speaking. */
  setViseme(name: string): void {
    this.viseme = VISEMES[name] ?? {};
  }

  /** Talks for as long as `on`: the jaw and lips move like speech (or follow `level`, 0 to 1, if you have the loudness of real speech). */
  speak(on: boolean): void {
    this.speaking = on ? 1 : 0;
  }
  private level: number | null = null;
  setSpeechLevel(level: number | null): void {
    this.level = level;
  }

  wink1(side: "l" | "r" = "l"): void {
    this.wink = side === "l" ? 1 : -1;
    this.winkClock = 0.5;
  }
  private winkClock = 0;

  /** Where the eyes are in their blink (0 open, 1 shut), for anything that needs to know. */
  update(dt: number): void {
    this.blinkClock += dt;
    if (this.blinkClock > this.nextBlink) {
      this.blinkClock = 0;
      this.nextBlink = 2 + Math.random() * 4.5;
      this.blinkT = 0;
    }
    this.blinkT += dt;
    // a blink: shut fast, open a little slower
    const b = this.blinkT < 0.07 ? this.blinkT / 0.07 : this.blinkT < 0.2 ? 1 - (this.blinkT - 0.07) / 0.13 : 0;
    let wink = 0;
    if (this.winkClock > 0) {
      this.winkClock -= dt;
      wink = Math.sin(Math.min(1, (0.5 - this.winkClock) / 0.5) * Math.PI);
    }

    const want: Partial<Record<string, number>> = {};
    const add = (w: Weights, k = 1) => {
      for (const [u, v] of Object.entries(w)) want[u] = (want[u] ?? 0) + v! * k;
    };
    add(MOODS[this.mood], this.moodAmount);
    if (this.speaking) {
      this.speechClock += dt;
      // a syllable every ~0.17 s: the mouth takes the next shape, opening and closing between them
      const syllable = Math.floor(this.speechClock / 0.17);
      const phase = (this.speechClock % 0.17) / 0.17;
      const shape = VISEMES[SPEECH_SHAPES[(syllable * 5 + Math.floor(syllable / 3)) % SPEECH_SHAPES.length]!]!;
      const open = this.level ?? 0.35 + 0.65 * Math.abs(Math.sin(phase * Math.PI)) * (0.6 + 0.4 * Math.abs(Math.sin(syllable * 1.7)));
      add(shape, open);
    } else add(this.viseme);
    want.fu_blinkL = (want.fu_blinkL ?? 0) + b + (this.wink > 0 ? wink : 0);
    want.fu_blinkR = (want.fu_blinkR ?? 0) + b + (this.wink < 0 ? wink : 0);

    const k = 1 - Math.exp(-14 * dt);
    for (const [unit, list] of this.targets) {
      const blinking = unit === "fu_blinkL" || unit === "fu_blinkR";
      const goal = blinking ? clamp01(want[unit] ?? 0) : Math.max(0, Math.min(1.7, (want[unit] ?? 0) * GAIN));
      const now = this.current.get(unit) ?? 0;
      // blinks must be quick: the eyelid units follow their goal almost at once
      const rate = unit === "fu_blinkL" || unit === "fu_blinkR" ? 1 - Math.exp(-45 * dt) : k;
      const next = now + (goal - now) * rate;
      this.current.set(unit, next);
      for (const { mesh, index } of list) if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = next;
    }
  }
  private blinkT = 1;
}
