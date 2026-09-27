import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateImages } from "../../assets/client";
import { cls } from "../../dom";
import { closeOpenPopover } from "../../popover-host";
import type { SectionContext } from "./context";
import { renderFill } from "./fill";

const LIST = {
  images: [
    {
      bytes: 1,
      modified: 0,
      name: "new.png",
      path: "public/new.png",
      url: "/new.png",
    },
  ],
  root: "/app",
};

beforeEach(() => {
  invalidateImages();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(LIST), { status: 200 }))
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

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** A context whose writes land on the element's inline style, and are recorded. */
function stubCtx(node: HTMLElement): {
  changes: [string, string][];
  ctx: SectionContext;
  plus: () => HTMLElement;
} {
  const changes: [string, string][] = [];
  let plus: HTMLElement | null = null;
  const ctx = {
    batch: (run: () => void) => run(),
    colorRow: () => document.createElement("div"),
    gate: (target: Element) => (property: string) =>
      getComputedStyle(target).getPropertyValue(property),
    gestures: {},
    headerAction: (_icon: string, tip: string, onClick: () => void) => {
      const button = document.createElement("button");
      button.setAttribute("aria-label", tip);
      button.addEventListener("click", onClick);
      plus = button;
      return button;
    },
    onChange: (property: string, value: string) => {
      changes.push([property, value]);
      node.style.setProperty(property, value);
    },
    refresh: () => undefined,
    register: () => undefined,
    reseed: () => undefined,
    section: (
      _id: string,
      _label: string,
      body: HTMLElement,
      opts?: { actions?: HTMLElement[] }
    ) => {
      const wrap = document.createElement("section");
      wrap.append(...(opts?.actions ?? []), body);
      return wrap;
    },
  } as unknown as SectionContext;
  return {
    changes,
    ctx,
    plus: () => {
      if (!plus) {
        throw new Error("no header action");
      }
      return plus;
    },
  };
}

function mount(style: string) {
  const node = document.createElement("div");
  node.setAttribute("style", style);
  document.body.append(node);
  const stub = stubCtx(node);
  const section = renderFill(stub.ctx, node);
  document.body.append(section);
  return { ...stub, node, section };
}

const menuItems = (): string[] =>
  Array.from(document.querySelectorAll(`.${cls("pop-item-label")}`)).map(
    (item) => item.textContent ?? ""
  );

