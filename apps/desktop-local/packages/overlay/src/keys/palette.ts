/**
 * ⌘K — search everything the editor can do right now, and run it.
 *
 * The counterpart to the shortcuts panel, and deliberately not the same list.
 * This one renders `keys.available()`: commands that are bound *and* whose
 * guards say yes this second. It is an action surface, so every row has to do
 * something — a palette that offers "Zoom to fit" on the inline overlay, where
 * there is no canvas, has lied to you before you press Enter. The panel renders
 * the whole catalog with the unavailable rows dimmed, because a reference that
 * hides what you cannot currently do is useless for learning.
 *
 * That distinction is the whole reason no mode enum was needed for either. The
 * `when` closures are pure predicates each subsystem already maintains, so
 * asking all of them at once *is* the live answer — `tools.ts` made that
 * argument first ("consulted per keypress rather than latched — it asks").
 *
 * ## Two things that look like details and are not
 *
 * **Focus stays in the search field.** The active row moves by
 * `aria-activedescendant`, never by `focus()`. `popover-host`'s own roving
 * helpers move real focus, which is right for a menu and would take the caret
 * out of the field here on the first ↓.
 *
 * **The navigation is four scoped commands, not a keydown listener.** The
 * field has focus the whole time, so the registry skips every binding without
 * `allowWhileTyping`; these four carry it, and `within` keeps them from leaking
 * to a page where ↓ means something else.
 *
 * ## A row is not a menu row
 *
 * It used to be built as one — `.pop-item` plus `.pop-item-main` plus
 * `.pop-item-hint` — and inherited three faults from a shape it is not.
 * `.pop-item` is `justify-content: space-between`, so with an empty placeholder
 * at each end the body floated in the middle and every row's title started at a
 * different x, moved by the widths of the icon and the chord beside it.
 * `.pop-item-main` is an `inline-flex` *row*, so the title and its sentence
 * printed side by side rather than as the two lines this was written as. And
 * `.pop-item:hover` at (0,2,0) out-ranked `.palette-row-on` at (0,1,0) — so in a
 * surface whose entire navigation is the arrow keys, the pointer won every
 * argument about which row was current.
 *
 * The palette owns its own row now, and the columns come from the *list* — see
 * `help.css.ts`. The pointer still moves the cursor; it does it through
 * `pointerover` → `setActive`, which is one highlight moved by two inputs rather
 * than two highlights fighting over one row.
 */
import { cls, el } from "../dom";
import { icon } from "../icons";
import { openPopover, type PopoverHandle } from "../popover-host";

import { chordChips } from "./chips";
import { keys, type LiveCommand } from "./registry";

/** Only one can be open, and ⌘K while it is up should close it. */
let open: PopoverHandle | null = null;

/**
 * A row that is not a catalog command — "Add Button", "Wrap in <section>".
 *
 * These are the editor's *content* rather than its commands: there is one per
 * element in the library and one per tag you can type, so they cannot each be
 * a bound chord in the catalog. The app supplies them through a source; the
 * palette ranks and renders them exactly like a command.
 */
export interface PaletteRow {
  doc: string;
  group: string;
  /** Extra words to match on that the row does not print. */
  keywords?: string;
  run: () => void;
  title: string;
}

/**
 * Supplies extra rows for a query. `only` is true when the palette was opened
 * for them alone (⌘E, the Add button), which is also when an empty query should
 * list everything rather than nothing.
 */
export type PaletteSource = (query: string, only: boolean) => PaletteRow[];

let source: PaletteSource | null = null;

/** Register the app's extra rows. Returns the unregister. */
export function setPaletteSource(next: PaletteSource): () => void {
  source = next;
  return () => {
    if (source === next) {
      source = null;
    }
  };
}

export interface PaletteOptions {
  /** Show only the source's rows, not the commands. */
  only?: boolean;
  placeholder?: string;
  /** Rows for this opening only, in place of the registered source. */
  source?: PaletteSource;
}

interface Rankable {
  doc: string;
  group: string;
  keywords?: string;
  title: string;
}

/**
 * Rank a command against a query, or `null` if it does not match.
 *
 * Subsequence rather than substring, so "zf" finds "Zoom to fit" — the thing
 * people actually type into a palette. Lower is better. No fuzzy-search
 * dependency: the corpus is forty rows, and a scoring function nobody can
 * explain is worse than one that occasionally ranks a row second.
 */
function score(spec: Rankable, query: string): number | null {
  const haystack =
    `${spec.title} ${spec.group} ${spec.doc} ${spec.keywords ?? ""}`.toLowerCase();
  const title = spec.title.toLowerCase();
  if (!query) {
    return 0;
  }
  // A title that starts with the query is what the user meant, every time.
  if (title.startsWith(query)) {
    return 0;
  }
  if (title.includes(query)) {
    return 1;
  }
  let at = 0;
  for (const ch of query) {
    at = title.indexOf(ch, at);
    if (at === -1) {
      // Fall back to the whole haystack, so "canvas" finds the View group's
      // rows through their group name and their sentence.
      return haystack.includes(query) ? 3 : null;
    }
    at += 1;
  }
  return 2;
}

type Chord = ReturnType<typeof keys.chordParts>[number];

/** One rendered row: a live command or a source row, ranked the same way. */
interface Entry {
  chord: Chord | undefined;
  row: Rankable;
  run: () => void;
}

function commandEntry(c: LiveCommand): Entry {
  // The first chord only. A palette row is a thing to *run*, so it wants the
  // one key you would teach someone; the sheet is the reference that shows
  // every chord a command answers to.
  const [chord] = keys.chordParts(c.spec.id);
  return { chord, row: c.spec, run: () => c.run() };
}

