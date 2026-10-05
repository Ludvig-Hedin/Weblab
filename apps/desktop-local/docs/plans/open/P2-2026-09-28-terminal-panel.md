---
stage: brainstorm
priority: P2
owner:
created: 2026-09-28
artifact: docs/plans/assets/P2-2026-09-28-terminal-panel.html
prototype: docs/plans/assets/P2-2026-09-28-terminal-panel-prototype.html
---

# Terminal in the floating toolbar

You can open a real terminal from the editor's floating toolbar, with the
terminal button or Cmd+J, run any command in your site's folder, watch the dev
server's output, and ask for a command in plain words.

## Summary

| | |
|---|---|
| What | A terminal button at the end of the floating toolbar. Press it or Cmd+J and the toolbar grows upward into one card: terminal tabs on top, the same toolbar buttons at the bottom. |
| Why now | Old Weblab had a terminal and the new app does not, so running `npm install`, `git status` or reading a build error means leaving Weblab. Old Weblab's terminal also ran one line at a time and often showed no output, so copying it as-is is not enough. |
| Effort | About 6 days, in 4 slices: real shell (2 days), panel and tabs (2 days), dev server log (half a day), AI helper (1.5 days). |
| The ask | Build all four slices as drawn, or ship slices 1 to 3 first and add the AI helper later? |

## Owner decisions (2026-09-28)

- The terminal opens from the **floating toolbar** at the bottom, not the top bar.
- It **grows upward**, like old Weblab. The toolbar buttons stay where they are.
- **Many tabs** with a + button, like old Weblab, plus a **Dev server** log tab.
- **Include the AI helper**: type what you want in words, get a command to review.

## What I assumed

1. **It is a real shell**, not old Weblab's one-line runner. Colours, prompts,
   `vim`, `Ctrl+C` and interactive installers all work. This needs a native
   terminal module on the server side (`@lydell/node-pty`, prebuilt binaries
   per platform).
2. **Works in the desktop app and the browser editor** (`npx` CLI), because the
   shell runs in the local editor server both already start. It is **off**
   under `--safe`, and off when the server listens beyond this computer
   (`--host` other than loopback) unless `--terminal` is passed. The button is
   hidden when it is off.
3. **Shells open in the site's folder** with the user's real login shell
   (`os.userInfo().shell`, then `-l`), PowerShell on Windows. The shell gets a
   **cleaned environment**: none of Weblab's own variables (API key,
   `ELECTRON_RUN_AS_NODE`, `PORT`, `NO_COLOR`, `FORCE_COLOR`, the desktop's
   fixed `PATH`, `SHELL=/bin/sh`).
4. **Closing the panel stops nothing.** Shells keep running while it is hidden,
   and a page reload reconnects with their recent output. Full-screen programs
   like `vim` may need a keypress to redraw after a reload.
5. **Shells stop when the editor stops**, including switching sites or quitting
   the desktop app. No warning in v1.
6. **Closing a tab ends what runs in it, with no question**, like VS Code.
7. The panel starts closed on every launch. Tabs are not kept after quitting.
   Fixed height (352px), no drag to resize in v1.
8. **The AI helper works with Claude in v1** (the desktop app always runs
   Claude). With Codex or OpenCode picked, the sparkle is hidden. It always
   shows the command **plus one plain sentence** of what it does, and waits for
   Enter. No "run without asking" switch.
9. **Cmd+J inside a Chrome tab** may open Downloads on some setups. The button
   always works. In the desktop app Cmd+J always works, even while typing in
   the terminal.
10. The Dev server tab only shows when Weblab started the dev server itself (the
    desktop app always does; the CLI does with `--exec`).
11. While you type in the terminal, Cmd+J is the only editor shortcut that
    works. Cmd+Z, Delete and Cmd+K do **not** act on the canvas. They work
    again once you click the canvas.

## What changes

