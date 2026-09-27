import { beforeEach, describe, expect, it, vi } from "vitest";
import type { History } from "./history";
import type { Selection, SelectionController } from "./picker";
import {
  ELEMENT_PRESETS,
  elementsFromHtml,
  nestingIssue,
  parseTagQuery,
  placementFor,
  retagged,
  StructureEditor,
} from "./structure-ops";
import { StructureSet } from "./structure-set";

vi.mock("./toast", () => ({ toast: vi.fn() }));

function page(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

function editorFor(node: Element) {
  const structureSet = new StructureSet();
  const pushed: unknown[] = [];
  const history = {
    batch: (fn: () => void) => fn(),
    push: (op: unknown) => pushed.push(op),
  } as unknown as History;
  let selected: Element = node;
  const controller = {
    select: (next: Element) => {
      selected = next;
    },
  } as unknown as SelectionController;
  const editor = new StructureEditor({
    controller,
    history,
    onChanged: () => undefined,
    selection: () =>
      ({
        element: {
          classes: [],
          displayName: null,
          tagName: selected.tagName.toLowerCase(),
          textPreview: "",
        },
        node: selected,
        source: null,
      }) as unknown as Selection,
    structureSet,
  });
  return { editor, pushed, selected: () => selected, structureSet };
}

describe("placementFor", () => {
  it("puts a new element inside a container and after a leaf", () => {
    const body = page("<div id=box></div><p id=text>Hi</p><ul id=list></ul>");
    expect(placementFor(body.querySelector("#box") as Element, "p")).toBe(
      "inside"
    );
    expect(placementFor(body.querySelector("#text") as Element, "p")).toBe(
      "after"
    );
    expect(placementFor(body.querySelector("#list") as Element, "li")).toBe(
      "inside"
    );
  });
});

describe("parseTagQuery", () => {
  it("reads a tag out of what was typed", () => {
    expect(parseTagQuery("<section>")).toBe("section");
    expect(parseTagQuery(" Nav ")).toBe("nav");
    expect(parseTagQuery("my-card")).toBe("my-card");
    expect(parseTagQuery("not a tag")).toBeNull();
  });
});

describe("elementsFromHtml", () => {
  it("builds elements from JSX and drops what could run", () => {
    const nodes = elementsFromHtml(
      document,
      '<div className="card" onClick={go} style={{a: 1}}><script>x()</script><a href="javascript:alert(1)">Hi</a></div>'
    );
    expect(nodes).toHaveLength(1);
    const [card] = nodes;
    expect(card.getAttribute("class")).toBe("card");
    expect(card.querySelector("script")).toBeNull();
    expect(card.querySelector("a")?.hasAttribute("href")).toBe(false);
  });

  it("drops script links however they are spelled", () => {
    const [link] = elementsFromHtml(
      document,
      '<a href="java&#9;script:alert(1)">x</a>'
    );
    expect(link.hasAttribute("href")).toBe(false);
  });

  it("ignores text that is not markup", () => {
    expect(elementsFromHtml(document, "hello")).toEqual([]);
  });

  it("parses every preset", () => {
    for (const preset of ELEMENT_PRESETS) {
      expect(elementsFromHtml(document, preset.html)).toHaveLength(1);
    }
  });
});

describe("nestingIssue", () => {
  it("warns about a link in a link and a block in a paragraph", () => {
    // Built by hand: the HTML parser would split these before we saw them.
    const outer = document.createElement("a");
    const inner = document.createElement("a");
    outer.append(document.createElement("span"));
    outer.firstElementChild?.append(inner);
    expect(nestingIssue(inner)).toContain("link inside a link");
    expect(nestingIssue(outer)).toContain("link inside a link");
    const p = document.createElement("p");
    p.append(document.createElement("section"));
    expect(nestingIssue(p)).toContain("block inside a paragraph");
  });

  it("is quiet for ordinary HTML", () => {
    const body = page("<section><div><p>Fine</p></div></section>");
    expect(nestingIssue(body.firstElementChild as Element)).toBeNull();
  });
});

describe("retagged", () => {
  it("keeps attributes and adds what a link or button needs", () => {
    const div = document.createElement("div");
    div.className = "cta";
    expect(retagged(div, "a").getAttribute("href")).toBe("#");
    expect(retagged(div, "button").getAttribute("type")).toBe("button");
    expect(retagged(div, "section").className).toBe("cta");
  });
});

describe("StructureEditor", () => {
  let body: HTMLElement;
  beforeEach(() => {
    body = page("<main id=main><p id=text>Hello</p></main>");
  });

  it("adds after a leaf, and undo takes it away", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet } = editorFor(text);
    editor.insertTag("button");
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<p id="text">Hello</p><button>button</button>'
    );
    const [target] = structureSet.targets();
    expect(target.op).toBe("insert");
    expect(target.position).toBe("after");
    expect(target.html).toBe("<button>button</button>");
    structureSet.restore();
    expect(body.querySelector("button")).toBeNull();
  });

  it("wraps and unwraps, and both undo cleanly", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet, selected } = editorFor(text);
    editor.wrap("section");
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<section><p id="text">Hello</p></section>'
    );
    const wrapper = selected();
    expect(wrapper.tagName).toBe("SECTION");
    editor.unwrap();
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<p id="text">Hello</p>'
    );
    structureSet.remove(wrapper); // undo the unwrap
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<section><p id="text">Hello</p></section>'
    );
  });

  it("changes any tag and changes it back", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet, selected } = editorFor(text);
    editor.retag("h2");
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<h2 id="text">Hello</h2>'
    );
    expect(structureSet.targets()[0]).toMatchObject({
      fromTag: "p",
      op: "retag",
      toTag: "h2",
    });
    structureSet.remove(selected());
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<p id="text">Hello</p>'
    );
  });

  it("undoes a tag change and an unwrap of the same element in turn", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet, selected } = editorFor(text);
    editor.wrap("div");
    const wrapper = selected();
    editor.retag("nav");
    const nav = selected();
    editor.unwrap();
    expect(structureSet.targets().map((t) => t.op)).toEqual([
      "wrap",
      "retag",
      "unwrap",
    ]);
    structureSet.remove(nav); // undo the unwrap
    structureSet.remove(nav); // undo the tag change
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<div><p id="text">Hello</p></div>'
    );
    structureSet.remove(wrapper); // undo the wrap
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<p id="text">Hello</p>'
    );
    expect(structureSet.count()).toBe(0);
  });

  it("pastes several elements in order as one change", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet } = editorFor(text);
    editor.insertHtml("<h2>One</h2><p>Two</p>");
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<p id="text">Hello</p><h2>One</h2><p>Two</p>'
    );
    expect(structureSet.targets()).toHaveLength(1);
    expect(structureSet.targets()[0].html).toBe("<h2>One</h2>\n<p>Two</p>");
    structureSet.restore();
    expect(body.querySelector("#main")?.innerHTML).toBe(
      '<p id="text">Hello</p>'
    );
  });

  it("undoes the change a chip names, not the node's latest", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet, selected } = editorFor(text);
    editor.retag("h3");
    editor.wrap("div");
    const [retag] = structureSet.entries();
    structureSet.remove(retag);
    expect(structureSet.targets().map((t) => t.op)).toEqual(["wrap"]);
    expect(selected().innerHTML).toBe('<p id="text">Hello</p>');
  });

  it("does not bring back a node deleted after it was wrapped", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet } = editorFor(text);
    editor.wrap("section");
    const [wrap] = structureSet.entries();
    text.remove(); // a later delete
    structureSet.remove(wrap);
    expect(text.isConnected).toBe(false);
    expect(body.querySelector("section")).toBeNull();
  });

  it("ships nothing when an added element is deleted again", () => {
    const text = body.querySelector("#text") as Element;
    const { editor, structureSet, selected } = editorFor(text);
    editor.insertTag("span");
    const added = selected();
    const parent = added.parentElement as Element;
    const record = {
      element: {
        classes: [],
        displayName: null,
        tagName: "span",
        textPreview: "",
      },
      node: added,
      op: "delete" as const,
      origNext: added.nextSibling,
      origParent: parent,
      source: null,
    };
    structureSet.record(record);
    added.remove();
    expect(structureSet.count()).toBe(0);
    structureSet.remove(added); // undo the delete
    expect(structureSet.targets().map((t) => t.op)).toEqual(["insert"]);
    expect(added.isConnected).toBe(true);
  });
});
