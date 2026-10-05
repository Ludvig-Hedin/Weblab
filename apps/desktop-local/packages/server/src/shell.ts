/**
 * The canvas shell document.
 *
 * In canvas mode the proxy stops serving the app's HTML at the top level and
 * serves this instead. The app still runs — one full copy per frame, inside
 * same-origin iframes the shell creates — but it no longer shares a document
 * with the editor.
 *
 * That separation is the point. Until now the overlay lived inside the app and
 * had to defend itself from it: scoped CSS variables so the app's `:root` didn't
 * bleed in, a `__airship-` prefix on every class, and a `z-index` of 2147483600
 * to stay on top. None of the app's CSS reaches this document, so the editor
 * finally has a clean page of its own.
 *
 * Deliberately minimal: no app CSS, no framework, no build step. Fonts resolve
 * same-origin from `/__airship/fonts/*` (see `serveAirshipAsset`), and every
 * pixel of UI is drawn by the overlay bundle.
 */
import type { AirshipWindowConfig } from "@airship/protocol";

/**
 * The tab icon: Weblab's brand mark, inlined.
 *
 * A data URI rather than a route, for the same reason this file has no build
 * step — the favicon is the first thing a browser asks for, and serving it
 * would mean a second round trip and another branch in `serveAirshipAsset` for
 * ~1 KB. `editor-icons/assets/local/logo.svg` is the geometry of record (the
 * Weblab symbol, pre-scaled into the 24 box); this is a copy of its three
 * paths, and the two change together.
 *
 * Two differences from the in-UI glyph, both because a favicon is 16 physical
 * pixels:
 *
 * - The viewBox is cropped to `5.2 5.2 13.6 13.6` instead of the full 24 box.
 *   The set's optical inset gives back a third of the tab icon as empty margin,
 *   which matters at 24px and is waste at 16.
 * - Full opacity, not the set's 0.9. That step exists to seat a glyph among
 *   other glyphs; in a tab strip there is nothing to seat it against.
 *
 * The colour comes from a `prefers-color-scheme` rule because the tab strip
 * follows the *browser's* theme, not this page's — the shell is always dark,
 * the chrome around it is not. Black is the base so that a renderer which
 * ignores the query still lands on the readable answer for a default light
 * tab strip.
 */
const FAVICON =
  "data:image/svg+xml," +
  "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='5.2 5.2 13.6 13.6'%3E" +
  "%3Cstyle%3Epath{fill:%23000}" +
  "@media(prefers-color-scheme:dark){path{fill:%23fff}}%3C/style%3E" +
  "%3Cpath d='" +
  "M7.72 5.6C7.94 5.58 8.14 5.69 8.14 5.92C8.15 6.34 8.15 6.76 8.15 7.18L8.15 10.92" +
  "L8.15 12C8.15 12.18 8.13 12.38 8.16 12.56C8.17 12.65 8.25 12.72 8.31 12.77C8.66 " +
  "13.05 10.58 13.97 10.67 14.23C10.73 14.42 10.69 15.97 10.69 16.27C10.69 16.83 10" +
  ".72 17.41 10.69 17.97C10.69 18.02 10.67 18.08 10.65 18.13C10.61 18.2 10.54 18.27" +
  " 10.46 18.3C10.21 18.38 9.46 17.86 9.22 17.72C8.96 17.56 8.69 17.42 8.42 17.26C8" +
  ".28 17.18 8.15 17.07 8.15 16.89C8.12 16.09 8.15 15.28 8.14 14.48C8.14 14.06 7.91" +
  " 14.02 7.59 13.84L6.4 13.15C5.55 12.67 5.6 12.86 5.6 11.87L5.6 10.81L5.6 7.43C5." +
  "6 7.3 5.59 6.87 5.68 6.8C5.98 6.57 6.41 6.34 6.74 6.15C7.03 5.99 7.44 5.73 7.72 " +
  "5.6ZM12.79 7.08C13.32 7.02 13.22 7.46 13.23 7.82C13.24 8.01 13.23 8.2 13.23 8.38" +
  "L13.23 11.35L13.23 12.15C13.23 12.27 13.22 12.42 13.24 12.54C13.25 12.63 13.32 1" +
  "2.7 13.39 12.76C13.76 13.08 15.63 13.94 15.75 14.23C15.81 14.39 15.8 16.25 15.77" +
  " 16.52C15.77 16.56 15.76 16.61 15.74 16.65C15.7 16.73 15.63 16.81 15.54 16.83C15" +
  ".29 16.9 14.52 16.37 14.27 16.23C14.03 16.08 13.51 15.82 13.33 15.65C13.07 15.41" +
  " 13.38 14.43 13.14 14.14C13.05 14.03 12.71 13.86 12.57 13.78L11.46 13.14C10.63 1" +
  "2.66 10.69 12.83 10.69 11.87L10.69 10.76C10.69 10.04 10.68 9.31 10.69 8.59C10.69" +
  " 8.52 10.71 8.4 10.73 8.33C10.74 8.28 10.85 8.2 10.89 8.17C11.19 8 11.48 7.81 11" +
  ".78 7.65C12.11 7.47 12.45 7.24 12.79 7.08ZM17.93 8.53C18.04 8.52 18.29 8.62 18.3" +
  " 8.75C18.35 10.34 18.31 11.95 18.32 13.54C18.32 13.6 18.3 13.67 18.28 13.72C18.0" +
  "5 14.19 17.12 13.47 16.8 13.29C16.57 13.15 16.01 12.86 15.84 12.69C15.73 12.58 1" +
  "5.78 11.49 15.77 11.26C15.76 10.85 15.78 10.44 15.78 10.02C15.78 9.95 15.8 9.76 " +
  "15.86 9.72C16.16 9.51 16.55 9.29 16.87 9.12C17.14 8.96 17.66 8.63 17.93 8.53Z" +
  "'/%3E" +
  "%3C/svg%3E";

/**
 * `</script>` inside a JSON string would close the tag early; U+2028 and U+2029
 * are legal in JSON but are line terminators to a JS parser, so both have to be
 * escaped before the config can be inlined into a `<script>`.
 *
 * Exported because the inline injection embeds the same config into the app's
 * own HTML, and that config now carries a `pathname` taken from the request —
 * i.e. a string the page's author does not control.
 */
export function escapeForScript(json: string): string {
  return json.replace(/[<\u2028\u2029]/g, (c) => {
    if (c === "<") {
      return "\\u003c";
    }
    return c === "\u2028" ? "\\u2028" : "\\u2029";
  });
}

export function shellHtml(config: AirshipWindowConfig): string {
  const json = escapeForScript(JSON.stringify(config));
  return `<!doctype html>
<html lang="en" data-airship-shell>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex">
<title>Weblab</title>
<link rel="icon" href="${FAVICON}">
<style>
/* Painted before the bundle runs so the canvas never flashes white. */
html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#141414;}
</style>
<script>window.__AIRSHIP__=${json};</script>
</head>
<body>
<script src="/__airship/overlay.js"></script>
</body>
</html>
`;
}
