import { describe, expect, it } from "vitest";
import { shownHeight } from "./frames";
import { freezeValue, MAX_PAGE_HEIGHT } from "./page-fit";

describe("freezeValue", () => {
  it("turns every viewport-height unit into device pixels", () => {
    expect(freezeValue("100vh", 900)).toBe("900px");
    expect(freezeValue("100svh", 900)).toBe("900px");
    expect(freezeValue("50dvh", 900)).toBe("450px");
    expect(freezeValue("100lvh", 874)).toBe("874px");
  });

  it("rewrites inside calc and min without touching other units", () => {
    expect(freezeValue("min(490px, calc(100svh - 112px))", 1000)).toBe(
      "min(490px, calc(1000px - 112px))"
    );
    expect(freezeValue("calc(100vw - 2rem)", 900)).toBe("calc(100vw - 2rem)");
    expect(freezeValue("10vmin", 900)).toBe("10vmin");
  });

  it("keeps fractions and negatives", () => {
    expect(freezeValue("33.3vh", 900)).toBe("299.7px");
    expect(freezeValue("-10vh", 900)).toBe("-90px");
    expect(freezeValue(".5vh", 1000)).toBe("5px");
  });
});

describe("shownHeight", () => {
  it("is one screen before the page reports, then the whole page", () => {
    expect(shownHeight({ height: 900, pageHeight: null })).toBe(900);
    expect(shownHeight({ height: 900, pageHeight: 5200 })).toBe(5200);
  });

  it("never draws a frame shorter than its device", () => {
    expect(shownHeight({ height: 900, pageHeight: 400 })).toBe(900);
  });

  it("has a ceiling a runaway page cannot pass", () => {
    expect(MAX_PAGE_HEIGHT).toBeGreaterThan(10_000);
  });
});
