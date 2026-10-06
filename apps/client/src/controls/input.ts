import { getSettings } from "../settings/settings";
import type { GameAction } from "./bindings";

/**
 * What the player is pushing right now, from the keyboard and the on-screen stick, in one place. The game reads `move()` and
 * `running()` every frame and is told when a button (interact, phone...) is pressed.
 */
class Input {
  private readonly down = new Set<string>();
  private stickX = 0;
  private stickY = 0;
  private runButton = false;
  private readonly listeners = new Set<(a: GameAction) => void>();
  private attached = false;
  /** Which kind of control was used last, so on-screen hints can match ("Press E" or the hand button). */
  last: "keys" | "touch" = "keys";

  attach(): () => void {
    if (this.attached) return () => {};
    this.attached = true;
    const typing = (e: Event) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    };
    const onDown = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const keys = getSettings().keys;
      const action = (Object.keys(keys) as GameAction[]).find((a) => keys[a].includes(e.code));
      if (!action) return;
      e.preventDefault(); // (Tab would otherwise move focus away from the game)
      this.last = "keys";
      if (!this.down.has(e.code)) {
        this.down.add(e.code);
        if (!e.repeat && (action === "interact" || action === "phone" || action === "resetCamera" || action === "map")) this.press(action);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      this.down.delete(e.code);
    };
    const clear = () => this.down.clear();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    return () => {
      this.attached = false;
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      this.down.clear();
    };
  }

  private held(action: GameAction): boolean {
    const keys = getSettings().keys[action];
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }

  /** x: right (+) / left (-), y: forward (+) / back (-). Length 0 to 1. */
  move(): { x: number; y: number; m: number } {
    let x = (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0);
    let y = (this.held("forward") ? 1 : 0) - (this.held("back") ? 1 : 0);
    if (x !== 0 || y !== 0) {
      const l = Math.hypot(x, y);
      x /= l;
      y /= l;
    } else {
      x = this.stickX;
      y = this.stickY;
    }
    return { x, y, m: Math.min(1, Math.hypot(x, y)) };
  }

  running(): boolean {
    // Pushing the stick all the way out breaks into a run.
    return this.held("run") || this.runButton || Math.hypot(this.stickX, this.stickY) > 0.93;
  }

  /** The on-screen stick (-1 to 1 each way; y up is forward). */
  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
    if (x !== 0 || y !== 0) this.last = "touch";
  }

  setRun(on: boolean): void {
    this.runButton = on;
    if (on) this.last = "touch";
  }

  press(action: GameAction): void {
    for (const l of this.listeners) l(action);
  }

  onPress(fn: (a: GameAction) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const input = new Input();
