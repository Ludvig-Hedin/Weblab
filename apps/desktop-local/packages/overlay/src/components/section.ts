import type {
  ComponentDetail,
  ComponentInfo,
  PropControl,
  PropOrigin,
  PropSpec,
} from "@airship/protocol";
import type { PropValue } from "@airship/source/component-chain";
import { cls, el } from "../dom";
import { createSegmented } from "../inspector/controls/segmented";
import { createSelect } from "../inspector/controls/select";
import { enumDescriptor } from "../inspector/sections/row";
import { cleanStega, decodeStega, hasStega } from "./stega";

/** Props a designer never edits from here. */
const HIDDEN_PROPS = new Set(["className", "style", "key", "ref", "id"]);
const IMAGE_NAME =
  /(^|[a-z])(src|image|img|poster|logo|avatar|photo|thumbnail|background)/i;
const LINK_NAME = /(href|url|link)$/i;
const MULTILINE_AT = 60;

export interface ComponentSectionDeps {
  /** Props and origins, still on its way from the server. */
  detail: Promise<ComponentDetail | null>;
  info: ComponentInfo | undefined;
  name: string;
  /** Record a new value for one prop of this instance. */
  onEdit: (edit: {
    control: PropControl;
    from: string | null;
    origin?: PropOrigin;
    prop: string;
    to: string;
  }) => void;
  onEnter: () => void;
  /** The pending value for a prop, if the user already changed it. */
  pending: (prop: string) => string | undefined;
  /** This instance's props as React holds them. */
  values: Record<string, PropValue> | null;
}

/** A row to render: the declared spec, or one inferred from the live value. */
interface Row {
  control: PropControl;
  name: string;
  options?: string[];
  origin?: PropOrigin;
  value: PropValue | undefined;
}

function inferControl(name: string, value: PropValue | undefined): PropControl {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "string") {
    if (IMAGE_NAME.test(name)) {
      return "image";
    }
    return LINK_NAME.test(name) ? "link" : "text";
  }
  if (value && typeof value === "object" && value.kind === "node") {
    return "node";
  }
  return "object";
}

function rowsFor(
  detail: ComponentDetail | null,
  values: Record<string, PropValue> | null
): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const specs: PropSpec[] = detail?.props ?? [];
  for (const spec of specs) {
    if (HIDDEN_PROPS.has(spec.name)) {
      continue;
    }
    seen.add(spec.name);
    rows.push({
      control: spec.control,
      name: spec.name,
      options: spec.options,
      origin: detail?.origins[spec.name],
      value: values?.[spec.name],
    });
  }
  // Without types (plain JS, or TypeScript the server could not load) the
  // live props are still worth showing — they are what the instance renders.
  for (const [name, value] of Object.entries(values ?? {})) {
    if (seen.has(name) || HIDDEN_PROPS.has(name)) {
      continue;
    }
    rows.push({
      control: inferControl(name, value),
      name,
      origin: detail?.origins[name],
      value,
    });
  }
  return rows;
}

