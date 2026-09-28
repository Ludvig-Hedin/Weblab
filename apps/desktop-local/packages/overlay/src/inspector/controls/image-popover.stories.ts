import type { Meta, StoryObj } from "@storybook/html-vite";
import type { AssetImage } from "../../assets/client";
import { cls, el } from "../../dom";
import { inspectorBody, section, stage } from "../../stories/chrome";
import {
  type ImageKind,
  type ImageState,
  openImagePopover,
} from "./image-popover";

/*
 * The image popover, against a stand-in project folder.
 *
 * The real popover lists `public/` through the editor server, which Storybook
 * does not run, so these stories hand it a few generated images instead. The
 * writes go to a local state object, which is enough to see the Type switch,
 * the position pad and the selected thumbnail follow each click.
 */

const meta: Meta = {
  title: "Inspector/Controls/Image",
};

export default meta;

const SWATCHES = ["#0D99FF", "#2ECC71", "#F5C84C", "#FF4D4F", "#8A5CF6"];

/** A flat SVG image, so the story needs no files on disk. */
function sample(name: string, color: string, wide = true): AssetImage {
  const [w, h] = wide ? [160, 100] : [100, 160];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="#fff" fill-opacity=".6"/></svg>`;
  return {
    bytes: svg.length,
    modified: 0,
    name,
    path: `public/${name}`,
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
  };
}

const IMAGES = SWATCHES.map((color, i) =>
  sample(`photo-${i + 1}.svg`, color, i % 2 === 0)
);

function openStory(kind: ImageKind): HTMLElement {
  let state: ImageState = {
    alt: "",
    fit: "fill",
    position: "50% 50%",
    src: IMAGES[0].url,
  };
  const anchor = el("button", { class: cls("img-row"), type: "button" }, [
    el("span", { class: cls("img-row-name"), text: "Open the popover" }),
  ]);
  const open = (): void => {
    openImagePopover(anchor, {
      assets: {
        listImages: () => Promise.resolve(IMAGES),
        uploadImage: (file) =>
          Promise.reject(
            new Error(`Uploads need the editor server (${file.name}).`)
          ),
      },
      kind,
      read: () => state,
      setAlt: (alt) => {
        state = { ...state, alt };
      },
      setFit: (fit) => {
        state = { ...state, fit };
      },
      setPosition: (position) => {
        state = { ...state, position };
      },
      setSrc: (src) => {
        state = { ...state, src };
      },
    });
  };
  anchor.addEventListener("click", open);
  const node = stage(inspectorBody([section("Image", anchor)]), {
    caption: {
      try: "pick a thumbnail, switch Type to Stretch (Position goes away), or drag the dot on the preview in Fill",
      what:
        kind === "img"
          ? "The popover for an <img>: Fill, Fit and Stretch, and an alt text field."
          : "The popover for a background layer: Tile joins the Type switch, and there is no alt text.",
    },
  });
  // After the anchor is in the document, so the popover can measure it.
  queueMicrotask(open);
  return node;
}

export const ForImg: StoryObj = { render: () => openStory("img") };

export const ForBackground: StoryObj = {
  render: () => openStory("background"),
};
