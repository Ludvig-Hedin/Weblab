import type {
  ComponentDetail,
  ComponentFrameRef,
  ComponentInfo,
  ComponentsResponse,
} from "@airship/protocol";
import {
  AIRSHIP_COMPONENT_DETAIL_PATH,
  AIRSHIP_COMPONENTS_PATH,
} from "@airship/protocol";
import { resolveFrames } from "@airship/source/browser";
import {
  type ComponentLink,
  pageComponents,
} from "@airship/source/component-chain";

/** One request's worth of call sites; a long page is sent in a few. */
const BATCH = 150;

/**
 * What the project's source says about the components on the page.
 *
 * Hover and click need to know *synchronously* whether the thing under the
 * pointer is a shared component, and the answer lives on the server, in the
 * import graph. So the page is scanned up front — every distinct call site in
 * one batch — and the answers are cached by call-site key. Until an answer
 * arrives a component is treated as a plain layer, which is also exactly what
 * the editor did before components existed, so a slow server degrades to the
 * old behaviour rather than to anything wrong.
 */
export class ComponentRegistry {
  private readonly infos = new Map<string, ComponentInfo>();
  private readonly inFlight = new Set<string>();
  /**
   * Keys the server could not answer — an older daemon without the route, or
   * one that is down. Not asked again until `refresh`, or every quiet moment
   * after a layout change would rescan the page and POST the same batch.
   */
  private readonly failed = new Set<string>();
  private readonly details = new Map<string, Promise<ComponentDetail | null>>();
  private readonly listeners = new Set<() => void>();
  /** Last frames seen per key, so `refresh` can re-ask without a rescan. */
  private readonly frames = new Map<string, ComponentFrameRef>();
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.fetcher = fetcher;
  }

  info(key: string): ComponentInfo | undefined {
    return this.infos.get(key);
  }

  isShared(key: string): boolean {
    return this.infos.get(key)?.shared ?? false;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Look up every call site on `doc` not already known or on its way. */
  async scan(doc: Document): Promise<void> {
    const fresh = pageComponents(doc).filter(
      (ref) =>
        !(
          this.infos.has(ref.key) ||
          this.inFlight.has(ref.key) ||
          this.failed.has(ref.key)
        )
    );
    if (!fresh.length) {
      return;
    }
    for (const ref of fresh) {
      this.inFlight.add(ref.key);
    }
    try {
      const refs = await Promise.all(
        fresh.map(async (ref) => ({
          frames: await resolveFrames(ref.frames),
          key: ref.key,
          name: ref.name,
        }))
      );
      for (const ref of refs) {
        this.frames.set(ref.key, ref);
      }
      await this.lookup(refs);
    } finally {
      for (const ref of fresh) {
        this.inFlight.delete(ref.key);
      }
    }
  }

  /**
   * Re-ask about everything known, after the agent changed the code.
   *
   * Answers are replaced as they arrive rather than dropped first, so the
   * purple does not blink off for the length of a round trip after every save.
   */
  async refresh(): Promise<void> {
    this.details.clear();
    this.failed.clear();
    await this.lookup([...this.frames.values()]);
  }

  /** Props and where their values come from, for one instance. Cached. */
  detail(link: ComponentLink): Promise<ComponentDetail | null> {
    const hit = this.details.get(link.key);
    if (hit) {
      return hit;
    }
    const pending = this.fetchDetail(link).catch(() => null);
    this.details.set(link.key, pending);
    // A failure is not cached: the next selection asks again.
    pending.then((detail) => {
      if (!detail) {
        this.details.delete(link.key);
      }
    });
    return pending;
  }

  /** One batch's answers, or null when the server could not give any. */
  private async ask(
    batch: ComponentFrameRef[]
  ): Promise<ComponentInfo[] | null> {
    try {
      const res = await this.fetcher(AIRSHIP_COMPONENTS_PATH, {
        body: JSON.stringify({ refs: batch }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      return res.ok
        ? ((await res.json()) as ComponentsResponse).components
        : null;
    } catch {
      // Offline or an older daemon without the route: stay a plain editor.
      return null;
    }
  }

  private async fetchDetail(
    link: ComponentLink
  ): Promise<ComponentDetail | null> {
    const ref = this.frames.get(link.key) ?? {
      frames: await resolveFrames(link.frames),
      key: link.key,
      name: link.name,
    };
    const res = await this.fetcher(AIRSHIP_COMPONENT_DETAIL_PATH, {
      body: JSON.stringify({ ref }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return res.ok ? ((await res.json()) as ComponentDetail) : null;
  }

  private async lookup(refs: ComponentFrameRef[]): Promise<void> {
    const batches: ComponentFrameRef[][] = [];
    for (let i = 0; i < refs.length; i += BATCH) {
      batches.push(refs.slice(i, i + BATCH));
    }
    const answers = await Promise.all(batches.map((batch) => this.ask(batch)));
    let changed = false;
    for (const [i, answer] of answers.entries()) {
      if (answer === null) {
        for (const ref of batches[i] ?? []) {
          this.failed.add(ref.key);
        }
        continue;
      }
      for (const info of answer) {
        this.infos.set(info.key, info);
        changed = true;
      }
    }
    if (changed) {
      for (const cb of this.listeners) {
        cb();
      }
    }
  }
}
