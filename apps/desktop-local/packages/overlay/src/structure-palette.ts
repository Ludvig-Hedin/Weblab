/*
 * The palette rows for adding, wrapping and retagging.
 *
 * ⌘K and ⌘E are the same palette. ⌘K searches the commands and, once you type,
 * the element library too ("but" → Add Button). ⌘E, `A` and the Add button open
 * it on the library alone, the way Webflow's Add panel lists everything at
 * once. "Wrap in…" and "Change tag…" open it on their own tag lists.
 *
 * Any tag can be typed. "article" offers Add, Wrap in and Change to an
 * `<article>` even though no preset names it — the library is a shortcut, not
 * a fence.
 */
import type { PaletteRow, PaletteSource } from "./keys/palette";
import {
  ELEMENT_PRESETS,
  FLEX_WRAPPER_STYLE,
  parseTagQuery,
  RETAG_GROUPS,
  type StructureEditor,
  WRAP_TAGS,
} from "./structure-ops";

/**
 * Tags a person might type, so "sec" suggests Section rather than a made-up
 * `<sec>`. Anything with a dash is a custom element and always allowed.
 */
const KNOWN_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "blockquote",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "dd",
  "em",
  "fieldset",
  "figcaption",
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
  "i",
  "img",
  "input",
  "label",
  "legend",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "option",
  "p",
  "picture",
  "pre",
  "q",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "video",
]);

function typedTag(query: string): string | null {
  const tag = parseTagQuery(query);
  if (!tag) {
    return null;
  }
  return KNOWN_TAGS.has(tag) || tag.includes("-") ? tag : null;
}

const PRESET_TAG = /^<([a-z][a-z0-9-]*)/;

function addRows(editor: StructureEditor, only: boolean): PaletteRow[] {
  return ELEMENT_PRESETS.map((preset) => ({
    doc: `A <${preset.html.match(PRESET_TAG)?.[1] ?? "div"}>, inside or after the selection.`,
    group: only ? preset.group : "Add",
    keywords: preset.keywords,
    run: () => editor.insertPreset(preset),
    title: only ? preset.label : `Add ${preset.label.toLowerCase()}`,
  }));
}

function wrapRows(editor: StructureEditor): PaletteRow[] {
  return [
    {
      doc: "A flex container, stacked vertically.",
      group: "Wrap in",
      keywords: "flex stack auto layout",
      run: () => editor.wrap("div", FLEX_WRAPPER_STYLE),
      title: "Flex",
    },
    ...WRAP_TAGS.map((tag) => ({
      doc: tag === "a" ? "A link around it." : `A new <${tag}> around it.`,
      group: "Wrap in",
      keywords: tag === "a" ? "link anchor" : undefined,
      run: () => editor.wrap(tag),
      title: `<${tag}>`,
    })),
  ];
}

function retagRows(editor: StructureEditor): PaletteRow[] {
  return RETAG_GROUPS.flatMap((group) =>
    group.tags.map((tag) => ({
      doc: `Make it a <${tag}>.`,
      group: group.label,
      run: () => editor.retag(tag),
      title: `<${tag}>`,
    }))
  );
}

/** "Add / Wrap in / Change to <tag>" for whatever tag was typed. */
function tagRows(
  editor: StructureEditor,
  tag: string,
  verbs: readonly ("add" | "wrap" | "retag")[]
): PaletteRow[] {
  const rows: PaletteRow[] = [];
  if (verbs.includes("add")) {
    rows.push({
      doc: "Any tag you type.",
      group: "Add",
      run: () => editor.insertTag(tag),
      title: `Add <${tag}>`,
    });
  }
  if (verbs.includes("wrap")) {
    rows.push({
      doc: "Any tag you type.",
      group: "Wrap in",
      run: () => editor.wrap(tag),
      title: `Wrap in <${tag}>`,
    });
  }
  if (verbs.includes("retag")) {
    rows.push({
      doc: "Any tag you type.",
      group: "Change to",
      run: () => editor.retag(tag),
      title: `Change to <${tag}>`,
    });
  }
  return rows;
}

/** ⌘K: the library and the typed-tag verbs join the commands once you type. */
export function structureRows(editor: StructureEditor): PaletteSource {
  return (query) => {
    if (!query.trim()) {
      return [];
    }
    const tag = typedTag(query);
    const verbs = editor.canAct()
      ? (["add", "wrap", "retag"] as const)
      : (["add"] as const);
    return [
      ...addRows(editor, false),
      ...(tag ? tagRows(editor, tag, verbs) : []),
    ];
  };
}

/** ⌘E, `A` and the Add button: the library alone. */
export function addPaletteRows(editor: StructureEditor): PaletteSource {
  return (query) => {
    const tag = typedTag(query);
    return [
      ...addRows(editor, true),
      ...(tag ? tagRows(editor, tag, ["add"]) : []),
    ];
  };
}

/** "Wrap in…": common wrappers, plus any typed tag. */
export function wrapPaletteRows(editor: StructureEditor): PaletteSource {
  return (query) => {
    const tag = typedTag(query);
    return [
      ...wrapRows(editor),
      ...(tag ? tagRows(editor, tag, ["wrap"]) : []),
    ];
  };
}

/** "Change tag…": common tags, plus any typed tag. */
export function retagPaletteRows(editor: StructureEditor): PaletteSource {
  return (query) => {
    const tag = typedTag(query);
    return [
      ...retagRows(editor),
      ...(tag ? tagRows(editor, tag, ["retag"]) : []),
    ];
  };
}
