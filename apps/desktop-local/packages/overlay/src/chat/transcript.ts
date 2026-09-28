import type { Editor, GitHealth, JobDiffBundle } from "@airship/protocol";
import { firstHunkLine, renderDiff, selectedLineRange } from "../diff-view";
import { clear, cls, el } from "../dom";
import { icon } from "../icons";
import { createMenu, type MenuEntry } from "../popover-host";
import { disclosure } from "./disclosure";
import { renderMarkdown } from "./markdown";
import { type TimelineView, timelineView } from "./timeline";

/** Callbacks a finished assistant turn can offer. Omit any to hide its entry. */
export interface AssistantActions {
  /**
   * Whether git works, from the daemon.
   *
   * Present for the git-backed rows, which are shown greyed with the reason
   * rather than hidden: a Commit that is simply missing reads as a bug, and a
   * Commit that fails after the click has already cost the user the click.
   * Absent is treated as healthy, which is what an older daemon that never
   * sends `git:health` should look like.
   */
  git?: GitHealth;
  onBranch?: () => void;
  onComment?: (file: string, body: HTMLElement) => void;
  onCommit?: (push: boolean) => void;
  onCopyPath?: (file: string) => void;
  onCreatePr?: () => void;
  onFollowUp?: (text: string) => void;
  onOpenIn?: (editor: Editor, file: string, line?: number) => void;
  onUndo?: () => void;
}

/**
 * A single assistant turn. The timeline is append-only and never cleared for
 * the life of the turn — that is the whole point. The result slot below it is
 * what `fillAssistant` rewrites, so finishing a job no longer destroys the
 * record of how it got there.
 */
export interface AssistantTurn {
  /** Where `fillAssistant` writes. Safe to clear. */
  result: HTMLElement;
  root: HTMLElement;
  /** Live status pill; removed once the turn finishes. */
  status: HTMLElement;
  timeline: TimelineView;
}

export function userBubble(text: string): HTMLElement {
  return el("div", { class: `${cls("msg")} ${cls("msg-user")}` }, [
    el("div", { class: cls("msg-body"), text }),
  ]);
}

/** Everything `fillAssistant` needs to fold a turn's work log shut. */
interface TurnWork {
  /** The "Worked for 12s" row; hidden until the turn settles. */
  fold: HTMLElement;
  /** Holds the timeline. Shown live, folded shut once the turn settles. */
  log: HTMLElement;
  /** Local clock at turn start, for turns the bundle carries no times for. */
  startedAt: number;
  timeline: TimelineView;
}

/** Each turn's result slot → its work log. See `assistantTurn`. */
const WORK = new WeakMap<HTMLElement, TurnWork>();

const TICK_MS = 1000;
const TENTHS_BELOW_S = 10;
const SECONDS_PER_MINUTE = 60;

/** "4.3s", "12s", "1m 5s". Tenths only where they still matter. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < TENTHS_BELOW_S) {
    return `${s.toFixed(1)}s`;
  }
  const whole = Math.round(s);
  if (whole < SECONDS_PER_MINUTE) {
    return `${whole}s`;
  }
  const m = Math.floor(whole / SECONDS_PER_MINUTE);
  const rest = whole % SECONDS_PER_MINUTE;
  return rest ? `${m}m ${rest}s` : `${m}m`;
}

/** The live label: whole seconds, so it ticks evenly. */
function workingLabel(ms: number): string {
  const whole = Math.floor(Math.max(0, ms) / 1000);
  if (whole < 1) {
    return "Working…";
  }
  if (whole < SECONDS_PER_MINUTE) {
    return `Working for ${whole}s`;
  }
  return `Working for ${formatDuration(whole * 1000)}`;
}

/**
 * The live "Working for 12s" line. Ticks until it leaves the page — the app
 * removes it when the turn settles — so no caller has to remember to stop it.
 */
function workingStatus(startedAt: number): HTMLElement {
  const label = el("span", {
    class: cls("turn-status-label"),
    text: workingLabel(0),
  });
  const status = el("div", { class: cls("turn-status") }, [label]);
  let seen = false;
  const timer = setInterval(() => {
    if (status.isConnected) {
      seen = true;
    } else if (seen) {
      clearInterval(timer);
      return;
    }
    label.textContent = workingLabel(Date.now() - startedAt);
  }, TICK_MS);
  return status;
}

