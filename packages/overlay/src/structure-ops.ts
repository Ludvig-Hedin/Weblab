/*
 * Adding, wrapping, unwrapping and retagging elements.
 *
 * The Webflow half of the editor, without Webflow's walls. Webflow lets you add
 * a fixed set of elements, wrap in a div, and change the tag of three element
 * types. Here any element can become any tag, anything can be wrapped in
 * anything, and pasted HTML becomes real elements. Where the result is unusual
 * HTML — a link inside a link — the editor says so and does it anyway.
 *
 * Every edit follows the same contract as a delete or a duplicate: the live DOM
 * changes at once, a `StructureRecord` tells the agent what to write, and the
 * same record is the undo step. `StructureSet` owns what each op means on the
 * DOM in both directions; this file only builds the nodes and the records.
 */
import type { InsertPosition } from "@airship/protocol";
import { elementLabel } from "./dom";
import { isEditorNode } from "./edit-guard";
import type { History } from "./history";
import type { IconName } from "./icons";
import type { Selection, SelectionController } from "./picker";
import type { StructureRecord, StructureSet } from "./structure-set";
import { toast } from "./toast";

// ---------------------------------------------------------------------------
// The element library
// ---------------------------------------------------------------------------

export type ElementGroup =
  | "Structure"
  | "Basic"
  | "Typography"
  | "Media"
  | "Forms";

export interface ElementPreset {
  group: ElementGroup;
  /** The markup the element is built from. Plain HTML, one root. */
  html: string;
  icon: IconName;
  id: string;
  /** Extra words the search should find it by. */
  keywords: string;
  label: string;
}

/**
 * Small, honest defaults. An empty `div` is zero pixels tall and could not be
 * seen, clicked or dropped into, so the containers carry just enough size to
 * exist; everything else is bare, so the project's own styles decide.
 */
const BOX = "min-height: 48px;";
const PLACEHOLDER_IMAGE = "https://placehold.co/800x500?text=Image";

