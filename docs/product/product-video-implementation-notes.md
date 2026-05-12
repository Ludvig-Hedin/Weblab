# Weblab Product Explainer Video — Implementation Notes

Companion to [`product-video-plan.md`](./product-video-plan.md). Records what was actually built, where it lives, what's missing, and how to iterate.

## Selected storyboard

**Storyboard A — "From prompt to polished site"** (per plan §5).

10 scenes, 75s total, 16:9 (1920×1080). Implemented as deterministic HyperFrames composition (HTML + CSS + GSAP + Tailwind v4 browser-runtime) with simplified, brand-faithful product UI mockups in place of real screen recordings. Captions sync to the planned voiceover script.

## Folder path

```
apps/web/product-video/
├── index.html                       # root composition, 75s, 1920×1080
├── design.md                        # brand pin (tokens, typography, motion tone)
├── voiceover-script.md              # script + cue table for ElevenLabs/Kokoro
├── package.json                     # npm scripts (dev / check / render / publish)
├── meta.json                        # project metadata
├── hyperframes.json                 # registry/paths config
├── CLAUDE.md / AGENTS.md            # generated agent guidance
├── compositions/
│   ├── captions.html                # caption overlay (full duration)
│   ├── scene-01-logo.html           # 0–3s    cold open, brand mark
│   ├── scene-02-prompt.html         # 3–8s    Create composer w/ typed prompt
│   ├── scene-03-generate.html       # 8–14s   editor reveal, pricing page
│   ├── scene-04-style-edit.html     # 14–24s  selection + padding slider
│   ├── scene-05-ai-chat.html        # 24–34s  chat refinement w/ stream
│   ├── scene-06-ast-diff.html       # 34–46s  layers tree + JSX diff overlay
│   ├── scene-07-responsive.html     # 46–58s  3-frame breakpoint switcher
│   ├── scene-08-publish.html        # 58–66s  publish dropdown → URL bar
│   ├── scene-09-live-site.html      # 66–72s  browser frame, live URL
│   └── scene-10-end-card.html       # 72–75s  wordmark + tagline + URL
├── assets/
│   ├── brand/
│   │   ├── logo.svg                 # combined mark + wordmark
│   │   ├── symbol.svg               # mark only
│   │   └── wordmark.svg             # wordmark only
│   ├── audio/                       # empty — VO not generated
│   └── captures/                    # empty — real screen recordings deferred
└── out/
    └── weblab-explainer-v1.mp4      # 2.6 MB · 75s · 2250 frames @ 30fps
```

## Render commands

All commands run from `apps/web/product-video/`. The npm scripts pin `hyperframes@0.5.5`.

```bash
cd apps/web/product-video

# Preview studio (live editor, watches files)
npm run dev

# Lint + validate + inspect (full check)
npm run check

# Render to MP4 (default output: out/{project}.mp4)
npm run render -- --output out/weblab-explainer-v1.mp4

# Publish a shareable link
npm run publish
```

If the global `npx` cache is corrupt (seen in this build), set a writable cache dir:

```bash
mkdir -p "$TMPDIR/npm-cache-hf"
npm_config_cache="$TMPDIR/npm-cache-hf" npx -y hyperframes@0.5.5 render --output out/weblab-explainer-v1.mp4
```

If the runtime requires headless Chrome to listen on a local port (validate / render / inspect), the harness sandbox must allow it. If the sandbox blocks the listen, re-run with sandboxing disabled (Claude Code: re-issue with `dangerouslyDisableSandbox: true` or use `/sandbox` to broaden allowlist).

## Asset status

| Asset | Status | Path | Notes |
|-------|--------|------|-------|
| Wordmark SVG | ✅ Present | `assets/brand/wordmark.svg` | Reused from `apps/web/client/public/brand/wordmark.svg`. |
| Symbol SVG | ✅ Present | `assets/brand/symbol.svg` | Reused. |
| Logo SVG | ✅ Present | `assets/brand/logo.svg` | Reused. |
| Brand tokens | ✅ Present | `design.md` | Mirrors `packages/ui/src/globals.css`. |
| Voiceover audio | ❌ Missing | `assets/audio/` (empty) | ElevenLabs API not configured. Script in `voiceover-script.md`. Composition runs without audio. |
| Music pad | ❌ Missing | `assets/audio/` (empty) | License decision pending (plan §"Open Decisions"). |
| SFX | ❌ Missing | `assets/audio/` (empty) | Decision pending. |
| Real homepage Create-composer recording | ❌ Substituted | scene 2 | Stylized HTML+CSS recreation of the actual `Create` component. Brand-accurate; not a literal screenshot. |
| Real editor screen recordings (scenes 3–8) | ❌ Substituted | scenes 3–8 | Stylized recreations using Weblab tokens, layout, and component patterns. Demo project + deploy URL still pending — see plan §"Open Decisions". |
| Real deployed pricing page (scene 9) | ❌ Substituted | scene 9 | Stylized clean-browser frame with `pricing-demo.weblab.build` URL bar. |

## Substituted product UI — rationale

Plan §6 explicitly allowed: *"prefer simplified recreated UI if it gives cleaner motion and less technical risk"*. Real screen recordings require:

1. A seeded demo project (the prompt result).
2. A reserved `*.weblab.build` deploy URL.
3. A controlled cursor path that's deterministic across recording takes.

None of those are available in this build session. Recreated UI gives:

