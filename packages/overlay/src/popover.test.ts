import { afterEach, describe, expect, it } from "vitest";
import { placePopover } from "./popover";

function menuOf(width: number, height: number): HTMLElement {
  const menu = document.createElement("div");
  document.body.append(menu);
  Object.defineProperties(menu, {
    clientHeight: { value: height },
    offsetHeight: { value: height },
    offsetParent: { value: null },
    offsetWidth: { value: width },
    scrollHeight: { value: height },
  });
  return menu;
}

describe("placePopover beside", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("opens left of the edge, level with the anchor", () => {
    const menu = menuOf(280, 300);
    placePopover(menu, new DOMRect(1000, 200, 200, 24), "below", {
      beside: 960,
    });
    // 960 - 6 gap - 280 wide.
    expect(menu.style.left).toBe("674px");
    expect(menu.style.top).toBe("200px");
  });

  it("keeps the user's scroll position when it re-places", () => {
    const menu = menuOf(280, 300);
    menu.scrollTop = 120;
    placePopover(menu, new DOMRect(1000, 200, 200, 24), "below", {
      beside: 960,
    });
    expect(menu.scrollTop).toBe(120);
  });

  it("falls back to below when there is no room on the left", () => {
    const menu = menuOf(280, 100);
    placePopover(menu, new DOMRect(100, 200, 200, 24), "below", {
      beside: 120,
    });
    expect(menu.style.top).toBe("230px");
  });
});
