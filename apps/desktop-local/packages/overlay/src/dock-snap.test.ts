/**
 * When a dragged panel docks, and which edges a floating one sticks to.
 *
 * Free functions, tested directly for the reason `dock-size.test.ts` gives.
 */

import { describe, expect, it } from "vitest";
import { inDockZone, snapTo } from "./app";

describe("inDockZone", () => {
  it("docks a left panel whose left edge is near the window's", () => {
    expect(inDockZone("left", 0, 320, 1440)).toBe(true);
    expect(inDockZone("left", 32, 320, 1440)).toBe(true);
    expect(inDockZone("left", 33, 320, 1440)).toBe(false);
  });

  it("docks a right panel by its right edge, not its left", () => {
    expect(inDockZone("right", 1440 - 300, 300, 1440)).toBe(true);
    expect(inDockZone("right", 1440 - 300 - 32, 300, 1440)).toBe(true);
    expect(inDockZone("right", 1440 - 300 - 33, 300, 1440)).toBe(false);
  });

  it("never docks a panel on the other side's edge", () => {
    expect(inDockZone("left", 1440 - 320, 320, 1440)).toBe(false);
    expect(inDockZone("right", 0, 300, 1440)).toBe(false);
  });
});

describe("snapTo", () => {
  it("pulls onto a guide within reach", () => {
    expect(snapTo(26, [20])).toBe(20);
    expect(snapTo(14, [20])).toBe(20);
  });

  it("leaves a value alone when no guide is close", () => {
    expect(snapTo(40, [20, 100])).toBe(40);
  });

  it("picks the nearest of two guides in reach", () => {
    expect(snapTo(25, [20, 27])).toBe(27);
  });
});
