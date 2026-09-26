/**
 * "Which backend, on which model?", as one picker.
 *
 * The header used to ask only the first half, because the second was settled at
 * launch by `--model` and could not be changed without restarting the daemon.
 * Splitting them into two controls was the obvious shape and the wrong one: a
 * model id only means anything against a backend — `claude-opus-5` is not a
 * thing Codex can run — so two independent pickers would spend most of their
 * time in states that cannot be sent.
 *
 * So it stays one surface, laid out the way T3 Code lays out its own: a rail of
 * backend marks down the left, and a search field over that backend's models on
 * the right. Choosing a row chooses both halves. The rail only *shows* a
 * backend; nothing is picked until a model is.
 *
 * It used to be a `createMenu` accordion with a separate "model id or alias"
 * field under it. The field is gone because the search box is the same field:
 * type an id nothing in the list matches and the last row offers to use it.
 *
 * Built on the command palette's pattern rather than the menu's — see
 * `keys/palette.ts`. Focus stays in the search field, the active row moves by
 * `aria-activedescendant`, and the navigation is scoped commands rather than a
 * keydown listener.
 */

import type { AgentKind, ModelCatalogue } from "@airship/protocol";
import { cls, el } from "../dom";
import { type IconName, icon } from "../icons";
import { keys } from "../keys/registry";
import { openPopover } from "../popover-host";

/** The id that means "send no model and let the daemon's default stand". */
export const MODEL_DEFAULT = "";

export interface ModelPick {
  agent: AgentKind;
  /** `MODEL_DEFAULT` for the backend's leading row. */
  model: string;
}

export interface ModelMenuDeps {
  /** The harness the composer is on. The rail opens on it. */
  agent: AgentKind;
  /** Live catalogue if one has arrived, else the seed. */
  catalogue: ModelCatalogue;
  /** The current model per harness, so each list marks its own. */
  models: Partial<Record<AgentKind, string>>;
  pick: (choice: ModelPick) => void;
}

/** Product marks, in the order the rail offers the backends. */
const AGENT_META: { icon: IconName; kind: AgentKind; label: string }[] = [
  { icon: "claude", kind: "claude", label: "Claude" },
  { icon: "codex", kind: "codex", label: "Codex" },
  { icon: "opencode", kind: "opencode", label: "OpenCode" },
];

/** The label a picked model gets in the button's tooltip. */
export function modelLabel(
  catalogue: ModelCatalogue,
  agent: AgentKind,
  model: string | undefined
): string {
  if (!model) {
    return "default";
  }
  const group = catalogue.find((g) => g.agent === agent);
  return group?.models.find((m) => m.id === model)?.label ?? model;
}

/** One line in the list. Data, so the filtering is testable without a DOM. */
export interface ModelRow {
  agent: AgentKind;
  /** A typed id nothing in the catalogue matched: "Use …". */
  custom?: boolean;
  /** A backend's note standing in for its models. Shown, never chosen. */
  disabled?: boolean;
  hint?: string;
  label: string;
  /** `MODEL_DEFAULT` for the Default row. */
  model: string;
  on: boolean;
}

/**
 * One backend's rows.
 *
 * Every backend leads with Default, and it is a real choice rather than a
 * placeholder: picking it clears the model from the request so the daemon's
 * own resolved setting applies — which is what `--claude-model` and
 * `airship.config.json` are for, and the only way back to them once a model has
 * been picked by hand.
 */
function rowsFor(deps: ModelMenuDeps, agent: AgentKind): ModelRow[] {
  const group = deps.catalogue.find((g) => g.agent === agent);
  const current = deps.models[agent];
  const rows: ModelRow[] = [
    {
      agent,
      hint: group?.default ?? "the backend decides",
      label: "Default",
      model: MODEL_DEFAULT,
      on: !current,
    },
  ];
  // A backend that could not be reached says so in place of its models. An
  // empty list reads as a broken picker rather than a missing login, and the
  // two want very different things from the user.
  if (group?.note && !group.models.length) {
    rows.push({
      agent,
      disabled: true,
      label: group.note,
      model: MODEL_DEFAULT,
      on: false,
    });
  }
  for (const model of group?.models ?? []) {
    rows.push({
      agent,
      hint: model.hint,
      label: model.label,
      model: model.id,
      on: model.id === current,
    });
  }
  return rows;
}

