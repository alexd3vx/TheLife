import type { ActionDef } from "./types";

// Everything the character can do, as data. Add a new activity by adding an entry here and pointing a piece of
// furniture at its id; no simulation code changes.

export const ACTIONS: Record<string, ActionDef> = {
  snack: {
    id: "snack",
    label: "Grabbing a snack",
    pose: "stand",
    clip: "Life_Eat_Standing_Loop",
    minutes: 10,
    minutesPerSecond: 1,
    needs: { hunger: 25, fun: 3 },
    cost: { portions: 1 },
    blockedIf: { need: "hunger", atLeast: 92, message: "You're not hungry." },
  },
  cook: {
    id: "cook",
    label: "Cooking",
    pose: "stand",
    clip: "Life_Cook_Loop",
    minutes: 30,
    minutesPerSecond: 2,
    needs: { fun: 4, energy: -2, hygiene: -1 },
    cost: { portions: 2 },
    gives: { meals: 1 },
  },
  cookQuick: {
    id: "cookQuick",
    label: "Cooking something quick",
    pose: "stand",
    clip: "Life_Cook_Loop",
    minutes: 12,
    minutesPerSecond: 2,
    needs: { fun: 2, energy: -1, hygiene: -1 },
  },
  eatDish: {
    id: "eatDish",
    label: "Having a plate of food",
    pose: "seat",
    clip: "Life_Eat_Loop",
    minutes: 25,
    minutesPerSecond: 2,
    needs: { hunger: 65, fun: 5 },
    blockedIf: { need: "hunger", atLeast: 92, message: "You're not hungry." },
  },
  eatMeal: {
    id: "eatMeal",
    label: "Having a meal",
    pose: "seat",
    clip: "Life_Eat_Loop",
    minutes: 25,
    minutesPerSecond: 2,
    needs: { hunger: 65, fun: 5 },
    cost: { meals: 1 },
    blockedIf: { need: "hunger", atLeast: 92, message: "You're not hungry." },
  },
  tv: {
    id: "tv",
    label: "Watching TV",
    pose: "seat",
    clip: "Life_Sit_Loop",
    minutes: 60,
    minutesPerSecond: 3,
    needs: { fun: 32, energy: -2 },
  },
  work: {
    id: "work",
    label: "Working at the computer",
    pose: "seat",
    clip: "Life_Type_Loop",
    minutes: 120,
    minutesPerSecond: 4,
    needs: { energy: -14, fun: -10, hygiene: -2 },
    incomePerHour: 1200,
    skill: { id: "computer", xpPerHour: 5 },
    needsAtLeast: { need: "energy", atLeast: 15, message: "You're too tired to work. Get some rest first." },
  },
  sleep: {
    id: "sleep",
    label: "Sleeping",
    pose: "lie",
    clip: "Life_Sleep_Loop",
    minutes: 420,
    minutesPerSecond: 15,
    needs: { energy: 100 },
    decay: { energy: 0, hunger: 0.4, bladder: 0.3, hygiene: 0.3, fun: 0.2 },
    until: { need: "energy", atLeast: 100 },
    blockedIf: { need: "energy", atLeast: 85, message: "You're not tired enough to sleep." },
  },
  passout: {
    id: "passout",
    label: "Passed out from exhaustion",
    pose: "lie",
    clip: "Life_Sleep_Loop",
    minutes: 300,
    minutesPerSecond: 30,
    needs: { energy: 55 },
    decay: { energy: 0, hunger: 0.6, bladder: 0.4, hygiene: 0.4, fun: 0.4 },
    until: { need: "energy", atLeast: 45 },
  },
  sit: {
    id: "sit",
    label: "Sitting",
    pose: "seat",
    clip: "Life_Sit_Loop",
    minutes: 30,
    minutesPerSecond: 3,
    needs: { energy: 6, fun: 2 },
  },
  toilet: {
    id: "toilet",
    label: "Using the toilet",
    pose: "seat",
    clip: "Life_Toilet_Loop",
    minutes: 6,
    minutesPerSecond: 1,
    needs: { bladder: 100, hygiene: -2 },
    blockedIf: { need: "bladder", atLeast: 75, message: "You don't need the toilet yet." },
  },
  shower: {
    id: "shower",
    label: "Showering",
    pose: "stand",
    clip: "Life_Wash_Loop",
    minutes: 15,
    minutesPerSecond: 1.5,
    needs: { hygiene: 100, energy: 2, fun: 3 },
    blockedIf: { need: "hygiene", atLeast: 90, message: "You're already clean." },
  },
  brush: {
    id: "brush",
    label: "Brushing teeth",
    pose: "stand",
    clip: "Life_Brush_Loop",
    minutes: 3,
    minutesPerSecond: 1,
    needs: { hygiene: 8, fun: 1 },
  },
  radio: {
    id: "radio",
    label: "Dancing to the radio",
    pose: "stand",
    clip: "Dance_Loop",
    minutes: 30,
    minutesPerSecond: 2,
    needs: { fun: 16 },
  },
  read: {
    id: "read",
    label: "Reading",
    pose: "stand",
    clip: "Life_Read_Loop",
    minutes: 45,
    minutesPerSecond: 3,
    needs: { fun: 20, energy: -2 },
    skill: { id: "knowledge", xpPerHour: 6 },
  },
};

/** Whole-naira prices and rates. */
export const ECONOMY = {
  startingMoney: 12000,
  groceriesPrice: 1800,
  groceriesPortions: 6,
  rentPerWeek: 14000,
  rentDay: 7, // charged on every 7th day at 08:00
  rentHour: 8,
  lateFee: 1000,
} as const;

/** Skill level from experience: slow at first, then steadily rewarding. */
export function skillLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 8));
}

/** Work pay grows 8% per computer skill level. */
export function skillPayMultiplier(xp: number): number {
  return 1 + 0.08 * skillLevel(xp);
}