export const ELEMENT_PRESETS: readonly ElementPreset[] = [
  {
    group: "Structure",
    html: '<section style="padding: 64px 24px;"></section>',
    icon: "layer-section",
    id: "section",
    keywords: "section block band area",
    label: "Section",
  },
  {
    group: "Structure",
    html: `<div style="width: 100%; max-width: 1200px; margin: 0 auto; ${BOX}"></div>`,
    icon: "layer-frame",
    id: "container",
    keywords: "container wrapper max width center",
    label: "Container",
  },
  {
    group: "Structure",
    html: `<div style="${BOX}"></div>`,
    icon: "shape-rect",
    id: "div",
    keywords: "div block box frame",
    label: "Div block",
  },
  {
    group: "Structure",
    html: `<div style="display: flex; flex-direction: column; gap: 16px; ${BOX}"></div>`,
    icon: "al-vertical",
    id: "vflex",
    keywords: "v flex vertical stack column flexbox auto layout",
    label: "V flex",
  },
  {
    group: "Structure",
    html: `<div style="display: flex; align-items: center; gap: 16px; ${BOX}"></div>`,
    icon: "al-horizontal",
    id: "hflex",
    keywords: "h flex horizontal stack row flexbox auto layout",
    label: "H flex",
  },
  {
    group: "Structure",
    html: `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; ${BOX}"></div>`,
    icon: "grid",
    id: "grid",
    keywords: "grid columns layout",
    label: "Grid",
  },
  {
    group: "Basic",
    html: '<button type="button">Button</button>',
    icon: "square",
    id: "button",
    keywords: "button cta action",
    label: "Button",
  },
  {
    group: "Basic",
    html: '<a href="#">Text link</a>',
    icon: "connection",
    id: "text-link",
    keywords: "link anchor a href url",
    label: "Text link",
  },
  {
    group: "Basic",
    html: `<a href="#" style="display: block; ${BOX}"></a>`,
    icon: "layer-frame",
    id: "link-block",
    keywords: "link block anchor card clickable",
    label: "Link block",
  },
  {
    group: "Basic",
    html: "<ul>\n  <li>List item</li>\n  <li>List item</li>\n  <li>List item</li>\n</ul>",
    icon: "text-list",
    id: "list",
    keywords: "list ul bullets",
    label: "List",
  },
  {
    group: "Basic",
    html: "<li>List item</li>",
    icon: "text-list",
    id: "list-item",
    keywords: "list item li",
    label: "List item",
  },
  {
    group: "Basic",
    html: "<hr />",
    icon: "shape-line",
    id: "divider",
    keywords: "divider line rule hr separator",
    label: "Divider",
  },
  ...[1, 2, 3, 4, 5, 6].map(
    (level): ElementPreset => ({
      group: "Typography",
      html: `<h${level}>Heading</h${level}>`,
      icon: level === 1 ? "text-h1" : "text-h2",
      id: `h${level}`,
      keywords: `heading title h${level}`,
      label: `Heading ${level}`,
    })
  ),
  {
    group: "Typography",
    html: "<p>Write something here. Click to edit this paragraph.</p>",
    icon: "layer-text",
    id: "paragraph",
    keywords: "paragraph text p copy body",
    label: "Paragraph",
  },
  {
    group: "Typography",
    html: "<div>This is some text inside a div block.</div>",
    icon: "style-text",
    id: "text-block",
    keywords: "text block div copy",
    label: "Text block",
  },
  {
    group: "Typography",
    html: "<span>Text</span>",
    icon: "tool-text",
    id: "span",
    keywords: "span inline text",
    label: "Inline text",
  },
  {
    group: "Typography",
    html: "<blockquote>A quote worth reading.</blockquote>",
    icon: "comment-message",
    id: "quote",
    keywords: "quote blockquote citation",
    label: "Block quote",
  },
  {
    group: "Media",
    html: `<img src="${PLACEHOLDER_IMAGE}" alt="" style="max-width: 100%;" />`,
    icon: "image",
    id: "image",
    keywords: "image picture photo img",
    label: "Image",
  },
  {
    group: "Media",
    html: '<video controls style="max-width: 100%;"></video>',
    icon: "play",
    id: "video",
    keywords: "video movie clip",
    label: "Video",
  },
  {
    group: "Forms",
    html: '<form style="display: flex; flex-direction: column; gap: 12px;">\n  <label>Email<input type="email" name="email" placeholder="you@example.com" /></label>\n  <button type="submit">Submit</button>\n</form>',
    icon: "mail",
    id: "form",
    keywords: "form signup contact",
    label: "Form",
  },
  {
    group: "Forms",
    html: '<input type="text" placeholder="Type here" />',
    icon: "text-size",
    id: "input",
    keywords: "input field text box",
    label: "Input",
  },
  {
    group: "Forms",
    html: '<textarea rows="4" placeholder="Type here"></textarea>',
    icon: "text-paragraph-spacing",
    id: "textarea",
    keywords: "textarea text area multiline",
    label: "Text area",
  },
  {
    group: "Forms",
    html: "<label>Label</label>",
    icon: "layer-text",
    id: "label",
    keywords: "label form",
    label: "Label",
  },
  {
    group: "Forms",
    html: '<label><input type="checkbox" /> Checkbox</label>',
    icon: "check",
    id: "checkbox",
    keywords: "checkbox check tick",
    label: "Checkbox",
  },
  {
    group: "Forms",
    html: "<select>\n  <option>First choice</option>\n  <option>Second choice</option>\n</select>",
    icon: "chev-down",
    id: "select",
    keywords: "select dropdown options",
    label: "Select",
  },
  {
    group: "Forms",
    html: '<button type="submit">Submit</button>',
    icon: "check-bold",
    id: "submit",
    keywords: "submit button form send",
    label: "Submit button",
  },
];

