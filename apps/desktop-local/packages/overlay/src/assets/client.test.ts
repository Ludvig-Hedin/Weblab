import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateImages,
  isImageFile,
  listImages,
  NOT_AN_IMAGE,
  peekImages,
  uploadImage,
} from "./client";

const HERO = {
  bytes: 1200,
  modified: 1_700_000_000_000,
  name: "hero.jpg",
  path: "public/hero.jpg",
  url: "/hero.jpg",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invalidateImages();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listImages", () => {
  it("returns the server's images and caches the list", async () => {
    fetchMock.mockResolvedValue(json({ images: [HERO], root: "/app" }));
    expect(await listImages()).toEqual([HERO]);
    expect(await listImages()).toEqual([HERO]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/__airship/api/assets");
  });

  it("does not cache a failure, so the next call retries", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "public/ is missing" }, 500));
    await expect(listImages()).rejects.toThrow("public/ is missing");
    fetchMock.mockResolvedValueOnce(json({ images: [HERO], root: "/app" }));
    expect(await listImages()).toEqual([HERO]);
  });

  it("refetches when asked for a fresh list, and remembers the last one", async () => {
    fetchMock.mockResolvedValueOnce(json({ images: [], root: "/app" }));
    await listImages();
    expect(peekImages()).toEqual([]);
    fetchMock.mockResolvedValueOnce(json({ images: [HERO], root: "/app" }));
    expect(await listImages({ fresh: true })).toEqual([HERO]);
    expect(peekImages()).toEqual([HERO]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says the server is unreachable when fetch itself fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listImages()).rejects.toThrow("Could not reach the editor");
  });
});

describe("uploadImage", () => {
  it("posts the raw bytes with the file name and type, then drops the cache", async () => {
    fetchMock.mockResolvedValueOnce(json({ images: [], root: "/app" }));
    await listImages();
    fetchMock.mockResolvedValueOnce(json(HERO, 201));
    const file = new File(["x"], "my hero.jpg", { type: "image/jpeg" });

    expect(await uploadImage(file)).toEqual(HERO);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/__airship/api/assets?name=my%20hero.jpg");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(file);
    expect(init.headers["Content-Type"]).toBe("image/jpeg");

    fetchMock.mockResolvedValueOnce(json({ images: [HERO], root: "/app" }));
    expect(await listImages()).toEqual([HERO]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces the server's error message", async () => {
    fetchMock.mockResolvedValue(json({ error: "File is too large." }, 413));
    const file = new File(["x"], "big.png", { type: "image/png" });
    await expect(uploadImage(file)).rejects.toThrow("File is too large.");
  });

  it("falls back to a plain message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    const file = new File(["x"], "a.png", { type: "image/png" });
    await expect(uploadImage(file)).rejects.toThrow(
      "The upload did not go through."
    );
  });

  it("rejects a file that is not an image without calling the server", async () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    await expect(uploadImage(file)).rejects.toThrow(NOT_AN_IMAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends octet-stream for an image the browser gave no type", async () => {
    fetchMock.mockResolvedValue(json(HERO, 201));
    const file = new File(["x"], "photo.webp");
    await uploadImage(file);
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
      "application/octet-stream"
    );
  });
});

describe("isImageFile", () => {
  it("trusts the MIME type, and the extension only when there is none", () => {
    expect(isImageFile(new File([""], "a.png", { type: "image/png" }))).toBe(
      true
    );
    expect(isImageFile(new File([""], "a.png", { type: "text/plain" }))).toBe(
      false
    );
    expect(isImageFile(new File([""], "a.svg"))).toBe(true);
    expect(isImageFile(new File([""], "a.pdf"))).toBe(false);
  });
});
