/**
 * What a button already does when clicked, read from the page.
 *
 * A `<button>` that opens a dialog has no href to show, so the Link section
 * used to open on an empty web-address field — which read as "this button
 * goes nowhere" when it plainly does something. This is the sentence that
 * says what, the way Webflow's element settings name a trigger's action.
 *
 * Read-only on purpose. What a click handler does lives in the component's
 * code, and rewriting it is a job for the agent, not a field.
 *
 * The signals, strongest first: the platform's own declarative triggers
 * (`popovertarget`, `commandfor`), then ARIA — every dialog library worth
 * using (Radix, Headless UI, React Aria) marks its trigger with
 * `aria-haspopup` and `aria-controls` — then the form a button sits in, and
 * last a bare React click handler, which says only that *something* runs.
 */
import type { IconName } from "../../icons";

export interface ClickAction {
  /** A fact about the target: a dialog's title, a handler's name. */
  detail?: string;
  icon: IconName;
  /** Safe to offer as a way to reveal content for editing. */
  previewable?: true;
  /** What the visitor's click does, as a sentence. */
  text: string;
}

const DIALOG = "dialog, [role='dialog'], [role='alertdialog']";
const MAX_DETAIL = 40;
const WHITESPACE = /\s+/;
/** A dismiss button inside a dialog, by its words. */
const CLOSE_WORDS = /close|cancel|stäng/i;
/** Names that say nothing about intent: library wrappers and bound handlers. */
const OPAQUE_HANDLER = /^(|bound .*|handle(Event|Click)?|onClick|anonymous)$/;

/** The dialog or panel an `aria-controls`/`popovertarget` id points at. */
function targetOf(node: Element, id: string | null): Element | null {
  const first = id?.trim().split(WHITESPACE)[0];
  return first ? node.ownerDocument.getElementById(first) : null;
}

/** A dialog's own name, when it is mounted: its label, else its heading. */
function titleOf(target: Element | null): string | undefined {
  if (!target) {
    return;
  }
  const labelId = target.getAttribute("aria-labelledby");
  const named =
    target.getAttribute("aria-label") ??
    (labelId
      ? target.ownerDocument.getElementById(labelId)?.textContent
      : null) ??
    target.querySelector("h1, h2, h3, h4")?.textContent;
  return named?.trim().slice(0, MAX_DETAIL) || undefined;
}

function isDialog(target: Element | null): boolean {
  return Boolean(target?.matches(DIALOG));
}

/**
 * The click handler React attached, if any.
 *
 * React keeps a node's current props on an expando named `__reactProps$<id>`.
 * Private, but stable since React 17 and the only place the handler is
 * visible from the DOM at all. Absent outside React, which is fine.
 */
function reactClick(node: Element): ((...args: never[]) => unknown) | null {
  for (const key of Object.keys(node)) {
    if (key.startsWith("__reactProps$")) {
      const props = (node as unknown as Record<string, unknown>)[key] as
        | { onClick?: unknown }
        | undefined;
      return typeof props?.onClick === "function"
        ? (props.onClick as (...args: never[]) => unknown)
        : null;
    }
  }
  return null;
}

function fromCommand(node: Element): ClickAction | null {
  const command = node.getAttribute("command");
  const target = targetOf(node, node.getAttribute("commandfor"));
  if (!(command && target)) {
    return null;
  }
  if (command === "show-modal") {
    return {
      detail: titleOf(target),
      icon: "proto-open-overlay",
      previewable: true,
      text: "Opens a dialog",
    };
  }
  if (command === "close" || command === "request-close") {
    return { icon: "proto-close-overlay", text: "Closes a dialog" };
  }
  if (command === "hide-popover") {
    return { icon: "proto-close-overlay", text: "Closes a popover" };
  }
  if (command === "show-popover" || command === "toggle-popover") {
    return {
      detail: titleOf(target),
      icon: "proto-open-overlay",
      previewable:
        command === "show-popover" || !target.matches(":popover-open")
          ? true
          : undefined,
      text: "Opens a popover",
    };
  }
  return { icon: "proto-click", text: "Runs a command when clicked" };
}

function fromAria(node: Element): ClickAction | null {
  const target = targetOf(node, node.getAttribute("aria-controls"));
  const popup = node.getAttribute("aria-haspopup");
  if (popup === "dialog" || isDialog(target)) {
    return {
      detail: titleOf(target),
      icon: "proto-open-overlay",
      previewable:
        node.getAttribute("aria-expanded") === "true" ? undefined : true,
      text: "Opens a dialog",
    };
  }
  if (popup === "menu" || popup === "true") {
    return {
      icon: "proto-open-overlay",
      previewable:
        node.getAttribute("aria-expanded") === "true" ? undefined : true,
      text: "Opens a menu",
    };
  }
  if (popup === "listbox") {
    return {
      icon: "proto-open-overlay",
      previewable:
        node.getAttribute("aria-expanded") === "true" ? undefined : true,
      text: "Opens a list to choose from",
    };
  }
  if (target && node.hasAttribute("aria-expanded")) {
    return {
      icon: "proto-change-to",
      previewable:
        node.getAttribute("aria-expanded") === "true" ? undefined : true,
      text: "Shows and hides a panel",
    };
  }
  return null;
}

function fromForm(node: Element): ClickAction | null {
  if (!(node.closest("form") || node.hasAttribute("form"))) {
    return null;
  }
  const type = (node.getAttribute("type") ?? "submit").toLowerCase();
  if (type === "submit") {
    return { icon: "proto-navigate", text: "Sends the form" };
  }
  if (type === "reset") {
    return { icon: "rotate-ccw", text: "Clears the form" };
  }
  return null;
}

export function clickAction(node: Element): ClickAction | null {
  const form = fromForm(node);
  if (form) {
    return form;
  }
  const command = fromCommand(node);
  if (command) {
    return command;
  }
  const popover = node.getAttribute("popovertarget");
  if (popover) {
    const target = targetOf(node, popover);
    const mode = node.getAttribute("popovertargetaction") ?? "toggle";
    if (
      mode === "hide" ||
      (mode === "toggle" && target?.matches(":popover-open"))
    ) {
      return { icon: "proto-close-overlay", text: "Closes a popover" };
    }
    return {
      detail: titleOf(target),
      icon: "proto-open-overlay",
      previewable: true,
      text: "Opens a popover",
    };
  }
  const declared = fromAria(node);
  if (declared) {
    return declared;
  }
  if (node.closest(DIALOG) && CLOSE_WORDS.test(node.textContent ?? "")) {
    return { icon: "proto-close-overlay", text: "Closes this dialog" };
  }
  const handler = reactClick(node);
  if (handler) {
    return {
      detail: OPAQUE_HANDLER.test(handler.name) ? undefined : handler.name,
      icon: "proto-click",
      text: "Runs code when clicked",
    };
  }
  return null;
}
