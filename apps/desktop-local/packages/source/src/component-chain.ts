/**
 * Which React components a picked DOM node belongs to, nearest first.
 *
 * The editor's idea of a "component instance" is React's idea of an *owner*:
 * the component whose render created the element. That is not the DOM parent.
 * A button a page passes into `<PageHero>{button}</PageHero>` sits inside the
 * hero's DOM but is owned by the page — so it is edited as part of the page,
 * which is exactly how Framer treats slot content.
 *
 * Owners come in two shapes and this module treats them as one:
 *
 * - a **Fiber**, for a client component (`memoizedProps`, `_debugStack`,
 *   `_debugOwner`), and
 * - a **ReactComponentInfo**, for a server component rendered through RSC
 *   (`props`, `debugStack`/`stack`, `owner`). React 19 dev keeps both the props
 *   and the JSX call-site stack on these, which is what makes instance editing
 *   work on a Next.js App Router page at all.
 *
 * Everything here is synchronous and realm-independent: it reads React's own
 * expando keys off the node, so the shell can run it on a frame's nodes without
 * going through the frame agent. Mapping a call-site frame back to a source
 * file is the async part, and the server's job for server-component frames.
 */

/** A prop value, reduced to what can cross to the server and the panel. */
export type PropValue =
  | string
  | number
  | boolean
  | null
  | { kind: "node"; text: string | null }
  | { kind: "object" }
  | { kind: "array"; length: number };

export interface ComponentLink {
  /** The raw call-site frames (`url:line:col`), nearest first, library frames dropped. */
  frames: string[];
  /** Stable per call site — the cache key the server echoes back. */
  key: string;
  name: string;
  /** This instance's props, serialized. `null` when React kept none. */
  props: Record<string, PropValue> | null;
  /** The owner object itself. Opaque; only for `instanceRoot` and identity. */
  ref: object;
}

interface OwnerLike {
  _debugOwner?: OwnerLike | null;
  _debugStack?: { stack?: unknown } | null;
  alternate?: OwnerLike | null;
  debugStack?: { stack?: unknown } | null;
  memoizedProps?: unknown;
  name?: unknown;
  owner?: OwnerLike | null;
  props?: unknown;
  stack?: unknown;
  tag?: number;
  type?: unknown;
}

const FIBER_KEY_PREFIX = "__reactFiber$";
const LEGACY_FIBER_KEY_PREFIX = "__reactInternalInstance$";
/** Owners above this depth are layout plumbing nobody edits. */
const MAX_CHAIN = 24;
const MAX_FRAMES = 4;
const MAX_TEXT = 400;
const STACK_LINE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
/** Frames that belong to React's JSX runtime or its RSC replay, not to user code. */
const LIBRARY_FUNCTION =
  /^(?:exports\.)?(?:jsx|jsxs|jsxDEV|jsxDEV\$1|createElement|fakeJSXCallSite|react[-_]stack[-_]bottom[-_]frame|Object\.react_stack_bottom_frame|Function\.all)$/;
const LIBRARY_URL = /node_modules|<anonymous>|react-server-dom|\/next\/dist\//;
/** React's placeholder for a server prop it refused to serialize. */
const OMITTED = "This object has been omitted by React";

function fiberOf(node: Node): OwnerLike | null {
  for (const key of Object.keys(node)) {
    if (
      key.startsWith(FIBER_KEY_PREFIX) ||
      key.startsWith(LEGACY_FIBER_KEY_PREFIX)
    ) {
      return (node as unknown as Record<string, OwnerLike>)[key] ?? null;
    }
  }
  return null;
}

function isFiber(owner: OwnerLike): boolean {
  return typeof owner.tag === "number";
}

function ownerName(owner: OwnerLike): string | null {
  if (!isFiber(owner)) {
    return typeof owner.name === "string" && owner.name ? owner.name : null;
  }
  const type = owner.type as
    | { displayName?: unknown; name?: unknown; render?: { name?: unknown } }
    | string
    | null
    | undefined;
  if (!type || typeof type === "string") {
    return null;
  }
  for (const candidate of [type.displayName, type.name, type.render?.name]) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  }
  return null;
}

function parentOwner(owner: OwnerLike): OwnerLike | null {
  return (isFiber(owner) ? owner._debugOwner : owner.owner) ?? null;
}

function stackOf(owner: OwnerLike): string | null {
  const raw = isFiber(owner)
    ? owner._debugStack?.stack
    : (owner.debugStack?.stack ?? owner.stack);
  return typeof raw === "string" ? raw : null;
}

/**
 * The user-code frames of a JSX call-site stack.
 *
 * React's stacks open with a `react-stack-top-frame` line, then the runtime's
 * own `jsxDEV` (or, for RSC, the flight client's `fakeJSXCallSite`), then the
 * component whose render wrote the JSX. Those first lines are dropped here; the
 * server makes the final call, because only it can tell a bundled chunk's
 * `node_modules` region from the user's code after mapping.
 */
export function callSiteFrames(stack: string): string[] {
  const out: string[] = [];
  for (const line of stack.split("\n")) {
    const match = STACK_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, fn, url, row, col] = match;
    if ((fn && LIBRARY_FUNCTION.test(fn)) || LIBRARY_URL.test(url ?? "")) {
      continue;
    }
    out.push(`${url}:${row}:${col}`);
    if (out.length >= MAX_FRAMES) {
      break;
    }
  }
  return out;
}

