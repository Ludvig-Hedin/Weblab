import { beforeEach, describe, expect, it } from "vitest";
import { ChromeLayer } from "../chrome-layer";
import { isOwn } from "../edit-guard";
import { DesignPanel } from "./panel";
import { harness, resetDocument, selectionOf, sizeOf } from "./test-support";

beforeEach(resetDocument);

describe("HTML dropdown options", () => {
  it("shows script-created options and lets the editor select one without changing the value", () => {
    const select = document.createElement("select");
    const first = document.createElement("option");
    first.value = "all";
    first.textContent = "All task families";
    const second = document.createElement("option");
    second.value = "drafting";
    second.textContent = "Drafting";
    second.disabled = true;
    select.append(first, second);
    document.body.append(select);
    sizeOf(select, { height: 32, left: 100, top: 60, width: 180 });

    const layer = new ChromeLayer();
    layer.mount(document.body);
    const chrome = layer.element;
    const h = harness({ layer });
    const panel = new DesignPanel(h.deps);
    panel.setSelection(selectionOf(select, { surface: h.surface }));
    panel.element
      .querySelector<HTMLButtonElement>('[aria-label="Show"]')
      ?.click();

    const menu = chrome.querySelector('[role="listbox"]');
    expect(menu?.textContent).toContain("Drafting");
    expect(isOwn(menu?.querySelector('[role="option"]') ?? null)).toBe(true);
    menu?.querySelectorAll<HTMLButtonElement>('[role="option"]')[1]?.click();
    expect(h.spy.selected.at(-1)?.node).toBe(second);
    expect(select.value).toBe("all");

    panel.element
      .querySelector<HTMLButtonElement>('[aria-label="Hide"]')
      ?.click();
    expect(chrome.querySelector('[role="listbox"]')).toBeNull();
    panel.destroy();
  });
});
