import { describe, expect, it } from "vitest";
import { validateEmail, validateLogin, validatePassword, validateSignUp } from "./auth.js";

describe("validateEmail", () => {
  it("accepts a normal address", () => {
    expect(validateEmail("ada@example.com")).toBeNull();
  });
  it("rejects empty and malformed addresses", () => {
    expect(validateEmail("  ")).not.toBeNull();
    expect(validateEmail("ada@")).not.toBeNull();
    expect(validateEmail("ada example@x.com")).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("requires length, letters and a digit", () => {
    expect(validatePassword("short1")).not.toBeNull();
    expect(validatePassword("onlyletters")).not.toBeNull();
    expect(validatePassword("12345678")).not.toBeNull();
    expect(validatePassword("goodpass1")).toBeNull();
  });
});

describe("validateLogin", () => {
  it("flags missing fields", () => {
    const errors = validateLogin("", "");
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });
});

describe("validateSignUp", () => {
  const valid = { email: "a@b.co", password: "goodpass1", confirmPassword: "goodpass1", isAdult: true };
  it("passes valid input", () => {
    expect(validateSignUp(valid)).toEqual({});
  });
  it("catches mismatched passwords and the 18+ gate", () => {
    const errors = validateSignUp({ ...valid, confirmPassword: "different1", isAdult: false });
    expect(errors.confirmPassword).toBeDefined();
    expect(errors.isAdult).toBeDefined();
  });
});
