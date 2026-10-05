/**
 * Link — where an `<a>` or a `<button>` goes.
 *
 * The first section in the panel, above Scope, because it is not a style: no
 * scope or forced state changes where a link points. Everything here writes
 * HTML attributes through `ctx.onAttr`, the same path Media's `alt` takes.
 *
 * The shape is Webflow's link settings, drawn inline rather than in a popover:
 * a row of destination kinds as icon cells, then only the fields that kind
 * needs. The words are 8pixel's — each kind says what the *visitor's* click
 * does ("Starts an email to this address"), not what the attribute is called.
 */
import { cls, el, PREFIX } from "../../dom";
import { type IconName, icon } from "../../icons";
import { createTextField } from "../controls/num-field";
import { createSegmented } from "../controls/segmented";
import { createSelect } from "../controls/select";
import type { Descriptor, EnumOption } from "../descriptors";
import { type ClickAction, clickAction } from "./click-action";
import type { SectionContext } from "./context";
import { enumDescriptor, labelled } from "./row";

type LinkKind = "url" | "page" | "section" | "email" | "phone";

interface KindSpec {
  hint: string;
  icon: IconName;
  label: string;
}

const KINDS: Record<LinkKind, KindSpec> = {
  email: {
    hint: "Starts an email to this address",
    icon: "mail",
    label: "Email",
  },
  page: {
    hint: "Goes to a page on this site",
    icon: "proto-navigate",
    label: "Page",
  },
  phone: {
    hint: "Calls this number on a phone",
    icon: "phone",
    label: "Phone",
  },
  section: {
    hint: "Scrolls to a part of this page",
    icon: "proto-scroll-to",
    label: "Section",
  },
  url: {
    hint: "Opens another website",
    icon: "proto-open-link",
    label: "Web address",
  },
};

const KIND_ORDER: readonly LinkKind[] = [
  "url",
  "page",
  "section",
  "email",
  "phone",
];

/** Any scheme at the start of an href: `https:`, `mailto:`, `javascript:`. */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const WEB_SCHEME = /^https?:$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Enough digits to be a number someone could dial. */
const DIALLABLE = /\d{5,}/;
const NOT_DIAL = /[^\d+]/g;
/** A bare host a person types without its scheme: `example.com/about`. */
const BARE_HOST = /^[^\s./]+\.[^\s]{2,}$/;
const WHITESPACE = /\s+/;
const MAX_SECTIONS = 60;

/*
 * The kind a person picked but has not filled in yet.
 *
 * Choosing Email writes nothing — an empty `mailto:` is a broken link — so the
 * choice lives here until the address is typed. Keyed on the node so it
 * survives the panel rebuilding its body under a refresh.
 */
const draftKinds = new WeakMap<Element, LinkKind>();

/** Which kind an existing href is, so the section opens on the right tab. */
export function kindOf(href: string | null): LinkKind {
  const raw = (href ?? "").trim();
  const scheme = SCHEME.exec(raw)?.[1]?.toLowerCase();
  if (scheme === "mailto") {
    return "email";
  }
  if (scheme === "tel") {
    return "phone";
  }
  if (raw.startsWith("#")) {
    return "section";
  }
  if (scheme || raw.startsWith("//") || raw === "") {
    return "url";
  }
  return "page";
}

/**
 * The href for what someone typed into the web-address field, or the reason
 * it cannot be one. A bare `example.com` gets its `https://`, because almost
 * nobody types the scheme; anything that is not http(s) is refused, which is
 * what keeps a `javascript:` address out of the markup.
 */
export function webHref(value: string): { href: string } | { problem: string } {
  const clean = value.trim();
  if (clean.startsWith("//")) {
    return { href: clean };
  }
  const scheme = SCHEME.exec(clean)?.[0];
  if (scheme) {
    return WEB_SCHEME.test(scheme)
      ? { href: clean }
      : { problem: "Only web addresses (https://) go here" };
  }
  return BARE_HOST.test(clean)
    ? { href: `https://${clean}` }
    : { problem: "That does not look like a web address" };
}