/** Tags a user reaches for when wrapping, in the order a menu should offer. */
export const WRAP_TAGS = [
  "div",
  "section",
  "a",
  "header",
  "footer",
  "nav",
  "main",
  "article",
  "aside",
  "figure",
  "span",
] as const;

/** The flex wrapper ⇧A makes, after Figma's auto layout and Webflow's V flex. */
export const FLEX_WRAPPER_STYLE =
  "display: flex; flex-direction: column; gap: 16px;";

/** Tags offered for "Change to", grouped as a Webflow user thinks of them. */
export const RETAG_GROUPS: readonly {
  label: string;
  tags: readonly string[];
}[] = [
  {
    label: "Layout",
    tags: [
      "div",
      "section",
      "header",
      "footer",
      "nav",
      "main",
      "article",
      "aside",
    ],
  },
  { label: "Text", tags: ["h1", "h2", "h3", "h4", "p", "span", "blockquote"] },
  { label: "Action", tags: ["a", "button", "label"] },
  { label: "List", tags: ["ul", "ol", "li"] },
];

const TAG_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Is this a name the browser will build an element from? */
export function isValidTagName(raw: string): boolean {
  return TAG_NAME.test(raw);
}

/** Pull a tag name out of what someone typed: `section`, `<section>`, `</nav>`. */
export function parseTagQuery(query: string): string | null {
  const bare = query
    .trim()
    .replace(/^<\/?|\/?>$/g, "")
    .trim()
    .toLowerCase();
  return bare && isValidTagName(bare) ? bare : null;
}

// ---------------------------------------------------------------------------
// HTML facts
// ---------------------------------------------------------------------------

/** Elements that can never have children. */
const VOID_TAGS = new Set([
  "area",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/**
 * Elements a new element goes *after* rather than inside, the way Webflow
 * places a click-to-add: text, controls and media are leaves to a designer even
 * where HTML would allow children.
 */
const LEAF_TAGS = new Set([
  ...VOID_TAGS,
  "a",
  "audio",
  "b",
  "blockquote",
  "button",
  "canvas",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "iframe",
  "label",
  "li",
  "option",
  "p",
  "picture",
  "pre",
  "select",
  "small",
  "span",
  "strong",
  "svg",
  "textarea",
  "video",
]);

/** Elements that must not sit inside a `<p>` — the parser would split it. */
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "div",
  "dl",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);

const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
]);

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function tagOf(node: Element): string {
  return node.tagName.toLowerCase();
}

/**
 * Where a new element goes relative to the selection: inside a container, at
 * the end, or right after a leaf. A new list item picks a list up as its
 * parent even though a list is otherwise a place to put things after.
 */
export function placementFor(anchor: Element, newTag: string): InsertPosition {
  const tag = tagOf(anchor);
  if (tag === "body" || tag === "html") {
    return "inside";
  }
  if (newTag === "li" && (tag === "ul" || tag === "ol")) {
    return "inside";
  }
  return LEAF_TAGS.has(tag) ? "after" : "inside";
}

/**
 * Why this tree is unusual HTML, in plain words, or null when it is fine.
 *
 * Checked over `root` and everything under it against their ancestors, because
 * a wrap can create the problem at either end: a link wrapped around a card
 * that already holds a link.
 */
export function nestingIssue(root: Element): string | null {
  for (const node of [root, ...root.querySelectorAll("*")]) {
    const parent = node.parentElement;
    if (!parent) {
      continue;
    }
    const tag = tagOf(node);
    const rule = NESTING_RULES.find((r) => r.breaks(tag, parent));
    if (rule) {
      return rule.message;
    }
  }
  return null;
}

interface NestingRule {
  breaks: (tag: string, parent: Element) => boolean;
  message: string;
}