describe("Fill section, images", () => {
  it("adds a solid first, and only then offers Gradient and Image", () => {
    const empty = mount("");
    empty.plus().click();
    expect(empty.changes).toEqual([["background-color", "#FFFFFF"]]);
    expect(menuItems()).toEqual([]);

    empty.plus().click();
    expect(menuItems()).toEqual(["Gradient", "Image"]);
  });

  it("Image opens the image popover and adds nothing until one is picked", async () => {
    const { changes, plus } = mount("background-color: red");
    plus().click();
    const image = Array.from(
      document.querySelectorAll<HTMLElement>(`.${cls("pop-item")}`)
    ).find((item) => item.textContent === "Image");
    image?.click();

    const pop = document.querySelector<HTMLElement>(`.${cls("img-pop")}`);
    expect(pop).not.toBeNull();
    // Background mode: Tile is on offer.
    expect(pop?.querySelector('button[aria-label="Tile"]')).not.toBeNull();
    expect(changes).toEqual([]);

    await settle();
    pop?.querySelector<HTMLElement>('[data-url="/new.png"]')?.click();
    const written = new Map(changes);
    expect(written.get("background-image")).toBe('url("/new.png")');
    expect(written.get("background-size")).toBe("cover");
    expect(written.get("background-repeat")).toBe("no-repeat");
    expect(written.get("background-position")).toBe("50% 50%");
  });

  it("puts a new image on top of the existing layers", async () => {
    const { changes, plus } = mount(
      "background-color: red; background-image: linear-gradient(red, blue)"
    );
    plus().click();
    Array.from(document.querySelectorAll<HTMLElement>(`.${cls("pop-item")}`))
      .find((item) => item.textContent === "Image")
      ?.click();
    await settle();
    document
      .querySelector<HTMLElement>(`.${cls("img-pop")} [data-url="/new.png"]`)
      ?.click();
    const image = new Map(changes).get("background-image") ?? "";
    expect(image.startsWith('url("/new.png"), ')).toBe(true);
    expect(image).toContain("linear-gradient");
  });

  it("turns an image layer's glyph into a thumbnail that opens the popover", async () => {
    const { changes, section } = mount(
      'background-color: red; background-image: url("/old.png")'
    );
    const thumb = section.querySelector<HTMLElement>(`.${cls("fill-thumb")}`);
    expect(thumb?.tagName).toBe("BUTTON");
    expect(thumb?.getAttribute("aria-label")).toBe("Edit image");
    thumb?.click();

    const pop = document.querySelector<HTMLElement>(`.${cls("img-pop")}`);
    expect(pop?.querySelector(`.${cls("img-name")}`)?.textContent).toBe(
      "old.png"
    );
    await settle();
    pop?.querySelector<HTMLElement>('[data-url="/new.png"]')?.click();
    expect(changes).toContainEqual(["background-image", 'url("/new.png")']);
    // The row's own field follows the popover.
    const field = section.querySelector<HTMLInputElement>(
      'input[aria-label="Fill layer"]'
    );
    expect(field?.value).toBe('url("/new.png")');
  });

  it("writes the other layers back root-relative, not as proxy URLs", async () => {
    const absolute = new URL("/hero.jpg", document.baseURI).href;
    const { changes, plus } = mount(
      `background-color: red; background-image: url("${absolute}"), url("https://cdn.example.com/x.png")`
    );
    plus().click();
    Array.from(document.querySelectorAll<HTMLElement>(`.${cls("pop-item")}`))
      .find((item) => item.textContent === "Image")
      ?.click();
    await settle();
    document
      .querySelector<HTMLElement>(`.${cls("img-pop")} [data-url="/new.png"]`)
      ?.click();
    expect(new Map(changes).get("background-image")).toBe(
      'url("/new.png"), url("/hero.jpg"), url("https://cdn.example.com/x.png")'
    );
  });

  it("makes room in per-layer attachment, origin and clip lists", async () => {
    // happy-dom drops multi-value lists for these three, so the computed
    // values a browser would report are supplied here.
    const lists: Record<string, string> = {
      "background-attachment": "fixed, local",
      "background-blend-mode": "multiply",
      "background-clip": "padding-box, content-box",
      "background-origin": "content-box, border-box",
    };
    const real = window.getComputedStyle.bind(window);
    const spy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((target: Element) => {
        const style = real(target);
        return new Proxy(style, {
          get(obj, key) {
            if (key === "getPropertyValue") {
              return (property: string) =>
                lists[property] ?? obj.getPropertyValue(property);
            }
            const value = Reflect.get(obj, key, obj);
            return typeof value === "function" ? value.bind(obj) : value;
          },
        });
      });
    const { changes, plus } = mount(
      "background-color: red; background-image: linear-gradient(red, blue), linear-gradient(blue, red)"
    );
    plus().click();
    Array.from(document.querySelectorAll<HTMLElement>(`.${cls("pop-item")}`))
      .find((item) => item.textContent === "Image")
      ?.click();
    await settle();
    document
      .querySelector<HTMLElement>(`.${cls("img-pop")} [data-url="/new.png"]`)
      ?.click();
    const written = new Map(changes);
    expect(written.get("background-attachment")).toBe("scroll, fixed, local");
    expect(written.get("background-origin")).toBe(
      "padding-box, content-box, border-box"
    );
    expect(written.get("background-clip")).toBe(
      "border-box, padding-box, content-box"
    );
    // A single shared value keeps applying to every layer.
    expect(written.has("background-blend-mode")).toBe(false);
    spy.mockRestore();
  });

  it("edits the right CSS entry for a layer below a hidden one", () => {
    const { changes, section } = mount(
      'background-color: red; background-image: url("/a.png"), url("/b.png")'
    );
    section.querySelector<HTMLElement>('button[aria-label="Hide"]')?.click();
    changes.length = 0;
    const thumbs = section.querySelectorAll<HTMLElement>(
      `.${cls("fill-thumb")}`
    );
    // The hidden layer offers no image popover; the visible one does.
    expect(thumbs.length).toBe(1);
    thumbs[0].click();
    document
      .querySelector<HTMLElement>(
        `.${cls("img-pop")} [aria-label="Image type"] button[aria-label="Fit"]`
      )
      ?.click();
    expect(new Map(changes).get("background-size")).toBe("contain");
  });
});
