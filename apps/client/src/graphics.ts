// Graphics quality. "Auto" favours a smooth frame rate: it gives up shadow refreshes first, then resolution (down to 0.7x),
// when the frame rate drops; "High" never trades anything away; "Low" renders at three quarters resolution with cheap shadows.

export type Quality = "auto" | "high" | "low";
const KEY = "thelife.quality";

export function loadQuality(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "high" || v === "low" || v === "auto") return v;
  } catch {
    // storage blocked
  }
  return "auto";
}

export function saveQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // ignore
  }
}

export const NEXT_QUALITY: Record<Quality, Quality> = { auto: "high", high: "low", low: "auto" };
export const QUALITY_LABEL: Record<Quality, string> = { auto: "Auto", high: "High", low: "Low" };

export class AdaptiveQuality {
  ratio = 1;
  /** The shadows refresh once every this many frames. */
  shadowEvery = 1;
  private base = 1;
  private floor = 1;
  private lowFor = 0;
  private highFor = 0;

  constructor(
    private readonly apply: (ratio: number) => void,
    private quality: Quality = loadQuality(),
  ) {
    this.configure();
  }

  get mode(): Quality {
    return this.quality;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    saveQuality(q);
    this.configure();
  }

  private configure() {
    const dpr = window.devicePixelRatio || 1;
    this.lowFor = this.highFor = 0;
    if (this.quality === "low") {
      this.base = this.floor = 0.75;
      this.shadowEvery = 4;
    } else {
      // Auto starts at no more than 1.5x (phones report 3x, which is nine times the pixels for little visible gain) and can
      // go down to 0.7x if the device struggles; High keeps up to 2x and never trades anything away.
      this.base = Math.min(dpr, this.quality === "high" ? 2 : 1.5);
      this.floor = this.quality === "high" ? this.base : Math.min(this.base, 0.7);
      this.shadowEvery = 1;
    }
    this.ratio = this.base;
    this.apply(this.ratio);
  }

  /** Call about twice a second with the measured frame rate. */
  update(fps: number): void {
    if (this.quality !== "auto" || document.hidden) return;
    if (fps < 40) {
      this.highFor = 0;
      if (++this.lowFor >= 2) {
        this.lowFor = 0;
        if (this.shadowEvery < 4) this.shadowEvery *= 2;
        else if (this.ratio > this.floor) {
          this.ratio = Math.max(this.floor, this.ratio * 0.85);
          this.apply(this.ratio);
        }
      }
    } else if (fps > 56) {
      this.lowFor = 0;
      if (++this.highFor >= 8) {
        this.highFor = 0;
        if (this.ratio < this.base) {
          this.ratio = Math.min(this.base, this.ratio * 1.12);
          this.apply(this.ratio);
        } else if (this.shadowEvery > 1) this.shadowEvery /= 2;
      }
    } else this.lowFor = this.highFor = 0;
  }
}
