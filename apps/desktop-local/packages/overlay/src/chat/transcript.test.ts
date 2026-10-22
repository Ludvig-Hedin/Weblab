import type { JobDiffBundle } from "@airship/protocol";
import { afterEach, expect, test, vi } from "vitest";
import { canUndoBundle, fillAssistant } from "./transcript";

const SUCCESS_ACTION_LABELS = /Commit|Pull request/;

afterEach(() => document.body.replaceChildren());

function bundle(
  status: "failed" | "cancelled",
  withDiff = true
): JobDiffBundle {
  return {
    additions: 1,
    createdAt: 1,
    deletions: 1,
    diffs: withDiff
      ? [
          {
            additions: 1,
            after: "new",
            before: "old",
            deletions: 1,
            file: "page.tsx",
            isDeleted: false,
            isNew: false,
            patch: "",
          },
        ]
      : [],
    filesChanged: withDiff ? 1 : 0,
    jobId: "partial-edit",
    prompt: "change heading",
    promptPreview: "change heading",
    status,
    target: { displayName: null, source: null, tagName: "h1" },
  };
}

test.each(["failed", "cancelled"] as const)(
  "%s edits with partial writes expose only recovery actions",
  (status) => {
    const target = document.createElement("div");
    document.body.append(target);
    const onUndo = vi.fn();
    const onCommit = vi.fn();
    fillAssistant(target, bundle(status), {
      onCommit,
      onCreatePr: vi.fn(),
      onUndo,
    });
    const undo = target.querySelector<HTMLButtonElement>(
      '[aria-label="Undo this change"]'
    );
    expect(undo).not.toBeNull();
    expect(target.textContent).toContain("page.tsx");
    if (!undo) {
      throw new Error("Expected the recovery Undo button");
    }
    undo.click();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
    expect(target.textContent).not.toMatch(SUCCESS_ACTION_LABELS);
  }
);

test("a failed edit without writes offers no file recovery", () => {
  const target = document.createElement("div");
  fillAssistant(target, bundle("failed", false), { onUndo: vi.fn() });
  expect(target.querySelector('[aria-label="Undo this change"]')).toBeNull();
});

test.each(["done", "failed", "cancelled"] as const)(
  "%s captured writes can be undone",
  (status) => {
    expect(canUndoBundle({ ...bundle("failed"), status })).toBe(true);
  }
);

test.each(["running"] as const)(
  "%s writes cannot be undone while work continues",
  (status) => {
    const pending = { ...bundle("failed"), status };
    expect(canUndoBundle(pending)).toBe(false);
    const target = document.createElement("div");
    fillAssistant(target, pending, { onUndo: vi.fn() });
    expect(target.querySelector('[aria-label="Undo this change"]')).toBeNull();
  }
);

test.each([
  { before: undefined },
  { after: undefined },
  { noBaseline: true },
  { before: null },
  { after: null },
  { before: "old", isNew: true },
  { after: null, before: null, isDeleted: true, isNew: true },
])("missing or inconsistent capture data offers no recovery: %j", (capture) => {
  const partial = bundle("failed");
  Object.assign(partial.diffs[0], capture);
  expect(canUndoBundle(partial)).toBe(false);
  const target = document.createElement("div");
  fillAssistant(target, partial, { onUndo: vi.fn() });
  expect(target.querySelector('[aria-label="Undo this change"]')).toBeNull();
});

test.each([
  { after: "new", before: null, isDeleted: false, isNew: true },
  { after: null, before: "old", isDeleted: true, isNew: false },
])("captured creations and deletions can be undone: %j", (capture) => {
  const partial = bundle("cancelled");
  Object.assign(partial.diffs[0], capture);
  expect(canUndoBundle(partial)).toBe(true);
});

test("partial recovery requires the supplied Undo action", () => {
  const target = document.createElement("div");
  fillAssistant(target, bundle("failed"), {
    onCommit: vi.fn(),
    onCreatePr: vi.fn(),
  });
  expect(target.querySelector('[aria-label="Undo this change"]')).toBeNull();
  expect(target.textContent).not.toContain("page.tsx");
});
