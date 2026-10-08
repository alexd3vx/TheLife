import { describe, expect, it } from "vitest";
import { validateEmail, validateLogin, validatePassword, validateSignUp, validateUsername } from "./auth.js";

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

describe("validateUsername", () => {
  it("accepts 3 to 20 letters, numbers and underscores", () => {
    expect(validateUsername("Ada_01")).toBeNull();
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("a".repeat(21))).not.toBeNull();
    expect(validateUsername("no spaces")).not.toBeNull();
    expect(validateUsername("emoji😀name")).not.toBeNull();
    expect(validateUsername("   ")).not.toBeNull();
  });
});

describe("validateSignUp", () => {
  const valid = { username: "Ada_01", email: "a@b.co", password: "goodpass1", confirmPassword: "goodpass1", isAdult: true };
  it("passes valid input", () => {
    expect(validateSignUp(valid)).toEqual({});
  });
  it("catches mismatched passwords and the 18+ gate", () => {
    const errors = validateSignUp({ ...valid, confirmPassword: "different1", isAdult: false });
    expect(errors.confirmPassword).toBeDefined();
    expect(errors.isAdult).toBeDefined();
  });
});
