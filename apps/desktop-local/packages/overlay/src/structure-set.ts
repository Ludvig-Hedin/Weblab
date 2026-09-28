import type {
  ElementContext,
  InsertPosition,
  SourceLocation,
  StructuralEdit,
  StructuralOp,
  TextEditTarget,
} from "@airship/protocol";

/**
 * Accumulates direct-manipulation *structure* changes — deletes, duplicates,
 * inserts, wraps, unwraps, tag changes and in-place text edits — alongside
 * {@link ChangeSet} (style) and {@link MoveSet} (position).
 *
 * Modelled on `MoveSet` on purpose, down to the method names: `discard()` in the
 * panel and `reconcileVisual()` in the app each pick up a new edit set with two
 * lines rather than a new branch, and the three sets can be reasoned about as
 * one thing.
 *
 * As with the other two, the DOM is changed immediately as a live preview and
 * the agent is told afterwards, so it is catching the source up to a page the
 * user is already looking at.
 *
 * Every op names the node the user now sees: the clone of a duplicate, the new
 * element of an insert, the wrapper of a wrap, the removed wrapper of an unwrap
 * and the replacement of a tag change. `undoStructure` and `reapply` are exact
 * inverses for each, so ⌘Z, ⌘⇧Z, a chip's ✕ and Discard all agree.
 */

export interface StructureRecord {
  element: ElementContext;
  /** `retag`: the tag before. */
  fromTag?: string;
  /** `insert`: the new node's markup. `wrap`: the wrapper's opening tag. */
  html?: string;
  /**
   * `wrap`: the nodes now inside the wrapper. `unwrap`: the nodes that were
   * inside the removed wrapper and now stand where it stood. `insert`: every
   * node a paste added, `node` being the first.
   */
  inner?: Node[];
  node: Element;
  op: StructuralOp;
  /** Where it was, so Discard can put it back (delete) or remove it (duplicate). */
  origNext: Node | null;
  origParent: Element;
  /** `insert`: where the new node sits relative to `element`. */
  position?: InsertPosition;
  /** `retag`: the element `node` replaced in the page. */
  replaced?: Element;
  source: SourceLocation | null;
  /** `retag`: the tag after. */
  toTag?: string;
}

export interface TextRecord {
  element: ElementContext;
  /** The text before the *first* edit, so repeated edits still revert fully. */
  from: string;
  node: Element;
  source: SourceLocation | null;
  to: string;
}

/** Ops whose node did not exist in the source when the turn began. */
const ADDED_OPS: ReadonlySet<StructuralOp> = new Set(["duplicate", "insert"]);

export class StructureSet {
  /**
   * Every structure change, oldest first.
   *
   * A list rather than a map keyed on the node, because one node can carry
   * several changes in a turn — retag a div to a nav, then unwrap the nav — and
   * a map kept only the last, so undoing the unwrap forgot the retag entirely.
   * The agent gets them in the order they were made.
   */
  private readonly records: StructureRecord[] = [];
  private readonly text = new Map<Element, TextRecord>();

  record(rec: StructureRecord): void {
    this.records.push(rec);
  }

  /**
   * Record a text change. The `from` is kept from the first edit, so typing,
   * blurring and typing again still reverts to the original string — and a node
   * edited back to exactly what it said drops out of the set rather than
   * shipping a no-op to the agent.
   */
  recordText(rec: TextRecord): void {
    const existing = this.text.get(rec.node);
    const from = existing?.from ?? rec.from;
    if (from === rec.to) {
      this.text.delete(rec.node);
      return;
    }
    this.text.set(rec.node, { ...rec, from });
  }

  count(): number {
    return this.entries().length + this.text.size;
  }

  /**
   * Every structure change the agent should hear about — one composer chip each.
   *
   * Deleting a node this same turn added hides both: "add this, then remove
   * it" is no change to the source at all. Both stay recorded, so undoing the
   * delete brings the add back.
   */
  entries(): StructureRecord[] {
    const hidden = new Set<StructureRecord>();
    const lastByNode = new Map<Element, StructureRecord>();
    const gone: Element[] = [];
    for (const r of this.records) {
      const prev = lastByNode.get(r.node);
      if (r.op === "delete" && prev && ADDED_OPS.has(prev.op)) {
        hidden.add(prev);
        hidden.add(r);
        gone.push(r.node);
      }
      lastByNode.set(r.node, r);
    }
    // What was added inside an added-then-deleted node went with it.
    return this.records.filter(
      (r) =>
        !(hidden.has(r) || gone.some((g) => g !== r.node && g.contains(r.node)))
    );
  }

  /** Every tracked text edit — one composer chip per entry. */
  textEntries(): TextRecord[] {
    return [...this.text.values()];
  }

  /**
   * Undo one change and forget it (one chip's ✕, or ⌘Z).
   *
   * Pass the record itself wherever you have it: one node can carry several
   * changes, and a node alone can only name its latest one.
   */
  remove(target: Element | StructureRecord): void {
    const at =
      target instanceof Element
        ? this.records.findLastIndex((r) => r.node === target)
        : this.records.indexOf(target);
    if (at === -1) {
      return;
    }
    const [entry] = this.records.splice(at, 1);
    this.undoStructure(entry);
  }

  /** Restore one node's original string and forget it (one chip's ✕). */
  removeText(node: Element): void {
    const entry = this.text.get(node);
    if (!entry) {
      return;
    }
    this.undoText(entry);
    this.text.delete(node);
  }

