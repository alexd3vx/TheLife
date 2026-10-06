import { describe, expect, it } from "vitest";
import { cleanLook, parseClientMessage } from "./net.js";

describe("net messages", () => {
  it("keeps only known, short look fields", () => {
    const out = JSON.parse(cleanLook(JSON.stringify({ body: "realmale", hair: null, beard: true, evil: "x", top: "<script>", hairColor: "a".repeat(80), skinTone: "deep" }))!);
    expect(out).toEqual({ body: "realmale", hair: null, beard: true, skinTone: "deep" });
  });

  it("drops a look that is too big or not JSON", () => {
    expect(cleanLook("{")).toBeUndefined();
    expect(cleanLook(JSON.stringify({ body: "x".repeat(2000) }))).toBeUndefined();
    expect(cleanLook("[]")).toBeUndefined();
  });

  it("cleans a hello and the name in it", () => {
    const m = parseClientMessage(JSON.stringify({ t: "hello", name: "  Ada<b> ", protocol: 1, look: JSON.stringify({ body: "realfemale" }) }));
    expect(m).toMatchObject({ t: "hello", name: "Adab", look: JSON.stringify({ body: "realfemale" }) });
  });

  it("rejects numbers that are not finite and unknown messages", () => {
    expect(parseClientMessage(JSON.stringify({ t: "move", x: 1e20, y: 0, z: 0, yaw: 0, clip: "x", level: 0 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "nope" }))).toBeNull();
  });
});