/**
 * An assistant turn, laid out the way t3code does it: a live "Working for…"
 * line with the steps streaming under it, and once the turn is done those
 * steps fold behind one "Worked for 12s" row that sits *above* the answer.
 * The answer is what the user came for, so it is the thing left open.
 */
export function assistantTurn(): AssistantTurn {
  const startedAt = Date.now();
  const timeline = timelineView();
  const status = workingStatus(startedAt);
  const result = el("div", { class: cls("turn-result") });
  const log = el("div", { class: cls("turn-log") }, [timeline.root]);
  const fold = el("button", {
    "aria-expanded": "false",
    class: cls("turn-fold"),
    hidden: true,
    type: "button",
  });
  fold.addEventListener("click", () => {
    const open = fold.getAttribute("aria-expanded") !== "true";
    setFoldOpen(fold, log, open);
  });
  WORK.set(result, { fold, log, startedAt, timeline });
  const root = el("div", { class: `${cls("msg")} ${cls("msg-assistant")}` }, [
    status,
    fold,
    log,
    result,
  ]);
  return { result, root, status, timeline };
}

function setFoldOpen(fold: HTMLElement, log: HTMLElement, open: boolean): void {
  fold.setAttribute("aria-expanded", String(open));
  log.hidden = !open;
  const label = fold.querySelector(`.${cls("turn-fold-label")}`);
  fold.replaceChildren(
    label ?? "",
    el("span", { class: cls("disc-chev") }, [
      icon(open ? "chev-down" : "chev-right", "xs"),
    ])
  );
}

/** Fold a finished turn's steps behind "Worked for 12s". */
function settleWork(target: HTMLElement, bundle: JobDiffBundle): void {
  const work = WORK.get(target);
  if (!work) {
    return;
  }
  const { fold, log, startedAt, timeline } = work;
  if (timeline.isEmpty()) {
    fold.hidden = true;
    log.hidden = true;
    return;
  }
  const ms =
    bundle.completedAt && bundle.createdAt
      ? bundle.completedAt - bundle.createdAt
      : Date.now() - startedAt;
  const took = formatDuration(ms);
  const text =
    bundle.status === "cancelled"
      ? `Stopped after ${took}`
      : `Worked for ${took}`;
  fold.replaceChildren(el("span", { class: cls("turn-fold-label"), text }));
  fold.hidden = false;
  setFoldOpen(fold, log, false);
}

/**
 * The live progress line. Deliberately the same words whatever step the agent
 * reports — "Reading src/app/page.tsx" is detail, and the steps themselves
 * stream right under it. The step is kept as the tooltip for anyone curious.
 */
export function setTurnStatus(status: HTMLElement, text: string): void {
  status.title = text;
}

/**
 * Populate a turn's *result slot* with the finished job — markdown summary,
 * changed files, follow-ups, and actions.
 *
 * `target` is the `.turn-result` node, not the bubble root: this function
 * clears what it is given, and pointing it at the root is what used to wipe the
 * streamed activity on every completion.
 */
export function fillAssistant(
  target: HTMLElement,
  bundle: JobDiffBundle,
  actions: AssistantActions
): void {
  clear(target);
  settleWork(target, bundle);
  const bubble = target.parentElement ?? target;
  bubble.classList.remove(cls("msg-err"));
  if (bundle.status !== "done") {
    bubble.classList.add(cls("msg-err"));
    target.append(
      el("div", {
        class: cls("msg-body"),
        text: bundle.error || "Edit failed.",
      })
    );
    return;
  }

  target.append(
    el("div", {
      class: cls("msg-body"),
      html: renderMarkdown(bundle.summary || "Edit applied."),
    })
  );

  // No price. Under a Claude or ChatGPT subscription the figure the SDK reports
  // is what the same run would have cost on the API, not what anyone paid, and
  // "$4.72" under a one-line edit reads as a bill.
  if (bundle.diffs?.length) {
    target.append(changedFiles(bundle, actions));
  }

  if (hasTurnActions(actions)) {
    target.append(actionsRow(bundle, actions));
  }

  const { onFollowUp } = actions;
  if (bundle.followUps?.length && onFollowUp) {
    const follow = el("div", { class: cls("follow") });
    for (const f of bundle.followUps) {
      follow.append(
        el("button", { onClick: () => onFollowUp(f), type: "button" }, [
          icon("chev-right", "sm"),
          el("span", { text: f }),
        ])
      );
    }
    const n = bundle.followUps.length;
    target.append(
      collapsible(
        `${n} suggestion${n === 1 ? "" : "s"}`,
        follow,
        cls("follow-disc")
      )
    );
  }
}

