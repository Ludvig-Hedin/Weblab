/**
 * The image library — the left dock's Assets tab.
 *
 * Every image in the project's `public/` folder, as thumbnails. Click one to
 * make it the selected image; drag one onto an image on the canvas to swap that
 * one; drop files from Finder anywhere on the panel (or use +) to add them.
 *
 * The list comes from the editor server (`assets/client.ts`), and is re-read
 * whenever the tab is shown and after each upload, so a file added in Finder
 * shows up the next time the tab is opened.
 */

import {
  type AssetImage,
  invalidateImages,
  isImageFile,
  listImages,
  NOT_AN_IMAGE,
  uploadImage,
} from "../assets/client";
import { clear, cls, el } from "../dom";
import { icon } from "../icons";
import { ASSET_MIME } from "./image-drop";

export interface AssetsClient {
  invalidateImages: () => void;
  listImages: () => Promise<AssetImage[]>;
  uploadImage: (file: File) => Promise<AssetImage>;
}

export interface AssetsPanelDeps {
  /**
   * Make this image the selected element's picture. False when the selection
   * is not an image, and the panel says how to get one.
   */
  applyToSelection: (url: string) => boolean;
  /** Injected in tests; the real client otherwise. */
  client?: AssetsClient;
}

/** More than this many images earns a search field. */
const SEARCH_THRESHOLD = 12;
const SELECT_HINT = "Select an image on the canvas to swap it.";
const EMPTY =
  "No images yet. Drop files here or click + to add them to public/images.";

const REAL_CLIENT: AssetsClient = { invalidateImages, listImages, uploadImage };

