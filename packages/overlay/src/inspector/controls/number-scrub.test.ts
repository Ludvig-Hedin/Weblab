import { describe, expect, it } from "vitest";
import { fromPercent, toPercent } from "./number-scrub";

describe("opacity as a percentage", () => {
  it("shows a 0-1 value as 0-100", () => {
    expect(toPercent("1")).toBe("100");
    expect(toPercent("0.8")).toBe("80");
    expect(toPercent(".05")).toBe("5");
  });

  it("reads a whole number as a percentage", () => {
    expect(fromPercent("80")).toBe("0.8");
    expect(fromPercent("100")).toBe("1");
    expect(fromPercent("5%")).toBe("0.05");
  });

  it("reads a decimal up to 1 as the fraction itself", () => {
    expect(fromPercent("0.8")).toBe("0.8");
    expect(fromPercent(".5")).toBe("0.5");
  });

  it("reads a small step from the current value as a nudge", () => {
    // ⌥-arrow from 0% emits 0.1: that is 0.1%, not 10%.
    expect(fromPercent("0.1", 0)).toBe("0.001");
    // Typing 0.8 over 100% is still eighty percent.
    expect(fromPercent("0.8", 100)).toBe("0.8");
  });

  it("clamps to the 0-1 range and ignores junk", () => {
    expect(fromPercent("140")).toBe("1");
    expect(fromPercent("-5")).toBe("0");
    expect(fromPercent("abc")).toBeNull();
  });
});
