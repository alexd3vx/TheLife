import { charImage, charMeta, type CharFrameMeta } from "./assets";

/** One picture of the character: where its origin is, and the picture itself. */
export interface CharFrame {
  img: CanvasImageSource;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/** Where the engine gets its character pictures from: shipped files, or sprites baked on the player's own device from their look. */
export interface CharProvider {
  /** Are all frames of this animation ready? */
  ready(clip: string): boolean;
  /** Which directions this animation has, and how many frames per direction. */
  dirs(clip: string): number[];
  count(clip: string, dir: number): number;
  frame(clip: string, dir: number, idx: number): CharFrame | null;
  /** Ask for an animation to be made ready (a no-op if it already is). */
  ensure(clip: string): void;
  /** Height and width of this person compared with the average (1 = average). */
  shape?(): { w: number; h: number };
  /** Resolves when these animations are ready. */
  prepare(clips: string[]): Promise<void>;
}

/** The character that ships with the game (a default look), loaded from files. */
export class StaticChar implements CharProvider {
  private meta = new Map<string, CharFrameMeta[]>();
  private images = new Map<string, HTMLImageElement>();
  private loading = new Map<string, Promise<void>>();

  async init(): Promise<void> {
    const m = await charMeta();
    for (const [clip, frames] of Object.entries(m.frames)) this.meta.set(clip, frames);
  }

  ready(clip: string): boolean {
    const f = this.meta.get(clip);
    return !!f && f.every((x) => this.images.has(`${clip}_${x.dir}_${x.frame}`));
  }
  dirs(clip: string): number[] {
    return [...new Set((this.meta.get(clip) ?? []).map((f) => f.dir))];
  }
  count(clip: string, dir: number): number {
    return (this.meta.get(clip) ?? []).filter((f) => f.dir === dir).length;
  }
  frame(clip: string, dir: number, idx: number): CharFrame | null {
    const m = (this.meta.get(clip) ?? []).find((f) => f.dir === dir && f.frame === idx);
    const img = m ? this.images.get(`${clip}_${dir}_${idx}`) : undefined;
    return m && img ? { img, w: m.w, h: m.h, ax: m.ax, ay: m.ay } : null;
  }
  ensure(clip: string): void {
    void this.load(clip);
  }
  prepare(clips: string[]): Promise<void> {
    return Promise.all(clips.map((c) => this.load(c))).then(() => undefined);
  }
  private load(clip: string): Promise<void> {
    let p = this.loading.get(clip);
    if (!p) {
      const frames = this.meta.get(clip) ?? [];
      p = Promise.all(
        frames.map((f) =>
          charImage(clip, f.dir, f.frame).then(
            (img) => void this.images.set(`${clip}_${f.dir}_${f.frame}`, img),
            () => undefined,
          ),
        ),
      ).then(() => undefined);
      this.loading.set(clip, p);
    }
    return p;
  }
}