/** A same-site path. A scheme belongs on the Web address tab instead. */
export function pageHref(
  value: string
): { href: string } | { problem: string } {
  const clean = value.trim();
  if (SCHEME.test(clean) || clean.startsWith("//")) {
    return { problem: "Other websites go under Web address" };
  }
  return { href: clean };
}

export function mailHref(address: string, subject: string): string {
  const query = subject.trim()
    ? `?subject=${encodeURIComponent(subject.trim())}`
    : "";
  return `mailto:${address.trim()}${query}`;
}

export function readMail(href: string | null): {
  address: string;
  subject: string;
} {
  const raw = (href ?? "").replace(SCHEME, "");
  const [address = "", query = ""] = raw.split("?");
  const subject = new URLSearchParams(query).get("subject") ?? "";
  return { address: decodeURIComponent(address), subject };
}

/** `tel:` keeps digits and a leading `+`: spaces make some keypads misdial. */
export function telHref(value: string): string {
  return `tel:${value.trim().replace(NOT_DIAL, "")}`;
}

function isAnchor(node: Element): boolean {
  return node.tagName.toUpperCase() === "A";
}

function isButton(node: Element): boolean {
  return node.tagName.toUpperCase() === "BUTTON";
}

/** Does this element get the section at all? Part of the panel's shape key. */
export function hasLinkSection(node: Element): boolean {
  return isAnchor(node) || isButton(node);
}

export function renderLink(
  ctx: SectionContext,
  node: Element,
  onPreview?: (node: Element) => void
): HTMLElement | null {
  // A `<button>` gets the same picker. It cannot hold an href, so the agent
  // is told to turn it into a link that keeps its look (see `prompt.ts`).
  return hasLinkSection(node) ? renderAnchor(ctx, node, onPreview) : null;
}

function renderAnchor(
  ctx: SectionContext,
  node: Element,
  onPreview?: (node: Element) => void
): HTMLElement {
  const href = (): string | null => node.getAttribute("href");
  /*
   * A button that already does something says so first. Its link picker
   * stays below, under a heading that says what choosing one would mean,
   * and starts with no kind chosen: an empty web-address field under
   * "Opens a dialog" read as a second, broken destination.
   */
  const action = isButton(node) && !href() ? clickAction(node) : null;
  const currentKind = (): LinkKind | "" => {
    const draft = draftKinds.get(node);
    if (draft) {
      return draft;
    }
    return action && !href() ? "" : kindOf(href());
  };

  const body = el("div", { class: cls("sect-body") });
  const detail = el("div", { class: cls("link-detail") });
  const repaint = ctx.repaintScope();
  let shown = currentKind();

  const paint = (): void => {
    shown = currentKind();
    const kind = shown;
    repaint(() => {
      detail.replaceChildren(...(kind ? renderKind(ctx, node, kind) : []));
    });
  };

  const kindDescriptor: Descriptor = {
    controlType: "segmented",
    cssProperty: "--attr-link-kind",
    defaultValue: action ? "" : "url",
    enumValues: KIND_ORDER.map(
      (kind): EnumOption => ({
        icon: KINDS[kind].icon,
        label: KINDS[kind].label,
        value: kind,
      })
    ),
    group: "appearance",
    key: "linkKind",
    label: "Link to",
    span: "full",
  };
  const kinds = createSegmented(kindDescriptor, shown, () => undefined, {
    derive: currentKind,
    onSelect: (value) => {
      const kind = value as LinkKind;
      if (kind === kindOf(href())) {
        draftKinds.delete(node);
      } else {
        draftKinds.set(node, kind);
      }
      paint();
    },
  });
  ctx.register({
    ...kinds,
    resync: () => {
      // An undo or an agent edit can move the href to another kind entirely;
      // a draft only survives while the href still has nothing to say.
      if (href() && draftKinds.get(node) === kindOf(href())) {
        draftKinds.delete(node);
      }
      kinds.setValue(kindDescriptor.cssProperty, currentKind());
      if (currentKind() !== shown) {
        // Deferred: this runs inside the re-seed pass, and a repaint registers
        // controls into the list that pass is walking.
        queueMicrotask(paint);
      }
    },
    virtual: true,
  });

  if (action) {
    body.append(
      actionCard(action, node, onPreview),
      el("div", { class: cls("sect-sub-head"), text: "Link instead" })
    );
  }
  body.append(kinds.element, detail);
  paint();

  const unlink = ctx.headerAction("minus", "Remove link", () => {
    draftKinds.delete(node);
    ctx.batch(() => {
      if (node.hasAttribute("href")) {
        ctx.onAttr(node, "href", null);
      }
      setNewTab(ctx, node, false);
    });
  });
  // No "Remove link" on a button that has none to remove.
  return ctx.section("link", action ? "Action" : "Link", body, {
    actions: action ? [] : [unlink],
  });
}

