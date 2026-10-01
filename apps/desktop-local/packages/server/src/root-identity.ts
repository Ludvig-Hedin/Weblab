import { lstatSync, realpathSync } from "node:fs";

export const MOVED_PROJECT_MESSAGE =
  "The site folder moved or changed. Close this site and reopen it from Sites before editing.";

/** A running editor never switches its filesystem target behind the user. */
export function captureProjectRoot(root: string): () => void {
  const canonical = realpathSync(root);
  const original = lstatSync(root, { bigint: true });
  if (!original.isDirectory() || original.isSymbolicLink()) {
    throw new Error(MOVED_PROJECT_MESSAGE);
  }
  let invalid = false;
  return () => {
    if (!invalid) {
      try {
        const current = lstatSync(root, { bigint: true });
        invalid =
          !current.isDirectory() ||
          current.isSymbolicLink() ||
          current.dev !== original.dev ||
          current.ino !== original.ino ||
          current.birthtimeNs !== original.birthtimeNs ||
          realpathSync(root) !== canonical;
      } catch {
        invalid = true;
      }
    }
    if (invalid) {
      throw new Error(MOVED_PROJECT_MESSAGE);
    }
  };
}
