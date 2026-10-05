import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetImage } from "../../assets/client";
import { cls } from "../../dom";
import { closeOpenPopover } from "../../popover-host";
import { toast } from "../../toast";
import type { SectionContext } from "../sections/context";
import { imgBinding } from "../sections/media";
import {
  decodeNextImage,
  displayName,
  fitCss,
  fitFromCss,
  type ImageAssets,
  type ImageFit,
  type ImagePopoverOptions,
  type ImageState,
  openImagePopover,
  parsePosition,
  sameImage,
} from "./image-popover";

vi.mock("../../toast", () => ({ toast: vi.fn() }));

afterEach(() => {
  closeOpenPopover("programmatic");
  for (const child of Array.from(document.body.children)) {
    if (!child.classList.contains(cls("pop-host"))) {
      child.remove();
    }
  }
});

const image = (name: string): AssetImage => ({
  bytes: 10,
  modified: 0,
  name,
  path: `public/${name}`,
  url: `/${name}`,
});

function assets(list: AssetImage[] = []): ImageAssets & {
  uploads: File[];
} {
  const uploads: File[] = [];
  return {
    listImages: () => Promise.resolve(list),
    uploadImage: (file) => {
      uploads.push(file);
      return Promise.resolve(image(file.name));
    },
    uploads,
  };
}