| What | Where | Why |
|---|---|---|
| Terminal button, last in the bar | `packages/overlay/src/app.ts` (`buildBar`) | One press to open. Icon swaps to a down chevron while open. Hidden in inline mode and when the terminal is off. |
| New `terminal` and `sparkle` glyphs | `packages/editor-icons` | The set has neither today. |
| Cmd+J | `packages/overlay/src/keys/catalog.ts`, `app.ts` (`bindEditorKeys`) | Free chord. `allowWhileTyping`, so it works inside the terminal. |
| Toolbar grows into a card | new `packages/overlay/src/terminal/` + `styles/terminal.css.ts` | Terminal and tools read as one object. |
| xterm as its own script | third tsup entry `terminal.global.js`, route in `proxy.ts` `serveAirshipAsset`, copy in `apps/cli/scripts/vendor-assets.mjs` | Keeps 300 KB off every page load. |
| Real shell sessions | new `packages/server/src/terminal.ts` | Runs the shell, keeps recent output, stops it cleanly. |
| New socket messages | `packages/protocol/src/index.ts` | `term:*` for open, type, resize, output, exit. |
| Native module shipping | `apps/cli/package.json`, `pnpm-workspace.yaml`, `apps/desktop` build + `scripts/stage.mjs` | Module installs, is signed and stays executable. |
| Dev server output | `apps/cli/src/lib/exec.ts`, `commands/serve.ts` | Copies the dev server's output into a buffer the Dev server tab reads. |
| AI suggestion | `packages/core` (new one-shot method on the Claude adapter) + server handler | One small request per use. |
| Security note | `SECURITY.md` | Says plainly what the terminal can reach and when it is off. |
| Docs | `CONTROLS.md`, `README.md` via `make controls` | The controls test fails otherwise. |

## What it looks like

See the page for frames and the prototype file for a pressable version: closed
bar, open card with tabs, the Dev server tab, the AI helper (asking, thinking,
suggestion with a plain sentence, no answer), and the states (starting, could
not start, shell ended, no tabs left, reconnecting, eight-tab limit).

Geometry, in the overlay's own tokens:

- Card: `--ap-surface-panel`, `--ap-border-subtle` hairline, `--ap-radius-lg`,
  `--ap-shadow-sm`, 6px pad. Today's `.bar` recipe, so the closed state is
  today's bar plus one button.
- Terminal area: `min(640px, space between the two docks minus 32px)` wide,
  352px tall.
- Tab strip: 28px tall (`--ap-control-icon-box`), tabs use the `.seg` recipe
  (soft fill on the active tab), 11px label, close `x` on shell tabs. `+` at the
  end, disabled at 8 tabs with the tooltip "Eight terminals is the most".
  Sparkle toggle at the far right.
- Terminal text: JetBrains Mono (`--ap-font-mono`, already served), 12px, line
  height 1.4, on a `--ap-surface-base` inset with `--ap-radius-sm`.
- Colours: ANSI palette from `--ap-*` tokens (text primary, semantic success,
  warning, error, blue 400).
- Toasts (`toast.css.ts`, today `bottom: 76px`) move up above the card while it
  is open, via a `--airship-bar-h` custom property the card sets.
- Button placement: last in the row. That shifts Edit/View about 18px left of
  centre in the browser editor. In the desktop app the help pair already moves
  to the top bar, so the shift there is smaller than today's help pair. Accepted.

## Motion

- Open: the card animates width and height from the bar's size to its open size
  over `--ap-motion-dur-slow` (200ms) with `--ap-motion-ease-out`. Terminal
  content fades in over 150ms, starting 60ms in.
- Close: same curve, content fades out first in 100ms (`dur-micro`).
- The tool row does not move. The card is centred the same way the bar is today
  (`left: 50%` with the dock inset maths), and the row is a plain child.
- Release to `auto` on `transitionend` **or** a 250ms timeout, whichever comes
  first. Reduced motion gives a 0s duration and no `transitionend` event, so the
  timeout is required.
- `prefers-reduced-motion`: instant, via the existing `motion.css.ts`.
- xterm is mounted on first open and kept mounted, so later opens do not re-fit.

## What it costs

- **No new cost for the terminal or the Dev server tab.**
- **AI helper:** one small request per suggestion to Claude Haiku 4.5 with the
  system prompt replaced by a short one, about 1,500 tokens in and 60 out,
  roughly **0.02 kr per suggestion** on an API key. On a Claude subscription it
  counts against the user's normal limits. Weblab pays nothing.
- xterm.js adds about 300 KB, loaded only on first open.
- The native shell module adds about 2 MB to the CLI package and the desktop
  app (desktop is arm64-only today).

## What could go wrong