function matches(
  query: string,
  only: boolean,
  from: PaletteSource | null
): Entry[] {
  const q = query.trim().toLowerCase();
  const extra: Entry[] = (from?.(query, only) ?? []).map((r) => ({
    chord: undefined,
    row: r,
    run: r.run,
  }));
  const commands = only ? [] : keys.available().map(commandEntry);
  return (
    [...commands, ...extra]
      .map((e) => ({ e, rank: score(e.row, q) }))
      .filter((r): r is { e: Entry; rank: number } => r.rank !== null)
      // Stable within a rank, so an empty query keeps catalog order and the
      // groups below stay contiguous.
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.e)
  );
}

export function closePalette(): void {
  open?.close("programmatic");
  open = null;
}

export function paletteIsOpen(): boolean {
  return open !== null;
}

export function openPalette(options: PaletteOptions = {}): void {
  if (open) {
    closePalette();
    return;
  }
  const only = Boolean(options.only);
  const from = options.source ?? source;

  const field = el("input", {
    "aria-autocomplete": "list",
    "aria-controls": `${cls("palette-list")}`,
    "aria-expanded": "true",
    class: cls("palette-field"),
    placeholder: options.placeholder ?? "Search commands…",
    role: "combobox",
    type: "text",
  }) as HTMLInputElement;

  const list = el("div", {
    class: `${cls("palette-list")} ${cls("scroll-y")}`,
    id: cls("palette-list"),
    role: "listbox",
  });

  const empty = el("div", {
    class: cls("palette-empty"),
    text: "Nothing matches.",
  });

  const card = el(
    "div",
    {
      "aria-label": "Command palette",
      "aria-modal": "true",
      class: cls("palette"),
      role: "dialog",
    },
    [
      el("div", { class: cls("palette-head") }, [icon("search", "sm"), field]),
      list,
    ]
  );

  /** The rows currently rendered, in display order. */
  let rows: { el: HTMLElement; run: () => void }[] = [];
  let active = 0;

  const setActive = (i: number): void => {
    if (!rows.length) {
      field.removeAttribute("aria-activedescendant");
      return;
    }
    active = Math.max(0, Math.min(rows.length - 1, i));
    rows.forEach((row, at) => {
      row.el.classList.toggle(cls("palette-row-on"), at === active);
      row.el.setAttribute("aria-selected", String(at === active));
    });
    const chosen = rows[active].el;
    field.setAttribute("aria-activedescendant", chosen.id);
    chosen.scrollIntoView({ block: "nearest" });
  };

  const render = (): void => {
    const found = matches(field.value, only, from);
    list.replaceChildren();
    rows = [];
    if (!found.length) {
      list.append(empty);
      field.removeAttribute("aria-activedescendant");
      return;
    }
    // Headers only on an empty query. Once you are searching, the ranking has
    // already reordered everything and a group heading would sit above rows
    // that are no longer grouped.
    const grouped = !field.value.trim();
    let seen: string | null = null;
    found.forEach((entry, i) => {
      const { chord, row: spec } = entry;
      if (grouped && spec.group !== seen) {
        seen = spec.group;
        list.append(el("div", { class: cls("pop-head"), text: spec.group }));
      }
      const row = el(
        "div",
        {
          class: cls("palette-row"),
          id: `${cls("palette-row")}-${i}`,
          role: "option",
        },
        [
          el("span", { class: cls("palette-title"), text: spec.title }),
          el("span", { class: cls("palette-doc"), text: spec.doc }),
          // Always present, even empty. The three cells are placed into the
          // list's subgrid by source order, so a row that skipped its chord
          // would put its sentence in the chord's column.
          chordChips(chord ? [chord] : []),
        ]
      );
      const invoke = (): void => {
        closePalette();
        entry.run();
      };
      // `pointerdown`, not `click`: the host's outside-press listener is also
      // on `pointerdown`, and a row that waited for `click` would be gone by
      // the time it arrived.
      row.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        invoke();
      });
      row.addEventListener("pointerover", () => setActive(i));
      rows.push({ el: row, run: invoke });
      list.append(row);
    });
    setActive(0);
  };

  field.addEventListener("input", render);
  // The one trap in a dialog whose focus never moves: anything that steals
  // focus leaves the four navigation commands scoped to a card nobody is in.
  card.addEventListener("focusout", (e) => {
    const to = (e as FocusEvent).relatedTarget as Node | null;
    if (!(to && card.contains(to))) {
      field.focus();
    }
  });

  render();

  const offKeys = keys.bindAll([
    { id: "palette.next", run: () => setActive(active + 1), within: card },
    { id: "palette.prev", run: () => setActive(active - 1), within: card },
    {
      id: "palette.run",
      run: () => rows[active]?.run(),
      within: card,
    },
    {
      id: "palette.close",
      // Clears the query first and closes on the second press — the same
      // two-step `token-field.ts` uses, so a mistyped search does not cost you
      // the palette.
      //
      // The popover host binds its own Escape on this same card, and what tells
      // the two apart is that focus is in a *field*: the host's carries no
      // `allowWhileTyping`, so the registry skips it and this one is the only
      // Escape left standing. If focus ever escapes the field the host's wins
      // and the palette simply closes, which is the right fallback anyway.
      run: () => {
        if (field.value) {
          field.value = "";
          render();
          return;
        }
        closePalette();
      },
      within: card,
    },
  ]);

  open = openPopover({
    className: "pop-palette",
    content: card,
    modal: true,
    onClose: () => {
      offKeys();
      open = null;
    },
    // The card's own commands do the navigating; the host's roving would move
    // real focus out of the search field.
    roving: false,
  });
  field.focus();
}
