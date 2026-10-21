import type { JobDiffBundle } from "@airship/protocol";
import { afterEach, expect, test, vi } from "vitest";
import { fillAssistant } from "./transcript";

afterEach(() => document.body.replaceChildren());

function bundle(status: "failed" | "cancelled", withDiff = true): JobDiffBundle {
  return {
    additions: 1, deletions: 1, createdAt: 1, filesChanged: withDiff ? 1 : 0,
    jobId: "partial-edit", prompt: "change heading", status,
    target: { displayName: null, source: null, tagName: "h1" },
    diffs: withDiff ? [{ file: "page.tsx", before: "old", after: "new", additions: 1, deletions: 1, patch: "", isNew: false, isDeleted: false }] : [],
  };
}

test.each(["failed", "cancelled"] as const)("%s edits with partial writes expose only recovery actions", (status) => {
  const target = document.createElement("div");
  document.body.append(target);
  const onUndo = vi.fn();
  const onCommit = vi.fn();
  fillAssistant(target, bundle(status), { onUndo, onCommit, onCreatePr: vi.fn() });
  const undo = target.querySelector<HTMLButtonElement>('[aria-label="Undo this change"]');
  expect(undo).not.toBeNull();
  expect(target.textContent).toContain("page.tsx");
  undo!.click();
  expect(onUndo).toHaveBeenCalledOnce();
  expect(onCommit).not.toHaveBeenCalled();
  expect(target.textContent).not.toMatch(/Commit|Pull request/);
});

test("a failed edit without writes offers no file recovery", () => {
  const target = document.createElement("div");
  fillAssistant(target, bundle("failed", false), { onUndo: vi.fn() });
  expect(target.querySelector('[aria-label="Undo this change"]')).toBeNull();
});
