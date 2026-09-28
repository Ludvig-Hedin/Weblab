import { describe, expect, it, vi } from "vitest";
import { reveal } from "./reveal";

/*
 * A node picked in Layers on a hidden slide: the matching dot is pressed.
 * Built on aria-hidden slides, since happy-dom does no layout.
 */

function carousel(): { dots: HTMLButtonElement[]; slides: HTMLElement[] } {
  document.body.innerHTML = `
    <section>
      <div class="dots">
        <button aria-label="Show slide 1"></button>
        <button aria-label="Show slide 2"></button>
        <button aria-label="Show slide 3"></button>
      </div>
      <div class="viewport"><div class="track">
        <article><p>One</p></article>
        <article aria-hidden="true"><p>Two</p></article>
        <article aria-hidden="true"><p>Three</p></article>
      </div></div>
    </section>`;
  return {
    dots: [...document.querySelectorAll("button")],
    slides: [...document.querySelectorAll("article")],
  };
}

describe("reveal", () => {
  it("presses the dot for the hidden slide a node is on", () => {
    const { dots, slides } = carousel();
    const clicks = dots.map((d) => {
      const spy = vi.fn();
      d.addEventListener("click", spy);
      return spy;
    });
    reveal(slides[2].querySelector("p") as Element, window);
    expect(clicks[2]).toHaveBeenCalledTimes(1);
    expect(clicks[0]).not.toHaveBeenCalled();
    expect(clicks[1]).not.toHaveBeenCalled();
  });

  it("does nothing for a node already showing", () => {
    const { dots, slides } = carousel();
    const spy = vi.fn();
    for (const d of dots) {
      d.addEventListener("click", spy);
    }
    reveal(slides[0].querySelector("p") as Element, window);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores hidden icons that are not slides", () => {
    document.body.innerHTML = `
      <div>
        <button>A</button><button>B</button>
        <span><svg aria-hidden="true"></svg><svg aria-hidden="true"></svg></span>
      </div>`;
    const spy = vi.fn();
    for (const b of document.querySelectorAll("button")) {
      b.addEventListener("click", spy);
    }
    reveal(document.querySelector("svg") as Element, window);
    expect(spy).not.toHaveBeenCalled();
  });
});