- Deterministic GSAP animation that survives re-renders byte-for-byte.
- No video-decode complexity in the render pipeline (the render reports `videoCount: 0`).
- 1:1 fidelity to the actual app's tokens (#131314 bg, #3d8bfd accent, Inter, 16px radius).
- Easy swap-in later: each scene is an isolated sub-comp; replace the inner HTML with a `<video>` clip when real recordings exist.

When real captures are recorded, swap inside the relevant scene file:

```html
<!-- replace the recreated UI block with -->
<video class="clip" id="capture" data-start="0" data-duration="6" data-track-index="0"
       src="../assets/captures/scene-03.mp4" muted playsinline></video>
```

## Validation results

Run from `apps/web/product-video/`. Output captured in this build:

| Command | Result |
|---------|--------|
| `npx hyperframes lint` | ✅ 0 errors, 210 warnings (all `composition_self_attribute_selector` — cosmetic) |
| `npx hyperframes validate` | ✅ 0 errors, 0 lint warnings, ⚠ 250 contrast warnings (all on small UI-mock chrome labels — narrative captions and headlines pass WCAG AA) |
| `npx hyperframes render` | ✅ 75s · 2250 frames · 2.6 MB · 28.7s wall time |

Render console emitted a few `non-blocking · 404 (Not Found)` lines (HyperFrames Tailwind CDN integrity probe) — does not affect output.

## Issues / known limitations

1. **No voiceover audio.** `ELEVENLABS_API_KEY` not present. Script fully written in `voiceover-script.md`. Plug in later via either:
   - ElevenLabs `text-to-speech` skill (preferred per plan §8), then drop `assets/audio/voiceover-full.mp3` and add `<audio data-track-index="2" src="assets/audio/voiceover-full.mp3" data-start="0" data-duration="75">` to root `index.html`.
   - Local Kokoro: `npx hyperframes tts "<line>" --out assets/audio/voiceover-full.mp3` (produces a single-take MP3 with no API key).
2. **No music or SFX.** Music license + SFX pack pending decision (plan §"Open Decisions" items 3, 5).
3. **Lint warnings — 210 cosmetic.** Each scene scopes CSS via `[data-composition-id="scene-NN"]`. Lint suggests `#scene-NN` for clearer scoping. Each scene is embedded once in the root, so the leak the warning warns about cannot occur. If cutdowns later embed the same scene multiple times, refactor to `id="scene-NN"` on the wrapper + `#scene-NN` selectors.
4. **Contrast warnings — 250.** Concentrated on small UI-chrome labels in the recreated product mockups (panel labels at 14–18px on `#1B1B1B`/`#1f1f22`, line-number columns in the diff). Captions, scene headlines, and the end-card lockup all pass 4.5:1. To clear all warnings: bump `--fg-secondary` from `#a0a09f` → `#c4c4c3`. Done at design-token level in `design.md` if desired.
5. **No real screen recordings.** All product UI is a faithful recreation, not real Weblab UI. Swap procedure documented above.
6. **No social cutdowns.** 9:16 and 1:1 not yet rendered. Author separate root files at `index-portrait.html` (1080×1920) and `index-square.html` (1080×1080) with re-routed scene durations.
7. **CDN dependencies.** Composition pulls GSAP and Tailwind browser-runtime at load. HyperFrames inlines them at compile time, so the rendered MP4 is fully offline-deterministic — but live preview (`npm run dev`) requires network.
8. **Node version.** HyperFrames warns Node 20 is below required 22. Renders work; engine warning is benign on this build.

## How to preview

```bash
cd apps/web/product-video
npm run dev
# opens HyperFrames Studio at http://localhost:3210 (or first free port)
```

Scrub the timeline. Each scene seeks deterministically. Captions overlay the entire 75s.

## How to render

```bash
cd apps/web/product-video
npm run render -- --output out/weblab-explainer-v1.mp4
```

Default: H.264 MP4, 30fps, 1920×1080. Re-render is byte-deterministic given identical inputs.

## What to review manually

Open `apps/web/product-video/out/weblab-explainer-v1.mp4` and watch full-screen. Specifically check:

- [ ] Caption timing — does each line align with the script cue (`voiceover-script.md`)?
- [ ] Scene 4 — does the padding slider arrival feel like one motion, not two?
- [ ] Scene 5 — does the typed message + assistant stream read at video size, or is text too small?
- [ ] Scene 6 — does the AST diff land as "real code" or feel decorative?
- [ ] Scene 7 — is the breakpoint cycle clear at a glance, or does the static layout (no animated viewport switch) flatten the message?
- [ ] Scene 8 — is the dropdown → deploy → URL transition coherent in 8 seconds?
- [ ] Final 3 seconds — end card legibility on small previews (LinkedIn embed test).
- [ ] Color grade — does the dark theme match the live app (open `weblab.build` side-by-side).

## Final render path

Local: `apps/web/product-video/out/weblab-explainer-v1.mp4` (2.5 MB · 75s · 30fps · 1920×1080 H.264)

### Public mirrors

- **HyperFrames Studio (recommended):** https://hyperframes.dev/p/41a605f3-a1e3-4a7f-a219-4d8e4fd60007?claim_token=bXZMj8tox16Yx34fh8CQ2vikeathjyGt — full-fidelity in-browser playback + ability to claim and edit the project.
- **MP4 direct (72hr mirror):** https://tmpfiles.org/dl/37291372/weblab-explainer-v1.mp4 — raw MP4 for download / phone playback. Expires after ~72hrs.

Re-render produces a byte-identical MP4 from the same source.
