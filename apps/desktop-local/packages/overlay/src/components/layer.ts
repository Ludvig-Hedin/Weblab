import type {
  ComponentAction,
  ComponentActionKind,
  ComponentInfo,
  ComponentRef,
  PropControl,
  PropEdit,
  PropOrigin,
} from "@airship/protocol";
import type { ComponentLink } from "@airship/source/component-chain";
import type { Point } from "../canvas/space";
import type { ChangeChip } from "../chat/change-chips";
import type { ChromeLayer } from "../chrome-layer";
import type { ComponentPanelHooks } from "../inspector/panel";
import { isEditableText, textTargetIn } from "../inspector/text-edit";
import { keys } from "../keys/registry";
import type { Selection } from "../picker";
import type { MenuEntry } from "../popover-host";
import type { SurfaceResolver } from "../surface";
import { toast } from "../toast";
import { PropSet } from "./prop-set";
import { ComponentRegistry } from "./registry";
import { ComponentScope } from "./scope";
import { renderComponentSection, valueText } from "./section";
import { cleanStega, hasStega } from "./stega";
import {
  type InstanceHit,
  insideScope,
  instanceAt,
  instanceFor,
  withProps,
} from "./targeting";

/** How long the page has to be quiet before it is re-scanned for components. */
const RESCAN_MS = 600;
/** A double-click's prop edit waits this long for its selection, then lapses. */
const PENDING_EDIT_MS = 2000;

export interface ComponentLayerDeps {
  /** Record-and-preview a prop text edit in place; see `DesignPanel`. */
  beginPropTextEdit: (
    node: Element,
    caret: Point | null,
    onProp: (from: string, to: string) => void
  ) => boolean;
  /** Where the component bar is mounted. */
  host: HTMLElement;
  layer: ChromeLayer;
  /** A pending edit was recorded or dropped: refresh chips and counts. */
  onChanged: () => void;
  pageName: () => string;
  /** Re-render the design panel for the current selection. */
  refreshPanel: () => void;
  /** Redraw hover and selection chrome — their colour may have changed. */
  repaint: () => void;
  resolver: SurfaceResolver;
  select: (node: Element) => void;
  selected: () => Selection | null;
  /** Send the turn now: component actions are applied at once. False if refused. */
  submit: () => boolean;
}

/**
 * Everything components add to the editor, behind one object.
 *
 * `AirshipApp` is five thousand lines; this keeps the feature's state — which
 * components are shared, which one you are inside, the pending instance edits
 * and refactors — in one place, and gives the app a handful of hooks to call.
 * With no React on the page, or a daemon without the components route, every
 * hook is a no-op and the editor behaves as it did before.
 */
export class ComponentLayer {
  readonly registry = new ComponentRegistry();
  readonly props = new PropSet();
  readonly scope: ComponentScope;
  private actions: ComponentAction[] = [];
  private readonly deps: ComponentLayerDeps;
  private rescanTimer = 0;
  /** A prop text edit waiting for its instance to finish selecting. */
  private pendingEdit: {
    at: number;
    caret: Point | null;
    hit: InstanceHit;
    node: Element;
    prop: string;
  } | null = null;
  /**
   * What each node retargets to, for the current page state. Hover asks twice
   * per move (retarget, then the label), and the answer only changes when the
   * registry, the scope or the page does — each of which drops the cache.
   */
  private hits = new WeakMap<Element, InstanceHit | null>();
  private readonly disposers: (() => void)[] = [];

