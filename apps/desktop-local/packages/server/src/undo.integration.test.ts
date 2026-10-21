import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunEditResult } from "@airship/core";
import { afterEach, expect, test, vi } from "vitest";
import { WebSocket } from "ws";

const mocks = vi.hoisted(() => ({
  listHistory: vi.fn(),
  readBundle: vi.fn(),
  realRestore: undefined as
    | typeof import("@airship/git").restoreFiles
    | undefined,
  restoreFiles: vi.fn(),
  runEdit: vi.fn(),
  writeBundle: vi.fn(),
}));
vi.mock("@airship/core", async (original) => ({
  ...(await original<typeof import("@airship/core")>()),
  runEdit: mocks.runEdit,
}));
vi.mock("@airship/git", async (original) => {
  const actual = await original<typeof import("@airship/git")>();
  mocks.realRestore = actual.restoreFiles;
  return { ...actual, restoreFiles: mocks.restoreFiles };
});
vi.mock("./history", () => ({
  listHistory: mocks.listHistory,
  readBundle: mocks.readBundle,
  thread: () => [],
  writeBundle: mocks.writeBundle,
}));

import { type RunningServer, startServer } from "./index";
import { MOVED_PROJECT_MESSAGE } from "./root-identity";

let server: RunningServer | undefined;
let parent: string | undefined;
let cwd: string;
let socket: WebSocket | undefined;

afterEach(async () => {
  socket?.terminate();
  await server?.close();
  if (parent) {
    rmSync(parent, { force: true, recursive: true });
  }
  socket = undefined;
  server = undefined;
  parent = undefined;
  vi.resetAllMocks();
});

async function connect() {
  parent = mkdtempSync(join(tmpdir(), "weblab-undo-queue-"));
  cwd = join(parent, "site");
  mkdirSync(cwd);
  mocks.listHistory.mockReturnValue([]);
  mocks.readBundle.mockReturnValue({ diffs: [{ file: "page.tsx" }] });
  server = await startServer({ cwd, port: 0, targetPort: 1 });
  const connectedSocket = new WebSocket(
    `${server.url.replace("http:", "ws:")}/__airship/ws`,
    {
      origin: server.url,
    }
  );
  socket = connectedSocket;
  const events: Record<string, unknown>[] = [];
  connectedSocket.on("message", (raw) => events.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve, reject) => {
    connectedSocket.once("open", resolve);
    connectedSocket.once("error", reject);
  });
  return { events, socket: connectedSocket };
}

function pendingEdit() {
  let finish!: (result: RunEditResult) => void;
  mocks.runEdit.mockImplementation(
    () =>
      new Promise<RunEditResult>((resolve) => {
        finish = resolve;
      })
  );
  return () =>
    finish({
      checkpointId: null,
      diffs: [],
      followUps: [],
      ok: true,
      sessionId: null,
      summary: "",
      timeline: [],
    });
}

test("Undo waits for an active edit and returns its own result", async () => {
  const finish = pendingEdit();
  mocks.restoreFiles.mockReturnValue({ restored: ["page.tsx"], skipped: [] });
  const { socket: ws, events } = await connect();
  ws.send(
    JSON.stringify({ request: { prompt: "update heading" }, type: "edit" })
  );
  await vi.waitFor(() => expect(mocks.runEdit).toHaveBeenCalledOnce());
  ws.send(JSON.stringify({ jobId: "earlier-edit", type: "undo" }));
  ws.send(JSON.stringify({ type: "history" }));
  await vi.waitFor(() =>
    expect(events.some((event) => event.type === "history")).toBe(true)
  );
  expect(mocks.readBundle).not.toHaveBeenCalled();
  expect(mocks.restoreFiles).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() =>
    expect(events).toContainEqual({
      jobId: "earlier-edit",
      ok: true,
      type: "undo:result",
    })
  );
  expect(mocks.restoreFiles).toHaveBeenCalledOnce();
});

test("an unexpected Undo failure reports the correct job and keeps the queue usable", async () => {
  mocks.restoreFiles.mockImplementationOnce(() => {
    throw new Error("read failed");
  });
  mocks.restoreFiles.mockReturnValue({ restored: ["page.tsx"], skipped: [] });
  const { socket: ws, events } = await connect();
  ws.send(JSON.stringify({ jobId: "first", type: "undo" }));
  await vi.waitFor(() =>
    expect(events).toContainEqual({
      error: "undo failed: read failed",
      jobId: "first",
      ok: false,
      type: "undo:result",
    })
  );
  ws.send(JSON.stringify({ jobId: "second", type: "undo" }));
  await vi.waitFor(() =>
    expect(events).toContainEqual({
      jobId: "second",
      ok: true,
      type: "undo:result",
    })
  );
});

