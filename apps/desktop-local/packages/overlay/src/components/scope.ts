import type { ComponentInfo } from "@airship/protocol";
import type { ChromeLayer } from "../chrome-layer";
import { hide, place } from "../chrome-layer";
import { cls, el } from "../dom";
import { icon } from "../icons";
import { localRect, type SurfaceResolver } from "../surface";
import type { InstanceHit } from "./targeting";

/** One level of "inside a component": the instance and what we know of it. */
export interface ScopeLevel {
  hit: InstanceHit;
  info: ComponentInfo | undefined;
}

export interface ScopeDeps {
  /** Where the bar goes: the editor's own root, above the canvas. */
  host: HTMLElement;
  layer: ChromeLayer;
  /** Called after entering or leaving, so selection and panel can follow. */
  onChange: () => void;
  /** The page's name for the first crumb: "Home", "/about". */
  pageName: () => string;
  resolver: SurfaceResolver;
}

/**
 * The warning a designer needs before touching a main component, in words.
 *
 * Pages rather than instances whenever there is more than one page, because
 * "7 pages" is the thing that is actually at stake; a component repeated on a
 * single page falls back to counting its uses.
 */
export function impactNote(info: ComponentInfo | undefined): string {
  if (!info) {
    return "Changes here change every use of this component.";
  }
  const pages = info.pages.length;
  if (pages > 1) {
    return `Changing this changes ${pages} pages.`;
  }
  return `Changing this changes all ${info.instances} uses.`;
}

/**
 * Being inside a component: the dimmed page around it and the bar on top.
 *
 * Entering edits the component in place, on the page, rather than on a canvas
 * of its own. The component keeps its real data and its real surroundings, so
 * it always renders — a section pulled out of its page often cannot, because
 * the page is what hands it its props and providers.
 *
 * A stack, because components nest: a card inside a section inside the page.
 * The bar's crumbs step back out one level or all the way.
 */
export class ComponentScope {
  private readonly levels: ScopeLevel[] = [];
  private readonly dim: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly deps: ScopeDeps;

  constructor(deps: ScopeDeps) {
    this.deps = deps;
    this.dim = el("div", { class: `${cls("layer")} ${cls("cmp-dim")}` });
    hide(this.dim);
    deps.layer.add(this.dim);
    this.bar = el("div", { class: cls("cmp-bar"), role: "toolbar" });
    this.bar.setAttribute("aria-label", "Component");
    hide(this.bar);
    deps.host.append(this.bar);
  }

  /** The entered instance, innermost. */
  current(): ScopeLevel | null {
    return this.levels.at(-1) ?? null;
  }

  depth(): number {
    return this.levels.length;
  }

  enter(level: ScopeLevel): void {
    if (this.current()?.hit.link.ref === level.hit.link.ref) {
      return;
    }
    this.levels.push(level);
    this.render();
    this.deps.onChange();
  }

  /** Step out one level, or to `depth` levels deep (0 is the page). */
  exit(depth = this.levels.length - 1): void {
    if (depth >= this.levels.length || depth < 0) {
      return;
    }
    this.levels.length = depth;
    this.render();
    this.deps.onChange();
  }

  /** Update what we know about a level once the server answers. */
  refreshInfo(lookup: (key: string) => ComponentInfo | undefined): void {
    for (const level of this.levels) {
      level.info = lookup(level.hit.link.key) ?? level.info;
    }
    this.renderBar();
  }

  /** Re-place the dimming over the instance; the page may have moved. */
  draw(): void {
    const level = this.current();
    const root = level?.hit.root;
    const surface = root?.isConnected ? this.deps.resolver.of(root) : null;
    if (!(root && surface?.isLive)) {
      hide(this.dim);
      return;
    }
    // No clip to the frame: the dimming *is* the area outside the box, and the
    // chrome layer is already fenced to the canvas.
    place(this.dim, surface.toScreen(localRect(root)));
  }

  destroy(): void {
    this.dim.remove();
    this.bar.remove();
  }

  private render(): void {
    this.renderBar();
    this.draw();
  }

  private renderBar(): void {
    const level = this.current();
    if (!level) {
      hide(this.bar);
      this.bar.replaceChildren();
      return;
    }
    const crumbs = el("div", { class: cls("cmp-crumbs") });
    const crumb = (label: string, depth: number, here: boolean): void => {
      if (crumbs.childElementCount) {
        crumbs.append(el("span", { class: cls("cmp-sep"), text: "›" }));
      }
      crumbs.append(
        el("button", {
          "aria-current": here ? "true" : "false",
          class: cls("cmp-crumb"),
          onClick: () => {
            if (!here) {
              this.exit(depth);
            }
          },
          text: label,
          type: "button",
        })
      );
    };
    crumb(this.deps.pageName(), 0, false);
    this.levels.forEach((l, i) => {
      crumb(l.hit.link.name, i + 1, i === this.levels.length - 1);
    });
    this.bar.replaceChildren(
      el(
        "button",
        {
          "aria-label": "Leave component",
          class: cls("cmp-back"),
          onClick: () => this.exit(),
          title: "Leave component (Esc)",
          type: "button",
        },
        [icon("close", "sm")]
      ),
      crumbs,
      el("span", { class: cls("cmp-note"), text: impactNote(level.info) })
    );
    this.bar.style.display = "";
  }
}