/**
 * The rows for what the rail shows and what has been typed.
 *
 * An empty query lists the shown backend. A query searches *every* backend,
 * the way T3 Code's does — you usually know the model's name before you know
 * which rail button it sits under — and each result then carries its backend's
 * mark so two models with one name stay tellable apart.
 *
 * A query that is not exactly some row's id ends with a row that uses it as
 * typed, on the shown backend. Deliberately not validated: the daemon is the
 * one that knows, and the CLI already refuses `--opencode-model sonnet`.
 */
export function modelRows(
  deps: ModelMenuDeps,
  shown: AgentKind,
  query: string
): ModelRow[] {
  const q = query.trim();
  if (!q) {
    return rowsFor(deps, shown);
  }
  const needle = q.toLowerCase();
  const found = AGENT_META.flatMap((meta) => rowsFor(deps, meta.kind)).filter(
    (row) =>
      !row.disabled &&
      [row.label, row.model, row.hint ?? ""].some((s) =>
        s.toLowerCase().includes(needle)
      )
  );
  const exact = found.some((row) => row.agent === shown && row.model === q);
  if (!exact) {
    found.push({ agent: shown, custom: true, label: q, model: q, on: false });
  }
  return found;
}

export interface ModelPickerHandle {
  close: () => void;
  /** Repaint in place, keeping the query and the rail — for `models:result`. */
  update: (deps: ModelMenuDeps) => void;
}

function metaFor(agent: AgentKind): (typeof AGENT_META)[number] {
  return AGENT_META.find((m) => m.kind === agent) ?? AGENT_META[0];
}

function buildRow(row: ModelRow, id: string, searching: boolean): HTMLElement {
  const meta = metaFor(row.agent);
  const main = row.custom
    ? [
        el("span", { class: cls("model-row-label"), text: "Use" }),
        el("code", { class: cls("model-row-id"), text: row.label }),
      ]
    : [
        el("span", { class: cls("model-row-label"), text: row.label }),
        row.hint
          ? el("span", { class: cls("model-row-hint"), text: row.hint })
          : null,
      ];
  // The backend line only when the list mixes backends. Unsearched, the rail
  // already says whose models these are, and a second copy on every row would
  // double the list's height to repeat one word.
  const sub =
    searching || row.custom
      ? el("span", { class: cls("model-row-sub") }, [
          icon(meta.icon, "xs"),
          el("span", {
            text: row.custom ? `as a ${meta.label} model id` : meta.label,
          }),
        ])
      : null;
  return el(
    "div",
    {
      "aria-disabled": row.disabled ? "true" : undefined,
      "aria-selected": String(row.on),
      class: `${cls("model-row")}${row.on ? ` ${cls("model-row-on")}` : ""}`,
      id,
      role: "option",
    },
    [
      el("span", { class: cls("model-row-text") }, [
        el("span", { class: cls("model-row-main") }, main),
        sub,
      ]),
      row.on ? icon("check", "xs") : null,
    ]
  );
}

/**
 * Open the picker against its header button, or `null` when the press was the
 * one that toggles it shut.
 *
 * `onClose` fires however it goes, which is what drives the trigger's
 * `aria-expanded`.
 */