| Risk | Mitigation |
|---|---|
| The shell module fails to load or run | Spike first in slice 1 under Electron's Node and plain Node. On failure the panel says "Terminal could not start" with the reason; the rest of the editor keeps working. |
| Something other than the user reaches the shell | Off under `--safe` and on non-loopback hosts unless opted in. Same Host and Origin checks as today on loopback. `SECURITY.md` says plainly that scripts in the user's own site page share the editor's origin and could reach it, as they can already reach the agent. |
| Weblab's own secrets leak into the shell | Cleaned env, tested: `env` in the shell shows no `ANTHROPIC_API_KEY`, `ELECTRON_RUN_AS_NODE`, `PORT` or `NO_COLOR`. |
| Signing or file mode breaks the desktop build | `pty.node` and `spawn-helper` added to `mac.binaries`, `+x` restored after `pnpm deploy`, and `stage.mjs` fails the build if either is missing. Reuse `reference/t3code`'s node-pty adapter code. |
| Peer edits in the same files | `app.ts`, `CONTROLS.md`, `README.md` and the desktop files have uncommitted peer edits now. Build after they land; stage only owned hunks. |
| No Mac CI | CI runs Ubuntu and Windows only. Mac, the only desktop platform, is checked by hand before merge. |

## How it is built

### Slice 1: real shell on the server (2 days)

- `packages/server/src/terminal.ts`: `TerminalHost`.
  - `open({ id, cols, rows })` spawns `@lydell/node-pty` with
    `os.userInfo().shell` and `-l` (PowerShell on Windows), `cwd` = project root.
  - Env: start from `process.env`, delete `ANTHROPIC_API_KEY`,
    `ELECTRON_RUN_AS_NODE`, `PORT`, `NO_COLOR`, `FORCE_COLOR`, `SHELL`, and the
    desktop's `PATH` override (the login shell rebuilds `PATH`). Set
    `TERM=xterm-256color`, `COLORTERM=truecolor`, `SHELL` to the real shell.
  - Ring buffer per session, 256 KB, replayed on reconnect.
  - `write`, `resize`, `close` (SIGHUP, SIGKILL after 2s; `pty.kill()` on
    Windows). `dispose()` on server shutdown, hooked into the same path as
    `exec.ts`'s `killTree`.
  - Max 8 sessions; the 9th is refused with `term:error`.
  - Lazy `import()` of the native module; a load failure becomes a message.
  - Output coalesced for 8ms before sending.
- Gate: `terminalEnabled = !safe && (isLoopback(host) || flags.terminal)`.
  Flags `--terminal` and `--no-terminal` in `apps/cli/src/lib/args.ts` and
  `usage.ts`. The server tells the overlay with a `term:available` event on
  connect.
- Protocol (`packages/protocol/src/index.ts`), zod:
  - Client: `term:open {id, cols, rows}`, `term:input {id, data}` (max 64 KB),
    `term:resize`, `term:close {id}`, `term:list`, `term:suggest {prompt}`.
  - Server: `term:available {enabled, devServer, ai}`, `term:output {id, data}`,
    `term:exit {id, code}`, `term:list {sessions}`, `term:error {id?, message}`,
    `term:suggestion {command, explanation} | {none: true}`.
- `packages/server/src/index.ts` `handleMessage` routes `term:*`. No
  per-connection ownership (the server cannot tell shell from frame clients,
  see `index.ts:228` and `proxy.ts:285`); the gate above is the boundary.
- Packaging: `@lydell/node-pty` in `apps/cli/package.json` dependencies (the
  server is inlined by tsup, third-party stays external). Pin its platform
  packages in `pnpm-workspace.yaml` `minimumReleaseAgeExclude` like esbuild.
  Desktop: `mac.binaries` += `pty.node`, `spawn-helper`; chmod `+x` after
  `pnpm deploy` in `stage.mjs`, and assert both exist.
- Proves it: `terminal.test.ts` opens a session, writes `echo $((6*7))\r` (or
  `6*7` on PowerShell), asserts `42` in output, resizes, closes, sees exit.
  A second test asserts the cleaned env. Ubuntu and Windows CI; Mac by hand,
  including inside the packaged desktop app.

### Slice 2: the panel, tabs, Cmd+J (2 days)

- xterm bundle: third tsup entry in `packages/overlay/tsup.config.ts`
  (`src/terminal/xterm-entry.ts` to `terminal.global.js`, IIFE, exposes
  `window.__airshipXterm`), export in the overlay `package.json`, route
  `/__airship/terminal.js` in `proxy.ts` `serveAirshipAsset`, copy step in
  `apps/cli/scripts/vendor-assets.mjs`. The overlay injects the script tag on
  first open. xterm's CSS ported into `styles/terminal.css.ts`, scoped under
  the overlay root with enough specificity to beat site CSS.