const NESTING_RULES: readonly NestingRule[] = [
  {
    breaks: (tag, parent) => tag === "a" && Boolean(parent.closest("a")),
    message: "A link inside a link. Browsers split it into two links.",
  },
  {
    breaks: (tag, parent) =>
      INTERACTIVE_TAGS.has(tag) && Boolean(parent.closest("button")),
    message: "Something clickable inside a button. Browsers may ignore it.",
  },
  {
    breaks: (tag, parent) => tag === "button" && Boolean(parent.closest("a")),
    message:
      "A button inside a link. Browsers may handle the click in odd ways.",
  },
  {
    breaks: (tag, parent) =>
      BLOCK_TAGS.has(tag) && Boolean(parent.closest("p")),
    message: "A block inside a paragraph. Browsers end the paragraph early.",
  },
  {
    breaks: (tag, parent) =>
      HEADINGS.has(tag) && Boolean(parent.closest("h1,h2,h3,h4,h5,h6")),
    message: "A heading inside a heading.",
  },
  {
    breaks: (tag, parent) => tag === "form" && Boolean(parent.closest("form")),
    message: "A form inside a form. Browsers drop the inner one.",
  },
  {
    breaks: (tag, parent) =>
      tag === "li" && !["ul", "ol", "menu"].includes(tagOf(parent)),
    message: "A list item outside a list.",
  },
];

// ---------------------------------------------------------------------------
// Building nodes
// ---------------------------------------------------------------------------

/** Attributes nobody should be able to paste into a live page. */
const UNSAFE_ELEMENTS =
  "script,style,iframe,frame,object,embed,link,meta,base,template,animate,set,animatemotion,animatetransform";
const UNSAFE_URL = /(?:java|vb)script:/i;
/** A URL as the browser reads it: tabs, newlines and control characters gone. */
function urlAsRead(value: string): string {
  return [...value].filter((ch) => ch.charCodeAt(0) > 32).join("");
}

/**
 * JSX spelling to HTML spelling, for the common case of pasting a snippet out
 * of a component. Anything in braces is dropped rather than guessed at.
 */
function jsxToHtml(text: string): string {
  return text
    .replace(/\bclassName=/g, "class=")
    .replace(/\bhtmlFor=/g, "for=")
    .replace(/\s[\w:-]+=\{\{[\s\S]*?\}\}/g, "")
    .replace(/\s[\w:-]+=\{[^}]*\}/g, "");
}

function scrub(root: Element): void {
  for (const bad of root.querySelectorAll(UNSAFE_ELEMENTS)) {
    bad.remove();
  }
  for (const node of [root, ...root.querySelectorAll("*")]) {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = urlAsRead(attr.value);
      if (name.startsWith("on") || UNSAFE_URL.test(value)) {
        node.removeAttribute(attr.name);
      }
    }
  }
}

/**
 * Parse markup into detached elements owned by `doc`, or [] when it is not
 * markup. A `<template>` keeps it inert while it is parsed — nothing loads and
 * nothing runs — and the unsafe parts are gone before any of it is adopted.
 */
export function elementsFromHtml(doc: Document, markup: string): Element[] {
  const text = markup.trim();
  if (!text.startsWith("<")) {
    return [];
  }
  const template = doc.createElement("template");
  template.innerHTML = jsxToHtml(text);
  const out: Element[] = [];
  for (const child of [...template.content.children]) {
    if (UNSAFE_ELEMENTS.split(",").includes(tagOf(child))) {
      continue;
    }
    scrub(child);
    out.push(doc.importNode(child, true) as Element);
  }
  return out;
}

/** The markup the agent is shown for a new node: the page's own spelling. */
export function markupOf(node: Element): string {
  return node.outerHTML;
}

/** `<section class="hero" id="top">`, for telling the agent what a wrap made. */
export function openingTag(node: Element): string {
  const attrs = [...node.attributes]
    .map((a) => (a.value ? ` ${a.name}="${a.value}"` : ` ${a.name}`))
    .join("");
  return `<${tagOf(node)}${attrs}>`;
}

/**
 * A copy of `from` under a new tag: every attribute carried over, plus what the
 * new tag needs to work and minus what it cannot use.
 */