  /**
   * Redo a change: perform it on the DOM and track it again.
   *
   * The exact inverse of `remove`, which is the undo. Both live here because the
   * DOM operation a `StructuralOp` implies is this set's own knowledge —
   * `History` used to carry a second copy of it and, having no way to reach the
   * set, updated only the page. Undoing a delete put the element back on screen
   * and left the agent still being told to remove it.
   */
  reapply(rec: StructureRecord): void {
    applyForward(rec);
    this.record(rec);
  }

  isEmpty(): boolean {
    return this.count() === 0;
  }

  targets(): StructuralEdit[] {
    return this.entries().map((e) => ({
      element: e.element,
      fromTag: e.fromTag,
      html: e.html,
      op: e.op,
      position: e.position,
      source: e.source,
      toTag: e.toTag,
    }));
  }

  /**
   * `skip` drops a node without forgetting it — see `ChangeSet.targets`. Retyping
   * the label on an element the same turn asks the agent to delete is two
   * contradictory instructions.
   */
  textTargets(skip?: (node: Element) => boolean): TextEditTarget[] {
    return [...this.text.values()]
      .filter((e) => !skip?.(e.node))
      .map((e) => ({
        element: e.element,
        from: e.from,
        source: e.source,
        to: e.to,
      }));
  }

  /**
   * The nodes this turn will delete, so other sets can decline to also edit them.
   *
   * Roots, not a flat node list: a delete takes its whole subtree with it, so a
   * style change on a descendant is just as contradictory as one on the element
   * itself. Callers test with `contains`.
   */
  deletedRoots(): Element[] {
    return this.records.filter((e) => e.op === "delete").map((e) => e.node);
  }

  /** Undo every structural change and restore every original string. */
  restore(): void {
    // Newest first: a wrap made after an insert has to come off before the
    // insert does, or the insert's undo removes a node that is no longer where
    // it put it.
    for (const e of [...this.records].reverse()) {
      this.undoStructure(e);
    }
    for (const e of this.text.values()) {
      this.undoText(e);
    }
  }

  private undoStructure(e: StructureRecord): void {
    applyBackward(e);
  }

  private undoText(e: TextRecord): void {
    if (e.node.isConnected) {
      e.node.textContent = e.from;
    }
  }

  clear(): void {
    this.records.length = 0;
    this.text.clear();
  }
}

/** Put `node` back at a recorded place, if that place still exists. */
function putBack(node: Node, parent: Element, next: Node | null): void {
  if (!parent.isConnected) {
    return;
  }
  const ref = next && next.parentNode === parent ? next : null;
  parent.insertBefore(node, ref);
}

/**
 * The nodes of `inner` that are still where the change left them. A later
 * change can have deleted or moved one; putting that one back would undo the
 * later change behind its back.
 */
function stillIn(inner: Node[] | undefined, parent: Node): Node[] {
  return (inner ?? []).filter((n) => n.parentNode === parent);
}

/** Move `nodes`, in order, to stand immediately before `ref`. */
function moveBefore(nodes: readonly Node[], ref: Node): void {
  const parent = ref.parentNode;
  if (!parent) {
    return;
  }
  for (const n of nodes) {
    parent.insertBefore(n, ref);
  }
}

/** Do the change. */
function applyForward(e: StructureRecord): void {
  switch (e.op) {
    case "delete":
      e.node.remove();
      return;
    case "duplicate":
    case "insert":
      // A duplicate sits immediately after the node it was cloned from, which
      // is what `origNext` points at; an insert sits where it was dropped. A
      // paste can insert several nodes at once, all in `inner`.
      for (const n of e.inner ?? [e.node]) {
        putBack(n, e.origParent, e.origNext);
      }
      return;
    case "wrap": {
      const inner = stillIn(e.inner, e.origParent);
      const [first] = inner;
      if (first) {
        e.origParent.insertBefore(e.node, first);
        e.node.append(...inner);
      }
      return;
    }
    case "unwrap":
      moveBefore(stillIn(e.inner, e.node), e.node);
      e.node.remove();
      return;
    case "retag":
      if (e.replaced?.parentNode) {
        e.node.append(...e.replaced.childNodes);
        e.replaced.replaceWith(e.node);
      }
      return;
    default:
      return;
  }
}

/** Take the change back. */
function applyBackward(e: StructureRecord): void {
  switch (e.op) {
    case "delete":
      putBack(e.node, e.origParent, e.origNext);
      return;
    case "duplicate":
    case "insert":
      // Removing the new nodes is the whole undo.
      for (const n of e.inner ?? [e.node]) {
        n.parentNode?.removeChild(n);
      }
      return;
    case "wrap":
      moveBefore(stillIn(e.inner, e.node), e.node);
      e.node.remove();
      return;
    case "unwrap": {
      const inner = stillIn(e.inner, e.origParent);
      const [first] = inner;
      if (first) {
        e.origParent.insertBefore(e.node, first);
      } else {
        putBack(e.node, e.origParent, e.origNext);
      }
      e.node.append(...inner);
      return;
    }
    case "retag":
      if (e.replaced && e.node.parentNode) {
        e.replaced.append(...e.node.childNodes);
        e.node.replaceWith(e.replaced);
      }
      return;
    default:
      return;
  }
}