/** "When clicked → Opens a dialog · Book a demo", read-only. */
function actionCard(
  action: ClickAction,
  node: Element,
  onPreview?: (node: Element) => void
): HTMLElement {
  const play: HTMLElement | null =
    action.previewable && onPreview
      ? el(
          "button",
          {
            "aria-label": "Run action to show content for editing",
            class: cls("link-action-play"),
            "data-tip": "Show content, then select it to edit",
            onClick: () => {
              if (!clickAction(node)?.previewable) {
                play?.remove();
                return;
              }
              onPreview(node);
              queueMicrotask(() => {
                if (!(node.isConnected && clickAction(node)?.previewable)) {
                  play?.remove();
                }
              });
            },
            type: "button",
          },
          [icon("play", "sm")]
        )
      : null;
  return el("div", { class: cls("link-action") }, [
    icon(action.icon, "sm"),
    el("span", { class: cls("link-action-text"), text: action.text }),
    action.detail
      ? el("span", { class: cls("link-action-detail"), text: action.detail })
      : null,
    play,
  ]);
}

/** The fields one kind needs, and nothing else. */
function renderKind(
  ctx: SectionContext,
  node: Element,
  kind: LinkKind
): HTMLElement[] {
  const hint = el("p", { class: cls("link-hint"), text: KINDS[kind].hint });
  const own = (): string =>
    kindOf(node.getAttribute("href")) === kind
      ? (node.getAttribute("href") ?? "")
      : "";
  const write = (next: string): void => {
    draftKinds.delete(node);
    ctx.onAttr(node, "href", next);
  };

  switch (kind) {
    case "url":
      return [
        hint,
        linkField(ctx, {
          commit: (value) => {
            const result = webHref(value);
            if ("problem" in result) {
              return result.problem;
            }
            write(result.href);
            return null;
          },
          glyph: "globe",
          label: "Web address",
          placeholder: "example.com",
          read: own,
        }),
        newTabRow(ctx, node),
      ];
    case "page":
      return [
        hint,
        ...pickerRows(ctx, {
          commit: (value) => {
            const result = pageHref(value);
            if ("problem" in result) {
              return result.problem;
            }
            write(result.href);
            return null;
          },
          field: "Path",
          options: sitePages(node),
          other: "Another path…",
          placeholder: "/about",
          prompt: "Choose a page",
          read: own,
        }),
        newTabRow(ctx, node),
      ];
    case "section":
      return [
        hint,
        ...pickerRows(ctx, {
          commit: (value) => {
            write(value.startsWith("#") ? value : `#${value}`);
            return null;
          },
          field: "Anchor",
          options: pageSections(node),
          other: "Another anchor…",
          placeholder: "#pricing",
          prompt: "Choose a section",
          read: own,
        }),
      ];
    case "email":
      return [hint, ...mailRows(ctx, node, write)];
    default:
      return [
        hint,
        linkField(ctx, {
          commit: (value) => {
            if (!DIALLABLE.test(value.replace(NOT_DIAL, ""))) {
              return "That does not look like a phone number";
            }
            write(telHref(value));
            return null;
          },
          glyph: "phone",
          label: "Phone number",
          placeholder: "+46 70 123 45 67",
          read: () => own().replace(SCHEME, ""),
        }),
      ];
  }
}

interface FieldSpec {
  /**
   * Write the value, or return why it cannot be written. An empty field never
   * reaches this: emptying it removes the link instead.
   */
  commit: (value: string) => string | null;
  glyph?: IconName | string;
  label: string;
  placeholder: string;
  read: () => string;
}

