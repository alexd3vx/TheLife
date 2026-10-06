import { describe, expect, it } from "vitest";
import { Sim, balance, buyIngredient, cancelRecipe, chooseDish, chooseRecipe, createGameState, createKitchen, parseGameState, recipeById, servings, tickKitchen } from "./index.js";

const lapo = () => {
  const s = createGameState({ tier: "lapo", firstName: "T", surname: "Test" } as never);
  return new Sim(s);
};

function run(sim: Sim, id: string, steps = 80) {
  expect(sim.start(id).ok).toBe(true);
  for (let i = 0; i < steps && sim.active; i++) sim.step(1);
}

describe("the kitchen", () => {
  it("cooks a recipe from ingredients and makes plates", () => {
    const sim = new Sim(createGameState());
    const state = sim.state;
    expect(servings(state, "rice")).toBeGreaterThan(1);
    expect(chooseRecipe(state, "jollof").ok).toBe(true);
    expect(sim.canStart("cook").ok).toBe(true);
    run(sim, "cook"); // (picks the right stove action for the recipe)
    expect(state.kitchen.cooking).toBeNull();
    expect(state.kitchen.dishes.find((d) => d.id === "jollof")?.qty).toBe(recipeById("jollof")!.plates);
  });

  it("refuses a recipe when something is missing, and lets you put the ingredients back", () => {
    const sim = lapo();
    expect(chooseRecipe(sim.state, "eba_stew").ok).toBe(false);
    const before = servings(sim.state, "noodles");
    sim.state.kitchen.lots.push({ id: "egg", qty: 2, age: 0 });
    expect(chooseRecipe(sim.state, "noodles_egg").ok).toBe(true);
    expect(servings(sim.state, "noodles")).toBe(before - 2);
    expect(cancelRecipe(sim.state).ok).toBe(true);
    expect(servings(sim.state, "noodles")).toBe(before);
  });

  it("eating a plate fills hunger, and a bad plate makes you ill", () => {
    const sim = new Sim(createGameState());
    sim.state.kitchen.dishes.push({ id: "jollof", qty: 2, age: 0 }, { id: "fried_rice", qty: 1, age: 99_999 });
    sim.state.needs.hunger = 20;
    expect(chooseDish(sim.state, "jollof").ok).toBe(true);
    run(sim, "eatMeal"); // (a plate on the table turns this into eating it)
    expect(sim.state.needs.hunger).toBeGreaterThan(80);
    sim.state.needs.hunger = 20;
    expect(chooseDish(sim.state, "fried_rice").ok).toBe(true);
    const bladder = sim.state.needs.bladder;
    run(sim, "eatMeal"); // (a plate on the table turns this into eating it)
    expect(sim.state.needs.bladder).toBeLessThan(bladder);
  });

  it("food goes off faster without a fridge", () => {
    const withFridge = createGameState({ tier: "middle" } as never);
    const without = createGameState({ tier: "lapo" } as never);
    withFridge.kitchen = { ...createKitchen("middle"), lots: [{ id: "tomato", qty: 2, age: 0 }] };
    without.kitchen = { ...createKitchen("lapo"), lots: [{ id: "tomato", qty: 2, age: 0 }] };
    tickKitchen(withFridge, 2000);
    tickKitchen(without, 2000);
    expect(without.kitchen.lots[0]!.age).toBeGreaterThan(withFridge.kitchen.lots[0]!.age * 2);
    const gone = tickKitchen(without, 5000);
    expect(gone.join(" ")).toContain("tomatoes");
  });

  it("buying costs money and survives a save", () => {
    const sim = new Sim(createGameState());
    const before = balance(sim.state.ledger);
    expect(buyIngredient(sim.state, "fish", 2).ok).toBe(true);
    expect(balance(sim.state.ledger)).toBeLessThan(before);
    const parsed = parseGameState(JSON.parse(JSON.stringify(sim.state)));
    expect(parsed?.kitchen.lots.find((l) => l.id === "fish")?.qty).toBe(2);
    expect(buyIngredient(sim.state, "gold", 1).ok).toBe(false);
  });
});
