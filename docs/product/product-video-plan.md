# Weblab Product Explainer Video — Production Plan

> Owner: marketing + product. Status: **awaiting build**. This document is the spec; the next session executes it via the HyperFrames skill.

## 1. Product Positioning

**What Weblab is.** A visual-first code editor and AI builder. You design directly on your real Next.js + Tailwind app — not a mockup, not a render of an iframe, the actual running components. Every visual edit writes back to source via AST. The AI uses your components, your tokens, your design system — not generic HTML.

Source of truth: `packages/constants/src/editor.ts:5-9` (`APP_NAME = 'Weblab'`, `APP_TAGLINE = 'Cursor for Designers'`, `APP_DOMAIN = 'weblab.build'`).

**Who it's for.** Designers who write code (or work shoulder-to-shoulder with engineers) and small product teams who don't want to ship Figma mockups, hand them off, and wait. Secondary: solo founders building real Next.js apps who want a faster loop than "Cursor in one window, browser in another."

**Core pain it solves.**
- Designers can't change what they see — they make a Figma frame, an engineer translates it, the result drifts.
- Visual builders (Webflow, Framer) produce code you can't own or extend.
- AI builders (Bolt, Lovable, v0) generate generic HTML that ignores your existing component library and design tokens.
- Cursor is a great IDE for engineers but not a canvas — designers can't direct-manipulate.

**One-sentence promise.** Design with your real components on an infinite canvas. Ship production-ready websites instead of prototypes. (Verbatim from `apps/web/client/src/app/_components/hero/index.tsx:77-78`.)

**Why it's different.**
- Edits are AST-level changes to your real source — no translation step, no drift.
- AI is constrained to your existing `@weblab/ui` (or your imported component library) and your Tailwind tokens.
- Output is portable Next.js / Tailwind code. Push to GitHub, deploy anywhere.
- The canvas is the actual running app, not a rendered preview of one.

What we explicitly do **not** claim and will not show: "no-code", "for non-technical people", "replaces engineers", "design without thinking about code." Weblab is for people who want code, not people who want to avoid it.

## 2. Video Objective

**Primary objective.** Make a first-time landing-page visitor understand the Weblab loop — *prompt → real-canvas edit → AI refines using your components → publish* — in under 90 seconds, and click "Get started."

**Primary audience.** Designers and design-leaning developers, age 22–45, comfortable with Figma, familiar with React/Tailwind concepts, frustrated by the design-handoff gap.

**Desired feeling.** Calm confidence. Premium tool. Not hype. Not "AI builds your site in 30 seconds!" energy. Closer to a Linear or Arc launch video than a Lovable promo.

**Desired action.** Click the homepage CTA — "Get started" — and create a project from prompt.

**What NOT to communicate.**
- "No code." Weblab is *for* people who want code.
- "Replaces designers / engineers."
- Feature laundry lists (CMS, breakpoints, branches, comments, deploys all in one breath).
- "Easy" — implies low ceiling. Use "fast" or "direct" instead.
- Pricing, tier comparisons, or competitor names.

## 3. Recommended Format

Opinionated picks — no hedging.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Length | **75 seconds** (target window 70–80s) | Long enough to land the loop, short enough to autoplay-loop on the homepage hero without feeling padded. |
| Aspect ratio | **16:9 primary (1920×1080)** | Landing page hero, YouTube, embedded docs. |
| Cutdowns | **9:16 (1080×1920) — 30s social** + **1:1 (1080×1080) — 30s feed** | Built from the same scenes via HyperFrames variants; not separately authored. |
| Voiceover | **Yes** — ElevenLabs, single calm female voice, ~45s of narration, ~140 wpm. | Without VO the product loop is too abstract for a first-time visitor. |
| Captions | **On by default**, baked into the hero render. Tight word groups, sentence-case, no all-caps. Position: lower-third, never covering UI. | Most homepage video plays muted on first impression. |
| Music | **Subtle ambient pad** — slow synth, no drums, low BPM. Sub-mixed −18 LUFS. | Hype tracks fight the tone. Pad lets the UI be the protagonist. |
| SFX | **Two soft UI ticks max** — one on prompt-send, one on publish-success. Nothing else. | Restraint signals premium. |
| Pacing | **2.0–2.5s avg shot length, 4 deliberate holds** of 4–6s on key UI moments. Hold = let the viewer read. | Most product videos cut too fast; the UI never lands. |
| Color grade | **App's actual dark theme** (`--background: 240 2.6% 7.6%`, `--foreground: 60 9.1% 97.8%`). No film LUTs. | The product's brand IS the look. Don't grade away from it. |

## 4. Five Alternative Storyboards

Five distinct angles. Each is a real option, not the same script reworded. Scoring legend: complexity 1 = trivial / 5 = high-effort; recommendation 1 = avoid / 5 = strongest.

---

### Storyboard A — "From prompt to polished site"