  constructor(deps: ComponentLayerDeps) {
    this.deps = deps;
    this.scope = new ComponentScope({
      host: deps.host,
      layer: deps.layer,
      onChange: () => {
        this.hits = new WeakMap();
        deps.repaint();
        deps.refreshPanel();
      },
      pageName: deps.pageName,
      resolver: deps.resolver,
    });
    this.disposers.push(
      this.registry.onChange(() => {
        this.hits = new WeakMap();
        this.scope.refreshInfo((key) => this.registry.info(key));
        deps.repaint();
        deps.refreshPanel();
      })
    );
    // Esc leaves the component, but only once nothing is selected: bound under
    // the same command as Deselect and guarded, so the registry runs exactly
    // one of the two — the first Esc deselects as it always has, the next one
    // steps out. Through the registry so it also works with focus in a frame.
    this.disposers.push(
      keys.bind({
        id: "selection.deselect",
        run: () => this.scope.exit(),
        when: () => this.scope.depth() > 0 && !this.deps.selected(),
      })
    );
  }

  destroy(): void {
    clearTimeout(this.rescanTimer);
    for (const dispose of this.disposers) {
      dispose();
    }
    this.scope.destroy();
  }

  // -- Page lifecycle --------------------------------------------------------

  /** Something on a page moved or re-rendered: redraw now, rescan when quiet. */
  onLayoutChange(): void {
    this.hits = new WeakMap();
    // A hot reload can remount the component you are inside; its old element
    // is gone and there is nothing left to be inside of.
    if (this.scope.current() && !this.scope.current()?.hit.root.isConnected) {
      this.scope.exit(0);
    }
    this.scope.draw();
    clearTimeout(this.rescanTimer);
    this.rescanTimer = window.setTimeout(() => this.scanAll(), RESCAN_MS);
  }

  scanAll(): void {
    for (const surface of this.deps.resolver.all()) {
      if (surface.isLive) {
        this.registry.scan(surface.doc).catch(() => undefined);
      }
    }
  }

  /** The agent's edit landed: pending edits are in the code now. */
  afterSave(): void {
    this.props.clear();
    this.registry.refresh().catch(() => undefined);
  }

  // -- Picker hooks ----------------------------------------------------------

  private scopeRef(): object | null {
    return this.scope.current()?.hit.link.ref ?? null;
  }

  private hitFor(node: Element): InstanceHit | null {
    if (this.hits.has(node)) {
      return this.hits.get(node) ?? null;
    }
    const hit = instanceFor(node, this.registry, this.scopeRef());
    this.hits.set(node, hit);
    return hit;
  }

  /** What a click on `node` selects: the instance it is part of, or itself. */
  retarget(node: Element): Element {
    return this.hitFor(node)?.root ?? node;
  }

  identify(node: Element): { component: boolean; name: string } | null {
    const hit = this.hitFor(node);
    return hit?.root === node ? { component: true, name: hit.link.name } : null;
  }

  /** The instance the selection is, if it is one. */
  selectedInstance(): InstanceHit | null {
    const node = this.deps.selected()?.node;
    return node ? instanceAt(node, this.registry, this.scopeRef()) : null;
  }

  /**
   * A selection is landing: leave any component it is outside of, before the
   * panel renders for it.
   */
  onSelected(sel: Selection): void {
    let level = this.scope.current();
    while (level && !insideScope(sel.node, level.hit.link.ref)) {
      this.scope.exit();
      level = this.scope.current();
    }
  }

  /**
   * The panel has rendered the selection: begin a prop edit that was waiting
   * for this instance. After, not before — the panel commits any live text
   * edit on a node other than the selection when it takes a new one, and the
   * prop's text node is inside the instance, not the instance itself.
   */
  afterSelected(sel: Selection): void {
    const pending = this.pendingEdit;
    this.pendingEdit = null;
    const fresh = pending && Date.now() - pending.at < PENDING_EDIT_MS;
    if (pending && fresh && pending.hit.root === sel.node) {
      this.beginPropEdit(
        pending.hit,
        pending.node,
        pending.prop,
        pending.caret
      ).catch(() => undefined);
    }
  }

  // -- Panel -----------------------------------------------------------------