export function retagged(from: Element, tag: string): Element {
  const next = from.ownerDocument.createElement(tag);
  for (const attr of from.attributes) {
    next.setAttribute(attr.name, attr.value);
  }
  if (tag === "a" && !next.hasAttribute("href")) {
    next.setAttribute("href", "#");
  }
  if (tag !== "a") {
    next.removeAttribute("href");
    next.removeAttribute("target");
    next.removeAttribute("rel");
  }
  if (tag === "button" && !next.hasAttribute("type")) {
    next.setAttribute("type", "button");
  }
  if (tagOf(from) === "button" && tag !== "button") {
    next.removeAttribute("type");
    next.removeAttribute("disabled");
  }
  return next;
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export interface StructureEditorDeps {
  controller: SelectionController;
  history: History;
  /** Re-render the composer's pending changes. */
  onChanged: () => void;
  /** The current selection, or null. */
  selection: () => Selection | null;
  structureSet: StructureSet;
}

/**
 * The verbs. Each one refuses with a toast rather than silently: a shortcut
 * that does nothing reads as a broken shortcut.
 */
export class StructureEditor {
  private readonly deps: StructureEditorDeps;

  constructor(deps: StructureEditorDeps) {
    this.deps = deps;
  }

  /** A page element is selected, so there is somewhere to act. */
  canAct(): boolean {
    const sel = this.deps.selection();
    return Boolean(sel?.node.parentElement && !isEditorNode(sel.node));
  }

  /** Add a library element at the selection. */
  insertPreset(preset: ElementPreset): void {
    this.insertHtml(preset.html, preset.label);
  }

  /** Add an empty element of any tag at the selection. */
  insertTag(tag: string): void {
    if (!isValidTagName(tag)) {
      toast(`“${tag}” is not a tag name`, { tone: "error" });
      return;
    }
    const markup = VOID_TAGS.has(tag)
      ? `<${tag} />`
      : `<${tag}>${tag}</${tag}>`;
    this.insertHtml(markup, `<${tag}>`);
  }

  /**
   * Add markup at the selection — a preset, a typed tag or a paste. Returns
   * false when there was nothing to add, so a paste handler can let the key go.
   */
  insertHtml(markup: string, label?: string): boolean {
    const sel = this.requireSelection("add");
    if (!sel) {
      return false;
    }
    const nodes = elementsFromHtml(sel.node.ownerDocument, markup);
    if (!nodes.length) {
      return false;
    }
    // The page root is not a place to put things; its body is.
    const anchor =
      tagOf(sel.node) === "html"
        ? (sel.node.ownerDocument.body ?? sel.node)
        : sel.node;
    const [first] = nodes;
    const position = placementFor(anchor, tagOf(first));
    const parent =
      position === "inside" ? anchor : (anchor.parentElement ?? anchor);
    const next = position === "inside" ? null : anchor.nextSibling;
    for (const node of nodes) {
      parent.insertBefore(node, next);
    }
    // One record for the whole paste, so the agent writes the elements in the
    // order they were pasted instead of each one "right after" the anchor.
    this.commit({
      element: sel.element,
      html: nodes.map(markupOf).join("\n"),
      inner: nodes,
      node: first,
      op: "insert",
      origNext: next,
      origParent: parent,
      position,
      source: sel.source,
    });
    const what =
      label ??
      (nodes.length > 1 ? `${nodes.length} elements` : elementLabel(first));
    this.report(first, `Added ${what}`);
    this.deps.controller.select(first, sel.surface);
    return true;
  }

  /** Wrap the selection in a new element of any tag. */
  wrap(tag: string, style?: string): void {
    const sel = this.requireSelection("wrap");
    if (!sel) {
      return;
    }
    if (!isValidTagName(tag) || VOID_TAGS.has(tag)) {
      toast(`Cannot wrap in <${tag}>`, { tone: "error" });
      return;
    }
    const { node } = sel;
    const parent = node.parentElement;
    if (!parent) {
      return;
    }
    const wrapper = node.ownerDocument.createElement(tag);
    if (tag === "a") {
      wrapper.setAttribute("href", "#");
    }
    if (style) {
      wrapper.setAttribute("style", style);
    }
    const origNext = node.nextSibling;
    parent.insertBefore(wrapper, node);
    wrapper.append(node);
    const record: StructureRecord = {
      element: sel.element,
      html: openingTag(wrapper),
      inner: [node],
      node: wrapper,
      op: "wrap",
      origNext,
      origParent: parent,
      source: sel.source,
    };
    this.commit(record);
    this.report(wrapper, `Wrapped ${elementLabel(node)} in <${tag}>`);
    this.deps.controller.select(wrapper, sel.surface);
  }

  /** Remove the selection's own tag and keep its children where it stood. */
  unwrap(): void {
    const sel = this.requireSelection("unwrap");
    if (!sel) {
      return;
    }
    const { node } = sel;
    const parent = node.parentElement;
    if (!parent) {
      return;
    }
    const inner = [...node.childNodes];
    const record: StructureRecord = {
      element: sel.element,
      inner,
      node,
      op: "unwrap",
      origNext: node.nextSibling,
      origParent: parent,
      source: sel.source,
    };
    for (const child of inner) {
      parent.insertBefore(child, node);
    }
    node.remove();
    this.commit(record);
    toast(`Unwrapped ${elementLabel(node)}`);
    const firstElement = inner.find(
      (n): n is Element => n.nodeType === Node.ELEMENT_NODE
    );
    if (firstElement) {
      this.deps.controller.select(firstElement, sel.surface);
    } else {
      this.deps.controller.select(parent, sel.surface);
    }
  }

  /** Turn the selection into any other tag, keeping its children and attributes. */
  retag(tag: string): void {
    const sel = this.requireSelection("change");
    if (!sel) {
      return;
    }
    const { node } = sel;
    const from = tagOf(node);
    if (!isValidTagName(tag)) {
      toast(`“${tag}” is not a tag name`, { tone: "error" });
      return;
    }
    if (tag === from) {
      toast(`It is already a <${tag}>`);
      return;
    }
    if (VOID_TAGS.has(tag) && node.childNodes.length > 0) {
      toast(`A <${tag}> cannot hold content. Empty it first.`, {
        tone: "error",
      });
      return;
    }
    const parent = node.parentElement;
    if (!parent) {
      return;
    }
    const next = retagged(node, tag);
    next.append(...node.childNodes);
    node.replaceWith(next);
    const record: StructureRecord = {
      element: sel.element,
      fromTag: from,
      node: next,
      op: "retag",
      origNext: next.nextSibling,
      origParent: parent,
      replaced: node,
      source: sel.source,
      toTag: tag,
    };
    this.commit(record);
    this.report(next, `Changed <${from}> to <${tag}>`);
    this.deps.controller.select(next, sel.surface);
  }

  private commit(record: StructureRecord): void {
    this.deps.structureSet.record(record);
    this.deps.history.push({ kind: "structure", record });
    this.deps.onChanged();
  }

  /** Say what happened, and warn — never block — when the HTML is unusual. */
  private report(node: Element, done: string): void {
    const issue = nestingIssue(node);
    if (issue) {
      toast(`${done}. Heads up: ${issue}`, {
        duration: 6000,
        icon: "attention",
      });
      return;
    }
    toast(done);
  }

  private requireSelection(verb: string): Selection | null {
    const sel = this.deps.selection();
    if (!(sel?.node.parentElement && !isEditorNode(sel.node))) {
      toast(`Select an element first, then ${verb}`, { icon: "attention" });
      return null;
    }
    // The page's root stays put. Adding still works on it: a new element goes
    // inside, at the end of the page.
    if (verb !== "add" && ["body", "html"].includes(tagOf(sel.node))) {
      toast(`Pick an element on the page to ${verb}, not the page itself.`, {
        icon: "attention",
      });
      return null;
    }
    return sel;
  }
}