export function openModelPicker(
  anchor: HTMLElement,
  initial: ModelMenuDeps,
  onClose: () => void
): ModelPickerHandle | null {
  let deps = initial;
  let shown = deps.agent;
  let rows: { el: HTMLElement; row: ModelRow }[] = [];
  let active = 0;

  const field = el("input", {
    "aria-autocomplete": "list",
    "aria-controls": cls("model-list"),
    "aria-expanded": "true",
    "aria-label": "Search models",
    class: cls("model-field"),
    role: "combobox",
    spellcheck: "false",
    type: "text",
  }) as HTMLInputElement;

  const list = el("div", {
    class: `${cls("model-list")} ${cls("scroll-y")}`,
    id: cls("model-list"),
    role: "listbox",
  });

  const railButtons = AGENT_META.map((meta) =>
    el(
      "button",
      {
        "aria-label": meta.label,
        class: cls("model-rail-btn"),
        "data-agent": meta.kind,
        "data-tip": meta.label,
        onClick: () => {
          shown = meta.kind;
          render();
          // Back to the field, so the next keystroke searches what you just
          // switched to instead of landing on a button.
          field.focus();
        },
        type: "button",
      },
      [icon(meta.icon, "sm")]
    )
  );

  const pane = el("div", { class: cls("model-pane") }, [
    el("div", { class: cls("model-head") }, [icon("search", "xs"), field]),
    list,
  ]);

  const card = el(
    "div",
    { "aria-label": "Choose a model", class: cls("model-picker") },
    [
      el(
        "div",
        {
          "aria-label": "Backends",
          "aria-orientation": "vertical",
          class: cls("model-rail"),
          role: "toolbar",
        },
        railButtons
      ),
      pane,
    ]
  );

  const setActive = (i: number): void => {
    if (!rows.length) {
      field.removeAttribute("aria-activedescendant");
      return;
    }
    // Wrap, like the menus do, so ↓ from the last row lands on the first.
    active = (i + rows.length) % rows.length;
    rows.forEach((r, at) => {
      r.el.classList.toggle(cls("model-row-active"), at === active);
    });
    const chosen = rows[active].el;
    field.setAttribute("aria-activedescendant", chosen.id);
    chosen.scrollIntoView({ block: "nearest" });
  };

  const choose = (row: ModelRow): void => {
    popover.close("select");
    deps.pick({ agent: row.agent, model: row.model });
  };

  function render(): void {
    for (const btn of railButtons) {
      btn.setAttribute("aria-pressed", String(btn.dataset.agent === shown));
    }
    field.placeholder =
      shown === "opencode" ? "Search, or type provider/model" : "Search models";
    const searching = Boolean(field.value.trim());
    list.replaceChildren();
    rows = [];
    modelRows(deps, shown, field.value).forEach((row, i) => {
      const node = buildRow(row, `${cls("model-row")}-${i}`, searching);
      list.append(node);
      if (row.disabled) {
        return;
      }
      const index = rows.length;
      // `click` is safe here, unlike the palette's `pointerdown`: that one is a
      // modal, and this press lands inside the shell the host is watching.
      node.addEventListener("click", () => choose(row));
      node.addEventListener("pointerover", () => setActive(index));
      rows.push({ el: node, row });
    });
    // Open on the current pick, so Enter straight away changes nothing and the
    // arrows start from where you are rather than from the top.
    const current = rows.findIndex((r) => r.row.on);
    setActive(!searching && current !== -1 ? current : 0);
  }

  field.addEventListener("input", render);
  render();

  const offKeys = keys.bindAll([
    { id: "modelPicker.next", run: () => setActive(active + 1), within: pane },
    { id: "modelPicker.prev", run: () => setActive(active - 1), within: pane },
    {
      id: "modelPicker.run",
      run: () => {
        const row = rows[active]?.row;
        if (row) {
          choose(row);
        }
      },
      within: pane,
    },
    {
      id: "modelPicker.close",
      // Clears the query first and closes on the second press, the same
      // two-step the palette uses.
      run: () => {
        if (field.value) {
          field.value = "";
          render();
          return;
        }
        popover.close("escape");
      },
      within: pane,
    },
  ]);

  const popover = openPopover({
    anchor,
    className: "pop-model",
    content: card,
    onClose: () => {
      offKeys();
      onClose();
    },
    prefer: "below",
    // The pane's own commands do the navigating; the host's roving would move
    // real focus out of the search field.
    roving: false,
  });
  // The host hands back an inert handle when this press re-clicked the trigger
  // of the picker already open — a toggle shut. Nothing mounted, so nothing
  // will ever call `onClose` to unbind these.
  if (!popover.element.isConnected) {
    offKeys();
    return null;
  }
  field.focus();

  return {
    close: () => popover.close(),
    update(next) {
      deps = next;
      render();
      popover.reposition();
    },
  };
}