/** Flush the promise the grid is waiting on. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

interface Recorder {
  fits: ImageFit[];
  positions: string[];
  srcs: string[];
  state: ImageState;
}

function open(
  overrides: Partial<ImagePopoverOptions> = {},
  initial: Partial<ImageState> = {}
): { pop: HTMLElement; rec: Recorder } {
  const rec: Recorder = {
    fits: [],
    positions: [],
    srcs: [],
    state: {
      alt: "",
      fit: "fill",
      position: "50% 50%",
      src: "/images/hero.jpg",
      ...initial,
    },
  };
  const anchor = document.createElement("button");
  document.body.append(anchor);
  openImagePopover(anchor, {
    assets: assets(),
    kind: "img",
    read: () => rec.state,
    setAlt: (alt) => {
      rec.state = { ...rec.state, alt };
    },
    setFit: (fit) => {
      rec.fits.push(fit);
      rec.state = { ...rec.state, fit };
    },
    setPosition: (position) => {
      rec.positions.push(position);
      rec.state = { ...rec.state, position };
    },
    setSrc: (src) => {
      rec.srcs.push(src);
      rec.state = { ...rec.state, src };
    },
    ...overrides,
  });
  const pop = document.querySelector<HTMLElement>(`.${cls("img-pop")}`);
  if (!pop) {
    throw new Error("popover did not open");
  }
  return { pop, rec };
}

const segment = (pop: HTMLElement, label: string): HTMLElement | null =>
  pop.querySelector<HTMLElement>(
    `[aria-label="Image type"] button[aria-label="${label}"]`
  );

describe("helpers", () => {
  it("names an image by its decoded file name", () => {
    expect(displayName("/images/my%20hero.jpg?v=2")).toBe("my hero.jpg");
    expect(displayName("https://cdn.example.com/a/b/photo.png#x")).toBe(
      "photo.png"
    );
    expect(displayName("")).toBe("");
    expect(displayName("data:image/png;base64,AAAA")).toBe("Embedded image");
  });

  it("sees through the Next.js image optimizer", () => {
    const next = "/_next/image?url=%2Fimages%2Fteam%20photo.jpg&w=1080&q=75";
    expect(decodeNextImage(next)).toBe("/images/team photo.jpg");
    expect(displayName(next)).toBe("team photo.jpg");
    expect(sameImage(next, "/images/team%20photo.jpg")).toBe(true);
  });

  it("maps each Type to the right CSS per kind", () => {
    expect(fitCss("img", "fill")).toEqual([["object-fit", "cover"]]);
    expect(fitCss("img", "fit")).toEqual([["object-fit", "contain"]]);
    expect(fitCss("img", "stretch")).toEqual([["object-fit", "fill"]]);
    expect(fitCss("background", "fill")).toEqual([
      ["background-size", "cover"],
      ["background-repeat", "no-repeat"],
    ]);
    expect(fitCss("background", "stretch")).toEqual([
      ["background-size", "100% 100%"],
      ["background-repeat", "no-repeat"],
    ]);
    expect(fitCss("background", "tile")).toEqual([
      ["background-size", "auto"],
      ["background-repeat", "repeat"],
    ]);
  });

  it("reads back a Type, and none for values it has no name for", () => {
    expect(fitFromCss("img", { objectFit: "cover" })).toBe("fill");
    expect(fitFromCss("img", { objectFit: "fill" })).toBe("stretch");
    expect(fitFromCss("img", { objectFit: "scale-down" })).toBeNull();
    expect(fitFromCss("img", { objectFit: "none" })).toBeNull();
    expect(
      fitFromCss("background", { repeat: "no-repeat", size: "contain" })
    ).toBe("fit");
    expect(fitFromCss("background", { repeat: "repeat", size: "auto" })).toBe(
      "tile"
    );
    expect(
      fitFromCss("background", { repeat: "no-repeat", size: "auto" })
    ).toBeNull();
  });

  it("parses positions, including keywords in either order", () => {
    expect(parsePosition("20% 30%")).toEqual([20, 30]);
    expect(parsePosition("top left")).toEqual([0, 0]);
    expect(parsePosition("right bottom")).toEqual([100, 100]);
    expect(parsePosition("12px 4px")).toEqual([50, 50]);
  });
});

describe("the popover", () => {
  it("shows the current image and its name", () => {
    const { pop } = open(
      {},
      { src: "/_next/image?url=%2Fimg%2Fcat.png&w=640&q=75" }
    );
    expect(pop.querySelector(`.${cls("img-name")}`)?.textContent).toBe(
      "cat.png"
    );
    expect(
      pop.querySelector<HTMLImageElement>(`.${cls("img-preview-img")}`)?.src
    ).toContain("/_next/image?url=");
    expect(pop.closest(`.${cls("pop")}`)?.getAttribute("aria-label")).toBe(
      "Image"
    );
  });

  it("offers Tile only for background images", () => {
    const img = open();
    expect(segment(img.pop, "Tile")).toBeNull();
    closeOpenPopover();
    const bg = open({ kind: "background" });
    expect(segment(bg.pop, "Tile")).not.toBeNull();
  });

  it("writes a Type through setFit and lights the new segment", () => {
    const { pop, rec } = open();
    expect(segment(pop, "Fill")?.getAttribute("aria-pressed")).toBe("true");
    segment(pop, "Fit")?.click();
    expect(rec.fits).toEqual(["fit"]);
    expect(segment(pop, "Fit")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("selects no Type for a value outside the four", () => {
    const { pop } = open({}, { fit: null });
    const pressed = pop.querySelectorAll(
      `[aria-label="Image type"] [aria-pressed="true"]`
    );
    expect(pressed.length).toBe(0);
  });

  it("hides Position for Stretch", () => {
    const { pop } = open();
    const pad = pop.querySelector(`.${cls("img-pos")}`)?.parentElement;
    expect(pad?.hidden).toBe(false);
    segment(pop, "Stretch")?.click();
    expect(pad?.hidden).toBe(true);
  });

  it("writes one of the nine positions", () => {
    const { pop, rec } = open();
    pop.querySelector<HTMLElement>('[aria-label="Top left"]')?.click();
    expect(rec.positions).toEqual(["0% 0%"]);
    expect(
      pop.querySelector('[aria-label="Top left"]')?.getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("writes alt text on blur, and not when unchanged", () => {
    const setAlt = vi.fn();
    const { pop } = open({ setAlt }, { alt: "Old" });
    const input = pop.querySelector<HTMLInputElement>(
      'input[aria-label="Alt text"]'
    );
    if (!input) {
      throw new Error("no alt field");
    }
    input.dispatchEvent(new FocusEvent("blur"));
    expect(setAlt).not.toHaveBeenCalled();
    input.value = "A cat on a sofa";
    input.dispatchEvent(new FocusEvent("blur"));
    expect(setAlt).toHaveBeenCalledWith("A cat on a sofa");
  });

  it("has no alt field for a background", () => {
    const { pop } = open({ kind: "background" });
    expect(pop.querySelector('input[aria-label="Alt text"]')).toBeNull();
  });

  it("lists project images, marks the current one, and applies a click", async () => {
    const list = [image("hero.jpg"), image("team.png")];
    const { pop, rec } = open(
      { assets: assets(list) },
      { src: "http://localhost:3000/hero.jpg" }
    );
    await settle();
    const tiles = pop.querySelectorAll<HTMLElement>("[data-url]");
    expect(tiles.length).toBe(2);
    expect(tiles[0].getAttribute("aria-pressed")).toBe("true");
    tiles[1].click();
    expect(rec.srcs).toEqual(["/team.png"]);
    expect(tiles[1].getAttribute("aria-pressed")).toBe("true");
    expect(pop.querySelector(`.${cls("img-name")}`)?.textContent).toBe(
      "team.png"
    );
  });

  it("says so when the project has no images", async () => {
    const { pop } = open();
    await settle();
    expect(pop.querySelector(`.${cls("img-note")}`)?.textContent).toBe(
      "No images in public/ yet. Drop one here or click +."
    );
    expect(pop.querySelector('[aria-label="Upload an image"]')).not.toBeNull();
  });

  it("offers search only past twelve images", async () => {
    const many = Array.from({ length: 13 }, (_, i) => image(`pic-${i}.png`));
    const { pop } = open({ assets: assets(many) });
    await settle();
    const search = pop.querySelector<HTMLElement>(`.${cls("img-search")}`);
    expect(search?.hidden).toBe(false);
    const input = search?.querySelector("input");
    if (!input) {
      throw new Error("no search");
    }
    input.value = "pic-12";
    input.dispatchEvent(new Event("input"));
    expect(pop.querySelectorAll("[data-url]").length).toBe(1);
  });

  it("uploads a dropped file and applies it", async () => {
    const store = assets();
    const { pop, rec } = open({ assets: store });
    const file = new File(["x"], "drop.png", { type: "image/png" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file], types: ["Files"] },
    });
    pop.dispatchEvent(drop);
    await settle();
    expect(store.uploads).toEqual([file]);
    expect(rec.srcs).toEqual(["/drop.png"]);
  });

  it("shows an upload error in place", async () => {
    const { pop, rec } = open({
      assets: {
        listImages: () => Promise.resolve([]),
        uploadImage: () => Promise.reject(new Error("Disk is full.")),
      },
    });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: [new File(["x"], "a.png", { type: "image/png" })],
        types: ["Files"],
      },
    });
    pop.dispatchEvent(drop);
    await settle();
    const line = pop.querySelector<HTMLElement>(`.${cls("img-error")}`);
    expect(line?.textContent).toBe("Disk is full.");
    expect(line?.hidden).toBe(false);
    expect(rec.srcs).toEqual([]);
  });

  it("applies a pasted URL", () => {
    const { pop, rec } = open();
    const reveal = Array.from(pop.querySelectorAll("button")).find(
      (b) => b.textContent === "Use a URL"
    );
    reveal?.click();
    const input = pop.querySelector<HTMLInputElement>(
      'input[aria-label="Image URL"]'
    );
    if (!input) {
      throw new Error("no url field");
    }
    input.value = "https://example.com/pic.jpg";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(rec.srcs).toEqual(["https://example.com/pic.jpg"]);
  });
});

describe("through the <img> binding", () => {
  it("swaps src, drops srcset and sizes, as one undo step", async () => {
    const node = document.createElement("img");
    node.setAttribute("src", "/_next/image?url=%2Fold.jpg&w=640&q=75");
    node.setAttribute("srcset", "/old-1x.jpg 1x, /old-2x.jpg 2x");
    node.setAttribute("sizes", "100vw");
    document.body.append(node);
    const writes: [string, string | null][] = [];
    let batches = 0;
    const ctx = {
      batch: (run: () => void) => {
        batches += 1;
        run();
      },
      onAttr: (target: Element, attribute: string, value: string | null) => {
        writes.push([attribute, value]);
        if (value === null) {
          target.removeAttribute(attribute);
        } else {
          target.setAttribute(attribute, value);
        }
      },
      onChange: () => undefined,
      reseed: () => undefined,
    } as unknown as SectionContext;

    const anchor = document.createElement("button");
    document.body.append(anchor);
    openImagePopover(anchor, {
      ...imgBinding(ctx, node),
      assets: assets([image("new.png")]),
    });
    await settle();
    const pop = document.querySelector<HTMLElement>(`.${cls("img-pop")}`);
    expect(pop?.querySelector(`.${cls("img-name")}`)?.textContent).toBe(
      "old.jpg"
    );
    pop?.querySelector<HTMLElement>('[data-url="/new.png"]')?.click();

    expect(writes).toEqual([
      ["src", "/new.png"],
      ["srcset", null],
      ["sizes", null],
    ]);
    expect(batches).toBe(1);
    expect(node.hasAttribute("srcset")).toBe(false);
    expect(pop?.querySelector(`.${cls("img-name")}`)?.textContent).toBe(
      "new.png"
    );
  });
});

describe("an upload that lands after the popover closed", () => {
  function deferredUpload(): {
    assets: ImageAssets;
    finish: () => void;
  } {
    let finish = (): void => undefined;
    const done = new Promise<AssetImage>((resolve) => {
      finish = () => resolve(image("late.png"));
    });
    return {
      assets: {
        listImages: () => Promise.resolve([]),
        uploadImage: () => done,
      },
      finish,
    };
  }

  function dropFile(pop: HTMLElement): void {
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: [new File(["x"], "late.png", { type: "image/png" })],
        types: ["Files"],
      },
    });
    pop.dispatchEvent(drop);
  }

  it("is still applied to the same element", async () => {
    const late = deferredUpload();
    const { pop, rec } = open({ assets: late.assets, isCurrent: () => true });
    dropFile(pop);
    closeOpenPopover("escape");
    late.finish();
    await settle();
    expect(rec.srcs).toEqual(["/late.png"]);
  });

  it("is kept in the library, and said so, once the element changed", async () => {
    vi.mocked(toast).mockClear();
    const late = deferredUpload();
    const { pop, rec } = open({ assets: late.assets, isCurrent: () => false });
    dropFile(pop);
    closeOpenPopover("outside");
    late.finish();
    await settle();
    expect(rec.srcs).toEqual([]);
    expect(toast).toHaveBeenCalledWith("Saved to your image library.");
  });
});

describe("the project list", () => {
  it("shows the cached list at once and repaints when a fresh one differs", async () => {
    const calls: (boolean | undefined)[] = [];
    const { pop } = open({
      assets: {
        listImages: (options) => {
          calls.push(options?.fresh);
          return Promise.resolve([image("old.png"), image("new.png")]);
        },
        peekImages: () => [image("old.png")],
        uploadImage: () => Promise.reject(new Error("unused")),
      },
    });
    expect(pop.querySelectorAll("[data-url]").length).toBe(1);
    await settle();
    expect(calls).toEqual([true]);
    expect(pop.querySelectorAll("[data-url]").length).toBe(2);
  });
});

describe("canvas mode", () => {
  it("resolves a relative source against the element's document", () => {
    const { pop } = open(
      { baseUrl: "http://frame.test/docs/page" },
      { src: "img/cat.png" }
    );
    expect(
      pop.querySelector<HTMLImageElement>(`.${cls("img-preview-img")}`)?.src
    ).toBe("http://frame.test/docs/img/cat.png");
  });
});
