// biome-ignore-all lint/correctness/noUndeclaredVariables: JavaScript for Automation supplies ObjC, Ref and $ through its Foundation bridge.
// Foundation-only ordinary bookmarks. Never ask Finder to locate or mount a folder.
ObjC.import("Foundation");

// biome-ignore lint/correctness/noUnusedVariables: osascript invokes the required JXA run entry point.
function run(argv) {
  try {
    if (argv.length !== 1 || argv[0].length > 70_000) {
      throw new Error("invalid_input");
    }
    const input = JSON.parse(argv[0]);
    const error = Ref();
    if (input.operation === "create") {
      if (
        typeof input.path !== "string" ||
        input.path.length > 4096 ||
        input.path[0] !== "/"
      ) {
        throw new Error("invalid_input");
      }
      const url = $.NSURL.fileURLWithPath(input.path);
      const bookmark =
        url.bookmarkDataWithOptionsIncludingResourceValuesForKeysRelativeToURLError(
          0,
          $(),
          $(),
          error
        );
      return JSON.stringify({
        bookmark: ObjC.unwrap(bookmark.base64EncodedStringWithOptions(0)),
      });
    }
    if (input.operation === "resolve") {
      if (
        typeof input.bookmark !== "string" ||
        input.bookmark.length > 65_536
      ) {
        throw new Error("invalid_input");
      }
      const data = $.NSData.alloc.initWithBase64EncodedStringOptions(
        input.bookmark,
        0
      );
      const stale = Ref();
      const resolved =
        $.NSURL.URLByResolvingBookmarkDataOptionsRelativeToURLBookmarkDataIsStaleError(
          data,
          768,
          $(),
          stale,
          error
        );
      return JSON.stringify({
        path: ObjC.unwrap(resolved.path),
        stale: Boolean(stale[0]),
      });
    }
    throw new Error("invalid_input");
  } catch {
    return JSON.stringify({ error: "bookmark_unavailable" });
  }
}