- **Core angle.** Linear before/after journey — a line of text becomes a finished site in 75s.
- **Best use case.** Homepage hero for cold traffic that has never heard of Weblab.
- **Length.** 75s.
- **Tone.** Calm, confident, slightly cinematic.
- **Structure.** Hook → prompt → AI generates → user edits visually → AI refines → publish.
- **Hook line.** "This is one prompt and ninety seconds of editing."
- **Complexity.** 3/5. **Recommendation.** 4/5.

| t | Visual | VO / on-screen text |
|---|--------|---------------------|
| 0.0–3.0s | Logo mark draws in on dark bg. Ambient pad enters. | (text) **Weblab** |
| 3.0–8.0s | Cursor types into the homepage prompt box: "A pricing page for a developer tool, dark, three tiers." UI: real `Create` component (`apps/web/client/src/app/_components/hero/create.tsx`). | (VO) "Start with a sentence." |
| 8.0–14.0s | Camera pushes into the editor. Iframe canvas reveals a generated pricing page. Subtle blur-in. | (VO) "Weblab generates real Next.js code, using your components." |
| 14.0–24.0s | User selects a card on the canvas. Right panel (`right-panel/style-tab`) opens. Padding slider moves; card breathes. | (VO) "Edit it like Figma. Every change is an AST edit to your source." (caption: *AST edit → source file*) |
| 24.0–34.0s | User opens AI chat (right panel chat tab). Types: "Make the middle tier the highlighted one. Use my brand blue." | (VO) "Chat with your project." |
| 34.0–46.0s | AI streams. Middle card shifts up, gains a `bg-background-brand` glow. Layers panel highlights the changed component. | (VO) "It uses *your* components, *your* tokens — not generic HTML." |
| 46.0–58.0s | User drags layout — flex direction toggle. Breakpoint switcher cycles desktop → tablet → mobile. Layout reflows. | (VO) "Edit responsive at every breakpoint." |
| 58.0–66.0s | Top bar publish dropdown opens (`top-bar/publish/`). Click. Soft tick SFX. Domain `*.weblab.build` appears. | (VO) "Publish to a real URL." |
| 66.0–72.0s | Cut to live site in a clean browser frame. URL: `your-site.weblab.build`. | (VO) "Production-ready. Yours to own." |
| 72.0–75.0s | Wordmark + tagline. End card. | (text) **Weblab** — Design with your real components |

- **UI to show.** homepage hero / `Create` / editor canvas / right-panel style tab / chat tab / breakpoint switcher / publish dropdown / live site.
- **Motion direction.** Single throughline. Camera mostly static; let the UI move. Three deliberate holds (12s, 38s, 70s).
- **Pros.** Clearest narrative for a cold visitor. Demonstrates the core loop end-to-end.
- **Risks.** If any UI moment is misrepresented, the whole story breaks. Demands accurate UI capture.

---

### Storyboard B — "AI builder with visual control"

- **Core angle.** Side-by-side: chat on the left, canvas on the right. Every chat message produces a visible canvas change.
- **Best use case.** Targeted comparison page (`/compare`) or "vs Lovable / Bolt" landing.
- **Length.** 60s.
- **Tone.** Tactical. Demo-driven.
- **Structure.** Three chat → result beats. No setup, no payoff arc — just the loop, three times.
- **Hook line.** "Three messages. Three real changes."
- **Complexity.** 3/5. **Recommendation.** 3/5.

| t | Visual | VO / on-screen text |
|---|--------|---------------------|
| 0.0–4.0s | Title card: "Three messages." Wordmark in lower-right. | (text) Three messages. Three real changes. |
| 4.0–22.0s | **Beat 1.** Chat message: "Add a hero with a CTA." Canvas: hero appears using actual `Button` from `@weblab/ui`. Layers panel updates. | (VO) "First, generate. Always uses your components." |
| 22.0–40.0s | **Beat 2.** Chat: "Make it dark, increase the headline weight, add a subtitle." Canvas: dark bg fades in, headline gets bolder, subtitle slides in. Style tab shows the diff. | (VO) "Refine. Every edit is real code." |
| 40.0–54.0s | **Beat 3.** Chat: "Now the same hero, mobile first." Breakpoint switches to 390px. Layout reflows. | (VO) "Responsive at every breakpoint, not at the end." |
| 54.0–60.0s | End card: wordmark + URL `weblab.build`. | (text) **weblab.build** |

- **UI to show.** chat tab / canvas / layers panel / style tab / breakpoint switcher.
- **Motion direction.** Clean split — left is text, right is UI. Cuts fire on chat-send.
- **Pros.** Maximum proof density per second. Comparison-friendly.
- **Risks.** Reads "competitor takedown" rather than "product story." Less effective for cold traffic.

---

### Storyboard C — "Stop fighting your website builder"

