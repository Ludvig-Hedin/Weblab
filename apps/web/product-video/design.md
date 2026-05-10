# Weblab — Brand Pin for HyperFrames

> Brand source of truth for this composition. Mirrors `apps/web/client/src/styles/globals.css` and `packages/ui/src/globals.css`. Do not invent colors or fonts. Do not substitute typography.

## Brand

- **Name.** Weblab
- **Tagline.** Cursor for Designers
- **Domain.** weblab.build
- **One-line promise.** Design with your real components on an infinite canvas. Ship production-ready websites instead of prototypes.

## Palette

Dark theme is canonical for the explainer. All values verified against the app's CSS.

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#131314` | Root scene background |
| `--bg-canvas` | `#1B1B1B` | Editor canvas viewport |
| `--bg-chrome` | `#121212` | Editor panels / chrome |
| `--bg-elevated` | `#1F1F22` | Cards, dropdowns, popovers |
| `--fg` | `#FAFAF9` | Primary text |
| `--fg-secondary` | `#A0A09F` | Secondary text, captions |
| `--fg-muted` | `#6B6B6B` | Borders, dividers, placeholder |
| `--accent` | `oklch(0.623 0.214 255)` (≈ `#3D8BFD`) | Brand blue, highlights |
| `--accent-soft` | `rgba(61, 139, 253, 0.18)` | Glow halos, hover tints |
| `--success` | `#3FB950` | Diff additions |
| `--danger` | `#F85149` | Diff deletions |
| `--shadow-md` | `0 8px 32px rgba(0, 0, 0, 0.45)` | UI panel float |

## Typography

- **Sans.** Inter — built-in to HyperFrames. Weights used: 300, 400, 500, 600.
- **Mono.** JetBrains Mono — used only for code overlays and the deployed URL. Falls back to system mono if unavailable.
- **Display script.** Vujahday Script — only for end-card italic accent (optional). Falls back to Inter italic if files unavailable.
- **Scale (1080p render).**
  - End-card display: 240px Inter Light
  - Section title: 96px Inter Light
  - Body: 32px Inter Regular
  - Caption: 36px Inter Medium (lower-third)
  - Code: 24px JetBrains Mono Regular

## Corners

- Cards / panels: `border-radius: 16px`
- Buttons / pills: `border-radius: 999px`
- Code blocks: `border-radius: 12px`

## Density

- Scene padding: 96px (16:9), 64px on cutdowns.
- Internal panel padding: 32px.
- Stack gap: 24px (compact), 48px (display).

## Depth

- Subtle. Single layered glow on the brand-color accent only. No multi-shadow stacks. No decorative gradients on dark backgrounds (H.264 banding risk).

## Avoidance Rules

- **No** generic SaaS gradients (purple-pink-orange).
- **No** "magic" shimmer / sparkle.
- **No** stock 3D objects.
- **No** flat-illustration mascots.
- **No** text larger than 240px.
- **No** competitor names on screen.
- **No** "AI" sparkle icons.
- **No** "Easy", "Magic", "Just", "Simply".

## Motion Tone

- Calm, confident, restrained.
- Average shot 2.0–2.5s. Four deliberate 4–6s holds.
- Default eases:
  - Headlines / display text: `power3.out` (entry), `power2.in` (exit, only on final scene).
  - UI panels: `expo.out`.
  - Interactive elements (slider, button): `back.out(1.4)` — used sparingly.
  - Subtext: `power2.out`.
- Vary at least three eases per scene.
- No `repeat: -1`. No async timeline construction.

## Logo Lockups

| File | Use |
|------|-----|
| `assets/brand/symbol.svg` | Cold-open mark (scenes 1, 10) |
| `assets/brand/wordmark.svg` | Inline label, end-card lockup |
| `assets/brand/logo.svg` | Combined mark + wordmark, end-card lockup |
