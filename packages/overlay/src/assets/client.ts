/**
 * The project's image assets, as the editor server reports them.
 *
 * Two calls: list what is in the user's `public/` folder, and upload a new file
 * into it. Both go to the proxy origin by a root-relative path — the same way
 * the control socket is reached (`ws.ts` builds `location.host` + `/__airship/ws`).
 * In canvas mode the overlay runs in the shell document, which is served from
 * that same origin, so no base URL has to be threaded through.
 *
 * The list is cached in memory, because the image popover asks for it every
 * time it opens and the folder rarely changes between two clicks. An upload is
 * the one thing that changes it from here, so an upload drops the cache.
 */

export interface AssetImage {
  bytes: number;
  modified: number | string;
  name: string;
  /** Path on disk, relative to the project root. */
  path: string;
  /** What to put in `src` — served by the user's dev server. */
  url: string;
}

interface AssetList {
  images: AssetImage[];
  root: string;
}

const ENDPOINT = "/__airship/api/assets";

/** Extensions accepted when the browser reports no MIME type for a file. */
const IMAGE_EXT = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

export const NOT_AN_IMAGE = "That file is not an image.";
const UNREACHABLE =
  "Could not reach the editor server. Check that it is still running.";

let cache: Promise<AssetImage[]> | null = null;
/** The last list the server actually returned, for showing at once. */
let last: AssetImage[] | null = null;

/** True for a file the editor should accept as an image. */
export function isImageFile(file: File): boolean {
  if (file.type) {
    return file.type.startsWith("image/");
  }
  return IMAGE_EXT.test(file.name);
}

/** Forget the cached list, so the next `listImages` asks the server again. */
export function invalidateImages(): void {
  cache = null;
}

/** The last list the server returned, without asking again. Null before any. */
export function peekImages(): AssetImage[] | null {
  return last;
}

/** The server's own words when it sent any, else a plain fallback. */
async function errorFrom(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.trim()) {
      return new Error(body.error);
    }
  } catch {
    // Not JSON. The fallback below says what happened well enough.
  }
  return new Error(fallback);
}

async function send(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (cause) {
    throw new Error(UNREACHABLE, { cause });
  }
}

async function fetchList(): Promise<AssetImage[]> {
  const response = await send(ENDPOINT, { cache: "no-store" });
  if (!response.ok) {
    throw await errorFrom(response, "Could not load the project images.");
  }
  const body = (await response.json()) as Partial<AssetList>;
  return Array.isArray(body.images) ? body.images : [];
}

/**
 * The project's images, newest first.
 *
 * Cached; `fresh` asks the server again regardless, which is what the popover
 * does each time it opens (it shows `peekImages()` meanwhile), so files added
 * to `public/` outside the editor turn up. A failed request is not cached.
 */
export function listImages(
  options: { fresh?: boolean } = {}
): Promise<AssetImage[]> {
  if (!cache || options.fresh) {
    const pending = fetchList();
    cache = pending;
    pending.then(
      (list) => {
        last = list;
      },
      () => {
        if (cache === pending) {
          cache = null;
        }
      }
    );
  }
  return cache;
}

/** Save a file into the project's `public/` folder and return where it landed. */
export async function uploadImage(file: File): Promise<AssetImage> {
  if (!isImageFile(file)) {
    throw new Error(NOT_AN_IMAGE);
  }
  const response = await send(
    `${ENDPOINT}?name=${encodeURIComponent(file.name)}`,
    {
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw await errorFrom(response, "The upload did not go through.");
  }
  invalidateImages();
  return (await response.json()) as AssetImage;
}