test("a history refresh failure preserves completed Undo and later queue work", async () => {
  mocks.restoreFiles.mockReturnValue({ restored: ["page.tsx"], skipped: [] });
  const { socket: ws, events } = await connect();
  mocks.listHistory.mockImplementation(() => {
    throw new Error("history unavailable");
  });
  ws.send(JSON.stringify({ jobId: "first", type: "undo" }));
  await vi.waitFor(() =>
    expect(events).toContainEqual({
      jobId: "first",
      ok: true,
      type: "undo:result",
    })
  );
  ws.send(JSON.stringify({ jobId: "second", type: "undo" }));
  await vi.waitFor(() =>
    expect(events).toContainEqual({
      jobId: "second",
      ok: true,
      type: "undo:result",
    })
  );
  expect(events.filter((event) => event.type === "undo:result")).toHaveLength(
    2
  );
  expect(mocks.restoreFiles).toHaveBeenCalledTimes(2);
});

test.each([false, true])(
  "a root moved while Undo waits refuses replacement=%s before history or restore",
  async (replacement) => {
    const finish = pendingEdit();
    const { socket: ws, events } = await connect();
    writeFileSync(join(cwd, "page.tsx"), "saved original");
    // Any wrongly reached restore/history write would leave observable bytes.
    mocks.restoreFiles.mockImplementation(() => {
      writeFileSync(join(cwd, "page.tsx"), "wrongly restored");
      return { restored: ["page.tsx"], skipped: [] };
    });
    mocks.writeBundle.mockImplementation(() =>
      writeFileSync(join(cwd, "unexpected-history.json"), "{}")
    );
    ws.send(
      JSON.stringify({ request: { prompt: "update heading" }, type: "edit" })
    );
    await vi.waitFor(() => expect(mocks.runEdit).toHaveBeenCalledOnce());
    ws.send(JSON.stringify({ jobId: "queued-before-move", type: "undo" }));
    // A later read-only message confirms Undo was accepted into the queue.
    ws.send(JSON.stringify({ type: "history" }));
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === "history")).toBe(true)
    );
    const historyReads = mocks.listHistory.mock.calls.length;
    const originalParent = parent;
    if (!originalParent) {
      throw new Error("Expected the temporary site parent");
    }
    const moved = join(originalParent, "moved");
    renameSync(cwd, moved);
    if (replacement) {
      mkdirSync(cwd);
      writeFileSync(join(cwd, "page.tsx"), "replacement site");
    }
    finish();
    await vi.waitFor(() =>
      expect(events).toContainEqual({
        error: `undo failed: ${MOVED_PROJECT_MESSAGE}`,
        jobId: "queued-before-move",
        ok: false,
        type: "undo:result",
      })
    );
    expect(mocks.readBundle).not.toHaveBeenCalled();
    expect(mocks.restoreFiles).not.toHaveBeenCalled();
    expect(mocks.writeBundle).not.toHaveBeenCalled();
    expect(mocks.listHistory).toHaveBeenCalledTimes(historyReads);
    expect(readdirSync(moved)).toEqual(["page.tsx"]);
    expect(readFileSync(join(moved, "page.tsx"), "utf8")).toBe(
      "saved original"
    );
    if (replacement) {
      expect(readdirSync(cwd)).toEqual(["page.tsx"]);
      expect(readFileSync(join(cwd, "page.tsx"), "utf8")).toBe(
        "replacement site"
      );
    }
  }
);

test.each(["failed", "cancelled"] as const)(
  "Undo restores captured partial writes from a %s turn",
  async (status) => {
    const { socket: ws, events } = await connect();
    const diff = {
      additions: 1,
      after: "partial heading",
      before: "original heading",
      deletions: 1,
      file: "page.tsx",
      isDeleted: false,
      isNew: false,
      patch: "",
    };
    writeFileSync(join(cwd, diff.file), diff.after);
    mocks.readBundle.mockReturnValue({ diffs: [diff], status });
    const restore = mocks.realRestore;
    if (!restore) {
      throw new Error("Expected the real restore implementation");
    }
    mocks.restoreFiles.mockImplementation(restore);
    ws.send(JSON.stringify({ jobId: "partial-turn", type: "undo" }));
    await vi.waitFor(() =>
      expect(events).toContainEqual({
        jobId: "partial-turn",
        ok: true,
        type: "undo:result",
      })
    );
    expect(readFileSync(join(cwd, diff.file), "utf8")).toBe(diff.before);
  }
);
