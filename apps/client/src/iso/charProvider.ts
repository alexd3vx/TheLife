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