/** `240 KB`, `1.2 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${Math.max(0, Math.round(bytes || 0))} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { images: AssetImage[]; kind: "ready" };

export class AssetsPanel {
  readonly element: HTMLElement;

  private readonly deps: AssetsPanelDeps;
  private readonly client: AssetsClient;
  private readonly search: HTMLInputElement;
  private readonly searchWrap: HTMLElement;
  private readonly title: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly list: HTMLElement;
  private state: State = { kind: "loading" };
  private query = "";
  /** Bumped per load, so a slow answer cannot overwrite a newer one. */
  private generation = 0;
  private dragDepth = 0;
  private uploading = false;

  constructor(deps: AssetsPanelDeps) {
    this.deps = deps;
    this.client = deps.client ?? REAL_CLIENT;

    this.search = el("input", {
      "aria-label": "Search images",
      class: cls("layers-search"),
      placeholder: "Search images",
      spellcheck: "false",
      type: "search",
    }) as HTMLInputElement;
    this.search.addEventListener("input", () => {
      this.query = this.search.value.trim().toLowerCase();
      this.renderList();
    });
    this.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.search.value) {
        e.stopPropagation();
        this.search.value = "";
        this.query = "";
        this.renderList();
      }
    });
    this.searchWrap = el(
      "div",
      { class: `${cls("layers-search-wrap")} ${cls("as-search")}` },
      [icon("search", "sm"), this.search]
    );
    this.title = el("div", { class: cls("as-title"), text: "Images" });

    this.fileInput = el("input", {
      accept: "image/*",
      class: cls("hidden"),
      multiple: "",
      tabindex: "-1",
      type: "file",
    }) as HTMLInputElement;
    this.fileInput.addEventListener("change", () => {
      const files = Array.from(this.fileInput.files ?? []);
      this.fileInput.value = "";
      this.upload(files);
    });
    const add = el(
      "button",
      {
        "aria-label": "Upload images",
        class: cls("iconbtn"),
        "data-tip": "Upload images",
        onClick: () => this.fileInput.click(),
        type: "button",
      },
      [icon("plus", "sm")]
    );

    this.status = el("div", { class: cls("as-status") });
    this.hint = el("div", { class: cls("as-hint"), text: SELECT_HINT });
    this.hint.hidden = true;
    this.list = el("div", { class: `${cls("as-body")} ${cls("scroll-y")}` });
    this.element = el("div", { class: cls("as") }, [
      el("div", { class: cls("as-head") }, [
        this.title,
        this.searchWrap,
        add,
        this.fileInput,
      ]),
      this.status,
      this.hint,
      this.list,
    ]);
    this.searchWrap.hidden = true;
    this.status.hidden = true;
    this.armDrop();
    this.renderList();
  }

  /** The tab came into view: read the folder again. */
  show(): void {
    this.client.invalidateImages();
    this.load();
  }

  /** Fetch the list and render it. Resolves when it has rendered. */
  async load(): Promise<void> {
    this.generation += 1;
    const { generation } = this;
    if (this.state.kind !== "ready") {
      this.state = { kind: "loading" };
      this.renderList();
    }
    try {
      const images = await this.client.listImages();
      if (generation === this.generation) {
        this.state = { images, kind: "ready" };
      }
    } catch (error) {
      if (generation === this.generation) {
        this.state = {
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load the project images.",
        };
      }
    }
    if (generation === this.generation) {
      this.renderList();
    }
  }

  /**
   * Add files to the project one at a time, saying how far along it is and
   * which ones did not make it.
   */
  async upload(files: File[]): Promise<void> {
    if (files.length === 0 || this.uploading) {
      return;
    }
    this.uploading = true;
    const failed: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        this.setStatus(
          files.length > 1
            ? `Uploading ${index + 1} of ${files.length}…`
            : `Uploading ${file.name}…`
        );
        if (!isImageFile(file)) {
          failed.push(`${file.name}: ${NOT_AN_IMAGE}`);
          continue;
        }
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one at a time, on purpose, so progress can say "2 of 3".
          await this.client.uploadImage(file);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "The upload did not go through.";
          failed.push(`${file.name}: ${message}`);
        }
      }
    } finally {
      this.uploading = false;
    }
    this.client.invalidateImages();
    this.setStatus(failed.length ? failed.join("\n") : "", failed.length > 0);
    await this.load();
  }

  private setStatus(text: string, error = false): void {
    this.status.textContent = text;
    this.status.hidden = text === "";
    this.status.toggleAttribute("data-error", error);
  }

  /** Files dragged anywhere over the panel are added to the project. */
  private armDrop(): void {
    const hasFiles = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const root = this.element;
    root.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) {
        return;
      }
      e.preventDefault();
      this.dragDepth += 1;
      root.setAttribute("data-drop", "");
    });
    root.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) {
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    });
    root.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) {
        return;
      }
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (!this.dragDepth) {
        root.removeAttribute("data-drop");
      }
    });
    root.addEventListener("drop", (e) => {
      if (!hasFiles(e)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.dragDepth = 0;
      root.removeAttribute("data-drop");
      this.upload(Array.from(e.dataTransfer?.files ?? []));
    });
    root.append(
      el("div", { class: cls("as-drop"), text: "Drop images to add them" })
    );
  }

  private pick(image: AssetImage): void {
    this.hint.hidden = this.deps.applyToSelection(image.url);
  }

  private renderList(): void {
    const { state } = this;
    clear(this.list);
    const many =
      state.kind === "ready" && state.images.length > SEARCH_THRESHOLD;
    this.searchWrap.hidden = !many;
    this.title.hidden = many;

    if (state.kind === "loading") {
      this.list.append(
        el("div", { class: cls("insp-hint"), text: "Loading images…" })
      );
      return;
    }
    if (state.kind === "error") {
      this.list.append(
        el("div", { class: cls("as-empty") }, [
          el("div", { class: cls("insp-hint"), text: state.message }),
          el("button", {
            class: cls("as-retry"),
            onClick: () => this.load(),
            text: "Try again",
            type: "button",
          }),
        ])
      );
      return;
    }
    if (state.images.length === 0) {
      this.list.append(el("div", { class: cls("insp-hint"), text: EMPTY }));
      return;
    }
    const shown = state.images.filter(
      (image) =>
        !(many && this.query) ||
        image.name.toLowerCase().includes(this.query) ||
        image.path.toLowerCase().includes(this.query)
    );
    if (shown.length === 0) {
      this.list.append(
        el("div", { class: cls("insp-hint"), text: "No images match." })
      );
      return;
    }
    const grid = el("div", { class: cls("as-grid") });
    for (const image of shown) {
      grid.append(this.tile(image));
    }
    this.list.append(grid);
  }

  private tile(image: AssetImage): HTMLElement {
    const tip = `${image.path} · ${formatBytes(image.bytes)}`;
    const tile = el(
      "button",
      {
        "aria-label": `${image.name}. Use this image`,
        class: cls("as-tile"),
        "data-tip": tip,
        draggable: "true",
        onClick: () => this.pick(image),
        title: tip,
        type: "button",
      },
      [
        el("span", { class: cls("as-thumb") }, [
          el("img", {
            alt: "",
            decoding: "async",
            draggable: "false",
            loading: "lazy",
            src: image.url,
          }),
        ]),
        el("span", { class: cls("as-name"), text: image.name }),
      ]
    );
    tile.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) {
        return;
      }
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(ASSET_MIME, image.url);
    });
    return tile;
  }
}