  panelHooks(): ComponentPanelHooks {
    return {
      identify: (node) => this.identify(node),
      onDiscard: () => {
        this.props.restore();
        this.props.clear();
      },
      section: (node) => {
        const found = instanceAt(node, this.registry, this.scopeRef());
        if (!found) {
          return null;
        }
        const hit = withProps(found);
        const info = this.registry.info(hit.link.key);
        return {
          element: renderComponentSection({
            detail: this.registry.detail(hit.link),
            info,
            name: hit.link.name,
            onEdit: (edit) => this.recordProp(hit, edit),
            onEnter: () => this.enter(hit),
            pending: (prop) => this.props.pending(hit.link.ref, prop),
            values: hit.link.props,
          }),
          exclusive: true,
        };
      },
    };
  }

  private componentRef(link: ComponentLink): ComponentRef {
    const info: ComponentInfo | undefined = this.registry.info(link.key);
    return {
      callSite: info?.callSite ?? null,
      definition: info?.definition?.file ?? null,
      name: link.name,
      pages: info?.pages ?? [],
    };
  }

  private recordProp(
    hit: InstanceHit,
    edit: {
      control: PropControl;
      from: string | null;
      origin?: PropOrigin;
      prop: string;
      to: string;
    },
    written?: { node: Element; before: string }
  ): void {
    this.props.record({
      ...edit,
      component: this.componentRef(hit.link),
      instance: hit.link.ref,
      root: hit.root,
      written,
    });
    this.deps.onChanged();
    this.deps.refreshPanel();
    this.deps.repaint();
  }

  // -- Entering --------------------------------------------------------------

  enter(hit: InstanceHit, focus?: Element): void {
    this.scope.enter({ hit, info: this.registry.info(hit.link.key) });
    // Inside, select what was pointed at — resolved at the new level, so a
    // nested shared component selects as an instance again.
    this.deps.select(focus ? this.retarget(focus) : hit.root);
  }

  /**
   * Double-click. True when a component took the gesture.
   *
   * On text that *is* one of the instance's props, edit that prop in place —
   * the change is this page's alone. On a prop image, select the instance so
   * its field is right there. Anywhere else inside an instance, enter it.
   */
  onDoubleClick(raw: Element, caret: Point | null): boolean {
    const found = instanceFor(raw, this.registry, this.scopeRef());
    if (!found) {
      return false;
    }
    const hit = withProps(found);
    const target = textTargetIn(raw) ?? (isEditableText(raw) ? raw : null);
    const prop = target ? this.textProp(hit, target) : null;
    if (target && prop) {
      const value = hit.link.props?.[prop];
      if (typeof value === "string" && hasStega(value)) {
        this.deps.select(hit.root);
        toast("This text comes from the CMS. Change it there.");
        return true;
      }
      if (this.deps.selected()?.node === hit.root) {
        this.beginPropEdit(hit, target, prop, caret).catch(() => undefined);
      } else {
        this.pendingEdit = { at: Date.now(), caret, hit, node: target, prop };
        this.deps.select(hit.root);
      }
      return true;
    }
    if (raw.tagName === "IMG" && this.imageProp(hit, raw)) {
      this.deps.select(hit.root);
      return true;
    }
    this.enter(hit, raw);
    return true;
  }

  /** The string prop whose value is exactly this node's text. */
  private textProp(hit: InstanceHit, node: Element): string | null {
    const text = cleanStega(node.textContent ?? "").trim();
    if (!text) {
      return null;
    }
    for (const [name, value] of Object.entries(hit.link.props ?? {})) {
      if (valueText(value)?.trim() === text) {
        return name;
      }
    }
    return null;
  }

  private imageProp(hit: InstanceHit, img: Element): string | null {
    const src = img.getAttribute("src") ?? "";
    for (const [name, value] of Object.entries(hit.link.props ?? {})) {
      if (
        typeof value === "string" &&
        value &&
        src.includes(encodeURI(value))
      ) {
        return name;
      }
      if (typeof value === "string" && value && src.includes(value)) {
        return name;
      }
    }
    return null;
  }

