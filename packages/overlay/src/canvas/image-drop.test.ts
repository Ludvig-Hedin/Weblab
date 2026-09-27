import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeLayer } from "../chrome-layer";
import type { Surface } from "../surface";
import {
  ASSET_MIME,
  bindImageDrop,
  dragKind,
  droppedImage,
  imageTargetOf,
} from "./image-drop";

/** A stand-in for the browser's DataTransfer, which happy-dom lacks. */
function transfer(opts: {
  data?: Record<string, string>;
  files?: File[];
  itemTypes?: string[];
  types: string[];
}): DataTransfer {
  return {
    dropEffect: "none",
    files: opts.files ?? [],
    getData: (type: string) => opts.data?.[type] ?? "",
    items: (opts.itemTypes ?? []).map((type) => ({ kind: "file", type })),
    types: opts.types,
  } as unknown as DataTransfer;
}

function dragEvent(type: string, dt: DataTransfer, target: Element): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, {
    clientX: { value: 10 },
    clientY: { value: 10 },
    dataTransfer: { value: dt },
  });
  target.dispatchEvent(e);
  return e;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("imageTargetOf", () => {
  it("takes an <img>", () => {
    document.body.innerHTML = `<img src="/a.png">`;
    const img = document.querySelector("img");
    expect(imageTargetOf(img)).toBe(img);
  });

  it("takes an element with a background image, and reaches it from text on top", () => {
    document.body.innerHTML = `<section style="background-image: url(/hero.jpg)"><h1>Hi</h1></section>`;
    const section = document.querySelector("section");
    expect(imageTargetOf(section)).toBe(section);
    expect(imageTargetOf(document.querySelector("h1"))).toBe(section);
  });

  it("rejects plain text", () => {
    document.body.innerHTML = "<div><p>Hello</p></div>";
    expect(imageTargetOf(document.querySelector("p"))).toBeNull();
  });
});

describe("dragKind", () => {
  it("tells files, assets and other files apart", () => {
    expect(dragKind(transfer({ types: [ASSET_MIME] }))).toBe("asset");
    expect(
      dragKind(transfer({ itemTypes: ["image/png"], types: ["Files"] }))
    ).toBe("file");
    expect(
      dragKind(transfer({ itemTypes: ["application/pdf"], types: ["Files"] }))
    ).toBe("other");
    expect(dragKind(transfer({ types: ["text/plain"] }))).toBeNull();
  });
});

describe("droppedImage", () => {
  it("takes the first file only when it is an image", () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    expect(
      droppedImage(transfer({ files: [png, pdf], types: ["Files"] }))
    ).toBe(png);
    expect(
      droppedImage(transfer({ files: [pdf], types: ["Files"] }))
    ).toBeNull();
  });
});

describe("bindImageDrop", () => {
  const surface = {
    bounds: () => null,
    toScreen: (r: unknown) => r,
  } as unknown as Surface;

  function setup(html: string) {
    document.body.innerHTML = html;
    const node = document.body.firstElementChild as Element;
    const onDrop = vi.fn();
    const onRefuse = vi.fn();
    const layer = new ChromeLayer();
    layer.mount(document.body);
    const off = bindImageDrop({
      enabled: () => true,
      hitTest: () => ({ node, surface }),
      layer,
      onDrop,
      onRefuse,
      win: window,
    });
    return { layer, node, off, onDrop, onRefuse };
  }

  it("swaps a dropped image file onto an <img>", () => {
    const { node, off, onDrop } = setup(`<img src="/a.png">`);
    const png = new File(["x"], "b.png", { type: "image/png" });
    const e = dragEvent(
      "drop",
      transfer({ files: [png], itemTypes: ["image/png"], types: ["Files"] }),
      node
    );
    expect(e.defaultPrevented).toBe(true);
    expect(onDrop).toHaveBeenCalledWith(node, surface, { file: png });
    off();
  });

  it("swaps a dragged asset by URL", () => {
    const { node, off, onDrop } = setup(`<img src="/a.png">`);
    dragEvent(
      "drop",
      transfer({
        data: { [ASSET_MIME]: "/images/c.png" },
        types: [ASSET_MIME],
      }),
      node
    );
    expect(onDrop).toHaveBeenCalledWith(node, surface, {
      url: "/images/c.png",
    });
    off();
  });

  it("refuses a drop on text, and never lets the browser open the file", () => {
    const { node, off, onDrop } = setup("<p>Hello</p>");
    const png = new File(["x"], "b.png", { type: "image/png" });
    const dt = transfer({
      files: [png],
      itemTypes: ["image/png"],
      types: ["Files"],
    });
    const over = dragEvent("dragover", dt, node);
    expect(over.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe("none");
    const drop = dragEvent("drop", dt, node);
    expect(drop.defaultPrevented).toBe(true);
    expect(onDrop).not.toHaveBeenCalled();
    off();
  });

  it("says so when the dropped file is not an image", () => {
    const { node, off, onDrop, onRefuse } = setup(`<img src="/a.png">`);
    const txt = new File(["x"], "notes.txt", { type: "" });
    dragEvent("drop", transfer({ files: [txt], types: ["Files"] }), node);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onRefuse).toHaveBeenCalledWith("That file is not an image.");
    off();
  });

  it("outlines the image while a file is over it", () => {
    const { layer, node, off } = setup(`<img src="/a.png">`);
    dragEvent(
      "dragover",
      transfer({ itemTypes: ["image/png"], types: ["Files"] }),
      node
    );
    const label = layer.element.querySelector("[class*='box-label']");
    expect(label?.textContent).toBe("Replace image");
    expect((label as HTMLElement).style.display).toBe("block");
    off();
  });
});
