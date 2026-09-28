import type { DesignToken } from "@airship/protocol/tokens";
import { describe, expect, it, vi } from "vitest";
import {
  displayValue,
  friendlyName,
  toVariableName,
  type VariableStep,
  VariablesPanel,
  type VariableWrite,
} from "./variables-panel";

function variable(
  name: string,
  value: string,
  category: DesignToken["category"],
  extra: Partial<DesignToken> = {}
): DesignToken {
  return {
    category,
    file: "src/app.css",
    kind: "css-var",
    line: 3,
    name,
    origin: "static",
    values: { "": value },
    ...extra,
  };
}

function setup(list: DesignToken[]) {
  const writes: VariableWrite[] = [];
  const steps: VariableStep[] = [];
  const panel = new VariablesPanel({
    record: (step) => steps.push(step),
    subscribe: () => () => undefined,
    variables: () => list,
    write: vi.fn((change: VariableWrite) => {
      writes.push(change);
      return true;
    }),
  });
  document.body.append(panel.element);
  return { panel, steps, writes };
}

const valueCell = (panel: VariablesPanel, name: string, mode = "") =>
  panel.element.querySelector<HTMLElement>(
    `[data-var="${name}"] [data-mode="${mode}"]`
  );

const pickerInput = () =>
  document.querySelector<HTMLInputElement>(
    "input[aria-label='Value, or search variables']"
  );

describe("names and values", () => {
  it("reads like a design tool, not like CSS", () => {
    expect(toVariableName("brand color")).toBe("--brand-color");
    expect(friendlyName(variable("--color-brand", "#fff", "colors"))).toBe(
      "brand"
    );
    expect(displayValue("#0d99ff")).toBe("0D99FF");
    expect(displayValue("16px")).toBe("16px");
  });
});

describe("VariablesPanel", () => {
  const dark = {
    file: "src/app.css",
    id: "dark",
    kind: "theme" as const,
    label: "Dark",
    line: 9,
    value: "#000000",
  };
  const list = [
    variable("--color-white", "#ffffff", "colors"),
    variable("--color-bg", "#ffffff", "colors", {
      modes: { dark },
    }),
    variable("--color-surface", "#ffffff", "colors", {
      aliasOf: "--color-white",
    }),
    variable("--space-4", "16px", "spacing"),
    variable("--p-4", "16px", "spacing", { kind: "utility-class" }),
  ];

  it("lists collections and a column per mode", () => {
    const { panel } = setup(list);
    const text = panel.element.textContent ?? "";
    expect(text).toContain("Colors3");
    expect(text).toContain("Spacing1");
    expect(text).toContain("Dark");
    expect(panel.element.querySelector("[data-var='--p-4']")).toBeNull();
    expect(valueCell(panel, "--color-surface")?.textContent).toBe("white");
  });

  it("connects a variable to another from the list, as one undo step", () => {
    const { panel, steps, writes } = setup(list);
    valueCell(panel, "--color-bg")?.click();
    const item = Array.from(
      document.querySelectorAll<HTMLElement>("[data-pop-item]")
    ).find((node) => node.textContent?.startsWith("white"));
    item?.click();
    expect(writes.at(-1)).toMatchObject({
      name: "--color-bg",
      op: "set",
      value: "var(--color-white)",
    });
    panel.onWriteResult({ file: "src/app.css", name: "--color-bg", ok: true });
    expect(steps[0]?.undo).toMatchObject({ op: "set", value: "#ffffff" });
  });

  it("edits a mode's own value where it is written", () => {
    const { panel, writes } = setup(list);
    valueCell(panel, "--color-bg", "dark")?.click();
    const input = pickerInput();
    if (!input) {
      throw new Error("no picker");
    }
    input.value = "#111111";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(writes.at(-1)).toMatchObject({
      line: 9,
      op: "set",
      value: "#111111",
    });
  });

  it("adds a value to a mode next to one already there", () => {
    const { panel, writes } = setup(list);
    valueCell(panel, "--color-white", "dark")?.click();
    const input = pickerInput();
    if (!input) {
      throw new Error("no picker");
    }
    input.value = "#000000";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(writes.at(-1)).toMatchObject({
      afterLine: 9,
      name: "--color-white",
      op: "create",
    });
  });

  it("opens the color picker from the swatch, not the value list", () => {
    const { panel } = setup(list);
    const swatch = valueCell(
      panel,
      "--color-white"
    )?.querySelector<HTMLElement>("button[aria-label='Change white color']");
    swatch?.click();
    expect(document.querySelector("[aria-label='Hue']")).not.toBeNull();
    expect(pickerInput()).toBeNull();
  });

  it("shows the server's error for a failed write", () => {
    const { panel } = setup(list);
    valueCell(panel, "--space-4")?.click();
    const input = pickerInput();
    if (!input) {
      throw new Error("no picker");
    }
    input.value = "20px";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    panel.onWriteResult({ error: "Nope.", name: "--space-4", ok: false });
    expect(panel.element.textContent).toContain("Nope.");
  });
});
