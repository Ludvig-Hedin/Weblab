/**
 * The picker's content: one backend's models, a search across all of them,
 * and the typed-id escape hatch at the end of a search.
 *
 * `modelRows` returns data rather than DOM, which is what makes most of this
 * testable without a popover to put it in. `openModelPicker` is driven for the
 * parts that only exist in the built surface: the rail, the keys, and the
 * press that picks.
 */

import type { ModelCatalogue } from "@airship/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cls } from "../dom";
import { keys } from "../keys/registry";
import { mountPopoverHost } from "../popover-host";
import {
  type ModelMenuDeps,
  modelLabel,
  modelRows,
  openModelPicker,
} from "./model-menu";

const CATALOGUE: ModelCatalogue = [
  {
    agent: "claude",
    default: "opus",
    models: [
      { hint: "1M", id: "claude-opus-5", label: "Opus 5" },
      { id: "sonnet", label: "Sonnet" },
    ],
  },
  { agent: "codex", models: [{ id: "gpt-5.6", label: "GPT-5.6" }] },
  { agent: "opencode", models: [], note: "Not signed in" },
];

function deps(
  agent: "claude" | "codex" | "opencode" = "claude",
  models: Record<string, string> = {},
  pick = vi.fn()
): ModelMenuDeps {
  return { agent, catalogue: CATALOGUE, models, pick };
}

const labels = (rows: { label: string }[]): string[] =>
  rows.map((r) => r.label);

describe("modelRows, unsearched", () => {
  it("lists the shown backend only", () => {
    expect(labels(modelRows(deps(), "codex", ""))).toEqual([
      "Default",
      "GPT-5.6",
    ]);
  });

  it("leads every backend with Default", () => {
    for (const agent of ["claude", "codex", "opencode"] as const) {
      expect(modelRows(deps(), agent, "")[0].label).toBe("Default");
    }
  });

  it("shows the daemon's resolved default as the Default row's hint", () => {
    expect(modelRows(deps(), "claude", "")[0].hint).toBe("opus");
  });

  it("falls back to a phrase when no default was resolved", () => {
    expect(modelRows(deps(), "codex", "")[0].hint).toBe("the backend decides");
  });

  it("marks Default as on when no model is picked for that backend", () => {
    expect(modelRows(deps(), "claude", "")[0].on).toBe(true);
  });

  it("marks each backend's own pick, not the active one's", () => {
    // The reason the state is per harness at all: Claude's pick must not light
    // up a row in Codex's list.
    const d = deps("claude", { claude: "sonnet", codex: "gpt-5.6" });
    expect(modelRows(d, "claude", "").find((r) => r.on)?.label).toBe("Sonnet");
    expect(modelRows(d, "codex", "").find((r) => r.on)?.label).toBe("GPT-5.6");
  });

  it("shows a backend's note as a disabled row when it has no models", () => {
    // An empty list reads as a broken picker; one that says "Not signed in"
    // reads as something the user can go and fix.
    const rows = modelRows(deps(), "opencode", "");
    expect(labels(rows)).toEqual(["Default", "Not signed in"]);
    expect(rows[1].disabled).toBe(true);
  });
});

describe("modelRows, searching", () => {
  it("searches every backend, not just the shown one", () => {
    const rows = modelRows(deps(), "claude", "gpt");
    expect(rows[0]).toMatchObject({ agent: "codex", model: "gpt-5.6" });
  });

  it("matches ids and hints as well as labels", () => {
    expect(modelRows(deps(), "claude", "opus-5")[0].label).toBe("Opus 5");
    expect(modelRows(deps(), "claude", "1m")[0].label).toBe("Opus 5");
  });

  it("never offers a note as a result", () => {
    const rows = modelRows(deps(), "claude", "signed");
    expect(rows.some((r) => r.disabled)).toBe(false);
  });

  it("ends with the typed id, on the shown backend", () => {
    const rows = modelRows(deps(), "opencode", " anthropic/opus ");
    expect(rows.at(-1)).toMatchObject({
      agent: "opencode",
      custom: true,
      model: "anthropic/opus",
    });
  });

  it("drops the typed-id row once the query is an exact id", () => {
    const rows = modelRows(deps(), "claude", "sonnet");
    expect(rows.some((r) => r.custom)).toBe(false);
  });
});

