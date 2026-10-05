/**
 * Which image the panel is showing right now, for callers outside the panel.
 *
 * The canvas (double-click on an image, the context menu, a file dropped on
 * the page) wants to say "edit this image" without knowing which section
 * rendered it or how. The Media section registers an opener for the image row
 * it rendered and unregisters it when that row is torn down, so there is at
 * most one live entry and it always belongs to the current selection.
 *
 * It also carries one small piece of hand-off state: a popover that closes
 * because its own write rebuilt the panel asks to be reopened, and the section
 * that renders the replacement row picks that up. See `requestImageEditorReopen`.
 */

interface Entry {
  applyUrl?: (url: string) => void;
  open: () => void;
  replaceFromFile?: (file: File) => Promise<boolean>;
}

let active: Entry | null = null;

/**
 * Make `open` the answer to `openActiveImageEditor`. Returns the unregister.
 *
 * The unregister only clears its own entry, so a late teardown of an old row
 * cannot remove the row that replaced it.
 */
export function registerImageEditor(
  open: () => void,
  replaceFromFile?: (file: File) => Promise<boolean>,
  applyUrl?: (url: string) => void
): () => void {
  const entry: Entry = { applyUrl, open, replaceFromFile };
  active = entry;
  return () => {
    if (active === entry) {
      active = null;
    }
  };
}

/** Open the image popover for the selected image. False when there is none. */
export function openActiveImageEditor(): boolean {
  if (!active) {
    return false;
  }
  active.open();
  return true;
}

/**
 * Upload a file and make it the selected image's source.
 *
 * Resolves `false` when no image is selected. Rejects with a readable `Error`
 * when the upload fails (not an image, server down), so the caller can say so.
 */
export function replaceImageFromFile(file: File): Promise<boolean> {
  const replace = active?.replaceFromFile;
  return replace ? replace(file) : Promise.resolve(false);
}

/**
 * Make an image already in the project the selected image's source, as one
 * undo step. False when no image is selected. Used by the Assets tab.
 */
export function applyImageUrl(url: string): boolean {
  const apply = active?.applyUrl;
  if (!apply) {
    return false;
  }
  apply(url);
  return true;
}

const reopen = new Set<string>();

/**
 * Ask for an image popover to be opened again on the row that replaces its anchor.
 *
 * Some writes change what the panel contains (the first image layer on an
 * element adds a Background block), and the panel rebuilds — closing every
 * popover, including the one the user is working in. The request lives for one
 * task: it is consumed by the rebuild that caused it, or it lapses.
 */
export function requestImageEditorReopen(key: string): void {
  reopen.add(key);
  setTimeout(() => reopen.delete(key), 0);
}

/** True once for a pending reopen request with this key. */
export function consumeImageEditorReopen(key: string): boolean {
  return reopen.delete(key);
}
