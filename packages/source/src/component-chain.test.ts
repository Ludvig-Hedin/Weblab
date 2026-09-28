import { describe, expect, it } from "vitest";
import {
  callSiteFrames,
  componentChain,
  instanceRoot,
  isOwnedBy,
  serializeProp,
} from "./component-chain";

const PAGE_STACK = `Error: react-stack-top-frame
    at fakeJSXCallSite (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-server-dom-turbopack_1._.js:2001:21)
    at AboutPage (about://React/Server/file:///app/.next/dev/server/chunks/ssr/%5Broot%5D__1._.js?11:49:264)`;
const HERO_HOST_STACK = `Error: react-stack-top-frame
    at exports.jsxDEV (http://localhost:3000/_next/static/chunks/node_modules_0_x._.js:12236:33)
    at Hero (http://localhost:3000/_next/static/chunks/src_1._.js:418:231)`;

interface FakeNode {
  parentElement: FakeNode | null;
  parentNode: FakeNode | null;
  [key: string]: unknown;
}

function node(parent: FakeNode | null, fiber?: object): FakeNode {
  const n: FakeNode = { parentElement: parent, parentNode: parent };
  if (fiber) {
    n.__reactFiber$abc = fiber;
  }
  return n;
}

// Server component info: the page, then a Hero it renders.
const page = { env: "Server", name: "AboutPage", owner: null, props: {} };
const hero = {
  debugStack: { stack: PAGE_STACK },
  env: "Server",
  name: "Hero",
  owner: page,
  props: {
    dark: true,
    heading: {
      $$typeof: Symbol.for("react.element"),
      props: { children: ["Hi ", "there"] },
    },
    onClick: () => undefined,
    title: "Hello",
  },
};

describe("callSiteFrames", () => {
  it("drops React's runtime frames and keeps the user's call site", () => {
    expect(callSiteFrames(PAGE_STACK)).toEqual([
      "about://React/Server/file:///app/.next/dev/server/chunks/ssr/%5Broot%5D__1._.js?11:49:264",
    ]);
    expect(callSiteFrames(HERO_HOST_STACK)).toEqual([
      "http://localhost:3000/_next/static/chunks/src_1._.js:418:231",
    ]);
  });
});

describe("serializeProp", () => {
  it("keeps primitives, flattens text elements and drops functions", () => {
    expect(serializeProp("x")).toBe("x");
    expect(serializeProp(3)).toBe(3);
    expect(serializeProp(() => 1)).toBeUndefined();
    expect(serializeProp({ a: 1 })).toEqual({ kind: "object" });
    expect(
      serializeProp({ $$typeof: Symbol.for("x"), props: { children: "Hey" } })
    ).toEqual({ kind: "node", text: "Hey" });
    expect(
      serializeProp("This object has been omitted by React in the console")
    ).toEqual({ kind: "object" });
  });
});

describe("componentChain", () => {
  const body = node(null);
  const section = node(body, { _debugOwner: hero, tag: 5 });
  const h1 = node(section, { _debugOwner: hero, tag: 5 });
  const text = node(h1);
  const sibling = node(body, { _debugOwner: page, tag: 5 });

  it("lists owners nearest first with serialized props", () => {
    const chain = componentChain(text as unknown as Element);
    expect(chain.map((c) => c.name)).toEqual(["Hero", "AboutPage"]);
    expect(chain[0]?.props).toEqual({
      dark: true,
      heading: { kind: "node", text: "Hi there" },
      title: "Hello",
    });
    expect(chain[0]?.key).toContain("Hero|about://React/Server/");
  });

  it("finds the instance's outermost element", () => {
    const [heroLink] = componentChain(h1 as unknown as Element);
    expect(heroLink).toBeDefined();
    if (!heroLink) {
      return;
    }
    expect(instanceRoot(h1 as unknown as Element, heroLink.ref)).toBe(section);
    expect(isOwnedBy(sibling as unknown as Element, heroLink.ref)).toBe(false);
  });

  it("treats a fiber and its alternate as one instance", () => {
    const client = {
      _debugOwner: null,
      memoizedProps: { a: "1" },
      tag: 0,
      type: { name: "Card" },
    };
    const alternate = { ...client, alternate: client };
    (client as { alternate?: object }).alternate = alternate;
    const a = node(null, { _debugOwner: client, tag: 5 });
    const b = node(null, { _debugOwner: alternate, tag: 5 });
    const [first] = componentChain(a as unknown as Element);
    const [second] = componentChain(b as unknown as Element);
    expect(first?.ref).toBe(second?.ref);
  });
});