describe("modelLabel", () => {
  it("reads default when nothing is picked", () => {
    expect(modelLabel(CATALOGUE, "claude", undefined)).toBe("default");
  });

  it("resolves a picked id to its label", () => {
    expect(modelLabel(CATALOGUE, "claude", "claude-opus-5")).toBe("Opus 5");
  });

  it("falls back to the raw id for a model it has never heard of", () => {
    // A typed id, or one the seed predates. Showing it verbatim is better than
    // showing nothing, and it is what the user entered.
    expect(modelLabel(CATALOGUE, "claude", "claude-opus-9")).toBe(
      "claude-opus-9"
    );
  });
});

describe("openModelPicker", () => {
  let anchor: HTMLButtonElement;

  beforeEach(() => {
    document.body.replaceChildren();
    mountPopoverHost(document.body);
    anchor = document.createElement("button");
    document.body.append(anchor);
  });

  afterEach(() => {
    keys.destroy();
    document.body.replaceChildren();
  });

  const field = (): HTMLInputElement =>
    document.querySelector(`.${cls("model-field")}`) as HTMLInputElement;
  const rowLabels = (): string[] =>
    [
      ...document.querySelectorAll(
        `.${cls("model-row")} .${cls("model-row-label")}`
      ),
    ].map((n) => n.textContent ?? "");
  const rail = (agent: string): HTMLButtonElement =>
    document.querySelector(`[data-agent="${agent}"]`) as HTMLButtonElement;

  function type(text: string): void {
    field().value = text;
    field().dispatchEvent(new Event("input", { bubbles: true }));
  }

  function press(key: string): void {
    field().dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key })
    );
  }

  it("opens on the composer's backend with focus in the search", () => {
    openModelPicker(anchor, deps("codex"), vi.fn());
    expect(rail("codex").getAttribute("aria-pressed")).toBe("true");
    expect(rowLabels()).toEqual(["Default", "GPT-5.6"]);
    expect(document.activeElement).toBe(field());
  });

  it("switches the list from the rail without picking anything", () => {
    const d = deps();
    openModelPicker(anchor, d, vi.fn());
    rail("codex").click();
    expect(rowLabels()).toEqual(["Default", "GPT-5.6"]);
    expect(d.pick).not.toHaveBeenCalled();
  });

  it("picks the backend and the model together on a press", () => {
    const d = deps();
    const onClose = vi.fn();
    openModelPicker(anchor, d, onClose);
    type("gpt");
    (document.querySelector(`.${cls("model-row")}`) as HTMLElement).click();
    expect(d.pick).toHaveBeenCalledWith({ agent: "codex", model: "gpt-5.6" });
    expect(onClose).toHaveBeenCalled();
  });

  it("uses a typed id on Enter", () => {
    const d = deps();
    openModelPicker(anchor, d, vi.fn());
    type("claude-opus-9");
    press("Enter");
    expect(d.pick).toHaveBeenCalledWith({
      agent: "claude",
      model: "claude-opus-9",
    });
  });

  it("moves with the arrows and keeps focus in the field", () => {
    const d = deps();
    openModelPicker(anchor, d, vi.fn());
    // Opens on the current pick, Default, so one ↓ is the first model.
    press("ArrowDown");
    expect(document.activeElement).toBe(field());
    press("Enter");
    expect(d.pick).toHaveBeenCalledWith({
      agent: "claude",
      model: "claude-opus-5",
    });
  });

  it("clears the search on the first Escape and closes on the second", () => {
    const onClose = vi.fn();
    openModelPicker(anchor, deps(), onClose);
    type("son");
    press("Escape");
    expect(field().value).toBe("");
    expect(onClose).not.toHaveBeenCalled();
    press("Escape");
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles shut when its trigger is pressed again", () => {
    const onClose = vi.fn();
    openModelPicker(anchor, deps(), onClose);
    expect(openModelPicker(anchor, deps(), vi.fn())).toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(field()).toBeNull();
  });

  it("repaints in place when the catalogue arrives", () => {
    const picker = openModelPicker(anchor, deps(), vi.fn());
    type("gpt");
    picker?.update({
      ...deps(),
      catalogue: [
        ...CATALOGUE.slice(0, 1),
        { agent: "codex", models: [{ id: "gpt-6", label: "GPT-6" }] },
      ],
    });
    expect(field().value).toBe("gpt");
    expect(rowLabels()).toContain("GPT-6");
  });
});