/** "+12 −4", each half in its own tone. */
function lineStats(additions: number, deletions: number): HTMLElement {
  return el("span", { class: cls("turn-stat") }, [
    el("span", { class: cls("turn-stat-add"), text: `+${additions}` }),
    el("span", { class: cls("turn-stat-del"), text: `−${deletions}` }),
  ]);
}

/** One card: "2 changed files +12 −4", then a folded row per file. */
function changedFiles(
  bundle: JobDiffBundle,
  actions: AssistantActions
): HTMLElement {
  const n = bundle.diffs.length;
  const head = el("div", { class: cls("turn-files-head") }, [
    el("span", {
      class: cls("turn-files-title"),
      text: `${n} changed file${n === 1 ? "" : "s"}`,
    }),
    lineStats(bundle.additions, bundle.deletions),
  ]);
  const card = el("div", { class: cls("turn-files") }, [head]);
  for (const d of bundle.diffs) {
    card.append(fileDiff(d, bundle, actions));
  }
  return card;
}

/**
 * Undo in plain sight, then the kebab. Undo used to be only a "Revert this
 * change" row inside the kebab, which is not where anyone looks for it.
 */
function actionsRow(
  bundle: JobDiffBundle,
  actions: AssistantActions
): HTMLElement {
  const row: HTMLElement[] = [];
  const { onUndo } = actions;
  const unrestorable = bundle.diffs?.some((d) => d.noBaseline) ?? false;
  if (onUndo && !unrestorable) {
    row.push(
      el(
        "button",
        {
          "aria-label": "Undo this change",
          class: cls("action"),
          onClick: onUndo,
          type: "button",
        },
        [icon("rotate-ccw", "sm"), el("span", { text: "Undo" })]
      )
    );
  }
  row.push(turnMenuButton(bundle, actions));
  return el("div", { class: cls("actions") }, row);
}

/**
 * A disclosure that renders its own chevron.
 *
 * `disclosure()` draws none — a timeline row's status dot is its affordance —
 * so anything used outside the timeline has to supply one or it reads as inert
 * text. `onToggle` fires once at construction, which is what seeds the glyph.
 */
function collapsible(
  label: string,
  body: HTMLElement,
  rootClass: string
): HTMLElement {
  const chev = el("span", { class: cls("disc-chev") });
  const d = disclosure({
    bodyClass: cls("disc-body"),
    class: rootClass,
    // Label first, chevron after, the same as "Worked for 12s ›".
    head: [el("span", { text: label }), chev],
    headClass: cls("disc-head"),
    onToggle: (open) =>
      chev.replaceChildren(icon(open ? "chev-down" : "chev-right", "xs")),
    open: false,
  });
  d.body.append(body);
  return d.root;
}

/**
 * One file's diff, folded shut.
 *
 * Every changed file used to render fully expanded, so a five-file edit buried
 * the rest of the turn — and the summary above it already says what happened.
 * The header carries the filename, the counts, and a ⋯ for the things you can
 * do to this specific file.
 */
