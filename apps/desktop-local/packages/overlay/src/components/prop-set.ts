import type {
  ComponentRef,
  PropControl,
  PropEdit,
  PropOrigin,
} from "@airship/protocol";
import { cleanStega } from "./stega";

/**
 * Pending edits to component *instance* props — the sixth member of the
 * pending-changes family beside `ChangeSet`, `AttrSet` and the rest, and shaped
 * like them: record with a live preview, list as chips, ship on Apply, forget
 * once the agent's edit has landed, restore on Discard.
 *
 * The preview is best effort by nature. A text or image prop usually lands in
 * the DOM verbatim, so the matching text node or `src` is found and swapped; a
 * variant or a switch changes markup only the component can render, so it has
 * no preview and the panel marks it pending until the save lands.
 */

const LEADING_SPACE = /^\s*/;
const TRAILING_SPACE = /\s*$/;

interface Preview {
  /** Undo the preview, putting the page back as it was. */
  revert: () => void;
}

export interface PropRecord {
  component: ComponentRef;
  control: PropControl;
  from: string | null;
  /** The instance, by owner identity — two instances of one component differ. */
  instance: object;
  origin?: PropOrigin;
  preview: Preview | null;
  prop: string;
  to: string;
}

export interface PropRecordInput {
  component: ComponentRef;
  control: PropControl;
  from: string | null;
  instance: object;
  origin?: PropOrigin;
  prop: string;
  /** The instance's outermost element, where a preview is looked for. */
  root: Element;
  to: string;
  /**
   * Set when the page already shows the new value — an in-place text edit
   * wrote it — so the preview only has to know how to take it back.
   */
  written?: { node: Element; before: string };
}

function textPreview(root: Element, from: string, to: string): Preview | null {
  const wanted = cleanStega(from).trim();
  if (!wanted) {
    return null;
  }
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (cleanStega(text.data).trim() !== wanted) {
      continue;
    }
    const before = text.data;
    const lead = before.match(LEADING_SPACE)?.[0] ?? "";
    const trail = before.match(TRAILING_SPACE)?.[0] ?? "";
    text.data = `${lead}${to}${trail}`;
    return {
      revert: () => {
        text.data = before;
      },
    };
  }
  return null;
}

function attrPreview(
  root: Element,
  attribute: "href" | "src",
  from: string,
  to: string
): Preview | null {
  const candidates = [root, ...root.querySelectorAll(`[${attribute}]`)];
  for (const node of candidates) {
    const current = node.getAttribute(attribute);
    if (current === null || !(current === from || current.includes(from))) {
      continue;
    }
    node.setAttribute(attribute, to);
    // A Next.js <Image> keeps a srcset that would win over the new src.
    const srcset = node.getAttribute("srcset");
    if (srcset !== null) {
      node.removeAttribute("srcset");
    }
    return {
      revert: () => {
        node.setAttribute(attribute, current);
        if (srcset !== null) {
          node.setAttribute("srcset", srcset);
        }
      },
    };
  }
  return null;
}

function makePreview(input: PropRecordInput): Preview | null {
  if (input.written) {
    const { node, before } = input.written;
    return {
      revert: () => {
        node.textContent = before;
      },
    };
  }
  if (input.from === null) {
    return null;
  }
  switch (input.control) {
    case "text":
    case "node":
      return textPreview(input.root, input.from, input.to);
    case "image":
      return attrPreview(input.root, "src", input.from, input.to);
    case "link":
      return attrPreview(input.root, "href", input.from, input.to);
    default:
      return null;
  }
}

export class PropSet {
  private readonly map = new Map<object, Map<string, PropRecord>>();

  record(input: PropRecordInput): void {
    let props = this.map.get(input.instance);
    if (!props) {
      props = new Map();
      this.map.set(input.instance, props);
    }
    const existing = props.get(input.prop);
    // Always preview from the page as it stands, then keep the *first* revert:
    // it is the one that goes back to before any edit.
    const applied = makePreview(
      existing ? { ...input, from: existing.to } : input
    );
    const preview = existing?.preview ?? applied;
    const from = existing ? existing.from : input.from;
    if (from === input.to) {
      preview?.revert();
      props.delete(input.prop);
      if (props.size === 0) {
        this.map.delete(input.instance);
      }
      return;
    }
    props.set(input.prop, {
      component: input.component,
      control: input.control,
      from,
      instance: input.instance,
      origin: input.origin,
      preview,
      prop: input.prop,
      to: input.to,
    });
  }

  /** The pending value of one prop on one instance, or undefined. */
  pending(instance: object, prop: string): string | undefined {
    return this.map.get(instance)?.get(prop)?.to;
  }

  entries(): PropRecord[] {
    const out: PropRecord[] = [];
    for (const props of this.map.values()) {
      out.push(...props.values());
    }
    return out;
  }

  targets(): PropEdit[] {
    return this.entries().map((rec) => ({
      component: rec.component,
      control: rec.control,
      from: rec.from,
      origin: rec.origin,
      prop: rec.prop,
      to: rec.to,
    }));
  }

  /** Revert one prop and forget it — a chip's ✕. */
  remove(instance: object, prop: string): void {
    const props = this.map.get(instance);
    const rec = props?.get(prop);
    if (!(props && rec)) {
      return;
    }
    rec.preview?.revert();
    props.delete(prop);
    if (props.size === 0) {
      this.map.delete(instance);
    }
  }

  count(): number {
    let n = 0;
    for (const props of this.map.values()) {
      n += props.size;
    }
    return n;
  }

  isEmpty(): boolean {
    return this.map.size === 0;
  }

  /** Put every preview back — Discard. */
  restore(): void {
    for (const rec of this.entries()) {
      rec.preview?.revert();
    }
  }

  /** Forget everything without touching the page — the save landed. */
  clear(): void {
    this.map.clear();
  }
}
