import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { WebSocket } from "ws";

const mocks = vi.hoisted(() => ({ runEdit: vi.fn(), restoreFiles: vi.fn(), readBundle: vi.fn() }));
vi.mock("@airship/core", async (original) => ({ ...await original<typeof import("@airship/core")>(), runEdit: mocks.runEdit }));
vi.mock("@airship/git", async (original) => ({ ...await original<typeof import("@airship/git")>(), restoreFiles: mocks.restoreFiles }));
vi.mock("./history", () => ({ listHistory: () => [], readBundle: mocks.readBundle, writeBundle: vi.fn(), thread: () => [] }));
import { type RunningServer, startServer } from "./index";

let server: RunningServer | undefined;
let cwd: string;
let socket: WebSocket | undefined;

afterEach(async () => {
  socket?.terminate();
  await server?.close();
  if (cwd) rmSync(cwd, { force: true, recursive: true });
  vi.resetAllMocks();
});

async function connect() {
  cwd = mkdtempSync(join(tmpdir(), "weblab-undo-queue-"));
  server = await startServer({ cwd, port: 0, targetPort: 1 });
  socket = new WebSocket(server.url.replace("http:", "ws:") + "/__airship/ws", { origin: server.url });
  const events: Record<string, unknown>[] = [];
  socket.on("message", (raw) => events.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve, reject) => { socket!.once("open", resolve); socket!.once("error", reject); });
  mocks.readBundle.mockReturnValue({ diffs: [{ file: "page.tsx" }] });
  return { socket, events };
}

test("Undo waits for an active edit and returns its own result", async () => {
  let finish!: (result: unknown) => void;
  mocks.runEdit.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  mocks.restoreFiles.mockReturnValue({ restored: ["page.tsx"], skipped: [] });
  const { socket: ws, events } = await connect();
  ws.send(JSON.stringify({ type: "edit", request: { prompt: "update heading" } }));
  await vi.waitFor(() => expect(mocks.runEdit).toHaveBeenCalledOnce());
  ws.send(JSON.stringify({ type: "undo", jobId: "earlier-edit" }));
  ws.send(JSON.stringify({ type: "history" }));
  await vi.waitFor(() => expect(events.some((event) => event.type === "history")).toBe(true));
  expect(mocks.restoreFiles).not.toHaveBeenCalled();
  finish({ ok: true, diffs: [], followUps: [], timeline: [] });
  await vi.waitFor(() => expect(events).toContainEqual({ type: "undo:result", jobId: "earlier-edit", ok: true }));
  expect(mocks.restoreFiles).toHaveBeenCalledOnce();
});

test("an unexpected Undo failure reports the correct job and keeps the queue usable", async () => {
  mocks.restoreFiles.mockImplementationOnce(() => { throw new Error("read failed"); });
  mocks.restoreFiles.mockReturnValue({ restored: ["page.tsx"], skipped: [] });
  const { socket: ws, events } = await connect();
  ws.send(JSON.stringify({ type: "undo", jobId: "first" }));
  await vi.waitFor(() => expect(events).toContainEqual({ type: "undo:result", jobId: "first", ok: false, error: "undo failed: read failed" }));
  ws.send(JSON.stringify({ type: "undo", jobId: "second" }));
  await vi.waitFor(() => expect(events).toContainEqual({ type: "undo:result", jobId: "second", ok: true }));
});
