import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BODY_SLIDERS } from "./bodySliders";
import { MOODS, VISEMES } from "./face";
import { DEFAULT_SHAPE, shapeWeights, type BodyShape, type MorphMeta } from "./bodyMorph";

const dir = new URL("../../public/assets/characters/", import.meta.url);
const meta = JSON.parse(readFileSync(new URL("body_mpfb.morphs.json", dir), "utf8")) as MorphMeta;
const pack = gunzipSync(readFileSync(new URL("body_mpfb.morphs.pack", dir)));
const ids = new Set(meta.targets.map((t) => t.id));

describe("shapeWeights", () => {
  it("turns a masculine adult into the masculine morph and nothing else", () => {
    expect(shapeWeights({ ...DEFAULT_SHAPE, sex: 1 })).toEqual({ masculine: 1 });
  });

  it("keeps the neutral body as the rest pose", () => {
    expect(shapeWeights(DEFAULT_SHAPE)).toEqual({});
  });

  it("measures build against the sex of the body, split by how masculine it is", () => {
    const w = shapeWeights({ ...DEFAULT_SHAPE, sex: 0.75, weight: 0.5 });
    expect(w["heavy@m"]).toBeCloseTo(0.375);
    expect(w["heavy@f"]).toBeCloseTo(0.125);
    expect(w["slim@m"]).toBeUndefined();
  });

  it("maps age onto younger and older around 25", () => {
    expect(shapeWeights({ ...DEFAULT_SHAPE, sex: 1, age: 70 })["older@m"]).toBeCloseTo(1);
    expect(shapeWeights({ ...DEFAULT_SHAPE, sex: 1, age: 18 })["younger@m"]).toBeCloseTo(1);
    expect(shapeWeights({ ...DEFAULT_SHAPE, sex: 1, age: 12 })["younger@m"]).toBeCloseTo(1); // clamped to adult
  });

  it("uses the increase or decrease target of a slider by its sign", () => {
    expect(shapeWeights({ ...DEFAULT_SHAPE, detail: { nose_width: 0.5, jaw_width: -0.25 } })).toEqual({ "nose_width+": 0.5, "jaw_width-": 0.25 });
  });

  it("only shows the bust on feminine bodies", () => {
    expect(shapeWeights({ ...DEFAULT_SHAPE, sex: 1, bust: 1 })["bust_full"]).toBeUndefined();
    expect(shapeWeights({ ...DEFAULT_SHAPE, sex: 0, bust: 1 })["bust_full"]).toBeCloseTo(1);
  });
});

describe("the body pack", () => {
  it("holds every morph a shape can ask for", () => {
    const wide: BodyShape = { sex: 0.3, age: 44, muscle: 0.4, weight: -0.6, height: 0.7, proportions: -0.2, european: 0.3, eastAsian: 0.2, bust: 0.5, detail: {} };
    for (const sign of [1, -1]) {
      // one-way sliders (head shapes) only go up
      const detail = Object.fromEntries(meta.sliders.filter((s) => sign > 0 || s.dec).map((s) => [s.id, sign * 0.5]));
      for (const id of Object.keys(shapeWeights({ ...wide, detail }))) expect(ids.has(id), id).toBe(true);
    }
  });

  it("has an increase morph for every slider and a decrease for the two-way ones", () => {
    for (const s of meta.sliders) {
      expect(ids.has(s.inc), s.id).toBe(true);
      if (s.dec) expect(ids.has(s.dec), s.id).toBe(true);
    }
  });

  it("lists the same sliders as the creator draws", () => {
    expect(BODY_SLIDERS.map((s) => [s.id, s.group, !s.oneWay])).toEqual(meta.sliders.map((s) => [s.id, s.group, !!s.dec]));
  });

  it("keeps every block inside the file, with indices inside its mesh space", () => {
    for (const t of meta.targets) {
      for (const [space, blk] of Object.entries(t.blocks)) {
        const n = meta.spaces[space]!;
        const base = (blk.offset + blk.count * 2 + 3) & ~3;
        expect(base + blk.count * 6, `${t.id}/${space}`).toBeLessThanOrEqual(pack.length);
        let at = 0;
        const gaps = new Uint16Array(pack.buffer, pack.byteOffset + blk.offset, blk.count);
        for (const g of gaps) at += g;
        expect(at, `${t.id}/${space}`).toBeLessThan(n);
      }
    }
  });

  it("has every face unit the moods and mouth shapes use, on the face meshes", () => {
    const units = new Set(meta.targets.filter((t) => t.id.startsWith("fu_")).map((t) => t.id));
    for (const w of [...Object.values(MOODS), ...Object.values(VISEMES)]) for (const u of Object.keys(w)) expect(units.has(u), u).toBe(true);
    for (const id of units) expect(meta.targets.find((t) => t.id === id)!.blocks["base"], id).toBeDefined();
    expect(meta.meshes["Teeth"]).toBeDefined();
    expect(meta.meshes["Tongue"]).toBeDefined();
  });

  it("describes a full skeleton with fingers and eye bones", () => {
    for (const b of ["root", "pelvis", "Head", "thigh_l", "hand_r", "index_01_l", "thumb_03_r", "pinky_02_l", "eye_l", "eye_r"]) {
      expect(meta.restBones[b], b).toBeDefined();
    }
    expect(meta.bones.length).toBeGreaterThanOrEqual(55);
  });

  it("stays inside the triangle budget for a close-up body", () => {
    const tris = Object.values(meta.meshes).reduce((n, m) => n + m.triangles, 0);
    expect(meta.meshes["Body"]!.triangles).toBeLessThan(28_000);
    expect(tris).toBeLessThan(33_000);
  });
});
