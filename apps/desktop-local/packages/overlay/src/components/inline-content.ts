import type { Point } from "../canvas/space";
import {
  isEditableText,
  readText,
  TextEditor,
  textEditTarget,
} from "../inspector/text-edit";
import { computedStyle, isHtmlElement } from "../realm";
import { toast } from "../toast";
import { type ContentBinding, contentBinding } from "./local-content";
import { cleanStega } from "./stega";

interface InlineResult {
  editId?: string;
  message?: string;
  ok: boolean;
  revision?: number;
  value?: string;
}
interface InlineBridge {
  abandonInline?: (editId: string) => Promise<unknown>;
  beginInline: (binding: ContentBinding) => Promise<InlineResult>;
  onInlineEnd: (callback: (event: { editId: string }) => void) => () => void;
  stageInline: (edit: {
    editId: string;
    value: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}
interface InlineDeps {
  changed?: () => void;
  setTextOwner: (node: Element | null) => void;
}
interface Session {
  binding: ContentBinding;
  children: Node[] | null;
  editId: string;
  emptyStyles: {
    property: string;
    value: string;
    priority: string;
    applied: string;
  }[];
  lastSent: string | null;
  node: Element;
  original: string;
  value: string;
}
function bridge(): InlineBridge | undefined {
  const candidate = (
    window as unknown as { weblabHost?: { content?: Partial<InlineBridge> } }
  ).weblabHost?.content;
  return candidate?.beginInline &&
    candidate.stageInline &&
    candidate.onInlineEnd
    ? (candidate as InlineBridge)
    : undefined;
}
function sameField(a: ContentBinding, b: ContentBinding): boolean {
  return a.documentId === b.documentId && a.path === b.path;
}
function visible(value: string): string {
  return cleanStega(value).replace(/\s+/g, " ").trim();
}

/** Chromium leaves one placeholder BR when a contenteditable field is cleared. */
function readInlineText(node: Element): string {
  const placeholder = node.firstElementChild;
  if (
    node.children.length === 1 &&
    placeholder?.tagName === "BR" &&
    Array.from(node.childNodes).every(
      (child) =>
        child === placeholder ||
        (child.nodeType === Node.TEXT_NODE && child.textContent === "")
    )
  ) {
    return "";
  }
  return readText(node);
}

/** Proposes text to native chrome. Only native Save may persist a draft. */
export class InlineContentEditor {
  private readonly editor: TextEditor;
  private readonly native = bridge();
  private readonly unsubscribe?: () => void;
  private session: Session | null = null;
  private observer: MutationObserver | null = null;
  private generation = 0;
  private loading = false;
  private disposed = false;
  private ending = false;
  private readonly endedIds = new Set<string>();

  private readonly deps: InlineDeps;

  constructor(deps: InlineDeps) {
    this.deps = deps;
    this.editor = new TextEditor({
      onCommit: ({ node }) => this.stage(readInlineText(node)),
      setTextOwner: (node) => {
        deps.setTextOwner(node);
        if (!node && this.session?.node.isConnected && this.session.children) {
          this.stage(readInlineText(this.session.node));
        }
      },
    });
    this.unsubscribe = this.native?.onInlineEnd(({ editId }) => {
      this.endedIds.add(editId);
      if (this.endedIds.size > 128) {
        const oldest = this.endedIds.values().next().value;
        if (oldest !== undefined) {
          this.endedIds.delete(oldest);
        }
      }
      if (this.session?.editId === editId) {
        this.end();
      }
    });
  }

  get active(): boolean {
    return this.editor.active;
  }

  begin(hit: Element, caret: Point | null): boolean {
    if (this.disposed || !this.native) {
      return false;
    }
    if (this.session?.node.contains(hit)) {
      if (!this.editor.active) {
        this.activate(this.session, caret);
      }
      return true;
    }
    if (!isEditableText(hit)) {
      return false;
    }
    const node = textEditTarget(hit);
    const binding = contentBinding(node.textContent ?? "");
    if (!binding) {
      return false;
    }
    if (this.loading) {
      return true;
    }
    const { session } = this;
    if (session && sameField(binding, session.binding)) {
      if (
        !this.editor.active &&
        visible(readInlineText(node)) === visible(session.original)
      ) {
        this.restore();
        session.node = node;
        this.activate(session, caret);
      }
      return true;
    }
    if (session && session.value !== session.original) {
      toast("Save or discard this text before editing another field.", {
        tone: "error",
      });
      return true;
    }
    this.end();
    this.generation += 1;
    const { generation } = this;
    this.loading = true;
    this.native
      .beginInline(binding)
      .then((result) => {
        if (generation !== this.generation || this.disposed) {
          this.abandon(result.editId);
          return;
        }
        this.loading = false;
        if (result.editId && this.endedIds.has(result.editId)) {
          return;
        }
        if (
          !result.ok ||
          typeof result.editId !== "string" ||
          !result.editId ||
          typeof result.value !== "string" ||
          !Number.isSafeInteger(result.revision)
        ) {
          this.abandon(result.editId);
          toast(result.message ?? "This text could not be opened.", {
            tone: "error",
          });
          return;
        }
        const currentBinding = contentBinding(node.textContent ?? "");
        if (
          !(
            node.isConnected &&
            currentBinding &&
            sameField(binding, currentBinding)
          ) ||
          visible(readInlineText(node)) !== visible(result.value)
        ) {
          this.abandon(result.editId);
          toast("The page text changed. Reload the page before editing.", {
            tone: "error",
          });
          return;
        }
        this.session = {
          binding,
          children: null,
          editId: result.editId,
          emptyStyles: [],
          lastSent: result.value,
          node,
          original: result.value,
          value: result.value,
        };
        this.activate(this.session, caret);
      })
      .catch(() => {
        if (generation !== this.generation || this.disposed) {
          return;
        }
        this.loading = false;
        toast("This text could not be opened.", { tone: "error" });
      });
    return true;
  }

  private activate(session: Session, caret: Point | null): void {
    session.children ??= Array.from(session.node.childNodes);
    session.node.replaceChildren(
      session.node.ownerDocument.createTextNode(session.value)
    );
    session.node.addEventListener("input", this.onInput);
    this.updateEmptyGeometry(session);
    if (!this.editor.begin(session.node, { allowEmpty: true, caret })) {
      this.restore();
      return;
    }
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => {
      if (!session.node.isConnected) {
        this.finish();
        this.restore();
      }
    });
    this.observer.observe(session.node.ownerDocument, {
      childList: true,
      subtree: true,
    });
    this.deps.changed?.();
  }

  private readonly onInput = (): void => {
    if (this.session) {
      this.stage(readInlineText(this.session.node));
    }
  };

  private stage(value: string): void {
    const { session } = this;
    if (!session || this.ending || !this.native || value === session.lastSent) {
      return;
    }
    session.value = value;
    session.lastSent = value;
    this.updateEmptyGeometry(session);
    this.deps.changed?.();
    this.native
      .stageInline({ editId: session.editId, value })
      .then((result) => {
        if (this.session !== session || this.disposed) {
          return;
        }
        if (!result.ok) {
          if (session.lastSent === value) {
            session.lastSent = null;
          }
          toast(
            result.message ??
              "This text could not be staged. Keep it open and try again.",
            { tone: "error" }
          );
        }
      })
      .catch(() => {
        if (this.session === session && !this.disposed) {
          if (session.lastSent === value) {
            session.lastSent = null;
          }
          toast("This text could not be staged. Keep it open and try again.", {
            tone: "error",
          });
        }
      });
  }

  private restoreEmptyGeometry(session: Session): void {
    if (isHtmlElement(session.node)) {
      const { style } = session.node;
      for (const saved of session.emptyStyles) {
        if (
          style.getPropertyValue(saved.property) === saved.applied &&
          style.getPropertyPriority(saved.property) === "important"
        ) {
          if (saved.value) {
            style.setProperty(saved.property, saved.value, saved.priority);
          } else {
            style.removeProperty(saved.property);
          }
        }
      }
    }
    session.emptyStyles = [];
  }

  private updateEmptyGeometry(session: Session): void {
    if (session.value !== "") {
      this.restoreEmptyGeometry(session);
      return;
    }
    if (session.emptyStyles.length || !isHtmlElement(session.node)) {
      return;
    }
    const computed = computedStyle(session.node);
    const lineHeight =
      Number.parseFloat(computed.lineHeight) ||
      (Number.parseFloat(computed.fontSize) || 16) * 1.2;
    const minimum = (floor: string, existing: string): string =>
      existing && existing !== "auto" && existing !== "normal"
        ? `max(${floor}, ${existing})`
        : floor;
    const properties: [string, string][] = [
      [
        "min-height",
        minimum(`${Math.max(1, lineHeight)}px`, computed.minHeight),
      ],
      ["min-width", minimum("1ch", computed.minWidth)],
      ["outline-width", "1px"],
      ["outline-style", "dashed"],
      ["outline-color", "currentColor"],
    ];
    if (computed.display === "inline") {
      properties.push(["display", "inline-block"]);
    }
    const { style } = session.node;
    for (const [property, value] of properties) {
      const saved = {
        applied: "",
        priority: style.getPropertyPriority(property),
        property,
        value: style.getPropertyValue(property),
      };
      style.setProperty(property, value, "important");
      saved.applied = style.getPropertyValue(property);
      session.emptyStyles.push(saved);
    }
  }

  private restore(): void {
    this.observer?.disconnect();
    this.observer = null;
    const { session } = this;
    if (!session?.children) {
      return;
    }
    this.restoreEmptyGeometry(session);
    session.node.removeEventListener("input", this.onInput);
    session.node.replaceChildren(...session.children);
    session.children = null;
    this.deps.changed?.();
  }

  /** Leave the caret, retaining the proposal until native Save or Discard. */
  finish(): void {
    this.generation += 1;
    this.loading = false;
    this.editor.commit();
    if (this.session?.node.isConnected && this.session.children) {
      this.stage(readInlineText(this.session.node));
    }
  }

  private end(): void {
    this.ending = true;
    this.finish();
    this.restore();
    if (this.session && this.session.value === this.session.original) {
      this.abandon(this.session.editId);
    }
    this.session = null;
    this.ending = false;
    this.deps.changed?.();
  }

  private abandon(editId: string | undefined): void {
    if (editId) {
      this.native?.abandonInline?.(editId).catch(() => undefined);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.end();
    this.unsubscribe?.();
  }
}