- `packages/overlay/src/terminal/panel.ts`: `TerminalPanel` with `el()`/`cls()`.
  Owns tabs and xterm instances. Theme from `--ap-*` via `getComputedStyle`.
  ResizeObserver calls `fit()` and sends `term:resize`.
- `buildBar()`: wrap in a `.bar-card` column; terminal region first, existing
  row second. Button via `iconButton("terminal", "Terminal", toggle,
  "view.terminal")`, last, outside both mode lists. Not built in inline mode or
  when `term:available.enabled` is false.
- Animation as in Motion, with the timeout fallback. `inert` + `aria-hidden`
  when closed. Toasts offset via `--airship-bar-h`.
- Catalog: `view.terminal`, `mod+j`, mode `any`, `inFrame: true`,
  `allowWhileTyping: true` (xterm types into a textarea, which
  `isTypingTarget` otherwise blocks, `registry.ts:576`). No tab-switch chords
  in v1: `mod+shift+]` never matches (`registry.ts:69-76, 248`, no bracket
  codes) and browsers use it for tabs.
- Other editor chords are suppressed while xterm has focus, by the existing
  typing-target rule.
- Tabs: first open creates "Terminal". `+` adds "Terminal 2", "Terminal 3";
  disabled at 8. Close with `x` or `exit` (tab closes on `term:exit`). Last
  shell tab closed: empty state "No terminals open" with a "New terminal"
  button. Restored from `term:list` on reload.
- Reconnecting: input blocked, overlay line "Reconnecting to the editor. Your
  commands keep running."
- Styles registered in the `CSS` array before `motion.css.ts`; Z from
  `styles/const.ts`; `check-css.mjs` and `styles/index.test.ts` pass.
- Proves it: overlay unit tests for toggle, tab add/close/limit, and the
  empty state; one Storybook story with the open card; `make controls`;
  `controls-doc.test.ts` green.

### Slice 3: Dev server tab (half a day)

- `apps/cli/src/lib/exec.ts`: `stdio: ["ignore", "pipe", "pipe"]` in both
  quiet and normal modes, child env `FORCE_COLOR=1` (and remove `NO_COLOR`) so
  colours survive the pipe. Tee to `process.stderr` unless quiet, and always to
  a 256 KB ring buffer.
- Pass the buffer into `startServer` (`commands/serve.ts:318-345`), exposed as
  the read-only session `dev-server`.
- Tab "Dev server", first, no close, `disableStdin`. When the dev server exits:
  "Dev server stopped (code 1). Open the site again to restart it."
- Hidden when there is no `--exec`.
- Proves it: exec test asserts output reaches the buffer in quiet mode and both
  places in normal mode.

### Slice 4: AI helper (1.5 days)

- New one-shot method `suggestCommand(prompt, context)` on the Claude adapter
  in `packages/core` (the `AgentAdapter` today only has `run`). Claude Haiku
  4.5, replaced system prompt, no tools, 15s timeout. Returns
  `{command, explanation}` as JSON or `{none: true}`.
- Context: OS, shell, the project's `package.json` scripts and package manager.
- Sparkle toggle shows a field under the terminal: "Describe a command, like:
  install tailwind". States: asking, thinking ("Finding a command"), suggestion
  (command in mono plus the one-sentence explanation, "Enter to run, Esc to
  cancel"), none ("No command found. Try other words."), error ("Claude is not
  signed in" / "Took too long, try again").
- Enter writes the command plus `\r` to the active tab. Hidden on the Dev
  server tab and when the agent is not Claude.
- Proves it: core unit test with a stubbed model; overlay test for each state.

### Checks

- Focused tests per slice, `make check` once before merge when the owner asks.
- Manual on Mac, desktop app and browser: open, `npm run build`, `vim`,
  `Ctrl+C` a running server, reload and see output return, Cmd+J from inside
  the terminal, `env` shows no API key, `--safe` hides the button.

## Not in this plan

- Drag to resize, reorder tabs, rename tabs.
- Restarting the dev server from its tab.
- Keeping tabs after quitting, or warning before quitting with shells running.
- Tab-switch shortcuts.
- AI helper for Codex and OpenCode.
- Split panes.

## The decision

Build all four slices as drawn? Or ship slices 1 to 3 first (about 4.5 days)
and add the AI helper after a week of use?