/**
 * A text field that commits on blur and Enter, reverts on Escape, and says in
 * a line underneath why a value was not written — rather than writing a broken
 * link or silently dropping what was typed.
 */
function linkField(ctx: SectionContext, spec: FieldSpec): HTMLElement {
  const field = createTextField({
    glyph: spec.glyph,
    label: spec.label,
    placeholder: spec.placeholder,
  });
  const problem = el("p", { class: cls("link-problem"), role: "status" });
  problem.hidden = true;
  const say = (text: string | null): void => {
    problem.textContent = text ?? "";
    problem.hidden = !text;
    field.element.toggleAttribute("data-invalid", Boolean(text));
  };
  const reflect = (): void => {
    field.input.value = spec.read();
    say(null);
  };
  reflect();

  let skipBlur = false;
  const commit = (): void => {
    if (skipBlur) {
      skipBlur = false;
      return;
    }
    const value = field.input.value.trim();
    if (value === spec.read()) {
      say(null);
      return;
    }
    if (value === "") {
      say(null);
      return;
    }
    say(spec.commit(value));
  };
  field.input.addEventListener("blur", commit);
  field.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      field.input.blur();
    } else if (e.key === "Escape") {
      // Same guard as Media's attribute fields: Escape reverts, and the blur
      // that follows must not commit what it just threw away.
      e.stopPropagation();
      reflect();
      skipBlur = true;
      field.input.blur();
    }
  });
  ctx.register({
    element: field.element,
    resync: reflect,
    setValue: () => undefined,
    virtual: true,
  });
  return el("div", { class: cls("link-field") }, [field.element, problem]);
}

/** The menu entry that reveals the field, for a value the menu does not list. */
const OTHER = "__other";

/**
 * Pick from what the page already has, or type anything.
 *
 * One menu of the pages or sections that exist, ending in an "Other" entry.
 * The field only appears for that entry, or for a value the menu does not
 * list: showing it beside a menu that already says `/pricing` was the same
 * value twice.
 */
function pickerRows(
  ctx: SectionContext,
  spec: {
    commit: (value: string) => string | null;
    field: string;
    options: EnumOption[];
    other: string;
    placeholder: string;
    prompt: string;
    read: () => string;
  }
): HTMLElement[] {
  const listed = (value: string): boolean =>
    spec.options.some((option) => option.value === value);
  const field = linkField(ctx, {
    commit: spec.commit,
    label: spec.field,
    placeholder: spec.placeholder,
    read: spec.read,
  });
  if (spec.options.length === 0) {
    return [field];
  }

  let choosingOther = false;
  const property = `--attr-link-${spec.field.toLowerCase()}`;
  const selected = (): string => {
    const value = spec.read();
    if (choosingOther) {
      return OTHER;
    }
    if (value === "") {
      return "";
    }
    return listed(value) ? value : OTHER;
  };
  const showField = (): void => {
    field.hidden = selected() !== OTHER;
  };
  const pick = createSelect(
    enumDescriptor(
      `link-${spec.field}`,
      property,
      spec.field,
      [
        // A prompt rather than a blank trigger, for a link of another kind
        // that has no value on this tab yet.
        ...(spec.read() === "" ? [{ label: spec.prompt, value: "" }] : []),
        ...spec.options,
        { label: spec.other, value: OTHER },
      ],
      spec.read() === "" ? "" : OTHER
    ),
    selected(),
    (_property, value) => {
      choosingOther = value === OTHER;
      showField();
      if (choosingOther) {
        field.querySelector("input")?.focus();
      } else if (value) {
        spec.commit(value);
      }
    }
  );
  ctx.register({
    ...pick,
    resync: () => {
      if (listed(spec.read())) {
        choosingOther = false;
      }
      pick.setValue(property, selected());
      showField();
    },
    virtual: true,
  });
  showField();
  return [pick.element, field];
}

