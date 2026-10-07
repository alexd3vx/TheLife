/** Undo and redo for the creator. A burst of changes (dragging a slider) counts as one step. */
export class LookHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastPush = 0;
  constructor(
    private readonly limit = 40,
    private readonly gap = 700,
  ) {}

  /** Call with the value before a change. */
  record(before: T, now = Date.now()): void {
    if (now - this.lastPush > this.gap) {
      this.past.push(before);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.lastPush = now;
    this.future = [];
  }
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    this.lastPush = 0;
    return prev;
  }
  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    this.lastPush = 0;
    return next;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
