// Resolution and shadow-refresh control. The base resolution comes from the player's settings; with "adjust automatically" on, it
// gives up shadow refreshes first and then resolution (never below 0.6x) when the frame rate drops, and recovers when it is smooth.

import type { Settings } from "./settings/settings";

export class AdaptiveQuality {
  ratio = 1;
  /** The shadows refresh once every this many frames. */
  shadowEvery = 1;
  private base = 1;
  private floor = 1;
  private auto = true;
  private target = 60;
  private lowFor = 0;
  private highFor = 0;

  constructor(private readonly apply: (ratio: number) => void) {}

  /** Reads the settings (call at start and whenever they change). */
  configure(s: Pick<Settings, "resolution" | "autoAdjust" | "fpsCap">): void {
    const dpr = window.devicePixelRatio || 1;
    this.base = Math.min(dpr, s.resolution);
    this.auto = s.autoAdjust;
    this.floor = s.autoAdjust ? Math.min(this.base, 0.6) : this.base;
    this.target = s.fpsCap || 60;
    this.lowFor = this.highFor = 0;
    this.shadowEvery = 1;
    this.ratio = this.base;
    this.apply(this.ratio);
  }

  /** Call about twice a second with the measured frame rate. */
  update(fps: number): void {
    if (!this.auto || document.hidden) return;
    if (fps < this.target * 0.67) {
      this.highFor = 0;
      if (++this.lowFor >= 2) {
        this.lowFor = 0;
        if (this.shadowEvery < 4) this.shadowEvery *= 2;
        else if (this.ratio > this.floor) {
          this.ratio = Math.max(this.floor, this.ratio * 0.85);
          this.apply(this.ratio);
        }
      }
    } else if (fps > this.target * 0.93) {
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
