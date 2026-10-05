/**
 * The chat timeline's row renderers — one factory per `TimelineItem` kind.
 *
 * One quiet line per step, after t3code's work log: a glyph that says which
 * kind of tool, a plain verb ("Read", "Edited", "Ran"), and the argument in a
 * dimmer tone. Everything else — the result, the arguments, the raw output —
 * is behind the row's own disclosure. A failure is the exception and shows on
 * the line itself, since it is the one result worth reading at rest.
 *
 * The glyph says *which* tool (`TOOL_GLYPH`), which is what makes a long turn
 * skimmable without reading a single label.
 */
import type {
  TimelineItem,
  TimelineTextItem,
  TimelineThinkingItem,
  TimelineTodosItem,
  TimelineToolItem,
} from "@airship/protocol";
import { clear, cls, el } from "../dom";
import { type IconName, icon } from "../icons";
import { disclosure } from "./disclosure";
import { renderMarkdown } from "./markdown";

/** A live row: its node, plus a way to fold a patched item back into it. */
export interface TimelineRow {
  root: HTMLElement;
  /**
   * Fold the row shut. Present only on rows that have a disclosure (tool,
   * thinking); prose and todos have nothing to collapse.
   *
   * This exists so `setCollapsed` can drive each row's own state. Doing it with
   * a class on the timeline root instead is what made every finished turn's
   * rows permanently un-expandable: a descendant `display: none` outranks the
   * row's own bookkeeping, so clicking the header appended the body and flipped
   * `aria-expanded` while the body stayed invisible.
   */
  setOpen?: (open: boolean) => void;
  /** Re-render from the updated item. Cheap and idempotent. */
  update: (item: TimelineItem) => void;
}

