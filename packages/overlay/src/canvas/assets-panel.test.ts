import { describe, expect, it, vi } from "vitest";
import type { AssetImage } from "../assets/client";
import { type AssetsClient, AssetsPanel, formatBytes } from "./assets-panel";

function image(name: string, bytes = 245_760): AssetImage {
  return {
    bytes,
    modified: 0,
    name,
    path: `public/images/${name}`,
    url: `/images/${name}`,
  };
}

function client(overrides: Partial<AssetsClient> = {}): AssetsClient {
  return {
    invalidateImages: vi.fn(),
    listImages: vi.fn(async () => [image("hero.png"), image("team.jpg")]),
    uploadImage: vi.fn(async (file: File) => image(file.name)),
    ...overrides,
  };
}

function tiles(panel: AssetsPanel): HTMLElement[] {
  return Array.from(
    panel.element.querySelectorAll<HTMLElement>("[class*='as-tile']")
  );
}

const text = (panel: AssetsPanel): string => panel.element.textContent ?? "";

describe("formatBytes", () => {
  it("reads like a file size", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(245_760)).toBe("240 KB");
    expect(formatBytes(1_300_000)).toBe("1.2 MB");
  });
});

describe("AssetsPanel", () => {
  it("shows the project's images as a grid with names and a path tooltip", async () => {
    const panel = new AssetsPanel({
      applyToSelection: () => true,
      client: client(),
    });
    await panel.load();
    const shown = tiles(panel);
    expect(shown).toHaveLength(2);
    expect(shown[0].textContent).toBe("hero.png");
    expect(shown[0].dataset.tip).toBe("public/images/hero.png · 240 KB");
    expect(shown[0].querySelector("img")?.getAttribute("src")).toBe(
      "/images/hero.png"
    );
  });

  it("says what to do when there are no images", async () => {
    const panel = new AssetsPanel({
      applyToSelection: () => true,
      client: client({ listImages: vi.fn(async () => []) }),
    });
    await panel.load();
    expect(text(panel)).toContain(
      "No images yet. Drop files here or click + to add them to public/images."
    );
  });

  it("offers Try again when the list cannot be read", async () => {
    const listImages = vi
      .fn<() => Promise<AssetImage[]>>()
      .mockRejectedValueOnce(new Error("Could not reach the editor server."))
      .mockResolvedValueOnce([image("hero.png")]);
    const panel = new AssetsPanel({
      applyToSelection: () => true,
      client: client({ listImages }),
    });
    await panel.load();
    expect(text(panel)).toContain("Could not reach the editor server.");
    const retry = Array.from(panel.element.querySelectorAll("button")).find(
      (b) => b.textContent === "Try again"
    );
    retry?.click();
    await vi.waitFor(() => expect(tiles(panel)).toHaveLength(1));
  });

  it("swaps the selected image on click", async () => {
    const applyToSelection = vi.fn(() => true);
    const panel = new AssetsPanel({ applyToSelection, client: client() });
    await panel.load();
    tiles(panel)[1].click();
    expect(applyToSelection).toHaveBeenCalledWith("/images/team.jpg");
    const hint = panel.element.querySelector<HTMLElement>("[class*='as-hint']");
    expect(hint?.hidden).toBe(true);
  });

  it("asks for an image selection when there is none", async () => {
    const panel = new AssetsPanel({
      applyToSelection: () => false,
      client: client(),
    });
    await panel.load();
    tiles(panel)[0].click();
    const hint = panel.element.querySelector<HTMLElement>("[class*='as-hint']");
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toBe("Select an image on the canvas to swap it.");
  });

  it("uploads one file at a time, shows progress, and lists what failed", async () => {
    let release: () => void = () => undefined;
    const uploadImage = vi.fn(async (file: File) => {
      if (file.name === "broken.png") {
        throw new Error("The upload did not go through.");
      }
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return image(file.name);
    });
    const c = client({ uploadImage });
    const panel = new AssetsPanel({ applyToSelection: () => true, client: c });
    await panel.load();
    const files = [
      new File(["x"], "a.png", { type: "image/png" }),
      new File(["x"], "broken.png", { type: "image/png" }),
      new File(["x"], "notes.pdf", { type: "application/pdf" }),
    ];
    const done = panel.upload(files);
    const status = panel.element.querySelector<HTMLElement>(
      "[class*='as-status']"
    );
    expect(status?.textContent).toBe("Uploading 1 of 3…");
    expect(uploadImage).toHaveBeenCalledTimes(1);
    release();
    await done;
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(status?.hasAttribute("data-error")).toBe(true);
    expect(status?.textContent).toContain(
      "broken.png: The upload did not go through."
    );
    expect(status?.textContent).toContain(
      "notes.pdf: That file is not an image."
    );
    expect(c.invalidateImages).toHaveBeenCalled();
    // The list is read again after the uploads.
    expect(c.listImages).toHaveBeenCalledTimes(2);
  });

  it("shows search only when there are many images", async () => {
    const many = Array.from({ length: 13 }, (_, i) => image(`img-${i}.png`));
    const panel = new AssetsPanel({
      applyToSelection: () => true,
      client: client({ listImages: vi.fn(async () => many) }),
    });
    await panel.load();
    const search = panel.element.querySelector<HTMLInputElement>(
      "input[type='search']"
    );
    expect(search?.closest<HTMLElement>("[class*='as-search']")?.hidden).toBe(
      false
    );
    if (search) {
      search.value = "img-12";
      search.dispatchEvent(new Event("input"));
    }
    expect(tiles(panel)).toHaveLength(1);
  });
});
