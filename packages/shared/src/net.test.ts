import { describe, expect, it } from "vitest";
import { cleanLook, parseClientMessage } from "./net.js";

describe("net messages", () => {
  it("keeps only known, short look fields", () => {
    const out = JSON.parse(cleanLook(JSON.stringify({ body: "realmale", hair: null, beard: true, evil: "x", top: "<script>", hairColor: "a".repeat(80), skinTone: "deep" }))!);
    expect(out).toEqual({ body: "realmale", hair: null, beard: true, skinTone: "deep" });
  });

  it("drops a look that is too big or not JSON", () => {
    expect(cleanLook("{")).toBeUndefined();
    expect(cleanLook(JSON.stringify({ body: "x".repeat(5000) }))).toBeUndefined();
    expect(cleanLook("[]")).toBeUndefined();
  });

  it("keeps a body shape inside its ranges and drops junk sliders", () => {
    const out = JSON.parse(cleanLook(JSON.stringify({ body: "realfemale", shape: { sex: 3, age: 5, weight: -0.123, junk: 9, detail: { nose_width: 0.5, "bad id": 1, big: 7, text: "x" } } }))!);
    expect(out.shape).toEqual({ sex: 1, age: 18, weight: -0.12, detail: { nose_width: 0.5, big: 1 } });
  });

  it("cleans a hello and the name in it", () => {
    const m = parseClientMessage(JSON.stringify({ t: "hello", name: "  Ada<b> ", protocol: 2, key: "abcdefghijklmnop1234", look: JSON.stringify({ body: "realfemale" }) }));
    expect(m).toMatchObject({ t: "hello", name: "Adab", look: JSON.stringify({ body: "realfemale" }) });
  });

  it("needs a proper key in a hello, and checks create and do messages", () => {
    expect(parseClientMessage(JSON.stringify({ t: "hello", name: "Ada", protocol: 2, key: "short" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "do", id: 1, fn: "deposit", args: [100] }))).toMatchObject({ t: "do", fn: "deposit", args: [100] });
    expect(parseClientMessage(JSON.stringify({ t: "do", id: 1, fn: "bad name!", args: [] }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "do", id: 1, fn: "x", args: [{ a: 1 }] }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "create", profile: { backgroundId: "a", sex: "female", firstName: "Ada<b>", surname: "O", hometown: "Ikeja", startingMoney: 1000.4, traits: ["x", 5] } }))).toMatchObject({ t: "create", profile: { firstName: "Adab", startingMoney: 1000, traits: ["x"] } });
  });

  it("rejects numbers that are not finite and unknown messages", () => {
    expect(parseClientMessage(JSON.stringify({ t: "move", x: 1e20, y: 0, z: 0, yaw: 0, clip: "x", level: 0 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "nope" }))).toBeNull();
  });
});