function fileDiff(
  diff: JobDiffBundle["diffs"][number],
  bundle: JobDiffBundle,
  actions: AssistantActions
): HTMLElement {
  const chev = el("span", { class: cls("disc-chev") });
  // The file name first, where it can't be cut off; the folder after it in a
  // dimmer tone, which is the half that gives way when the dock is narrow.
  const slash = diff.file.lastIndexOf("/");
  const base = slash >= 0 ? diff.file.slice(slash + 1) : diff.file;
  const dir = slash >= 0 ? diff.file.slice(0, slash) : "";
  const head: HTMLElement[] = [
    chev,
    el("span", { class: cls("diff-path"), title: diff.file }, [
      el("span", { class: cls("diff-file"), text: base }),
      dir ? el("span", { class: cls("diff-dir"), text: dir }) : "",
    ]),
    lineStats(diff.additions, diff.deletions),
  ];

  const d = disclosure({
    bodyClass: cls("diff-disc-body"),
    class: cls("diff"),
    head,
    headClass: cls("diff-head"),
    onToggle: (open) =>
      chev.replaceChildren(icon(open ? "chev-down" : "chev-right", "xs")),
    open: false,
  });

  const rendered = renderDiff(diff, { header: false });
  d.body.append(rendered);

  const entries = fileMenu(diff, bundle, actions, rendered);
  if (entries.length) {
    // Lives in the header but must not toggle it on the way through.
    const kebab = el(
      "button",
      {
        "aria-label": `Actions for ${diff.file}`,
        class: cls("diff-more"),
        "data-tip": "Actions for this file",
        onClick: (e: Event) => {
          e.stopPropagation();
          createMenu(fileMenu(diff, bundle, actions, rendered)).open(
            kebab as HTMLElement,
            "below"
          );
        },
        type: "button",
      },
      [icon("more", "sm")]
    );
    // Pressing the button collapses any text selection before `click` runs, so
    // the range a "comment on these lines" entry needs is latched here.
    kebab.addEventListener("pointerdown", () => {
      pendingSelection = selectedLineRange(rendered);
    });
    d.head.append(kebab);
  }
  return d.root;
}

/**
 * The line range latched on pointerdown, for the menu built on click.
 *
 * Module-level because only one menu can be opening at a time — the popover
 * host closes any other on open — and threading it through would mean every
 * diff owning state it only needs for the length of one click.
 */
let pendingSelection: ReturnType<typeof selectedLineRange> = null;

function fileMenu(
  diff: JobDiffBundle["diffs"][number],
  _bundle: JobDiffBundle,
  actions: AssistantActions,
  rendered: HTMLElement
): MenuEntry[] {
  const out: MenuEntry[] = [];
  const line = firstHunkLine(diff.patch);

  if (actions.onComment) {
    const range = pendingSelection;
    const { onComment } = actions;
    out.push({
      icon: "tool-comment",
      label: range
        ? `Comment on lines ${range.from}–${range.to}…`
        : "Comment on this change…",
      run: () => onComment(diff.file, rendered),
    });
  }
  const openIn = actions.onOpenIn;
  if (openIn) {
    if (out.length) {
      out.push({ separator: true });
    }
    out.push(
      { header: "Open" },
      {
        icon: "code",
        label: "Open in VS Code",
        run: () => openIn("vscode", diff.file, line),
      },
      {
        icon: "code",
        label: "Open in Cursor",
        run: () => openIn("cursor", diff.file, line),
      }
    );
  }
  const copyPath = actions.onCopyPath;
  if (copyPath) {
    out.push({
      icon: "clipboard",
      label: "Copy path",
      run: () => copyPath(diff.file),
    });
  }
  return out;
}

function hasTurnActions(actions: AssistantActions): boolean {
  return Boolean(
    actions.onUndo ||
      actions.onCommit ||
      actions.onBranch ||
      actions.onCreatePr ||
      actions.onOpenIn
  );
}

/**
 * One kebab for the whole turn.
 *
 * This was three always-visible icon buttons, and the set only grows — commit,
 * push, PR, open in two editors, copy path. Six glyphs under every message is
 * furniture; one is a place to look.
 */
function turnMenuButton(
  bundle: JobDiffBundle,
  actions: AssistantActions
): HTMLElement {
  const btn = el(
    "button",
    {
      "aria-label": "Actions for this change",
      class: `${cls("action")} ${cls("action-icon")}`,
      "data-tip": "Actions",
      onClick: () =>
        createMenu(turnMenu(bundle, actions, btn)).open(btn, "above"),
      type: "button",
    },
    [icon("more", "sm")]
  );
  return btn;
}

/**
 * The "This change" rows: revert, commit, and open a pull request.
 *
 * Separate from `turnMenu` because all three carry an availability gate, and
 * there are two different gates. Revert does not need git at all — it rewrites
 * files from the before-state the turn captured — so it is greyed only when
 * this turn has files whose baseline was never captured, which is a fact the
 * bundle already carries. Commit and Create pull request do need git, equally
 * for every turn, so they read the daemon's health report.
 *
 * Greyed with a reason rather than hidden: a Commit that is simply missing
 * reads as a bug, and one that fails after the click has already cost the click.
 */