function mailRows(
  ctx: SectionContext,
  node: Element,
  write: (href: string) => void
): HTMLElement[] {
  const own = (): { address: string; subject: string } =>
    kindOf(node.getAttribute("href")) === "email"
      ? readMail(node.getAttribute("href"))
      : { address: "", subject: "" };
  const address = linkField(ctx, {
    commit: (value) => {
      if (!EMAIL.test(value)) {
        return "That does not look like an email address";
      }
      write(mailHref(value, own().subject));
      return null;
    },
    glyph: "mail",
    label: "Email address",
    placeholder: "hello@example.com",
    read: () => own().address,
  });
  const subject = linkField(ctx, {
    commit: (value) => {
      if (!own().address) {
        return "Add the address first";
      }
      write(mailHref(own().address, value));
      return null;
    },
    glyph: "Aa",
    label: "Subject",
    placeholder: "Subject (optional)",
    read: () => own().subject,
  });
  return [address, subject];
}

/** Same tab or new tab, for the two kinds that navigate. */
function newTabRow(ctx: SectionContext, node: Element): HTMLElement {
  const descriptor: Descriptor = {
    controlType: "segmented",
    cssProperty: "--attr-target",
    defaultValue: "same",
    enumValues: [
      { label: "Same tab", value: "same" },
      { label: "New tab", value: "new" },
    ],
    group: "appearance",
    key: "linkTarget",
    label: "Open in",
    span: "full",
  };
  const read = (): string =>
    node.getAttribute("target") === "_blank" ? "new" : "same";
  const control = createSegmented(descriptor, read(), () => undefined, {
    derive: read,
    onSelect: (value) => ctx.batch(() => setNewTab(ctx, node, value === "new")),
  });
  ctx.register({
    ...control,
    resync: () => control.setValue(descriptor.cssProperty, read()),
    virtual: true,
  });
  return labelled("Open in", control.element);
}

/**
 * `target="_blank"` always travels with `rel="noopener"`, so a new tab cannot
 * reach back into this one. Turning it off only removes a `rel` this section
 * would have written; one the author wrote for another reason stays.
 */
function setNewTab(ctx: SectionContext, node: Element, on: boolean): void {
  const rel = node.getAttribute("rel") ?? "";
  if (on) {
    if (node.getAttribute("target") !== "_blank") {
      ctx.onAttr(node, "target", "_blank");
    }
    if (!rel.split(WHITESPACE).includes("noopener")) {
      ctx.onAttr(node, "rel", `${rel} noopener`.trim());
    }
    return;
  }
  if (node.getAttribute("target") === "_blank") {
    ctx.onAttr(node, "target", null);
  }
  if (rel === "noopener" || rel === "noopener noreferrer") {
    ctx.onAttr(node, "rel", null);
  }
}

/** Same-site paths other links on this page already point at. */
function sitePages(node: Element): EnumOption[] {
  const doc = node.ownerDocument;
  const paths = new Set<string>(["/"]);
  for (const link of doc.querySelectorAll("a[href]")) {
    const raw = link.getAttribute("href") ?? "";
    if (kindOf(raw) !== "page") {
      continue;
    }
    const path = raw.split("#")[0] ?? "";
    if (path) {
      paths.add(path);
    }
  }
  return [...paths]
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({ label: path === "/" ? "Home" : path, value: path }));
}

/** Everything on the page with an id, which is everything a `#` can reach. */
function pageSections(node: Element): EnumOption[] {
  const options: EnumOption[] = [];
  for (const target of node.ownerDocument.querySelectorAll("[id]")) {
    if (options.length >= MAX_SECTIONS) {
      break;
    }
    if (
      target.id.startsWith(PREFIX) ||
      target.closest("svg, head") ||
      !isVisible(target)
    ) {
      continue;
    }
    const heading = target
      .querySelector("h1, h2, h3, h4")
      ?.textContent?.trim()
      .slice(0, 40);
    options.push({
      detail: heading || target.tagName.toLowerCase(),
      label: `#${target.id}`,
      value: `#${target.id}`,
    });
  }
  return options;
}

/*
 * Something a visitor could scroll to. Libraries park screen-reader live
 * regions with ids on the page (dnd-kit's announcer), clipped to a pixel;
 * offering those as destinations is noise.
 */
function isVisible(target: Element): boolean {
  const rect = target.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}