/** Build the row for any timeline item. */
export function timelineRow(item: TimelineItem): TimelineRow {
  switch (item.kind) {
    case "tool":
      return toolRow(item);
    case "thinking":
      return thinkingRow(item);
    case "todos":
      return todosRow(item);
    default:
      return textRow(item);
  }
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/**
 * The glyph a tool row leads with, keyed on the raw tool name.
 *
 * Every row used to carry the same dot, which meant a stack of twelve rows had
 * one shape repeated twelve times and the only way to tell a file read from a
 * shell command was to read the label. Shape is now the whole signal: the
 * glyphs all rest at one quiet tone (see `.tl-glyph` in chat.css), because a
 * finished turn is mostly successful rows and colouring them would spend the
 * transcript's attention on its least surprising fact. The result line still
 * turns red when a call fails.
 *
 * The names are core's normalized vocabulary (`tool-summary.ts`), shared across
 * both backends, so a Codex `command_execution` and a Claude `Bash` arrive here
 * as the same word and get the same mark.
 *
 * `dot` stays as the fallback, and that is the point of keeping it: an MCP tool
 * or a name a future SDK invents gets a neutral mark rather than a wrong one.
 */
const TOOL_GLYPH: Record<string, IconName> = {
  Bash: "command",
  Delete: "minus",
  Edit: "pencil",
  Glob: "search",
  Grep: "search",
  MultiEdit: "pencil",
  NotebookEdit: "pencil",
  Read: "eye",
  // A subagent is Airship doing the thing itself, so it flies the brand mark.
  Task: "logo",
  TodoWrite: "text-list",
  WebFetch: "globe",
  WebSearch: "globe",
  Write: "doc-plus",
};

/** Airship's own MCP tools act on the page, so they fly the brand mark too. */
const AIRSHIP_MCP = "mcp__airship__";

function toolGlyph(name: string): IconName {
  if (name.startsWith(AIRSHIP_MCP)) {
    return "logo";
  }
  return TOOL_GLYPH[name] ?? "dot";
}

/**
 * Plain verbs for the raw tool names, as a person would say what happened:
 * "Read", "Edited", "Ran". The raw names (`Bash`, `MultiEdit`) are the SDK's
 * vocabulary, and a bold mono `Bash` at the head of every row was most of what
 * made the log read like a terminal dump. `[while running, once done]`.
 */
const TOOL_VERB: Record<string, [string, string]> = {
  Bash: ["Running", "Ran"],
  Delete: ["Deleting", "Deleted"],
  Edit: ["Editing", "Edited"],
  Glob: ["Finding files", "Found files"],
  Grep: ["Searching", "Searched"],
  MultiEdit: ["Editing", "Edited"],
  NotebookEdit: ["Editing", "Edited"],
  Read: ["Reading", "Read"],
  Task: ["Delegating", "Delegated"],
  TodoWrite: ["Planning", "Planned"],
  WebFetch: ["Fetching", "Fetched"],
  WebSearch: ["Searching the web", "Searched the web"],
  Write: ["Creating", "Created"],
};

/** The row's label for a phase. Unknown tools keep their own name. */
function toolVerb(name: string, fallback: string, pending: boolean): string {
  const verb = TOOL_VERB[name];
  if (!verb) {
    return fallback;
  }
  return pending ? verb[0] : verb[1];
}

export function toolRow(item: TimelineToolItem): TimelineRow {
  // `title` already reads `Read(src/app.ts)`; split it so the verb and the
  // argument can carry different weights without re-deriving either.
  const open = item.title.indexOf("(");
  const name = open > 0 ? item.title.slice(0, open) : item.title;
  const arg =
    open > 0 && item.title.endsWith(")") ? item.title.slice(open + 1, -1) : "";

  const label = el("span", { class: cls("tl-name") });
  // A failure is the one result worth reading without expanding, so it rides
  // on the header. Every other result lives in the body.
  const failure = el("span", { class: cls("tl-fail") });

  const d = disclosure({
    head: [
      el("span", { class: cls("tl-glyph") }, [
        icon(toolGlyph(item.name), "xs"),
      ]),
      label,
      arg ? el("span", { class: cls("tl-args"), text: arg }) : "",
      failure,
    ],
    toggleable: true,
  });
  d.root.classList.add(cls("tl-tool"));

  const row: TimelineRow = {
    root: d.root,
    setOpen: d.setOpen,
    update(next) {
      if (next.kind !== "tool") {
        return;
      }
      // Only the phase, the label, and the body change across a patch — the
      // row keeps its height, so a pending→ok transition doesn't reflow.
      d.root.setAttribute("data-phase", next.phase);
      label.textContent = toolVerb(next.name, name, next.phase === "pending");
      failure.textContent =
        next.phase === "error" ? (next.result?.text ?? "Failed") : "";
      renderToolBody(d.body, next);
      // Nothing to expand until there is something to show.
      const expandable = hasBody(next);
      d.root.classList.toggle(cls("tl-flat"), !expandable);
      if (!expandable) {
        d.setOpen(false);
      }
    },
  };

  row.update(item);
  return row;
}

function hasBody(item: TimelineToolItem): boolean {
  return Boolean(
    item.result?.text ||
      item.result?.detail ||
      Object.keys(item.args ?? {}).length > 0
  );
}

function renderToolBody(body: HTMLElement, item: TimelineToolItem): void {
  clear(body);

  const summary = item.phase === "error" ? "" : item.result?.text;
  if (summary) {
    body.append(el("div", { class: cls("tl-sum"), text: summary }));
  }

  const args = Object.entries(item.args ?? {});
  if (args.length) {
    const list = el("dl", { class: cls("tl-args-list") });
    for (const [k, v] of args) {
      list.append(el("dt", { text: k }), el("dd", { text: v }));
    }
    body.append(list);
  }

  const detail = item.result?.detail;
  if (detail) {
    body.append(
      el("pre", {
        class: `${cls("tl-out")} ${cls("scroll-y")}`,
        text: detail,
      })
    );
  }
  if (item.result?.truncated) {
    const n = item.result.droppedLines;
    body.append(
      el("div", {
        class: cls("tl-trunc"),
        text: n ? `… ${n} more line${n === 1 ? "" : "s"}` : "… truncated",
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Thinking
// ---------------------------------------------------------------------------

export function thinkingRow(item: TimelineThinkingItem): TimelineRow {
  const label = el("span", { class: cls("tl-think-label") });
  const d = disclosure({
    head: [
      el("span", { class: cls("tl-glyph") }, [icon("bulb-on", "xs")]),
      label,
    ],
    toggleable: true,
  });
  d.root.classList.add(cls("tl-think"));

  const row: TimelineRow = {
    root: d.root,
    setOpen: d.setOpen,
    update(next) {
      if (next.kind !== "thinking") {
        return;
      }
      const hasText = Boolean(next.text.trim());
      // Redacted thinking streams only a token estimate. A running count of
      // tokens is not something anyone reading the chat can act on, so the row
      // just says whether the model is still thinking.
      const live = Boolean(next.streaming);
      label.textContent = live ? "Thinking" : "Thought";
      d.root.classList.toggle(cls("tl-live"), live);
      clear(d.body);
      if (hasText) {
        d.body.append(
          el("div", { class: cls("tl-think-text"), text: next.text })
        );
      }
      d.root.classList.toggle(cls("tl-flat"), !hasText);
      if (!hasText) {
        d.setOpen(false);
      }
    },
  };

  row.update(item);
  return row;
}

// ---------------------------------------------------------------------------
// Assistant prose
// ---------------------------------------------------------------------------

export function textRow(item: TimelineTextItem): TimelineRow {
  const root = el("div", { class: `${cls("tl-text")} ${cls("msg-body")}` });
  const row: TimelineRow = {
    root,
    update(next) {
      if (next.kind !== "text") {
        return;
      }
      root.innerHTML = renderMarkdown(next.text);
    },
  };
  row.update(item);
  return row;
}

// ---------------------------------------------------------------------------
// Todos
// ---------------------------------------------------------------------------

export function todosRow(item: TimelineTodosItem): TimelineRow {
  const list = el("ul", { class: cls("todos") });
  const root = el("div", { class: cls("tl-todos") }, [list]);

  const row: TimelineRow = {
    root,
    update(next) {
      if (next.kind !== "todos") {
        return;
      }
      renderTodoItems(list, next.todos);
    },
  };
  row.update(item);
  return row;
}

/** Shared with the legacy todo renderer — same `data-s` contract, so the
 * existing `.todos` CSS keeps applying. */
export function renderTodoItems(
  container: HTMLElement,
  todos: TimelineTodosItem["todos"]
): void {
  clear(container);
  for (const t of todos) {
    container.append(
      el("li", { "data-s": t.status }, [
        icon(t.status === "completed" ? "check" : "dot", "sm"),
        el("span", { text: t.content }),
      ])
    );
  }
}
