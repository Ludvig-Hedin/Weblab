import { describe, expect, it } from "vitest";
import { PropSet } from "./prop-set";
import { impactNote } from "./scope";
import { cleanStega, decodeStega, encodeStega, hasStega } from "./stega";
import { instanceAt, instanceFor } from "./targeting";

/** Attach a fake React fiber whose owner is `owner`, the way React does. */
function own(node: Element, owner: object): void {
  (node as unknown as Record<string, unknown>).__reactFiber$test = {
    _debugOwner: owner,
    tag: 5,
  };
}

function stack(frame: string): { stack: string } {
  return {
    stack: `Error: react-stack-top-frame\n    at jsxDEV (http://x/node_modules/react.js:1:1)\n    at ${frame}`,
  };
}

// Page > CtaBanner (shared) > Button (shared), plus a one-off Hero.
const page = { name: "HomePage", owner: null, props: {} };
const cta = {
  debugStack: stack("HomePage (http://x/src/app/page.tsx:10:5)"),
  name: "CtaBanner",
  owner: page,
  props: { dark: true, title: "Book a demo" },
};
const button = {
  debugStack: stack("CtaBanner (http://x/src/cta.tsx:20:5)"),
  name: "Button",
  owner: cta,
  props: { label: "Go" },
};
const hero = {
  debugStack: stack("HomePage (http://x/src/app/page.tsx:8:5)"),
  name: "Hero",
  owner: page,
  props: { heading: "Hi" },
};

const shared = new Set(["CtaBanner", "Button"]);
const registry = {
  isShared: (key: string) => shared.has(key.split("|")[0] ?? ""),
};

function build() {
  document.body.innerHTML = `
    <section id="cta"><h2 id="title">Book a demo</h2><a id="btn"><span id="label">Go</span></a></section>
    <section id="hero"><h1 id="heading">Hi</h1></section>`;
  const $ = (id: string) => document.getElementById(id) as Element;
  own($("cta"), cta);
  own($("title"), cta);
  own($("btn"), button);
  own($("label"), button);
  own($("hero"), hero);
  own($("heading"), hero);
  return $;
}

describe("instance targeting", () => {
  it("selects the outermost shared instance at page level", () => {
    const $ = build();
    expect(instanceFor($("label"), registry, null)?.root).toBe($("cta"));
    expect(instanceFor($("title"), registry, null)?.link.name).toBe(
      "CtaBanner"
    );
  });

  it("skips components used only once", () => {
    const $ = build();
    expect(instanceFor($("heading"), registry, null)).toBeNull();
  });

  it("reaches nested instances once inside the parent component", () => {
    const $ = build();
    const outer = instanceFor($("label"), registry, null);
    const inner = instanceFor($("label"), registry, outer?.link.ref ?? null);
    expect(inner?.link.name).toBe("Button");
    expect(inner?.root).toBe($("btn"));
    // The main component's own text is a plain layer inside it.
    expect(
      instanceFor($("title"), registry, outer?.link.ref ?? null)
    ).toBeNull();
  });

  it("names only the instance's own root", () => {
    const $ = build();
    expect(instanceAt($("cta"), registry, null)?.link.name).toBe("CtaBanner");
    expect(instanceAt($("title"), registry, null)).toBeNull();
  });
});

describe("PropSet", () => {
  it("previews a text prop, keeps the first value and reverts on Discard", () => {
    const $ = build();
    const set = new PropSet();
    const base = {
      component: {
        callSite: null,
        definition: null,
        name: "CtaBanner",
        pages: [],
      },
      control: "text" as const,
      instance: cta,
      prop: "title",
      root: $("cta"),
    };
    set.record({ ...base, from: "Book a demo", to: "Talk to us" });
    expect($("title").textContent).toBe("Talk to us");
    set.record({ ...base, from: "Talk to us", to: "Call us" });
    expect($("title").textContent).toBe("Call us");
    expect(set.targets()).toEqual([
      expect.objectContaining({ from: "Book a demo", to: "Call us" }),
    ]);
    set.restore();
    expect($("title").textContent).toBe("Book a demo");
  });

  it("drops an edit that returns to where it started", () => {
    const $ = build();
    const set = new PropSet();
    const base = {
      component: {
        callSite: null,
        definition: null,
        name: "CtaBanner",
        pages: [],
      },
      control: "boolean" as const,
      instance: cta,
      prop: "dark",
      root: $("cta"),
    };
    set.record({ ...base, from: "true", to: "false" });
    expect(set.count()).toBe(1);
    set.record({ ...base, from: "false", to: "true" });
    expect(set.isEmpty()).toBe(true);
  });
});

describe("stega", () => {
  it("round-trips a CMS payload and strips it from the text", () => {
    const value = `Hello${encodeStega({ href: "/studio/intent/edit/id=1", origin: "sanity.io" })}`;
    expect(hasStega(value)).toBe(true);
    expect(cleanStega(value)).toBe("Hello");
    expect(decodeStega(value)).toEqual({
      href: "/studio/intent/edit/id=1",
      origin: "sanity.io",
    });
    expect(hasStega("Hello")).toBe(false);
  });
});

describe("impactNote", () => {
  it("counts pages when there are several, uses otherwise", () => {
    const info = {
      callSite: null,
      definition: null,
      external: false,
      instances: 3,
      isRoute: false,
      key: "k",
      name: "Cta",
      pages: ["/", "/about"],
      shared: true,
    };
    expect(impactNote(info)).toBe("Changing this changes 2 pages.");
    expect(impactNote({ ...info, pages: ["/"] })).toBe(
      "Changing this changes all 3 uses."
    );
  });
});
