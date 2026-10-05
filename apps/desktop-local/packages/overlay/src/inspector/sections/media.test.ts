import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateImages } from "../../assets/client";
import { cls } from "../../dom";
import { closeOpenPopover } from "../../popover-host";
import type { ControlHandle } from "../controls/types";
import { openActiveImageEditor } from "../image-editor";
import type { SectionContext } from "./context";
import { renderMedia } from "./media";

beforeEach(() => {
  invalidateImages();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ images: [], root: "/app" }), {
          status: 200,
        })
      )
    )
  );
});

afterEach(() => {
  closeOpenPopover("programmatic");
  vi.unstubAllGlobals();
  for (const child of Array.from(document.body.children)) {
    if (!child.classList.contains(cls("pop-host"))) {
      child.remove();
    }
  }
});

/** Just enough of the panel for the Media section to render against. */
function stubCtx(): { controls: ControlHandle[]; ctx: SectionContext } {
  const controls: ControlHandle[] = [];
  const ctx = {
    batch: (run: () => void) => run(),
    fieldCell: () => document.createElement("div"),
    gestures: {},
    onAttr: (node: Element, attribute: string, value: string | null) => {
      if (value === null) {
        node.removeAttribute(attribute);
      } else {
        node.setAttribute(attribute, value);
      }
    },
    onChange: () => undefined,
    refresh: () => undefined,
    register: (control: ControlHandle) => controls.push(control),
    reseed: () => undefined,
    section: (_id: string, _label: string, body: HTMLElement) => body,
  } as unknown as SectionContext;
  return { controls, ctx };
}

function mount(src: string, extra: Record<string, string> = {}) {
  const node = document.createElement("img");
  node.setAttribute("src", src);
  for (const [name, value] of Object.entries(extra)) {
    node.setAttribute(name, value);
  }
  document.body.append(node);
  const { controls, ctx } = stubCtx();
  const body = renderMedia(ctx, node);
  document.body.append(body);
  return { body, controls, node };
}

const imageRow = (body: HTMLElement): HTMLElement | null =>
  body.querySelector<HTMLElement>(`.${cls("img-row")}`);

describe("Media section, <img>", () => {
  it("leads with an image row naming the file", () => {
    const { body } = mount("/images/hero%20shot.jpg");
    const row = imageRow(body);
    expect(row?.tagName).toBe("BUTTON");
    expect(row?.textContent).toBe("hero shot.jpg");
    expect(body.firstElementChild).toBe(row);
  });

  it("names a Next.js optimized image by the real file", () => {
    const { body } = mount("/_next/image?url=%2Fimg%2Fteam.png&w=1080&q=75");
    expect(imageRow(body)?.textContent).toBe("team.png");
  });

  it("no longer has a plain Source field", () => {
    const { body } = mount("/a.png");
    expect(body.querySelector('input[aria-label="Source"]')).toBeNull();
    expect(body.querySelector('input[aria-label="Alt text"]')).not.toBeNull();
  });

  it("keeps srcset behind a closed More disclosure", () => {
    const { body } = mount("/a.png", { srcset: "/a-2x.png 2x" });
    const srcset = body.querySelector('input[aria-label="Srcset"]');
    const group = srcset?.closest<HTMLElement>(`.${cls("img-more-body")}`);
    const toggle = body.querySelector<HTMLElement>(`.${cls("img-more")}`);
    expect(group?.hidden).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    toggle?.click();
    expect(group?.hidden).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    // Leave it as found: the open state outlives one render on purpose.
    toggle?.click();
  });

  it("repaints the row when the source changes underneath it", () => {
    const { body, controls, node } = mount("/a.png");
    node.setAttribute("src", "/b.png");
    for (const control of controls) {
      control.resync?.();
    }
    expect(imageRow(body)?.textContent).toBe("b.png");
  });

  it("opens the image popover from the row and from the registry", () => {
    const { body, controls } = mount("/a.png");
    imageRow(body)?.click();
    expect(document.querySelector(`.${cls("img-pop")}`)).not.toBeNull();
    closeOpenPopover();

    expect(openActiveImageEditor()).toBe(true);
    expect(document.querySelector(`.${cls("img-pop")}`)).not.toBeNull();
    closeOpenPopover();

    for (const control of controls) {
      control.destroy?.();
    }
    expect(openActiveImageEditor()).toBe(false);
  });

  it("points to the code for an <img> with responsive <source>s", () => {
    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.setAttribute("srcset", "/wide.webp");
    const node = document.createElement("img");
    node.setAttribute("src", "/narrow.jpg");
    picture.append(source, node);
    document.body.append(picture);
    const body = renderMedia(stubCtx().ctx, node);
    expect(imageRow(body)).toBeNull();
    expect(body.textContent).toContain(
      "This image has responsive sources. Edit them in code."
    );
  });
});
