import { AIRSHIP_FRAME_NAME } from "@airship/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMotionGate } from "./motion-gate";

/*
 * Autoplay on the canvas: long timers are held while a canvas frame is
 * frozen, short ones still run, and the preview frame is never touched.
 */

function fakeWindow(name: string): Window {
  const win = {
    clearInterval: globalThis.clearInterval,
    clearTimeout: globalThis.clearTimeout,
    document,
    location: { href: "http://localhost/" },
    name,
    parent: {},
    setInterval: globalThis.setInterval,
    setTimeout: globalThis.setTimeout,
  };
  return win as unknown as Window;
}

describe("motion gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds an autoplay timeout until the frame unfreezes", () => {
    const win = fakeWindow(`${AIRSHIP_FRAME_NAME}a`);
    installMotionGate(win);
    const next = vi.fn();
    win.setTimeout(next, 5000);

    vi.advanceTimersByTime(6000);
    expect(next).not.toHaveBeenCalled();

    win.__airshipMotion?.setFrozen(false);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("lets short timers run while frozen", () => {
    const win = fakeWindow(`${AIRSHIP_FRAME_NAME}a`);
    installMotionGate(win);
    const quick = vi.fn();
    win.setTimeout(quick, 50);

    vi.advanceTimersByTime(60);
    expect(quick).toHaveBeenCalledTimes(1);
  });

  it("drops interval ticks while frozen", () => {
    const win = fakeWindow(`${AIRSHIP_FRAME_NAME}a`);
    installMotionGate(win);
    const tick = vi.fn();
    win.setInterval(tick, 3000);

    vi.advanceTimersByTime(9000);
    expect(tick).not.toHaveBeenCalled();

    win.__airshipMotion?.setFrozen(false);
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("forgets a held timeout that was cleared", () => {
    const win = fakeWindow(`${AIRSHIP_FRAME_NAME}a`);
    installMotionGate(win);
    const next = vi.fn();
    const id = win.setTimeout(next, 2000);
    vi.advanceTimersByTime(2500);
    win.clearTimeout(id);

    win.__airshipMotion?.setFrozen(false);
    expect(next).not.toHaveBeenCalled();
  });

  it("tells script the visitor prefers reduced motion", () => {
    const asked: string[] = [];
    const win = fakeWindow(`${AIRSHIP_FRAME_NAME}a`);
    const real = (query: string) => {
      asked.push(query);
      return { matches: false, media: query } as MediaQueryList;
    };
    (win as unknown as { matchMedia: typeof real }).matchMedia = real;
    installMotionGate(win);

    win.matchMedia("(prefers-reduced-motion: reduce)");
    win.matchMedia("not (prefers-reduced-motion:no-preference)");
    win.matchMedia("(min-width: 600px)");
    expect(asked).toEqual([
      "(width >= 0)",
      "not (width < 0)",
      "(min-width: 600px)",
    ]);

    win.__airshipMotion?.setFrozen(false);
    expect(win.matchMedia).toBe(real);
  });

  it("leaves the preview frame alone", () => {
    const win = fakeWindow(`${AIRSHIP_FRAME_NAME}view`);
    installMotionGate(win);
    expect(win.__airshipMotion).toBeUndefined();
    const next = vi.fn();
    win.setTimeout(next, 5000);
    vi.advanceTimersByTime(5000);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("ends a page-load animation at once, and holds a looping one", () => {
    const made: { finish: ReturnType<typeof vi.fn>; iterations: number }[] = [];
    class FakeElement {
      animate(_k: unknown, opts: { iterations?: number }) {
        const a = {
          effect: {
            getTiming: () => ({ iterations: opts.iterations ?? 1 }),
          },
          finish: vi.fn(),
          iterations: opts.iterations ?? 1,
        };
        made.push(a);
        return a;
      }
    }
    const win = fakeWindow(`${AIRSHIP_FRAME_NAME}a`);
    (win as unknown as { Element: unknown }).Element = FakeElement;
    installMotionGate(win);

    const node = new FakeElement() as unknown as Element;
    node.animate([], { duration: 600 });
    node.animate([], { duration: 600, iterations: Number.POSITIVE_INFINITY });
    expect(made[0]?.finish).toHaveBeenCalledTimes(1);
    expect(made[1]?.finish).not.toHaveBeenCalled();
  });
});