function changeRows(
  bundle: JobDiffBundle,
  actions: AssistantActions,
  anchor: HTMLElement
): MenuEntry[] {
  // The reason only, never the hint: `GitStatus.hint` is a command to run, sized
  // for a terminal, and a tooltip clamps at three lines. The banner and `airship
  // doctor` are where the fix gets spelled out.
  const gitBroken = actions.git && !actions.git.ok;
  const gitTip = gitBroken ? actions.git?.reason : undefined;
  const unrestorable = bundle.diffs?.some((d) => d.noBaseline) ?? false;

  const change: MenuEntry[] = [];
  if (actions.onUndo) {
    change.push({
      // No `hint`, and the label says "Revert" rather than "Undo".
      //
      // This row carried a `⌘Z` chip, which was not a stale glyph but a false
      // statement: `onUndo` here is `AirshipApp.undo(jobId)`, the *server-side*
      // revert of a finished job, while ⌘Z is `history.undo`, the local
      // direct-manipulation stack. `app.ts` says in as many words that the two
      // must never be wired together — and this menu was telling the user they
      // were. There is no chord for this, so it advertises none.
      disabled: unrestorable,
      icon: "rotate-ccw",
      label: "Revert this change",
      run: actions.onUndo,
      tip: unrestorable ? "No previous content to restore from" : undefined,
    });
  }
  const { onCommit } = actions;
  if (onCommit) {
    change.push(
      {
        disabled: gitBroken,
        icon: "version-current",
        label: "Commit to git",
        run: () => onCommit(false),
        tip: gitTip,
      },
      {
        disabled: gitBroken,
        icon: "version-merged",
        label: "Commit & push",
        run: () => onCommit(true),
        tip: gitTip,
      }
    );
  }
  const { onCreatePr } = actions;
  if (onCreatePr) {
    const files = bundle.diffs?.length ?? 0;
    change.push({
      disabled: gitBroken,
      icon: "version-branch",
      label: "Create pull request…",
      // Pushing is the only thing in this application that cannot be taken
      // back — everything else has Undo or Discard — so it takes a second
      // deliberate click. A second menu rather than a native confirm(): it
      // says exactly what will happen and looks like the rest of the editor.
      run: () =>
        createMenu([
          { header: "This cannot be undone" },
          {
            icon: "version-branch",
            label: `Commit ${files} file${files === 1 ? "" : "s"}, push & open PR`,
            run: onCreatePr,
          },
        ]).open(anchor, "above"),
      tip: gitTip,
    });
  }
  return change;
}

/** The turn kebab's contents, grouped. Exported for the same reason it is
 * separate: the shape of this menu is a product decision worth reading. */
export function turnMenu(
  bundle: JobDiffBundle,
  actions: AssistantActions,
  anchor: HTMLElement
): MenuEntry[] {
  const out: MenuEntry[] = [];
  const file = bundle.diffs?.[0]?.file ?? bundle.target?.source?.file;
  const line = bundle.diffs?.[0]
    ? firstHunkLine(bundle.diffs[0].patch)
    : (bundle.target?.source?.line ?? undefined);

  const change = changeRows(bundle, actions, anchor);
  if (change.length) {
    out.push({ header: "This change" }, ...change);
  }

  if (actions.onBranch) {
    if (out.length) {
      out.push({ separator: true });
    }
    // Deliberately not "Branch". This forks the agent's *session*, not git —
    // and sitting one line under "Create pull request" the git reading is the
    // one every user would take.
    out.push(
      { header: "Continue" },
      {
        icon: "version-branch",
        label: "Try again from here",
        run: actions.onBranch,
      }
    );
  }

  const openIn = actions.onOpenIn;
  if (openIn && file) {
    if (out.length) {
      out.push({ separator: true });
    }
    out.push(
      { header: "Open" },
      {
        icon: "code",
        label: "Open in VS Code",
        run: () => openIn("vscode", file, line),
      },
      {
        icon: "code",
        label: "Open in Cursor",
        run: () => openIn("cursor", file, line),
      }
    );
    if (actions.onCopyPath) {
      const copyPath = actions.onCopyPath;
      out.push({
        icon: "clipboard",
        label: "Copy path",
        run: () => copyPath(file),
      });
    }
  }
  return out;
}