- **Core angle.** Pain-led. Open with frustration archetypes (Figma → engineer ping-pong; visual builder code that's locked in; AI builder that ignores your design system). Then Weblab as the resolution.
- **Best use case.** Paid social, retargeting, or audience that's tried other tools.
- **Length.** 90s.
- **Tone.** Empathetic, slightly wry. Pain → relief.
- **Structure.** Three pains (45s) → reveal Weblab (10s) → three resolutions (30s) → CTA (5s).
- **Hook line.** "You shouldn't have to choose."
- **Complexity.** 4/5. **Recommendation.** 3/5.

| t | Visual | VO / on-screen text |
|---|--------|---------------------|
| 0.0–4.0s | Cold open: hand drags a Figma frame. Cut: engineer's editor. Cut: deployed page that looks 70% like the design. | (VO) "You design it. Someone rebuilds it. It drifts." |
| 4.0–18.0s | Pain 1 — Figma handoff montage. Stylized, near-monochrome, slightly desaturated. | (caption) *Pain 1: Translation* |
| 18.0–32.0s | Pain 2 — visual builder UI (generic stand-in, no competitor logos) generating locked output. Code blocked. | (caption) *Pain 2: Locked-in code* |
| 32.0–46.0s | Pain 3 — AI chat producing a generic Bootstrap-looking UI that ignores the user's tokens. | (caption) *Pain 3: Generic AI output* |
| 46.0–56.0s | Music cut. Color floods back. Weblab editor reveal. | (VO) "Weblab is built differently." |
| 56.0–66.0s | Resolution 1: visual edit → AST diff overlay on the right showing real code change. | (VO) "Edits are real code." |
| 66.0–76.0s | Resolution 2: AI chat using `<Button variant="primary">` from the user's library. Layers panel confirms. | (VO) "AI uses your components." |
| 76.0–86.0s | Resolution 3: Publish + live URL. | (VO) "Ship production-ready." |
| 86.0–90.0s | End card. | (text) **Weblab** |

- **UI to show.** All product surfaces from A, plus a stylized pain-state montage.
- **Motion direction.** Pain section is desaturated, jittery, slow zooms. Reveal punch with color flood and music swell.
- **Pros.** Strongest emotional pull. Makes the differentiator feel earned.
- **Risks.** Pain montage requires extra production work (stand-in UI). Easy to slip into negative-tone overreach. Longer = lower completion rate.

---

### Storyboard D — "Designer + developer workflow"

- **Core angle.** Two cursors on one canvas — designer and developer working together in real time. Comments, branches, live collaboration.
- **Best use case.** Teams page or B2B sales-led landing.
- **Length.** 90s.
- **Tone.** Practical, collaborative.
- **Structure.** Designer starts → developer joins → handoff disappears → ship together.
- **Hook line.** "The handoff was always the bug."
- **Complexity.** 4/5. **Recommendation.** 2/5.

| t | Visual | VO / on-screen text |
|---|--------|---------------------|
| 0.0–6.0s | Two named cursors land on the canvas (live collaboration v1.2). Comment thread appears on a card. | (VO) "Two roles. One canvas." |
| 6.0–24.0s | Designer drags layout, drops a Tailwind class, picks color from `Brand` tab (`design-panel/brand-tab`). | (VO) "Designers move pixels — and the source moves with them." |
| 24.0–48.0s | Developer joins. Opens code panel. Same change, now visible in JSX. Adds a logic edit via Cursor side-by-side. Push to GitHub (v1.4 GitHub Sync). | (VO) "Developers work in real code, in the same project, at the same time." |
| 48.0–72.0s | Branch switcher (`design-panel/branches-tab`) — designer experiments on branch B, dev keeps shipping on main. Merge. | (VO) "Branch, iterate, merge. No handoff." |
| 72.0–86.0s | Comments resolved, deploy runs. Live site appears. | (VO) "Ship together." |
| 86.0–90.0s | End card. | (text) **Weblab** — for design + engineering teams |

- **UI to show.** Live collaboration cursors / comments / code panel / GitHub sync / branch switcher.
- **Motion direction.** Two-cursor choreography is the centerpiece — the cursors must feel intentional, not chaotic.
- **Pros.** Differentiates from solo-AI-builder competitors. Sells expansion accounts.
- **Risks.** Two-cursor choreography is hard to make legible. Wrong audience for homepage cold traffic — better as a teams-page video.

---

### Storyboard E — "Cursor for websites, but visual"

- **Core angle.** Lean directly on the brand tagline (`APP_TAGLINE = 'Cursor for Designers'`). Position by analogy: Cursor brought AI to the engineer's IDE. Weblab brings it to the designer's canvas.
- **Best use case.** Product Hunt / launch / press piece. Audience that knows Cursor.
- **Length.** 60s.
- **Tone.** Confident, declarative.
- **Structure.** Analogy → demonstration → claim → CTA.
- **Hook line.** "Cursor changed how engineers code. This is what it looks like for designers."
- **Complexity.** 2/5. **Recommendation.** 4/5.

| t | Visual | VO / on-screen text |
|---|--------|---------------------|
| 0.0–4.0s | Black frame. Title: "Cursor changed how engineers code." Inter, 96px, light weight. | (text only — no VO yet) |
| 4.0–10.0s | Wipe. Replace with: "This is what it looks like for designers." | (VO begins) "Meet Weblab." |
| 10.0–25.0s | Editor reveal. Single fluid sequence: prompt → generate → visual edit. No cuts, just camera moves and panel reveals. | (VO) "Real code, on a real canvas, with AI that knows your components." |
| 25.0–40.0s | Tight three-shot montage: AST diff overlay / breakpoint switcher / publish click. ~5s each. | (VO) "Every edit is source. Every breakpoint is real. Every site is yours to ship." |
| 40.0–54.0s | Final beat: live deployed site loads in browser. | (VO) "This is design that ships." |
| 54.0–60.0s | Wordmark + tagline + URL. | (text) **Weblab** — Cursor for Designers — weblab.build |

- **UI to show.** Same surfaces as A, but compressed.
- **Motion direction.** Confident, declarative. Long camera holds, big type. Almost a manifesto.
- **Pros.** Strongest brand fit (this is the actual tagline). Tightest run-time. Quotable hook.
- **Risks.** Audience that doesn't know Cursor misses the analogy. Risk of feeling derivative.

---

## 5. Recommended Final Storyboard

**Pick: Storyboard A — "From prompt to polished site."**

Why: A demonstrates the actual product loop end-to-end (prompt → real-canvas edit → AI → publish), works for cold traffic on the landing page, and is the only one of the five that fully resolves the "what does Weblab do?" question for a viewer who has never seen the product. E is a strong second and works as the social cutdown / Product Hunt cut, but for the homepage hero, A wins because it answers "show me" not "tell me."

A's complexity (3/5) is well-matched to HyperFrames: the throughline is sequential, the UI surfaces are the ones we control, and the camera work is mostly static reveals.

### Final title

**Weblab — Design with your real components**

### Final timeline

| t | Scene | Duration | UI surface | Beat |
|---|-------|----------|------------|------|
| 0.0–3.0s | 1. Logo cold open | 3.0s | Wordmark over dark bg | Brand |
| 3.0–8.0s | 2. Prompt | 5.0s | Homepage `Create` composer | Setup |
| 8.0–14.0s | 3. Generate | 6.0s | Editor canvas reveal | Reveal |
| 14.0–24.0s | 4. Visual edit | 10.0s | Right-panel style tab | Proof 1 — visual edits are real |
| 24.0–34.0s | 5. AI chat | 10.0s | Right-panel chat tab | Proof 2 — AI uses your components |
| 34.0–46.0s | 6. AST diff | 12.0s | Layers + diff overlay | Proof 3 — your code, not magic |
| 46.0–58.0s | 7. Responsive | 12.0s | Breakpoint switcher | Proof 4 — real responsive |
| 58.0–66.0s | 8. Publish | 8.0s | Top-bar publish dropdown | Payoff |
| 66.0–72.0s | 9. Live site | 6.0s | Browser frame, deployed URL | Payoff |
| 72.0–75.0s | 10. End card | 3.0s | Wordmark + tagline | CTA |

Total: **75.0s.**

### Full voiceover draft (~140 wpm, ~45s spoken, plenty of breathing room)

> *(scene 2)* Start with a sentence. *(scene 3)* Weblab generates real Next.js code — using your components, your tokens, your design system. *(scene 4)* Edit it like Figma. Every visual change is an AST edit to your source. *(scene 5)* Or chat with your project. *(scene 6)* Watch what happens — Weblab uses *your* components, *your* tokens. Not generic HTML. *(scene 7)* Edit responsive at every breakpoint, not at the end. *(scene 8)* Publish to a real URL. *(scene 9)* Production-ready. Yours to own. *(scene 10 — silent, music tail)*

### Full on-screen text

| Scene | Text | Style |
|-------|------|-------|
| 1 | **Weblab** | Wordmark only, 240px, Inter Light. |
| 2 | live-typed prompt body | Inside the actual `Create` composer — no extra text. |
| 4 | *AST edit → source file* | Lower-third caption pill, 28px, foreground-secondary on transparent bg. |
| 6 | *uses your components* | Highlight pill anchored to the layers panel. |
| 9 | `your-site.weblab.build` | URL bar, monospace. |
| 10 | **Weblab** — Design with your real components — weblab.build | End card lockup. |

### Scene list

1. **Logo cold open** (3s) — wordmark draws in, ambient pad enters.
2. **Prompt** (5s) — homepage `Create` composer, cursor types `A pricing page for a developer tool, dark, three tiers.`
3. **Generate** (6s) — editor reveal, blur-in pricing page.
4. **Visual edit** (10s) — select card, padding slider, card breathes; AST caption pill.
5. **AI chat** (10s) — chat composer types refinement; stream response.
6. **AST diff** (12s) — middle card shifts, gains brand glow; layers tree highlights changed node; small code overlay shows the diff.
7. **Responsive** (12s) — breakpoint switcher cycles desktop → tablet → mobile; layout reflows live.
8. **Publish** (8s) — top-bar publish dropdown; click; soft tick SFX; URL appears.
9. **Live site** (6s) — clean browser frame, real-looking deployed page.
10. **End card** (3s) — wordmark + tagline + URL; pad fades.

### Asset list (referenced in section 6 in detail)

- Wordmark + symbol SVG.
- Inter font (built-in to HyperFrames).
- Vujahday Script (only if used on hero copy — likely NOT used in this video; reserve for end card optionally).
- 9 UI captures (one per scene 2–9, plus the end card).
- 1 ElevenLabs VO file.
- 1 ambient pad track.
- 2 SFX (publish click, end-card chime — optional).

### UI capture list

| Scene | What to capture | Source |
|-------|-----------------|--------|
| 2 | Homepage `Create` composer empty + typed state | `apps/web/client/src/app/_components/hero/create.tsx` rendered live at `weblab.build` or local `/` |
| 3 | Editor with a fresh project loaded | `app/project/[id]/_components/main.tsx` |
| 4 | Right-panel style tab open, card selected | `right-panel/style-tab/index.tsx` |
| 5 | Right-panel chat tab with a streaming message | `right-panel/chat-tab/` |
| 6 | Layers panel + canvas with selected node + small code panel | `design-panel/layers-tab/` + canvas |
| 7 | Breakpoint switcher cycling | Canvas + frame chrome |
| 8 | Publish dropdown open | `top-bar/publish/` |
| 9 | Deployed pricing page in a clean browser chrome | Render of the actual generated page in a `*.weblab.build` URL |

Capture method recommendation: a mix of **real screen recordings** for sequences with cursor motion (scenes 2, 4, 5, 7, 8) and **static screenshots animated in HyperFrames** for hero frames (scenes 3, 6, 9, 10). Resolution: capture at 2880×1800 minimum (Retina), downscale in HyperFrames.

### Component list

Use the actual `@weblab/ui` components for any synthetic on-screen UI (e.g., the end-card CTA button, the URL bar). No invented buttons or generic shadcn placeholders.

### Animation notes

- Scene 3 reveal: blur-from-12 → blur-0, opacity 0 → 1, 0.8s, `power3.out`. No scale.
- Scene 4 padding slider: simulate via `gsap.fromTo()` on the slider thumb x position, paired with a width transform on the targeted card. Card never lerps — only resnaps after the slider lands.
- Scene 5 chat stream: timed `gsap.to()` on a CSS `mask-image` width to simulate token streaming. ~30 chars/s.
- Scene 6 AST diff: a small overlay panel slides in from the right with the diff (`+ variant="primary"`), highlighted in green. Layers tree highlight pulses once.
- Scene 7 breakpoint cycle: layout uses real Tailwind responsive classes; HyperFrames swaps a `data-bp` attribute on a parent and the CSS handles the rest.
- Scene 8 publish: dropdown opens (scale 0.96 → 1, opacity 0 → 1, 0.18s, `power2.out`); click ripple; URL text reveal via clip-path.

### Transition notes

- Scene 1 → 2: crossfade, 0.4s.
- Scene 2 → 3: camera-push (scale 1 → 1.04 + opacity bridge), 0.6s.
- Scene 3 → 4: cut — already inside the editor.
- Scene 4 → 5: panel-swap wipe (right panel content swaps via vertical clip-path, 0.35s).
- Scene 5 → 6: cut.
- Scene 6 → 7: zoom-out (scale 1 → 0.92, opacity bridge, 0.5s) to reveal breakpoints.
- Scene 7 → 8: cut.
- Scene 8 → 9: crossfade through soft white flash (0.25s, max alpha 0.6 — never pure white).
- Scene 9 → 10: crossfade, 0.5s.

No exit animations on individual elements before transitions — the transition is the exit. (HyperFrames non-negotiable rule.)

### Music / SFX notes

- **Pad.** Ambient slow synth, ~80 BPM, no drums, key around D minor. Fades in over 1.0s at t=0, sub-mixed at −18 LUFS, ducks under VO to −24 LUFS, fades out over 2.0s ending at t=75.0s.
- **SFX.**
  - 0.4s soft pluck on logo draw-in (t=2.4s).
  - Soft UI tick on publish click (t=63.0s).
  - Optional: subtle whoosh on scene 6 → 7 zoom-out.

### Caption treatment

- Position: lower-third, 80px from bottom in 1080p; raised to mid-frame for portrait cutdown.
- Style: Inter Medium 36px (1080p), white at 95% opacity on a 4px-radius pill with bg `rgba(0,0,0,0.45)` + 0.5px border `rgba(255,255,255,0.08)`.
- Word groups: 2–4 words. No single-word flashes. No all-caps.
- Sync: ElevenLabs word timestamps (forced alignment via the `hyperframes-media` skill).
- Exit: every caption fully exits before the next enters — no overlap.

## 6. Asset Plan

| Asset | Source | Action | Resolution / format | Notes |
|-------|--------|--------|---------------------|-------|
| Wordmark | `apps/web/client/public/brand/wordmark.svg` | Reuse | SVG | Already brand-aligned. |
| Logo mark | `apps/web/client/public/brand/symbol.svg` | Reuse | SVG | For end-card lockup. |
| Logo PNG fallback | `apps/web/client/public/brand/logo.png` | Reuse | PNG, transparent bg | Only if SVG renders glitch. |
| OG image style ref | `apps/web/client/public/og-image.png` | Reference only | — | For matching marketing-page tone. |
| Scene 2 — homepage prompt | Live local `/` route | **Screen-record** | 2880×1800 → downscale | Record at 60fps; trim to 5s. |
| Scene 3 — editor reveal | Live `/project/[id]` with seeded pricing-page state | **Screen-record** | 2880×1800 | Need a saved demo project. Mark as **needed asset**. |
| Scene 4 — style-tab edit | Same project | **Screen-record** | 2880×1800 | Plan the cursor path before recording. |
| Scene 5 — AI chat stream | Same project | **Screen-record** + **simulate stream in HyperFrames** | Hybrid | Real chat is non-deterministic; simulate the response in HyperFrames using a fixed transcript. |
| Scene 6 — AST diff overlay | Constructed in HyperFrames | **Generate** | HTML+CSS in HyperFrames | The diff overlay isn't a product feature — it's a marketing visualization. Build it as a HyperFrames sub-comp using a real code snippet. |
| Scene 7 — breakpoint cycle | Live editor | **Screen-record** | 2880×1800 | Record 3 viewport changes. |
| Scene 8 — publish dropdown | Live editor | **Screen-record** | 2880×1800 | |
| Scene 9 — live site | Real deploy of the pricing page | **Screen-record** | 2880×1800 | Use a sandbox subdomain. Mark as **needed asset** until deploy URL is reserved. |
| Voiceover | ElevenLabs API | **Generate** (later) | mp3 / wav, mono, 48kHz | One full take, ~45s. |
| Music pad | Royalty-free (Artlist / Musicbed / Soundstripe) or commissioned | **Acquire** | wav, stereo, 48kHz | Mark as **needed asset / decision**. |
| SFX | UI sound pack (e.g., Cymatics) | **Acquire** | wav | Mark as **needed asset**. |
| Captions | Auto-generated from VO | **Generate** | Internal HyperFrames format | Via `hyperframes-media` transcribe. |

Backgrounds / cursor effects:
- Use the dark theme tokens directly. No invented gradients.
- Cursor in screen recordings: keep system cursor; don't overlay a custom cursor. If a custom cursor is desired, use a single subtle dot from the `Icons.Cursor` set, not a generic black arrow. Mark as a **decision needed**.
- Avatar (HeyGen): explicitly **not used**. Weblab's voice is the product UI, not a presenter.

## 7. HyperFrames Implementation Plan

**Folder structure** (created by `npx hyperframes init` later, in a separate worktree from the main app):

```
videos/explainer-v1/
├── index.html                  # root composition (16:9, 1920×1080, 75s)
├── design.md                   # Weblab brand pinned for HyperFrames
├── compositions/
│   ├── scene-01-logo.html
│   ├── scene-02-prompt.html
│   ├── scene-03-generate.html
│   ├── scene-04-style-edit.html
│   ├── scene-05-ai-chat.html
│   ├── scene-06-ast-diff.html
│   ├── scene-07-responsive.html
│   ├── scene-08-publish.html
│   ├── scene-09-live-site.html
│   └── scene-10-end-card.html
├── assets/
│   ├── brand/                  # wordmark.svg, symbol.svg
│   ├── captures/               # mp4 / webm / png from screen recordings
│   ├── audio/
│   │   ├── vo.mp3              # ElevenLabs output
│   │   ├── pad.wav
│   │   └── sfx-tick.wav
│   └── code/
│       └── pricing-card.tsx    # static code snippet for scene 6 diff overlay
├── fonts/                      # only if Vujahday Script is used; Inter is built-in
└── .hyperframes/               # generated outputs (anim-map, screenshots)
```

Cutdowns: portrait (`videos/explainer-v1-portrait/`) and square (`videos/explainer-v1-square/`) re-use the same scene compositions but with their own root `index.html` that re-points at the same sub-comps with different `data-width`/`data-height` and different scene durations.

**Composition name.** `weblab-explainer-v1` (root).

**Target dimensions.** `1920×1080` (root). Sub-comps inherit per-scene where helpful (e.g., scene-09 may stage the live site at 1920×1080).

**Scene breakdown.** One sub-composition per scene. Loaded into root via `<div data-composition-id data-composition-src data-start data-duration>`. See section 5's final timeline for `data-start` and `data-duration` values.

**Timeline architecture.**
- Root `index.html` is the orchestrator. It contains:
  - 10 scene clips (sub-compositions).
  - 1 audio clip for VO (`<audio>` element, track 0, full duration).
  - 1 audio clip for music pad (`<audio>` element, track 1, full duration).
  - 2 SFX clips on track 2.
  - 1 captions sub-composition on a top z-index layer, full duration.
- Each sub-comp has its own `window.__timelines["scene-N"]` registered, paused, framework-driven.
- Scene transitions live on the root timeline (between scene boundaries) — typically a brief CSS opacity tween on the outgoing scene wrapper, since HyperFrames non-negotiables forbid exit animations on inner elements.

**GSAP timeline plan (per scene, common pattern).**
- Read variables once at top of script via `window.__hyperframes.getVariables()`.
- Build static layout first (Layout Before Animation rule).
- Add entrances via `gsap.from()` (or `gsap.fromTo()` in sub-comps).
- Vary eases (≥3 different eases per scene): `power3.out` for headlines, `power2.out` for subtext, `expo.out` for UI element entries, `back.out(1.4)` only on the publish click.
- Offset first tween 0.15–0.25s.
- No `repeat: -1`. Calculate finite repeats from `data-duration`.

**Tailwind v4 styling approach.**
- HyperFrames runs Tailwind in the browser via the `tailwind` skill pattern.
- Pin the actual app token values in `design.md` for HyperFrames (separate from the app's `globals.css`):
  - `--background: oklch(0.131 0.005 285)` (mirrors `240 2.6% 7.6%`)
  - `--foreground: oklch(0.978 0.005 70)` (mirrors `60 9.1% 97.8%`)
  - `--accent: oklch(0.623 0.214 255)` (verbatim from `globals.css`)
  - `--font-sans: Inter`
  - `--radius: 1rem`
- Recreate UI surfaces via plain HTML + Tailwind utilities — do NOT try to import `@weblab/ui` into the HyperFrames project. Match the visual output, don't share code.

**Caption sync.**
- Generate VO via ElevenLabs.
- Run `hyperframes-media transcribe` against the VO to get word-level timestamps.
- Caption sub-comp reads timestamps and renders one word-group at a time (2–4 words), using the captions reference patterns from the HyperFrames skill.
- Each caption fully exits before the next enters.

**Voiceover handling.**
- Single `<audio data-track-index="0" src="assets/audio/vo.mp3" data-start="0" data-duration="75">` on the root.
- Music pad on track 1 with `data-volume="0.4"`, ducks lower under VO via a separate volume tween (handled in HyperFrames per audio-reactive pattern).
- SFX on track 2.

**Music / SFX mix.**
- VO at 0 dB reference.
- Pad: full at intro (t=0–3s), duck to ~−6 dB once VO begins (t=3s), restore to ~−3 dB at outro (t=66s).
- SFX: pre-mixed at −12 dB.
- Final master normalize to −16 LUFS for web playback.

**Screenshots / screen recordings placement.**
- Each capture goes inside its scene sub-comp as a `<video muted playsinline data-track-index="0">` (for moving captures) or `<img>` (for stills).
- Wrap in a non-timed container so HyperFrames can animate the wrapper (HyperFrames rule: never animate the video element directly).
- Apply consistent rounded-2xl corners (`border-radius: 24px`) and a subtle shadow matching the app's `--shadow-md` to make every capture feel like a single device.

**UI components recreated as static HTML.**
- The end-card lockup, the URL bar in scene 9, and the AST diff overlay in scene 6 are constructed natively in HyperFrames as HTML+Tailwind. Don't try to import the real components.

## 8. ElevenLabs Voiceover Plan

- **Voice.** Calm, neutral, mid-low female voice. Reference: ElevenLabs "Hope" or "Charlotte" tier; pick from the available models in the `elevenlabs:text-to-speech` skill at build time.
- **Pace.** ~140 words per minute. Slower than typical explainer-tempo; matches the calm-confident tone.
- **Tone.** Confident, never hyped. Direct statements. No question-rhetoric. No "Imagine if…" openings.
- **Pronunciation notes.**
  - "Weblab" — pronounced *Web-lab*, single stress on first syllable.
  - "Next.js" — *next-jay-ess*, not *next-jess*.
  - "AST" — letters: *A-S-T*, not "ast."
  - "Tailwind" — single word, *tail-wind*.
  - "weblab.build" — *Web-lab dot build*.
- **Script length target.** ~45s of spoken audio across the 75s timeline (leaves 30s of breathing / music-only frames).
- **Generation strategy.** **One full take, single file.** Easier to mix and align captions. If a single line needs a retake, re-render the full file and re-align — don't splice.
- **File naming.** `assets/audio/vo-v{n}.mp3`. Bump version number on every regenerate. Symlink current to `vo.mp3`.
- **Fallback if ElevenLabs unavailable.** Author an unspoken cut: keep all on-screen captions, drop VO, lift music level by 2 dB, extend captions to fill the silence. Do NOT use a different TTS provider — voice consistency matters more than having VO.

## 9. Production Checklist

Run in this order. Don't skip ahead.

- [ ] **Brand checks** — `APP_NAME`, `APP_TAGLINE`, `APP_DOMAIN` pulled verbatim from `packages/constants/src/editor.ts`. No "Onlook" anywhere except the legacy-attr fallback list.
- [ ] **Script approval** — VO script and on-screen text reviewed and signed off.
- [ ] **Storyboard approval** — final storyboard (A) timeline locked.
- [ ] **Asset capture** — all 9 UI captures recorded at 2880×1800. Demo project seeded and saved.
- [ ] **Audio acquisition** — music pad and SFX licensed.
- [ ] **VO generation** — single ElevenLabs file rendered.
- [ ] **HyperFrames composition build** — 10 scene sub-comps + root + captions sub-comp authored. `design.md` pinned.
- [ ] **Local preview** — `npx hyperframes preview` runs cleanly. Watch the full 75s. No layout overflows. Captions never cover UI.
- [ ] **Lint** — `npx hyperframes lint` and `npx hyperframes validate` both pass.
- [ ] **Inspect** — `npx hyperframes inspect` reports no unmarked overflow.
- [ ] **Animation map** — `node skills/hyperframes/scripts/animation-map.mjs videos/explainer-v1 --out videos/explainer-v1/.hyperframes/anim-map` reviewed; no unintended dead zones, no `paced-fast` flags on body content.
- [ ] **Render** — `npx hyperframes render --output videos/explainer-v1/out/weblab-explainer-v1.mp4`.
- [ ] **Review pass** — watched full-screen with audio; ship-ready quality.
- [ ] **Compression / export** — H.264 high profile, ~10 Mbps for 1080p; AAC stereo at 192 kbps. Tag with metadata (title, description, copyright).
- [ ] **Social cutdowns** — render 9:16 (30s) and 1:1 (30s) variants from re-rooted compositions.
- [ ] **Deploy** — drop into homepage hero (`apps/web/client/src/app/_components/hero/index.tsx`) replacing or augmenting the `UnicornBackground` for users who scroll, or into a dedicated section above the fold.
- [ ] **Changelog entry** — add to `apps/web/client/src/lib/changelog-entries.ts`. Bump version 0.1.
- [ ] **Blog post** — if "very major" tier, draft an MDX in `apps/web/client/content/blog/` announcing the explainer.

## 10. Validation Commands (for the future implementation session)

App-side validation (only relevant if the video build touches app code — usually not):

```bash
bun --filter @weblab/web-client typecheck
bun lint
```

HyperFrames composition validation (run inside `videos/explainer-v1/`):

```bash
npx hyperframes lint
npx hyperframes validate
npx hyperframes inspect
npx hyperframes preview
npx hyperframes render --output out/weblab-explainer-v1.mp4
```

For variants:

```bash
# Portrait 9:16 social cutdown
npx hyperframes render --variables '{"format":"portrait","duration":30}' --output out/weblab-explainer-v1-9x16.mp4

# Square 1:1 feed cutdown
npx hyperframes render --variables '{"format":"square","duration":30}' --output out/weblab-explainer-v1-1x1.mp4
```

(Variants assume the implementation session declares `format` and `duration` in `data-composition-variables`.)

---

## Open Decisions / Needed Assets

Items that block the build and require user input before the next session starts:

1. **Demo project content.** Confirm the prompt to seed (`A pricing page for a developer tool, dark, three tiers.`) or supply an alternative. The pricing-page output must be reviewed for visual quality before screen recording — a weak generated page will undermine the whole video.
2. **Deploy URL.** Reserve `*.weblab.build` subdomain for the demo (e.g., `pricing-demo.weblab.build`) so scene 9 shows a real address.
3. **Music license.** Pick a track and confirm license. Alternatively commission ~30 seconds of bespoke pad.
4. **Custom cursor.** Decide: system cursor (recommended) vs. branded dot.
5. **VO voice selection.** Which ElevenLabs voice — calm-female default ("Hope" / "Charlotte") or commission a custom clone?
6. **Vujahday Script in video?** The hero uses it for the italic "for builders" accent. Decision: include the same accent treatment in the video's end card, or keep the video Inter-only?
7. **Avatar (HeyGen).** Confirmed **out** in this plan. If the user wants a presenter cut, that's a separate v2 video, not a variant of v1.
8. **Hosting placement.** Confirm whether the video replaces the homepage hero `UnicornBackground` interaction or sits in a new section below it.