  /**
   * Edit a prop's text in place. The prop's origin is looked up first — the
   * panel has usually fetched it already — because it decides where the agent
   * writes the change (a data file, not the call site) and whether the value
   * is the CMS's and must not be edited here at all.
   */
  private async beginPropEdit(
    hit: InstanceHit,
    node: Element,
    prop: string,
    caret: Point | null
  ): Promise<void> {
    const detail = await this.registry.detail(hit.link);
    const origin = detail?.origins[prop];
    if (origin?.kind === "cms") {
      toast("This text comes from the CMS. Change it there.");
      return;
    }
    const from = valueText(hit.link.props?.[prop]);
    const control: PropControl =
      typeof hit.link.props?.[prop] === "string" ? "text" : "node";
    const began = this.deps.beginPropTextEdit(node, caret, (before, to) => {
      this.recordProp(
        hit,
        { control, from, origin, prop, to: to.trim() },
        { before, node }
      );
    });
    if (!began) {
      toast("This text can't be edited here", { tone: "error" });
    }
  }

  // -- Context menu ----------------------------------------------------------

  /** Rows for the right-click menu, for whatever is selected. */
  menuItems(): MenuEntry[] {
    const sel = this.deps.selected();
    if (!sel) {
      return [];
    }
    const hit = this.selectedInstance();
    if (hit) {
      return [
        { separator: true },
        {
          icon: "layer-component",
          label: "Edit component",
          run: () => this.enter(hit),
        },
        {
          label: "Detach instance",
          run: () => this.act("detach", sel, hit),
        },
      ];
    }
    const inside = this.scope.current();
    const rows: MenuEntry[] = [{ separator: true }];
    if (inside && (isEditableText(sel.node) || sel.node.tagName === "IMG")) {
      rows.push({
        icon: "layer-component",
        label: "Make property",
        run: () => this.act("make-property", sel, inside.hit),
      });
    }
    rows.push({
      icon: "layer-component",
      label: "Create component",
      run: () => this.act("create-component", sel, null),
    });
    return rows;
  }

  private act(
    action: ComponentActionKind,
    sel: Selection,
    hit: InstanceHit | null
  ): void {
    const value =
      sel.node.tagName === "IMG"
        ? (sel.node.getAttribute("src") ?? undefined)
        : cleanStega(sel.node.textContent ?? "").trim() || undefined;
    this.actions.push({
      action,
      component: hit ? this.componentRef(hit.link) : undefined,
      element: sel.element,
      source: sel.source,
      value: action === "make-property" ? value : undefined,
    });
    // Refused (a save is running, or the connection dropped): take it back,
    // or it would ride along unseen on the user's next, unrelated turn.
    if (!this.deps.submit()) {
      this.actions.pop();
      toast("Wait for the current save to finish, then try again");
    }
  }

  // -- Outbox ----------------------------------------------------------------

  /** What this turn adds to the request. Empty arrays are left out. */
  requestParts(): {
    componentActions?: ComponentAction[];
    propChanges?: PropEdit[];
  } {
    const propChanges = this.props.targets();
    return {
      componentActions: this.actions.length ? [...this.actions] : undefined,
      propChanges: propChanges.length ? propChanges : undefined,
    };
  }

  /** The turn went out; the refactors in it are the agent's now. */
  sent(): void {
    this.actions = [];
  }

  count(): number {
    return this.props.count();
  }

  chips(): ChangeChip[] {
    return this.props.entries().map((rec) => ({
      detail: rec.prop,
      icon: "layer-component",
      onRemove: () => {
        this.props.remove(rec.instance, rec.prop);
        this.deps.onChanged();
        this.deps.refreshPanel();
      },
      subject: rec.component.name,
      tip: `${rec.component.name} · ${rec.prop}: ${rec.from ?? "(unset)"} → ${rec.to}`,
      value: rec.to.length > 24 ? `${rec.to.slice(0, 23)}…` : rec.to,
    }));
  }
}
