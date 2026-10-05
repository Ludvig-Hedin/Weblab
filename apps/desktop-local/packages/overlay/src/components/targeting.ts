import {
  type ComponentLink,
  componentChain,
  instanceRoot,
} from "@airship/source/component-chain";

/** Just the part of the registry targeting reads — a stub in tests. */
export interface SharedLookup {
  isShared: (key: string) => boolean;
}

/** A shared component instance: the owner link and its outermost element. */
export interface InstanceHit {
  link: ComponentLink;
  root: Element;
}

/**
 * The owners that count at the current level of editing.
 *
 * At page level every owner does. Inside an entered component only the ones
 * below it do: the component itself and everything that renders it are the
 * context you have stepped into, not things to select. A node the entered
 * component does not own is outside it, and is treated at page level — which is
 * what lets hovering the dimmed page still read correctly.
 */
function ownersInScope(
  chain: ComponentLink[],
  scope: object | null
): ComponentLink[] {
  if (!scope) {
    return chain;
  }
  const at = chain.findIndex((link) => link.ref === scope);
  return at === -1 ? chain : chain.slice(0, at);
}

/**
 * The shared instance a click on `node` lands on, or null for a plain layer.
 *
 * Outermost first: on a page, a click inside a CTA section's button selects
 * the CTA, and the button is reached by entering the CTA — the Framer model.
 * Components that are used once are skipped over entirely, which is the whole
 * of "a single-use section acts like normal layers".
 */
export function instanceFor(
  node: Element,
  registry: SharedLookup,
  scope: object | null
): InstanceHit | null {
  const owners = ownersInScope(componentChain(node, false), scope);
  for (let i = owners.length - 1; i >= 0; i -= 1) {
    const link = owners[i];
    if (link && registry.isShared(link.key)) {
      return { link, root: instanceRoot(node, link.ref) };
    }
  }
  return null;
}

/** The instance whose outermost element *is* `node`, if any. */
export function instanceAt(
  node: Element,
  registry: SharedLookup,
  scope: object | null
): InstanceHit | null {
  const hit = instanceFor(node, registry, scope);
  return hit?.root === node ? hit : null;
}

/** The instance's props, read when needed rather than on every hover. */
export function withProps(hit: InstanceHit): InstanceHit {
  const link = componentChain(hit.root).find((l) => l.ref === hit.link.ref);
  return link ? { ...hit, link } : hit;
}

/** Whether `node` sits inside the entered instance `scope`. */
export function insideScope(node: Element, scope: object): boolean {
  return componentChain(node, false).some((link) => link.ref === scope);
}
