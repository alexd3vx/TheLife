// What the player can do with the keyboard or the touch buttons, and the default keys. Each key can be changed in Settings.

export type GameAction = "forward" | "back" | "left" | "right" | "run" | "interact" | "phone" | "resetCamera" | "map";

export const ACTIONS: { id: GameAction; label: string; hint: string }[] = [
  { id: "forward", label: "Move forward", hint: "Towards where the camera looks" },
  { id: "back", label: "Move back", hint: "" },
  { id: "left", label: "Move left", hint: "" },
  { id: "right", label: "Move right", hint: "" },
  { id: "run", label: "Run (hold)", hint: "Hold to run" },
  { id: "interact", label: "Interact", hint: "Use the hand: your door, people close to you" },
  { id: "phone", label: "Phone", hint: "Take out or put away your phone" },
  { id: "resetCamera", label: "Camera behind me", hint: "Swing the camera back behind the character" },
  { id: "map", label: "Map", hint: "Open the phone's map" },
];

export type KeyMap = Record<GameAction, string[]>;

/** Keys are `KeyboardEvent.code` values, so they work on any keyboard layout. */
export const DEFAULT_KEYS: KeyMap = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  run: ["ShiftLeft", "ShiftRight"],
  interact: ["KeyE", "Enter"],
  phone: ["KeyP", "Tab"],
  resetCamera: ["KeyC"],
  map: ["KeyM"],
};

/** The buttons on a touch screen. */
export type TouchId = "stick" | "interact" | "run" | "phone" | "camera";

export interface TouchSpot {
  /** From the left edge, 0 to 1 of the screen width (the middle of the control). */
  x: number;
  /** From the bottom edge, 0 to 1 of the screen height. */
  y: number;
  /** Size multiplier, 0.6 to 1.8. */
  s: number;
  hidden?: boolean;
}

export const TOUCH_LABEL: Record<TouchId, string> = { stick: "Move stick", interact: "Interact (hand)", run: "Run", phone: "Phone", camera: "Camera behind me" };

export const DEFAULT_TOUCH: Record<TouchId, TouchSpot> = {
  stick: { x: 0.14, y: 0.24, s: 1 },
  interact: { x: 0.9, y: 0.27, s: 1 },
  run: { x: 0.76, y: 0.14, s: 0.9, hidden: true },
  phone: { x: 0.92, y: 0.52, s: 0.8, hidden: true },
  camera: { x: 0.8, y: 0.38, s: 0.7, hidden: true },
};

/** A readable name for a key code ("KeyW" -> "W"). */
export function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const names: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", ShiftLeft: "Shift", ShiftRight: "Shift", Space: "Space", Enter: "Enter", Tab: "Tab", ControlLeft: "Ctrl", AltLeft: "Alt" };
  return names[code] ?? code;
}
