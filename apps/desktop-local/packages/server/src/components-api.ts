/**
 * The components API: which React components on the page are shared, and
 * what props one instance takes. Read-only — it answers from the project's
 * source and never writes — but it is a `POST` carrying file paths, so it is
 * gated like the asset upload: the Host allowlist in `handleHttp` first, then
 * an `Origin` equal to the proxy's own, required rather than optional.
 *
 * Bodies are bounded and shape-checked before anything touches the disk; a
 * page with a few hundred components is the expected worst case, not a
 * megabyte of frames.
 */
import type http from "node:http";
import {
  AIRSHIP_COMPONENT_DETAIL_PATH,
  AIRSHIP_COMPONENTS_PATH,
  type ComponentFrameRef,
  type SourceLocation,
} from "@airship/protocol";
import {
  resolveComponentDetail,
  resolveComponents,
} from "@airship/source/components";
import { originMatchesHost } from "./access";

export interface ComponentsApiOptions {
  projectRoot: string;
}

export const MAX_COMPONENTS_BODY_BYTES = 1024 * 1024;
const MAX_REFS = 500;
const MAX_FRAMES = 8;
const MAX_KEY = 512;
const MAX_NAME = 256;
const MAX_FILE = 2048;
const MAX_POSITION = 10_000_000;

const ERR = {
  badRequest: "This request could not be read.",
  failed: "Something went wrong reading your components. Please try again.",
  foreign: "This request came from another site, so it was blocked.",
  method: "This action is not supported.",
  notFound: "Weblab could not find this component in your project.",
  tooLarge: "This request is too large.",
} as const;

class ComponentsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function pathOf(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function isComponentsRequest(url: string | undefined): boolean {
  const path = pathOf(url);
  return (
    path === AIRSHIP_COMPONENTS_PATH || path === AIRSHIP_COMPONENT_DETAIL_PATH
  );
}

/** Route entry. Never throws and never lets a request reach the dev server. */
export async function handleComponentsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: ComponentsApiOptions
): Promise<void> {
  try {
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      throw new ComponentsError(405, ERR.method);
    }
    checkOrigin(req);
    const body = await readJsonBody(req);
    if (pathOf(req.url) === AIRSHIP_COMPONENT_DETAIL_PATH) {
      const ref = parseRef(isRecord(body) ? body.ref : undefined);
      if (!ref) {
        throw new ComponentsError(400, ERR.badRequest);
      }
      const detail = resolveComponentDetail(options.projectRoot, ref);
      if (!detail) {
        throw new ComponentsError(404, ERR.notFound);
      }
      sendJson(res, 200, detail);
      return;
    }
    const refs = parseRefs(isRecord(body) ? body.refs : undefined);
    if (!refs) {
      throw new ComponentsError(400, ERR.badRequest);
    }
    sendJson(res, 200, {
      components: resolveComponents(options.projectRoot, refs),
    });
  } catch (err) {
    const status = err instanceof ComponentsError ? err.status : 500;
    const message = err instanceof ComponentsError ? err.message : ERR.failed;
    if (!res.headersSent) {
      sendJson(res, status, { error: message });
    }
    if (!req.complete) {
      req.resume();
    }
  }
}

/** Required, unlike a GET: a browser always sends Origin on a POST. */
function checkOrigin(req: http.IncomingMessage): void {
  const { origin } = req.headers;
  if (origin === undefined || !originMatchesHost(origin, req.headers.host)) {
    throw new ComponentsError(403, ERR.foreign);
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(json)),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...(status === 413 ? { connection: "close" } : {}),
  });
  res.end(json);
}

/** The body as JSON, refusing anything over the cap before or while reading. */
async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_COMPONENTS_BODY_BYTES) {
    throw new ComponentsError(413, ERR.tooLarge);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > MAX_COMPONENTS_BODY_BYTES) {
      throw new ComponentsError(413, ERR.tooLarge);
    }
    chunks.push(buf);
  }
  const parsed = parseJson(Buffer.concat(chunks).toString("utf8"));
  if (parsed === INVALID_JSON) {
    throw new ComponentsError(400, ERR.badRequest);
  }
  return parsed;
}

const INVALID_JSON: unique symbol = Symbol("invalid-json");

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return INVALID_JSON;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function optionalPosition(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (Number.isInteger(value) &&
      (value as number) >= 0 &&
      (value as number) <= MAX_POSITION)
  );
}

function parseFrame(value: unknown): SourceLocation | null {
  if (!(isRecord(value) && boundedString(value.file, MAX_FILE))) {
    return null;
  }
  const { column, line } = value;
  if (!(optionalPosition(line) && optionalPosition(column))) {
    return null;
  }
  const frame: SourceLocation = { file: value.file };
  if (line !== undefined) {
    frame.line = line;
  }
  if (column !== undefined) {
    frame.column = column;
  }
  return frame;
}

function parseRef(value: unknown): ComponentFrameRef | null {
  if (
    !(
      isRecord(value) &&
      boundedString(value.key, MAX_KEY) &&
      boundedString(value.name, MAX_NAME) &&
      Array.isArray(value.frames) &&
      value.frames.length <= MAX_FRAMES
    )
  ) {
    return null;
  }
  const frames: SourceLocation[] = [];
  for (const raw of value.frames) {
    const frame = parseFrame(raw);
    if (!frame) {
      return null;
    }
    frames.push(frame);
  }
  return { frames, key: value.key, name: value.name };
}

function parseRefs(value: unknown): ComponentFrameRef[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS) {
    return null;
  }
  const refs: ComponentFrameRef[] = [];
  for (const raw of value) {
    const ref = parseRef(raw);
    if (!ref) {
      return null;
    }
    refs.push(ref);
  }
  return refs;
}