/** Plain text a React element renders, when it is only text and fragments. */
function elementText(value: unknown, depth = 0): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (depth > 6 || value === null || typeof value !== "object") {
    return null;
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const text = elementText(item, depth + 1);
      if (text === null) {
        return null;
      }
      parts.push(text);
    }
    return parts.join("");
  }
  const { props } = value as { props?: { children?: unknown } };
  if (!props) {
    return null;
  }
  return props.children === undefined
    ? ""
    : elementText(props.children, depth + 1);
}

function isReactElement(value: object): boolean {
  const tag = (value as { $$typeof?: unknown }).$$typeof;
  return typeof tag === "symbol";
}

export function serializeProp(value: unknown): PropValue | undefined {
  if (value === undefined || typeof value === "function") {
    return;
  }
  if (typeof value === "string") {
    return value.startsWith(OMITTED) ? { kind: "object" } : value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    const text = elementText(value);
    return text === null
      ? { kind: "array", length: value.length }
      : { kind: "node", text: text.slice(0, MAX_TEXT) };
  }
  if (isReactElement(value)) {
    const text = elementText(value);
    return {
      kind: "node",
      text: text === null ? null : text.slice(0, MAX_TEXT),
    };
  }
  return { kind: "object" };
}

function serializeProps(raw: unknown): Record<string, PropValue> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const out: Record<string, PropValue> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (name === "key" || name === "ref") {
      continue;
    }
    const serialized = serializeProp(value);
    if (serialized !== undefined) {
      out[name] = serialized;
    }
  }
  return out;
}

/**
 * One identity per instance, across a fiber's two buffers.
 *
 * React double-buffers fibers: after a re-render the node's owner may be the
 * `alternate` of the object seen last time. Anything that compares owners —
 * `instanceRoot` walking up, the app's "is this the entered component" — must
 * see the two as one, so both halves map to the first one ever seen.
 */
const canonical = new WeakMap<object, object>();

function identity(owner: OwnerLike): object {
  const known = canonical.get(owner);
  if (known) {
    return known;
  }
  const alt = owner.alternate ? canonical.get(owner.alternate) : undefined;
  const id = alt ?? owner;
  canonical.set(owner, id);
  if (owner.alternate) {
    canonical.set(owner.alternate, id);
  }
  return id;
}

/**
 * The owner chain of a node, nearest owner first. Empty for non-React pages.
 *
 * `withProps: false` skips serializing props — hover runs this on every
 * pointer move, and a page component's `children` can be the whole page.
 */
export function componentChain(
  node: Element,
  withProps = true
): ComponentLink[] {
  let host: Node | null = node;
  let fiber: OwnerLike | null = null;
  while (host && !fiber) {
    fiber = fiberOf(host);
    host = host.parentNode;
  }
  const out: ComponentLink[] = [];
  let owner = fiber ? (fiber._debugOwner ?? null) : null;
  while (owner && out.length < MAX_CHAIN) {
    const name = ownerName(owner);
    if (name) {
      const stack = stackOf(owner);
      const frames = stack ? callSiteFrames(stack) : [];
      out.push({
        frames,
        key: `${name}|${frames[0] ?? ""}`,
        name,
        props: withProps
          ? serializeProps(isFiber(owner) ? owner.memoizedProps : owner.props)
          : null,
        ref: identity(owner),
      });
    }
    owner = parentOwner(owner);
  }
  return out;
}

/** Whether `node`'s owner chain contains the instance `ref`. Cheap: no props. */
export function isOwnedBy(node: Element, ref: object): boolean {
  let host: Node | null = node;
  let fiber: OwnerLike | null = null;
  while (host && !fiber) {
    fiber = fiberOf(host);
    host = host.parentNode;
  }
  let owner = fiber ? (fiber._debugOwner ?? null) : null;
  let depth = 0;
  while (owner && depth < MAX_CHAIN) {
    if (identity(owner) === ref) {
      return true;
    }
    owner = parentOwner(owner);
    depth += 1;
  }
  return false;
}

/**
 * The outermost DOM element this instance rendered, found from any node in it.
 *
 * Walks up while the parent is still owned (at any depth) by the instance. A
 * component that returns a fragment has several roots; the first one found
 * from the picked node is the one the user was pointing at, which is the right
 * answer for a selection outline.
 */
export function instanceRoot(node: Element, ref: object): Element {
  let root = node;
  let parent = node.parentElement;
  while (parent && isOwnedBy(parent, ref)) {
    root = parent;
    parent = parent.parentElement;
  }
  return root;
}

interface CallSiteRef {
  frames: string[];
  key: string;
  name: string;
}

/**
 * Add the call sites of one element's owners, stopping at the first owner
 * already walked — everything above it was recorded on that earlier walk.
 */
function collectOwners(
  fiber: OwnerLike | null,
  seen: Map<string, CallSiteRef>,
  visited: WeakSet<object>
): void {
  let owner = fiber?._debugOwner ?? null;
  for (let depth = 0; owner && depth < MAX_CHAIN; depth += 1) {
    const id = identity(owner);
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    const name = ownerName(owner);
    if (name) {
      const stack = stackOf(owner);
      const frames = stack ? callSiteFrames(stack) : [];
      const key = `${name}|${frames[0] ?? ""}`;
      if (!seen.has(key)) {
        seen.set(key, { frames, key, name });
      }
    }
    owner = parentOwner(owner);
  }
}

/** One entry per distinct call site on the page, for a single batch lookup. */
export function pageComponents(doc: Document, cap = 6000): CallSiteRef[] {
  const seen = new Map<string, CallSiteRef>();
  const visited = new WeakSet<object>();
  const all = doc.body?.getElementsByTagName("*") ?? [];
  const limit = Math.min(all.length, cap);
  for (let i = 0; i < limit; i += 1) {
    collectOwners(fiberOf(all[i] as Element), seen, visited);
  }
  return [...seen.values()];
}