/** A prop value as the string a field shows, or null when it has no text. */
export function valueText(value: PropValue | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return cleanStega(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return value.kind === "node" ? value.text : null;
}

/** Split `camelCase` and `snake_case` names into words: `imageSrc` → "Image src". */
function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function textInput(
  initial: string,
  multiline: boolean,
  onCommit: (value: string) => void,
  readOnly = false
): HTMLElement {
  const input = multiline
    ? el("textarea", { class: cls("cmp-input"), rows: "2" })
    : el("input", { class: cls("cmp-input"), type: "text" });
  const field = input as HTMLInputElement | HTMLTextAreaElement;
  field.value = initial;
  field.readOnly = readOnly;
  let skipBlur = false;
  const commit = (): void => {
    if (skipBlur) {
      skipBlur = false;
      return;
    }
    if (field.value !== initial) {
      onCommit(field.value);
    }
  };
  field.addEventListener("blur", commit);
  field.addEventListener("keydown", (e) => {
    const { key, shiftKey } = e as KeyboardEvent;
    if (key === "Enter" && !shiftKey) {
      e.preventDefault();
      field.blur();
    } else if (key === "Escape") {
      // Revert, and keep the key from reaching the editor's own Escape.
      e.stopPropagation();
      field.value = initial;
      skipBlur = true;
      field.blur();
    }
  });
  return input;
}

function originHint(
  origin: PropOrigin | undefined,
  detail: ComponentDetail | null
): string | null {
  if (!origin) {
    return null;
  }
  if (origin.kind === "spread" && origin.file) {
    const also = origin.exportName
      ? (detail?.sharedData[origin.exportName] ?? [])
      : [];
    const tail = also.length ? ` · Also used on ${also.join(", ")}` : "";
    return `From ${origin.file}${tail}`;
  }
  if (origin.kind === "default") {
    return "Default value";
  }
  return null;
}

function cmsRow(label: string, value: string, raw: string): HTMLElement {
  const info = decodeStega(raw);
  const hint = el("div", { class: cls("cmp-hint") });
  if (info?.href) {
    hint.append(
      "Edit it in the CMS. ",
      el("a", {
        href: info.href,
        rel: "noopener",
        target: "_blank",
        text: "Open in CMS",
      })
    );
  } else {
    hint.textContent = "Edit it in the CMS.";
  }
  return el("div", { class: cls("cmp-prop") }, [
    el("div", { class: cls("cmp-prop-label") }, [
      el("span", { text: label }),
      el("span", { class: cls("cmp-tag"), text: "From CMS" }),
    ]),
    textInput(value, value.length > MULTILINE_AT, () => undefined, true),
    hint,
  ]);
}

function control(
  row: Row,
  current: string | null,
  commit: (to: string) => void
): HTMLElement {
  switch (row.control) {
    case "enum": {
      const values = row.options ?? [];
      const descriptor = enumDescriptor(
        `cmp-${row.name}`,
        row.name,
        humanize(row.name),
        values.map((value) => ({ label: value, value })),
        current ?? values[0] ?? ""
      );
      return createSelect(descriptor, current ?? "", (_p, value) =>
        commit(value)
      ).element;
    }
    case "boolean": {
      const descriptor = {
        ...enumDescriptor(
          `cmp-${row.name}`,
          row.name,
          humanize(row.name),
          [
            { label: "On", value: "true" },
            { label: "Off", value: "false" },
          ],
          "false"
        ),
        controlType: "segmented" as const,
      };
      const seg = createSegmented(descriptor, current ?? "false", (_p, value) =>
        commit(value)
      );
      seg.element.classList.add(cls("cmp-switch"));
      return seg.element;
    }
    case "text":
    case "node":
    case "image":
    case "link":
    case "color":
    case "number": {
      const text = current ?? "";
      return textInput(
        text,
        (row.control === "text" || row.control === "node") &&
          text.length > MULTILINE_AT,
        commit
      );
    }
    default:
      return textInput("Set in code", false, () => undefined, true);
  }
}

function propRow(
  row: Row,
  deps: ComponentSectionDeps,
  detail: ComponentDetail | null
): HTMLElement {
  const label = humanize(row.name);
  const raw = typeof row.value === "string" ? row.value : null;
  const live = valueText(row.value);
  if (row.origin?.kind === "cms" || (raw !== null && hasStega(raw))) {
    return cmsRow(label, live ?? "", raw ?? "");
  }
  const pending = deps.pending(row.name);
  // A node prop that is not plain text (an icon, a link inside the heading) has
  // no string to edit here; its markup belongs to whoever wrote it.
  const editable =
    row.control !== "object" && !(row.control === "node" && live === null);
  const head = el("div", { class: cls("cmp-prop-label") }, [
    el("span", { text: label }),
  ]);
  if (pending !== undefined) {
    head.append(
      el("span", {
        class: cls("cmp-tag"),
        "data-tone": "pending",
        text: "Pending",
      })
    );
  }
  const body = editable
    ? control(row, pending ?? live, (to) =>
        deps.onEdit({
          control: row.control,
          from: live,
          origin: row.origin,
          prop: row.name,
          to,
        })
      )
    : textInput("Set in code", false, () => undefined, true);
  const children: HTMLElement[] = [head, body];
  const hint = originHint(row.origin, detail);
  if (hint) {
    children.push(el("div", { class: cls("cmp-hint"), text: hint }));
  }
  return el("div", { class: cls("cmp-prop") }, children);
}

function usageLine(info: ComponentInfo | undefined): string {
  if (!info) {
    return "Shared component";
  }
  const pages = info.pages.length;
  if (pages > 1) {
    return `Used on ${pages} pages`;
  }
  return `Used ${info.instances} times`;
}

/**
 * The Component section: what a selected instance is, and its properties.
 *
 * Rendered at once with what the page already knows — the name and the live
 * prop values — and filled in when the server's answer about types and origins
 * arrives, so selecting never waits on a round trip to show something.
 */
export function renderComponentSection(
  deps: ComponentSectionDeps
): HTMLElement {
  const props = el("div", { class: cls("cmp-props") }, [
    el("div", { class: cls("cmp-hint"), text: "Loading properties…" }),
  ]);
  const root = el("div", { class: cls("cmp-sect") }, [
    el("div", { class: cls("cmp-head") }, [
      el("span", { class: cls("cmp-name"), text: deps.name }),
      el("button", {
        class: cls("cmp-edit"),
        onClick: () => deps.onEnter(),
        text: "Edit component",
        title: "Double-click the component to edit it too",
        type: "button",
      }),
    ]),
    el("div", {
      class: cls("cmp-meta"),
      text: usageLine(deps.info),
      title: deps.info?.pages.join(", ") ?? "",
    }),
    props,
    el("div", {
      class: cls("cmp-empty"),
      text: "To change the design, edit the component.",
    }),
  ]);
  const fill = (detail: ComponentDetail | null): void => {
    const rows = rowsFor(detail, deps.values);
    props.replaceChildren(
      ...(rows.length
        ? rows.map((row) => propRow(row, deps, detail))
        : [el("div", { class: cls("cmp-hint"), text: "No properties yet." })])
    );
  };
  deps.detail.then(fill, () => fill(null));
  return root;
}
