# The Anatomy of AI Slop: A Field Guide to Taste, Craft, and the Generic SaaS Aesthetic

---

## 1. Executive summary

**AI slop isn't an aesthetic problem. It's an averaging problem.** Large models are trained on the median of the public web's UI code — shadcn starter kits, Tailwind tutorials, Vercel example repos, Dribbble showcase grids — and they regress to the statistical mean of that corpus. The result is a recognizable composite: Inter on a slate-900 background, indigo-to-violet gradient, three identical rounded-2xl cards with Lucide icons on top, an em-dashed headline, a "Trusted by" logo wall, and a 0.3s ease-out fade applied to everything. It looks plausible in a 1280px screenshot and falls apart in use.

**Human craft is fundamentally subtractive and opinionated.** Karri Saarinen (Linear), Emil Kowalski, Katie Dill (Stripe), Rauno Freiberg (Vercel), Ivan Zhao (Notion), and Josh Miller (Browser Company) all converge on the same thesis: the differentiator is no longer whether something works — AI made that floor near-free — it's whether someone with taste decided what *not* to do. Linear ships without A/B tests. Notion bans green from its office. Vercel uses one #0070F3 and nothing else. Things 3 shipped no Android version in 18 years. **The signature of human design is the courage to remove and the discipline to commit.**

**The five mechanistic failures behind AI slop are consistent.** First, *averaging-as-aesthetic*: the model outputs the centroid of training data, which is by definition unremarkable. Second, *framework defaults leaking through*: shadcn's `bg-indigo-500`, Tailwind's `slate` ramp, Lucide's 1.5px stroke, and Radix's animation timings are visible to anyone who's seen them once. Third, *no taste hierarchy*: when every element gets equal weight, every element gets equal padding, equal radius, equal shadow — and the eye has nowhere to land. Fourth, *no narrative*: AI cannot build emotional arc through a page because it cannot decide what the page is *for*. Fifth, *no editing pass*: humans subtract; models accumulate. Adam Wathan's 2025 apology — "I'm sorry for making every button in Tailwind UI use bg-indigo-500, which caused every AI-generated interface on Earth to turn purple" — is the single most honest sentence written about this phenomenon.

**What this document is.** A practitioner-sourced inventory of the specific tells experienced designers see instantly, the underlying mechanisms that produce them, the opposing craft signals found in exemplar products (Linear, Stripe, Apple, Raycast, Vercel, Notion, Things, Superhuman, Mercury, Arc, Craft), and a reusable anti-slop reviewer prompt. It assumes you already understand grids, contrast, and hierarchy. It is concerned with the layer above those: judgment, restraint, and the invisible details that separate "shipped" from "considered."

---

## 2. Top 50 AI design tells

Ranked roughly by severity and frequency, weighted by consensus across Bakaus' Impeccable, Krebs' deterministic detector, Refactoring UI, Kowalski's skill file, Rauno's craft essays, and Linear/Stripe published positions. Severity 1–10.

### Tier S — instant disqualifiers

**1. The shadcn signature visible in DOM (S=10)**
*The tell:* `border-input`, `bg-background`, `text-muted-foreground`, `ring-offset-background` class strings; identical Button variant proportions; Radix `data-state` attributes leaking default animation. *Why humans hate it:* it isn't a design, it's a configuration. The product has no point of view. *Why AI generates it:* shadcn is the most-trained-on React UI corpus on GitHub; v0 explicitly inherits it; Cursor/Claude Code default to it when "modern UI" is requested. *Reference:* HN item 43542734, DEV Community v0 reviews.

**2. The purple-to-indigo gradient on a dark background (S=10)**
*The tell:* `from-gray-900 via-purple-900 to-violet-900` or similar; "VibeCode purple." *Why humans hate it:* the gradient signals nothing about the product. *Why AI generates it:* Tailwind's default primary is near-violet; cool saturated hues are the safest contrast bet on dark surfaces, so LLMs reach for them when underspecified. Adam Wathan's published apology directly names this lineage.

**3. Inter (or Geist) at every weight, untouched (S=9)**
*The tell:* a single neutral grotesque used for hero, body, captions, and code labels with no OpenType features enabled. *Why humans hate it:* Inter became default-by-default — the visual equivalent of Helvetica in a 2009 portfolio. *Why AI generates it:* shadcn ships it; Next.js examples use it; LLMs have no model of why Söhne, ABC Diatype, Tiempos, GT America, or Berkeley Mono would be different. Rasmus Andersson (Inter's creator) explicitly warns against the Google Fonts version because it strips OpenType features.

**4. Identical icon-topped feature card grid in threes (S=10)**
*The tell:* three cards, each with a Lucide `Sparkles`/`Zap`/`Shield` icon on top, an H3, two lines of body, perfectly equal heights. *Why humans hate it:* it's a feature catalog, not a value proposition; every card has equal weight so nothing is the point. *Why AI generates it:* `<Card>` + `lucide-react` is the most-trained-on React composition; v0 emits this near-100% of the time when "features section" appears in the prompt.

**5. Centered everything (S=9)**
*The tell:* hero text centered, eyebrow pill centered, two buttons centered, logo wall centered, every section centered. *Why humans hate it:* centered is the absence of decision — left-alignment requires the designer to commit to where the reader's eye starts. *Why AI generates it:* it's symmetric, it never breaks, it works at every viewport — the safest default.

**6. Hero eyebrow pill above an oversized italic-serif headline (S=9)**
*The tell:* `[ NEW ]` tracked uppercase chip, then "Build the future of *work*" with the italic serif (usually Instrument Serif or PP Editorial New) wrapping one word. *Why humans hate it:* it was novel in early 2024, became universal by mid-2024, and now signals taste-by-imitation. *Why AI generates it:* it absorbed the pattern from Twitter screenshots of 2024's "tasteful landing pages."

**7. Em-dash overuse in marketing copy (S=9)**
*The tell:* three or more em dashes per paragraph, the aphoristic "Not a feature — a platform — built for teams that actually ship" cadence. *Why humans hate it:* the rhythm is robotic; real human copy varies its punctuation. *Why AI generates it:* RLHF on "elegant" prose data overweights the em dash. OpenAI shipped suppression in custom instructions Nov 2025 specifically because of this.

**8. Side-tab thick colored left border on a rounded card (S=9)**
*The tell:* a 4px solid accent border on the left of an otherwise-bordered card, often paired with a colored icon. *Why humans hate it:* Krebs' designers put it bluntly — "almost as reliable a sign of AI-generated design as em dashes for text." *Why AI generates it:* it's the canonical "callout" pattern in every Tailwind tutorial.

**9. Nested cards inside cards (S=8)**
*The tell:* a bordered card containing a bordered card containing a bordered list item. *Why humans hate it:* it's a hierarchy failure dressed as containment; the borders fight each other. *Why AI generates it:* `<Card>` is the default container in shadcn; LLMs nest containers when the right answer is spacing or typography.

**10. Glassmorphism over a gradient mesh (S=8)**
*The tell:* `backdrop-blur` cards over a saturated gradient background. *Why humans hate it:* contrast collapses, text becomes unreadable on scroll, and it's a 2022 Dribbble fashion that overstayed. *Why AI generates it:* it photographs well at 1× and "looks modern" in static screenshots.

### Tier A — strong tells

**11. Default Lucide / Heroicons used unmodified (S=8).** Same 1.5px stroke as 2 million other sites. Hugeicons: "Icons stop being a design asset and instead signal 'generic template.'" AI uses `lucide-react` because shadcn does.

**12. `rounded-2xl` on cards, `rounded-lg` on inputs, `rounded-full` on buttons — but the same on everything inside (S=8).** No nested-radius math (parent = child + padding). Lily Konings's rule violated by every shadcn nested layout.

**13. Tailwind `shadow-md`/`shadow-lg` unmodified (S=8).** Single-layer black shadow with no vertical offset and no spread variation. Schoger's named tell. Real craft uses 3+ layered transparent shadows with consistent light direction.

**14. The "Trusted by" logo wall with no context (S=7).** Five faded gray monochrome logos under "Trusted by leading teams" with no link, no testimonial, no specificity.

**15. Straight quotes and hyphens used as ranges (S=7).** `it's` instead of `it's`; `9-5pm` instead of `9–5 pm`. The single most invisible tell that nobody reviewed the rendered output.

**16. No tabular numerals on changing data (S=7).** Dashboard counters jiggle when they update. `font-variant-numeric: tabular-nums` is one CSS declaration that AI never emits.

**17. Bento grid copying Apple's iPhone 15 page without information hierarchy (S=7).** Asymmetric tile grid with no reason for the asymmetry. Bento works when the cells are *unequal in importance*; AI makes them equal in importance but unequal in shape — backwards.

**18. The 99.9% / 200ms / 10× stat banner (S=7).** Hero metric layout with one big number, three supporting stats, gradient accent. Bakaus: "Used everywhere, trusted nowhere."

**19. Gradient text on headlines (S=7).** `bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text`. Was novel for one quarter in 2023.

**20. Permanent dark mode with glowing accents and barely-passing contrast (S=7).** HN consensus: "Dark mode/terminal font/high text density presents as 'cool looking' at first glance for one-shotting evals." Accessibility fails on subtext.

**21. Three-tier pricing cards with the middle one elevated (S=7).** v0 spits this out unprompted. Identical structure across every SaaS in existence.

**22. Numbered section kickers — "01 / 02 / 03" (S=7).** Editorial scaffolding without editorial content underneath.

**23. Hairline 1px border + wide soft shadow on the same element (S=7).** Schoger/Bakaus: commit to a defined edge *or* a soft elevation, never both.

**24. Tailwind `slate` / `zinc` grays as the entire neutral ramp (S=6).** Recognizable from across the room. Real design systems tint neutrals with brand hue.

**25. `transition: all 200ms ease-out` applied to every interactive element (S=7).** No differentiation between hover, press, focus, and state change. Linear timing is robotic; ease-out is fine; uniform-everywhere is the tell.

### Tier B — craft-level micro-tells

**26. Mismatched nested corner radii (S=7).** Outer radius 24px, child radius 24px, padding 8px → wider gap at corners than sides. Once seen, can't be unseen.

**27. Mathematical centering instead of optical centering (S=7).** Play triangle stuck to the left of its circle; chevron drifting on hover.

**28. Single-weight typography hierarchy (S=7).** "Headline" is 24px/600, "subhead" is 18px/600, "body" is 16px/400 — all on the same font. Refactoring UI's named failure. Real hierarchy varies *weight, size, color, and tracking* simultaneously.

**29. `outline: none` without a `:focus-visible` replacement (S=7).** Accessibility regression and a craft regression. WCAG 2.4.11 requires 3:1 contrast and 2px thickness.

**30. Hover state changes only background color (S=6).** A real hover coordinates 2+ properties: background + text-color + shadow elevation + (sometimes) scale. Single-property hovers read as default.

**31. Animated keyboard-triggered actions (S=8).** Cmd+K opening with a 500ms animation. Both Rauno and Kowalski independently name this. Raycast deliberately ships no enter animation because the action repeats hundreds of times a day.

**32. Animations on `width`/`height`/`padding`/`margin` instead of `transform` and `opacity` (S=7).** Triggers layout + paint = jank. Composite-only properties are the only ones designers should animate.

**33. Spring physics applied to non-physical UI (S=6).** Bounce on a dialog. Elastic on a card. Spring is for things that should feel physical (drawers, gestures, dynamic-island). Snap-easing for everything else.

**34. Uniform stagger timing in lists (S=6).** Every item delayed 200ms; should be 30–80ms or the page feels theatrical.

**35. Dropdown growing from `transform-origin: center` instead of the trigger (S=6).** Radix sets `--radix-dropdown-menu-content-transform-origin` automatically; AI-generated dropdowns don't.

**36. No `prefers-reduced-motion` gate (S=6).** Accessibility regression. Kowalski's hard rule.

**37. `text-balance` missing from headlines (S=5).** Headline breaks awkwardly across mobile, leaving an orphan word. Or worse, `text-balance` is on but produces unnatural breaks because the headline copy wasn't written for it.

**38. Pure `#FFFFFF` and pure `#000000` (S=6).** Linear uses `#08090a` for pitch-black; Vercel uses near-pure but Linear/Stripe explicitly avoid pure. Pure white on OLED is fatiguing.

**39. `border-radius` instead of squircles where iOS context is implied (S=5).** G1-join "kink" visible to trained eyes. Apple has used G2 since iOS 7; Chrome 139+ supports `corner-shape: squircle`.

**40. Icon stroke weight that doesn't match adjacent type weight (S=6).** Lucide's 1.5px stroke next to Inter 400 is acceptable; next to Inter 700 hero text it looks anemic.

**41. Tinted near-black or near-white image outlines (S=6).** Krehel's named tell: `rgba(slate, 0.1)` outline picks up surface color and reads as "dirt on the image edge." Must be pure black or pure white at low alpha.

**42. No `hanging-punctuation: first last` on blockquotes (S=4).** Quote marks "bite" into the left edge instead of hanging optically.

**43. No optical sizing axis enabled (`font-optical-sizing: auto`) on a variable font that supports it (S=5).** A 64px headline rendered with the 16px master looks chunky.

**44. Equal padding inside container (`p-6` everywhere) (S=5).** Buttons need horizontal padding ≈ 2× vertical; all-caps text needs more bottom than top padding to optically center; AI doesn't know either rule.

**45. Generic SaaS verbs in copy (S=7).** "Supercharge / streamline / unlock / leverage / world-class / empower / elevate / robust / seamless." Stripe's antidote: declarative + specific. "Accept payments on your website" beats "Unlock seamless payment experiences."

**46. Title Case In Every Button And Label (S=6).** Modern craft default is sentence case everywhere except product/feature names. Stripe, Linear, GitHub, Notion, Vercel all do this.

**47. Modal-with-internal-scroll for complex settings (S=6).** Bakaus' quality rule. If it needs to scroll, it doesn't belong in a modal.

**48. Dropdown clipped by `overflow: hidden` parent (S=6).** LLMs don't reason about stacking contexts; portal-rendering popovers is craft.

**49. Hand-drawn SVG "no data yet 🌱" empty state (S=5).** Generic illustration where copy + a CTA would do. Linear's empty state includes the keyboard shortcut to create the first item — that's the difference.

**50. Voice register shifts across the product (S=7).** Hero is breezy, error toast is formal, billing email is robotic, in-app tooltip is sarcastic. AI cannot maintain a single human voice across the full surface area; humans test by reading the whole product aloud.

---

## 3. Root causes

### The averaging problem
HN user `classified` said it most precisely: "AI represents the average of the majority, not of the best." A model trained on every Tailwind tutorial scraped from GitHub between 2019 and 2024 outputs the centroid of that corpus. The centroid is by definition the *least surprising* design — which is the *most generic*. Every taste signal a designer learns to value (asymmetry, restraint, density, opinionated color) is, statistically, a deviation from the mean. The model is structurally biased against the very qualities that signal craft.

### The framework default leak
Paul Bakaus diagnosed this exactly: "The AI slop aesthetic isn't a model problem. It's a vocabulary problem. Developers prompt AI with 'make it look good' because they don't know terms like tinted neutrals, vertical rhythm, or fluid typography. The AI obliges with Inter font, gray backgrounds, and cards wrapping everything." shadcn's `bg-indigo-500` becomes every AI button. Tailwind's `slate-900` becomes every dark background. Lucide's 1.5px stroke becomes every icon. Radix's `data-state` animations become every transition. The defaults are visible because they're the same defaults across millions of sites. Adam Wathan's apology is the canonical confession.

### No taste hierarchy
Karri Saarinen's Config 2025 keynote framed it this way: "Unification often becomes standardization. When everything is built from the same primitives, the same patterns of thought are endlessly reproduced. Tools can raise the minimum quality bar, but they can also quietly lower the ceiling of possibility." Models have no model of what *deserves* emphasis. Every container becomes a card. Every text becomes 16px/400. Every spacing becomes `gap-4`. Without a hierarchy of importance, there is no focal point, and without a focal point the user has nowhere to look first — every element competes equally for attention, and the eye gives up.

### No intentional asymmetry
Real layouts have a center of mass that isn't the geometric center. The eye is drawn to imbalance, to negative space that "earns" its emptiness against a heavy element. Models output symmetric layouts because symmetry never breaks at any viewport — it's the safest move under uncertainty. But safety is the opposite of intention. Linear's interfaces are aggressively dense on the left (issue list) and aggressively sparse on the right (detail pane). That asymmetry is the design.

### No restraint
Models accumulate. Humans subtract. Saarinen on Linear: "Quality is more like the mindset and the activity you do. The quality or beauty is the output." Ivan Zhao on Notion: "Every feature we add, we ask: does this make Notion more powerful without making it more complicated? If adding a feature requires adding explanatory text, we've failed." Michael Flarup on icons: "Try removing details from your icon until the concept starts to deteriorate." The reduction reflex is the most consistently absent skill in AI-generated work.

### No narrative arc
A landing page is a sequence: stakes, problem, evidence, resolution, call to action. AI generates each section independently and stacks them, producing a page with no rising action. There's no "this is the problem, *now look at this*" beat. Every section has the same weight, the same cadence, the same composition. The reader scrolls past it.

### No brand point of view
Linear is black with purple. Vercel is monochrome with one blue. Stripe is layered indigo gradients. Mercury is restrained charcoal. Notion is warm cream. These are *editorial decisions* — Notion bans green from its office because green doesn't harmonize with the brand. AI has no editorial decisions because it has no brand. It outputs every site as if the prompt were "modern SaaS," which produces "the modern SaaS aesthetic" — a category, not an identity.

### Optimizing for screenshots, not use
A model's training signal for visual quality comes from images and screenshots, not from interaction logs. So it optimizes for what looks plausible *frozen* — gradients, glassmorphism, hero composition — and ignores what works *in motion* — hover coordination, focus rings, empty states, error grace, keyboard speed. The result is designs that "demo well" and "use badly." Brian Lovin: "When you actually try it in the browser, you notice a ton of problems. All of a sudden you're clicking things, you notice loading states." AI doesn't notice because AI doesn't click.

### The specification gap
Adrian Krebs and Bakaus both isolated this: users prompt with "modern" or "clean" or "make it look good" — non-operational language. The model fills the gap with the highest-frequency pattern in its training data: the centroid. The fix isn't a better model; it's a designer specifying *operational* constraints — "tabular numerals on all stats," "near-black not pure black," "single accent under 5% of viewport area." The vocabulary gap is causal.

### The taste-engineering gap
Ludwig Pettersson (ex-Stripe, original OpenAI designer): "Great designers must have a balance of taste and engineering ability. The best designs quickly break down if the technology does not support them." AI has engineering capacity (it ships working code) without taste judgment (it doesn't know which ship was the right one). Rauno Freiberg's argument that "code is the medium" cuts in the opposite direction here — designs need to be tested in the material they ship in. Models can't iterate in the material because they don't *use* what they ship.

### The bar collapse
Tobias van Schneider: "If we collectively stop demanding excellence, the people capable of creating it stop providing it, and the entire economy of taste/quality dies of neglect." When the floor of "shipped" is "looks like a shadcn page," the bar for "exceptional" collapses too, because most reviewers have lost the ability to distinguish. This is why Katie Dill's framing matters: the role of taste in the AI era is not to raise the floor (AI handled that) but to relocate the ceiling — to the **15 out of 10 moments** that AI cannot generate because they require subtraction.

---

## 4. Top 50 human taste signals

What separates Linear, Stripe, Apple, Raycast, Vercel, Notion, Things, Superhuman, Mercury, Arc, Craft, Framer, and Anthropic from generic SaaS.

**1. One brand color, used under 5% of viewport area.** Vercel's blue, Linear's purple, Stripe's indigo, Mercury's accent. AI uses three accent colors at once; humans pick one and starve it.

**2. Near-black, not pure black.** Linear's `#08090a`. Pure `#000` is harsh on OLED, fatiguing in dark mode, and amateur in light mode. AI defaults to `#000`.

**3. Tinted neutrals.** Brand-tinted grays (5–10% saturation toward the brand hue) so the neutrals feel like part of the palette, not the absence of one. Refactoring UI's "Grays aren't usually totally desaturated."

**4. OKLCH ramps instead of HSL.** Stripe's published color blog. Perceptually uniform — `oklch(0.7 0.2 60)` and `oklch(0.7 0.2 240)` actually look equally bright, while HSL lies. AI emits hex codes or HSL.

**5. Custom typeface (or an unusual choice).** Söhne, ABC Diatype, Tiempos, GT America, Geist, Inter Display + Inter Text paired, Berkeley Mono. The absence of Inter at default weight is a taste signal in itself.

**6. Optical sizing enabled.** `font-optical-sizing: auto` on variable fonts. SF Pro switches between Text and Display at 20pt. AI never enables this.

**7. Tabular numerals on data.** `font-variant-numeric: tabular-nums` everywhere counters update. The single CSS line that separates a real dashboard from a demo.

**8. Smart quotes and proper dashes.** `'`/`'`/`"`/`"`/`—`/`–`. Marcin Wichary's Medium QSH heuristic. AI ships `'` and `-`.

**9. Sentence case everywhere except product names.** Stripe, Linear, GitHub, Notion, Vercel. Title Case On Every Button reads as 2014.

**10. Density that respects power users.** Linear's issue tables, Raycast's tight rows, Superhuman's keyboard density, Things' stacked rows. Information density signals respect; whitespace bloat signals demo-mode.

**11. Asymmetric layouts with an obvious focal point.** Linear's heavy left / sparse right. Stripe's dense product card / open marketing hero. Eye knows where to land.

**12. Nested radii respecting the parent = child + padding formula.** Lily Konings's rule. Linear, Apple, Stripe all honor it; shadcn defaults don't.

**13. Multi-layer shadows with consistent light direction.** Three transparent layers, vertical offset always positive (light from above), negative spread to hold them back. Schoger's signature shadow.

**14. Inset highlights on dark surfaces.** A barely-visible `inset 0 1px 0 rgba(255,255,255,0.08)` simulates a lit edge. Linear and Raycast use it on every elevated button.

**15. Differentiated radii by component class.** Buttons 6px, cards 12px, modals 16px, inputs 6–8px, pills 9999px. Not `rounded-lg` on everything.

**16. Squircles (G2 corners) where iOS context is implied.** Figma's 60% corner smoothing matches iOS; CSS `corner-shape: squircle` (Chrome 139+). Eye sees the difference even if it can't articulate it.

**17. Custom icon set or modified library.** Linear's proprietary icons, Raycast's James McDonald set, Vercel's Geist Icons, Apple's SF Symbols matched to SF Pro. Stroke width tuned to type weight per size.

**18. `:focus-visible` with brand-colored ring.** 2px outline, 2px offset, optional halo via `box-shadow` color-mix. WCAG-compliant and crafted.

**19. Hover states that coordinate 2+ properties.** Linear's hover: background brightens 4%, text shifts to white, no transform. Single-property hover (bg only) reads as default.

**20. Press states with scale.** `transform: scale(0.98)` on `:active` plus a touch darker bg. Mimics physical press. iOS-native feeling on web.

**21. Animation only on transform and opacity.** Composite-only properties. No `width`/`height`/`padding` animations. Kowalski's hard rule.

**22. Ease-out at 150–200ms for snappy UI, springs only for physical components.** Linear's defaults; Vaul (drawers) and Sonner (toasts) demonstrate the distinction.

**23. No animation on keyboard-triggered actions.** Raycast principle. Rauno and Kowalski independently named.

**24. Interruptible animations.** CSS transitions, not keyframes. Drawer can close mid-open without "waiting for the opening to finish." Framer Motion's signature capability.

**25. `prefers-reduced-motion` gates.** Every meaningful animation respects user preference.

**26. Stagger delays of 30–80ms in lists.** Not 200ms. Anything theatrical reads as cheap.

**27. `transform-origin` matched to trigger.** Dropdowns grow from their button location, not from center. Radix handles this automatically.

**28. Skeleton loaders with shimmer for >300ms loads.** Not full-screen blocking spinners. Linear, GitHub, Vercel all converge on this.

**29. Empty states with keyboard shortcuts.** Linear: "Nothing here. Press Cmd+N to create your first issue." Empty states as first-class UI surface, not decorative afterthoughts.

**30. Error copy that specifies field, constraint, and remedy.** Stripe's error voice. Never "Error 401."

**31. Voice consistency tested by reading the product aloud.** Hero, in-app tooltip, error toast, billing email — same voice.

**32. Hanging punctuation on blockquotes.** `hanging-punctuation: first last`. Even Safari-only support is a taste signal — designers who know it polyfill it.

**33. `text-wrap: balance` on headlines, `text-wrap: pretty` on body.** Andy Bell / Krehel pattern.

**34. Headline copy written for the page, not the model.** Specific verbs ("Accept payments," "Plan and build products") not generic ("Supercharge your workflow").

**35. Optical centering on icons inside containers.** Play triangles offset 5–8% right of geometric center. Chevrons offset on hover. Krehel + Vlastiuk.

**36. Padding asymmetry on all-caps and icon-text combos.** All-caps gets more bottom padding than top to optically center. Icon-text buttons get more padding on the text side.

**37. Tighter tracking at larger sizes.** `-0.022em` for display, `-0.011em` for body, positive tracking for small caps. Linear's published token values.

**38. Line-height that scales inversely with size.** 1.5–1.7 for body, 1.1–1.25 for display headlines. Big type at body line-height looks like it's floating.

**39. Distinctive type pairing.** A geometric sans + a high-contrast serif (Tiempos + Söhne; Inter + Inter Display; Geist + Geist Mono). Single grotesque for everything is the SaaS default.

**40. The `:has()` selector used for parent-state styling.** Crafted hover states that affect adjacent siblings. Modern CSS as a craft tool.

**41. Custom-tinted scrollbars matching the surface.** Linear, Notion, Things — all customize. shadcn defaults don't.

**42. Selection color matched to brand.** `::selection { background: var(--brand); }`. One CSS line that says someone thought about it.

**43. Caret-color matched to brand.** Input cursor in brand color. Linear, Raycast, Mercury all do this.

**44. Sub-pixel anchor adjustments.** Headlines aligned to optical center of cap-height, not to bounding box. Margins specified relative to baseline grid.

**45. Real shadows on real elevation contexts only.** Modals get shadows, table rows don't, buttons sometimes do. Differentiated by component role, not applied universally.

**46. Single-side borders for hierarchy.** A `border-left: 2px solid var(--accent)` on a focused list item — Linear's pattern. More designed than a full bordered box.

**47. Brand color reserved for backgrounds, not chrome.** Linear's purple is mostly a background hue; the wordmark is monochrome. The brand isn't sprinkled — it's anchored.

**48. Custom illustration system or no illustrations at all.** Stripe's hand-crafted product icons, Notion's signature face glyphs, Linear's hand-redrawn icons in the 2026 refresh. Vercel chose no illustration. Plastic 3D blob renders are the slop default.

**49. Real photography or none.** Stock photos of impossibly diverse smiling teams = slop. Mercury, Linear, Apple, Stripe all avoid stock photography.

**50. The reduction reflex.** The single most consistent signal across every exemplar. Saarinen on Linear shipping process. Zhao on Notion features. Flarup on icons. Refactoring UI's "remove until the concept breaks." Things 3 shipping no Android version in 18 years. The discipline to delete is the watermark of human-made design.

---

## 5. Never-do rules (100)

1. Never center every section by default.
2. Never use pure `#000000` or `#FFFFFF`.
3. Never use Tailwind's `slate`, `zinc`, or `gray` ramps unmodified as your neutrals.
4. Never use `bg-indigo-500` as a primary.
5. Never apply purple-to-pink or purple-to-cyan gradients as page backgrounds.
6. Never use gradient text on headlines as decoration.
7. Never animate keyboard-initiated actions.
8. Never animate layout-affecting properties (`width`, `height`, `padding`, `margin`, `top`, `left`).
9. Never use `transition: all`.
10. Never use linear easing.
11. Never use spring physics on non-physical UI components.
12. Never set durations above 300ms for snappy in-app interactions.
13. Never use `outline: none` without a `:focus-visible` replacement.
14. Never use a single-property hover state.
15. Never apply the same border-radius to nested elements.
16. Never combine a hairline border with a wide soft shadow on the same element.
17. Never use a single-layer black `box-shadow`.
18. Never use shadows that lack a vertical offset.
19. Never use shadows with inconsistent light direction across a screen.
20. Never use `rounded-2xl` on every card.
21. Never use the default Lucide or Heroicons set without modification, restyling, or rejection.
22. Never use the Sparkles / Zap / Rocket / Shield icons for AI features.
23. Never use emoji as section bullets in serious product UI.
24. Never use icon-on-top-of-card grids of three with equal heights.
25. Never use a "Trusted by" logo wall without context, links, or testimonials.
26. Never use the eyebrow-pill + oversized-headline + italic-serif-accent-word hero pattern.
27. Never use the `01 / 02 / 03` numbered section kicker.
28. Never use the hero stat banner (one big number, three supporting stats, gradient accent).
29. Never copy Apple's iPhone 15 bento grid without earning the asymmetry through information hierarchy.
30. Never apply glassmorphism without a contrast plan for scroll positions.
31. Never use plastic 3D blob illustrations.
32. Never use stock photography of impossibly diverse smiling teams.
33. Never use generic SaaS verbs ("supercharge," "streamline," "unlock," "leverage," "elevate," "empower," "robust," "seamless").
34. Never use more than two em dashes in a paragraph.
35. Never use straight quotes (`'`, `"`) in rendered copy.
36. Never use hyphens for date or number ranges.
37. Never use Title Case In Buttons unless the brand voice demands it.
38. Never put a period at the end of a button label.
39. Never let voice register shift across hero, in-app, error, and email.
40. Never write copy that survives a global find-and-replace of the product name.
41. Never use Inter for everything when the brief calls for personality.
42. Never use the Google Fonts version of Inter — it strips OpenType features.
43. Never use one weight for both headlines and body.
44. Never let your type scale steps land closer than 1.25× apart.
45. Never skip tabular numerals on dashboard counters, prices, or timers.
46. Never skip optical sizing on variable fonts that support it.
47. Never apply the same tracking value at every size.
48. Never let a headline orphan a single word on a new line — use `text-wrap: balance` or `&nbsp;`.
49. Never set body line-height tighter than 1.5 for paragraphs over 60 characters wide.
50. Never set display headline line-height looser than 1.25.
51. Never use measure lengths over 75 characters of body text.
52. Never use centered alignment for body text longer than two lines.
53. Never wrap every element in a card.
54. Never nest more than two cards.
55. Never use a side-tab colored border on a rounded card as a callout.
56. Never use bordered containers when spacing solves the same problem.
57. Never use a 1px border that's a solid mid-gray — use transparency.
58. Never use the same padding inside every container.
59. Never use equal padding on horizontal and vertical axes for text-only buttons.
60. Never use mathematical centering for asymmetric icons (play, chevron, triangle).
61. Never use mathematical centering for all-caps text inside containers.
62. Never use the same icon stroke weight at every size.
63. Never use icon stroke weights that don't match adjacent type weights.
64. Never use a tinted near-black for image outlines — use pure black at low alpha.
65. Never use saturated brand color for body text on a colored background — use the same hue at adjusted saturation/lightness.
66. Never extend a color ramp by sliding lightness only — rotate hue toward warm for lighter, cool for darker.
67. Never use rainbow accent palettes.
68. Never use more than one accent color in a single screen unless it carries semantic meaning.
69. Never use color as the only signal for state (add icon, weight, or text).
70. Never use color contrast below 4.5:1 on body text.
71. Never use color contrast below 3:1 on focus rings or borders.
72. Never use random gradients without semantic intent.
73. Never use gradient backgrounds on full sections without a contrast plan.
74. Never use modals with internal scroll for complex settings.
75. Never use modals to confirm low-stakes actions — use undo toasts.
76. Never use dropdowns that get clipped by `overflow: hidden` parents — portal them.
77. Never use a full-screen blocking spinner for any operation under 1 second.
78. Never use a spinner where a skeleton would work better.
79. Never use a generic "no data yet" illustration where copy and a CTA would do.
80. Never use the same empty-state pattern for "empty by default" and "empty by filter."
81. Never use generic error codes ("Error 401") as user-facing copy.
82. Never use motion to draw attention to something that should be designed in.
83. Never use micro-interactions as decoration unrelated to function.
84. Never use stagger delays over 80ms in lists.
85. Never grow dropdowns from `transform-origin: center` — origin from the trigger.
86. Never animate without `prefers-reduced-motion` gating.
87. Never use bounce or elastic easing on non-physical interface elements.
88. Never use `hover:` styles on touch devices without `@media (hover: hover)` gating.
89. Never use focus rings that match background color too closely.
90. Never use custom scrollbars that hide affordance.
91. Never use sticky elements that obscure content on small viewports.
92. Never use scroll-snap on long-form content.
93. Never use parallax on text-heavy sections.
94. Never use auto-playing video with sound.
95. Never use cookie banners with dark patterns.
96. Never use any visual gimmick more than once per component.
97. Never combine glassmorphism with bento grid with neumorphism.
98. Never use `text-shadow` for emphasis on body copy.
99. Never use uppercase tracking on body text.
100. Never ship without reading the entire product surface aloud in one sitting.

---

## 6. Always-prefer rules (100)

1. Prefer subtraction over addition.
2. Prefer hierarchy over decoration.
3. Prefer spacing over borders.
4. Prefer typography over color.
5. Prefer color over icons.
6. Prefer one opinionated choice committed to over five hedged ones.
7. Prefer left-alignment over centering.
8. Prefer asymmetric layouts with a focal point over balanced ones.
9. Prefer density over whitespace for power-user surfaces.
10. Prefer whitespace over chrome for marketing surfaces.
11. Prefer one accent color used sparingly over multiple accents used everywhere.
12. Prefer near-black (`#0a0a0a`) over pure black.
13. Prefer near-white (`#fafafa`) over pure white.
14. Prefer tinted neutrals over fully desaturated grays.
15. Prefer OKLCH over HSL for ramp generation.
16. Prefer brand color in backgrounds over brand color in chrome.
17. Prefer multi-layer transparent shadows over single-layer black ones.
18. Prefer consistent light source (top, positive Y offset) for all shadows.
19. Prefer negative spread on shadows to keep them held back.
20. Prefer inset highlights on dark surfaces for elevated elements.
21. Prefer differentiated radii per component class.
22. Prefer squircles where iOS feel is implied.
23. Prefer the parent = child + padding formula on nested radii.
24. Prefer `border` with transparency over solid gray.
25. Prefer single-side borders for hierarchy.
26. Prefer custom typefaces over Inter at default weight.
27. Prefer Inter Display + Inter Text pairing over Inter alone.
28. Prefer optical sizing enabled (`font-optical-sizing: auto`) on variable fonts.
29. Prefer tabular numerals (`font-variant-numeric: tabular-nums`) for all data.
30. Prefer lining figures in UI, oldstyle figures in editorial prose.
31. Prefer smart quotes and proper dashes always.
32. Prefer em dashes for parentheticals, en dashes for ranges, hyphens only for compounds.
33. Prefer sentence case everywhere except product names.
34. Prefer no trailing period on button labels.
35. Prefer specific verbs over generic SaaS verbs.
36. Prefer one voice across hero, in-app, error, and email.
37. Prefer copy that wouldn't survive find-and-replace of the product name.
38. Prefer `text-wrap: balance` on headlines, `text-wrap: pretty` on body.
39. Prefer measure lengths between 45 and 75 characters of body text.
40. Prefer 1.5–1.7 line-height for body, 1.1–1.25 for display headlines.
41. Prefer tighter tracking at larger sizes, looser at small caps.
42. Prefer type scales with steps ≥ 1.25× apart.
43. Prefer hanging punctuation on blockquotes.
44. Prefer custom icon sets or modified libraries over default Lucide/Heroicons.
45. Prefer icon stroke weights matching adjacent type weights.
46. Prefer pixel-snapped icons at 16px and below.
47. Prefer optical centering over mathematical centering for asymmetric shapes.
48. Prefer padding asymmetry on all-caps text and icon-text combos.
49. Prefer focused information density on power-user screens.
50. Prefer asymmetric hierarchy on marketing screens (one focal point, supporting detail).
51. Prefer real product screenshots over decorative imagery.
52. Prefer no imagery over generic stock imagery.
53. Prefer hand-crafted illustration over plastic 3D renders.
54. Prefer 2+ coordinated property changes on hover.
55. Prefer scale-down press states (`transform: scale(0.98)`).
56. Prefer custom `:focus-visible` rings in brand color with 2px offset.
57. Prefer brand-tinted selection color (`::selection`).
58. Prefer brand-tinted caret color in inputs.
59. Prefer brand-tinted scrollbars on long-scroll surfaces.
60. Prefer empty states with copy and a clear CTA (and keyboard shortcut where relevant).
61. Prefer error copy that names field, constraint, and remedy.
62. Prefer undo toasts over confirmation modals for low-stakes actions.
63. Prefer skeleton loaders for loads above 300ms.
64. Prefer spinner only for sub-300ms operations.
65. Prefer portal-rendered popovers over `overflow: visible` hacks.
66. Prefer interruptible animations via CSS transitions over keyframes.
67. Prefer composite-only animation properties (`transform`, `opacity`).
68. Prefer ease-out 150–200ms for snappy interactions.
69. Prefer springs only for physically motivated UI (drawers, gestures).
70. Prefer no animation for keyboard-triggered actions.
71. Prefer staggered delays of 30–80ms in lists.
72. Prefer `transform-origin` matched to the trigger element.
73. Prefer `prefers-reduced-motion` respected globally.
74. Prefer `@media (hover: hover)` gating on hover effects.
75. Prefer one visual gimmick per component, not three layered.
76. Prefer real shadows on elevation contexts only.
77. Prefer background-color shifts over borders inside list components.
78. Prefer color contrast comfortably above WCAG minimums.
79. Prefer color as semantic signal (success/warning/destructive), not decoration.
80. Prefer status colors desaturated vs. brand color.
81. Prefer reading the entire product surface aloud as a copy review.
82. Prefer prototyping in the production medium over Figma fidelity.
83. Prefer "would Linear ship this?" as a quality test.
84. Prefer the parent designer / engineer pair owning a feature end-to-end.
85. Prefer trusting taste and intuition over A/B testing on craft decisions.
86. Prefer customer-aligned conviction over data-aligned compromise.
87. Prefer naming new things with memorability over discoverability (Sonner > react-toast).
88. Prefer opinionated defaults over infinite configuration.
89. Prefer fewer features done excellently over many features done adequately.
90. Prefer subtracting features over adding helper text to explain them.
91. Prefer specific over generic in every copy choice.
92. Prefer "show, don't tell" — a real screenshot beats marketing copy.
93. Prefer keyboard-first navigation on product surfaces.
94. Prefer command palette as a first-class primitive on dense apps.
95. Prefer monospace for transaction IDs, hashes, and code.
96. Prefer real-time validation over post-submit error pages.
97. Prefer inline editing over modal-based editing for in-place changes.
98. Prefer hover-revealed actions over always-visible action clutter.
99. Prefer differentiated empty states for "empty by default" vs. "empty by filter."
100. Prefer the reduction reflex — every shipped element should defend its right to exist.

---

## 7. Anti-slop design reviewer (system prompt)

```
ANTI-SLOP DESIGN REVIEWER

You are a senior product designer with the taste bar of Linear,
Stripe, Apple, Raycast, and Vercel. You review interfaces — websites,
mobile apps, desktop apps, SaaS products, dashboards, and marketing
pages — and ruthlessly remove the patterns that mark a design as
AI-generated, template-based, or generic. You replace those patterns
with opinionated, restrained, human-feeling craft.

OPERATING PRINCIPLES

1. Your default move is subtraction. If a card, border, gradient,
   icon, illustration, or animation does not earn its presence, remove
   it. Spacing and typography solve 80% of "needs more visual
   interest."

2. You assume the floor is "shadcn + Tailwind + Lucide + Inter on
   slate-900 with a purple gradient." Your job is to deviate from that
   floor on every screen, in ways that signal taste and conviction.

3. You commit to one opinionated visual choice per surface — a
   distinctive type pairing, an unusual accent color used sparingly,
   an asymmetric layout, a custom icon family, an unusual color
   temperature — and starve everything else.

4. Every element must defend its right to exist. Ask: would removing
   it make the design worse, or just different?

5. You write criticism in specific, operational language: "increase
   tracking to -0.022em at this size," not "make it more refined."

FORBIDDEN PATTERNS (auto-reject if present)

— Tailwind defaults visible: `bg-indigo-500`, `slate-900`, `zinc-`,
  `gray-` neutrals unmodified, `shadow-md`/`shadow-lg`/`shadow-xl`
  unmodified, `rounded-2xl` on every card, `transition-all`.
— shadcn signatures: `border-input`, `bg-background`,
  `text-muted-foreground`, `ring-offset-background`, untouched Button
  variant set with default proportions.
— Inter (or Geist) at every weight on every screen with no OpenType
  features enabled. If Inter is used, require Inter Display + Inter
  Text pair with `font-feature-settings: 'cv11', 'ss01', 'tnum'` or
  equivalent.
— Lucide / Heroicons used without modification. Require custom icon
  set, or modified strokes, or rejection in favor of typography.
— Purple-to-pink, purple-to-cyan, indigo-to-violet gradient
  backgrounds. Reject unless the brand is genuinely violet (Linear,
  Figma) and the gradient is functional, not decorative.
— Centered hero with eyebrow pill + oversized italic-serif headline +
  two pill buttons + scroll-down indicator. Auto-reject.
— Three identical icon-topped feature cards in a row. Auto-reject.
— Side-tab colored left border on a rounded card. Auto-reject.
— "Trusted by" logo wall without links, testimonials, or specificity.
  Auto-reject.
— Stat banner with one big number + three supporting stats +
  gradient accent. Auto-reject.
— Hero metric layout: "99.9% uptime / 200ms p50 / 10× faster."
  Auto-reject.
— Bento grid with cells of unequal shape but equal information
  weight. Auto-reject.
— Pricing tier with middle column elevated and labeled "Most
  Popular." Auto-reject the pattern; replace with comparison logic.
— Glassmorphism cards over gradient mesh. Auto-reject.
— Plastic 3D blob illustrations. Auto-reject.
— Em-dash density above two per paragraph. Replace with varied
  punctuation.
— Straight quotes and hyphens-as-ranges. Replace with `'`/`"`/`—`/`–`.
— Title Case In Every Button. Replace with sentence case.
— Generic SaaS verbs (supercharge, streamline, unlock, leverage,
  elevate, empower, seamless, robust). Replace with specific verbs.
— Animated keyboard-triggered actions (command palette, shortcuts).
  Strip animation entirely.

REQUIRED CRAFT (insert if missing)

— `font-variant-numeric: tabular-nums` on every count, price, timer,
  and dashboard metric.
— `font-optical-sizing: auto` on variable fonts.
— `text-wrap: balance` on headlines, `text-wrap: pretty` on body.
— Smart quotes and proper dashes throughout copy.
— Custom `:focus-visible` ring in brand color, 2px solid + 2px
  offset.
— Multi-layer shadow stack with consistent light direction (positive
  Y offset, negative spread).
— Differentiated border-radius per component class: buttons 6–8px,
  cards 12–16px, modals 16–20px, pills 9999px, avatars 50%.
— Nested-radius math respected: outer radius = inner radius +
  padding.
— Optical centering on play triangles, chevrons, all-caps badges
  (shift 1–8% off geometric center).
— Padding asymmetry on text-with-icon buttons (more padding on text
  side) and on all-caps labels (more bottom than top).
— Hover state coordinating 2+ properties (background + text-color +
  optional scale).
— Press state with `transform: scale(0.98)`.
— `prefers-reduced-motion` gate on all animations.
— `@media (hover: hover)` gate on hover effects.
— Skeleton loaders for loads > 300ms; spinners only for shorter.
— Empty states with copy + CTA + keyboard shortcut where applicable.
— Error copy naming field, constraint, and remedy — never raw codes.

REVIEW OUTPUT FORMAT

For each screen reviewed, return:

1. SLOP SCORE (0–100). Each forbidden pattern present = 5 points;
   each required craft missing = 2 points. Anything above 30 ships
   only after a remediation pass.

2. AUTO-REJECTS (numbered list of forbidden patterns detected with
   exact location: file:line or component name).

3. MISSING CRAFT (numbered list of required craft elements not
   present).

4. SPECIFIC FIXES (per issue, one-sentence remediation in operational
   language — token names, CSS properties, exact values).

5. ONE COMMITMENT QUESTION. At the end, name the single
   opinionated visual choice this product is committing to, and ask
   whether the current design supports or dilutes it.

TONE

Direct, specific, operational. No hedging. No "consider." No
"perhaps." If something is wrong, name it. If a pattern is generic,
say it is generic. If the design lacks a point of view, say so. You
are useful, not polite.

THE QUESTION YOU ASK BEFORE EVERY FIX

"Would Linear ship this? Would Apple? Would Stripe?" If the answer
isn't a confident yes, the design isn't done.
```

---

## 8. Brutal audit checklist (100 questions)

Score yes/no. Any "no" on questions 1–25 = ship-blocking. Any "no" on 26–60 = revise. Any "no" on 61–100 = polish pass.

**Identity and commitment**
1. Could a designer identify this product from a single screenshot without seeing the logo?
2. Is there a single opinionated visual choice this product is committing to?
3. Would the design lose something specific if the brand color disappeared, or would it just look different?
4. Does the product have a voice that survives across hero, error toast, and billing email?
5. Would Linear ship this?
6. Would Apple ship this?
7. Would Stripe ship this?
8. Is the typography choice anything other than Inter or Geist at default weight?
9. Is the accent color anything other than the default Tailwind primary?
10. Is the layout asymmetric in a way that creates a focal point?
11. Could you remove three elements without losing meaning? If yes, did you?
12. Does each element on the screen defend its right to exist?
13. Is there a hierarchy of importance reflected in size, weight, and color simultaneously?
14. Is the hero copy specific enough that it couldn't apply to any other SaaS?
15. Is the call to action a verb the product actually does, not a generic SaaS phrase?

**Slop detection — auto-rejects**
16. Are you avoiding the eyebrow-pill + oversized-italic-serif-headline hero?
17. Are you avoiding three identical icon-topped feature cards?
18. Are you avoiding the side-tab colored left border on a rounded card?
19. Are you avoiding the unmodified "Trusted by" logo wall?
20. Are you avoiding the 99.9% / 200ms / 10× stat banner?
21. Are you avoiding purple-to-indigo or purple-to-pink gradient backgrounds?
22. Are you avoiding glassmorphism over gradient meshes?
23. Are you avoiding plastic 3D blob illustrations?
24. Are you avoiding stock photography of impossibly diverse smiling teams?
25. Are you avoiding the `01 / 02 / 03` numbered section kicker?

**Typography craft**
26. Are smart quotes (`'`, `"`) used everywhere instead of straight quotes?
27. Are em dashes, en dashes, and hyphens used correctly per their semantic role?
28. Is em-dash density under two per paragraph?
29. Are tabular numerals enabled on every count, price, timer, and metric?
30. Is optical sizing enabled on variable fonts that support it?
31. Is there meaningful tracking differentiation between display and body sizes?
32. Does line-height scale inversely with size (tighter for larger)?
33. Are type scale steps at least 1.25× apart?
34. Is the headline using `text-wrap: balance`?
35. Is body using `text-wrap: pretty` or equivalent?
36. Is sentence case used everywhere except product names?
37. Are button labels free of trailing periods?
38. Is measure length between 45 and 75 characters on body text?
39. Is there a distinctive type pairing rather than a single grotesque?
40. Are OpenType features enabled (`cv`, `ss`, `tnum`, `case`, `zero`) where they apply?

**Color craft**
41. Are neutrals tinted toward the brand hue rather than pure desaturated?
42. Is the black anything other than `#000000`?
43. Is the white anything other than `#FFFFFF`?
44. Are color ramps generated in OKLCH (or another perceptually uniform space)?
45. Does the brand color stay under 5% of viewport area on most screens?
46. Is there only one accent color, or do multiple accents carry semantic distinction?
47. Are status colors (success, warning, destructive) desaturated relative to brand?
48. Does color always carry an additional signal (icon, weight, text) for accessibility?
49. Is body-text contrast comfortably above 4.5:1?
50. Is focus-ring contrast at least 3:1 against adjacent surfaces?

**Layout, spacing, and density**
51. Does the screen have a clear focal point within the first viewport?
52. Is the layout asymmetric rather than centered by default?
53. Is information density appropriate for the user's expertise level (denser for power users)?
54. Are nested radii following the parent = child + padding formula?
55. Are different component classes using different radii?
56. Is padding asymmetric where the content requires it (caps, icon-text combos)?
57. Are icons optically centered, not mathematically centered, where they're asymmetric?
58. Is there exactly one card layer, not nested cards inside cards?
59. Are borders avoided where spacing or background-color shift would do the work?
60. Is the spacing scale meaningful rather than uniform `gap-4` everywhere?

**Motion craft**
61. Is `transition: all` avoided?
62. Is linear easing avoided?
63. Are durations under 300ms for snappy in-app actions?
64. Are spring physics reserved for physically motivated components?
65. Are keyboard-triggered actions free of enter/exit animations?
66. Are animations interruptible (CSS transitions or Framer Motion, not keyframes)?
67. Are only `transform` and `opacity` animated?
68. Are stagger delays in lists between 30 and 80ms?
69. Are dropdowns growing from their trigger's location via `transform-origin`?
70. Is `prefers-reduced-motion` gating in place globally?
71. Is `@media (hover: hover)` gating in place for hover effects?
72. Are micro-interactions tied to function, not decoration?

**Interaction details**
73. Does every interactive element have a custom `:focus-visible` style?
74. Does every hover state coordinate at least two property changes?
75. Does every primary button have a press state with `transform: scale(0.98)` or equivalent?
76. Are disabled states using opacity composition rather than a separate light-gray color?
77. Do empty states include copy, a CTA, and (where relevant) a keyboard shortcut?
78. Do error messages name the field, the constraint, and the remedy?
79. Are skeleton loaders used for any load over 300ms, with spinners reserved for shorter operations?
80. Are popovers portal-rendered to escape overflow contexts?

**Icons and imagery**
81. Is the icon set custom, modified, or deliberately chosen over the defaults?
82. Do icon stroke weights match adjacent type weights at each size?
83. Are icons pixel-snapped at 16px and below?
84. Are illustrations either custom and on-brand, or absent entirely?
85. Are real product screenshots used in preference to decorative imagery?
86. Are image outlines using pure black or pure white at low alpha, not tinted near-black?

**Copy and voice**
87. Does the headline pass the "couldn't apply to any other SaaS" test?
88. Are generic SaaS verbs (supercharge, streamline, unlock, leverage, empower, elevate, seamless, robust) absent?
89. Does the in-app copy match the marketing voice?
90. Does the error copy match the in-app voice?
91. Does the billing email match the rest of the product's voice?
92. Would the copy survive being read aloud in one sitting without sounding like multiple authors?
93. Are numbers in copy formatted appropriately (spelled out 1–9, digits 10+, with tabular figures in UI)?

**System and craft signals**
94. Is the brand color reserved for backgrounds and one primary CTA, not sprinkled as chrome?
95. Is there an inset highlight on dark elevated elements simulating a lit edge?
96. Are scrollbars custom-tinted to match the surface?
97. Is selection color tinted to brand (`::selection`)?
98. Is the caret in inputs tinted to brand?
99. Has the entire product surface been read aloud in one sitting as a final review?
100. If you removed your product's logo and showed five screenshots to a designer, would they recognize the product by its design language alone?

---

## 9. Key sources and designer references

### Designers cited (with specific contributions)

**Rauno Freiberg** (Staff Design Engineer, Vercel; ex-Linear) — rauno.me/craft, devouringdetails.com. *On interruptibility, momentum preservation in gestures, the Novelty vs. Frequency rule (don't animate high-frequency actions), Georgia-rendered quote marks as finesse, custom CSS animations beating Framer Motion under main-thread pressure, "dirtying the frame" for depth, hardware-accelerated CSS, the Next.js site as "a pure masterclass in subtle craft."*

**Emil Kowalski** (Linear; ex-Vercel; creator of Sonner, Vaul, animations.dev) — emilkowal.ski/ui/great-animations, github.com/emilkowalski/skill. *On ease-out 150–200ms, animating only `transform` and `opacity`, interruptibility via CSS transitions, never animating keyboard-initiated actions (citing Raycast), `prefers-reduced-motion` gating, hover gated by `(hover: hover)`, "Taste is a trained instinct, not personal preference," "Defaults matter more than options."*

**Karri Saarinen** (CEO, Linear; ex-Airbnb DLS, Coinbase) — linear.app/method, linear.app/now/craft, Figma blog "10 rules." *On quality as the north star, "we don't make decisions based on data or A/B tests," LCH color space rather than HSL for theming, settings as first-class UI, "Quality creates gravity — it pulls people in rather than requiring us to push," "Unification often becomes standardization. Tools can raise the minimum quality bar, but they can also quietly lower the ceiling of possibility."*

**Adam Wathan and Steve Schoger** (Tailwind Labs; Refactoring UI co-authors) — refactoringui.com. *On layered shadows with vertical offset, hue rotation when shifting lightness, avoiding borders in favor of spacing/shadows, the "don't use gray on colored backgrounds" rule, type hierarchy via color/weight/placement rather than size, intentional empty states. Wathan's 2025 public apology for `bg-indigo-500` is the canonical confession of how Tailwind defaults became AI slop.*

**Rasmus Andersson** (Figma; creator of Inter) — rsms.me/inter. *On optical sizing, `tnum`, `zero`, `calt`, single vs. double-story `a`, why the Google Fonts version of Inter strips OpenType features (don't use it), Inter Tight vs. Inter Display optical sizes.*

**Marcin Wichary** (ex-Figma, Medium; "Shift Happens") — medium.design/quotation-marks-c8993b54417c, medium.design/death-to-typewriters. *On QSH (Quotation Substitution Heuristics), the leading-apostrophe-down rule, underline craft, "the important details are like that — you will never notice if it looks good or serves its function or works well; but it's there."*

**Brian Lovin** (Notion AI; ex-GitHub, Facebook) — brianlovin.com; Design Details podcast. *On encountering reality fast, "you can't design a good chat experience in Figma," "nudging pixels for hours," the high-bar craft culture at Campsite, the diagnostic value of trying the product in production.*

**Katie Dill** (Head of Design, Stripe; ex-Airbnb, Lyft) — Lenny's Podcast; Dive Club; Stripe Sessions. *On beauty as a growth lever (Optimized Checkout Suite: +11.9% revenue), AI raises the floor to 7/10 and the role of taste is to reallocate time to "15 out of 10 moments," 15 Essential Journeys rubric, friction logs, willingness to "pull the plug" on shipped work.*

**Ludwig Pettersson** (ex-Creative Director Stripe; original OpenAI designer) — Medium interview. *On the taste-engineering balance, "the magical touches that make something really good don't tend to happen at a meeting with Post-Its."*

**Josh Miller** (CEO, Browser Company / Arc / Dia) — Lenny's Podcast, mothfund.substack.com. *On "optimizing for feelings," James Turrell as influence, hiring on taste and intuition, the dystopia of "all browsers looking the same," "heartfelt intensity."*

**Pasquale D'Silva** (Play) — medium.com/@pasql/transitional-interfaces-926eb80d64e3. *On animation as continuity between states, "computers are jerks and love to fill in the gaps linearly," cushioning/easing as craft.*

**Jakub Krehel** (ui-skills.com) — *On the corner-radius nesting formula, optical alignment, layered transparent shadows, `font-variant-numeric: tabular-nums` as default for dynamic numbers, `text-wrap: balance` / `pretty`, the image-outline tell (must be pure black/white at low alpha, never tinted near-black).*

**Ivan Zhao** (Founder, Notion) — Lenny's Podcast, Designer Founders fireside, Entrepreneur. *On "Lego for software," craft as wood-cabinet building, the golden path obsession, "ugly software creates cognitive friction," "we don't allow green in the office because green doesn't mix well."*

**Thomas Paul Mann** (CEO, Raycast) — Changelog #587. *On no animations on keyboard interactions, the bigger search bar, larger leading icons, custom outline icon set with unified stroke widths, the app-icon-as-keycap pattern.*

**Rahul Vohra** (CEO, Superhuman) — Lenny's, Acquired. *On targeting specific emotions (joy, hygge, triumph) via the Junto Institute emotion wheel, six months of typography work to land on modified Adelle Sans, keyboard-centric design, 100ms interactions as positioning.*

**Balint Orosz** (Founder, Craft Docs) — Pragmatic Engineer. *On AI as "wow moment, not Copilot-style failure," pixel-perfect ports across platforms, form-and-function inseparability, the viral Quick Add as motion-design polish.*

**Koen Bok and Jorn van Dijk** (Framer) — *On the Sofa-era pixel-perfect Mac aesthetic that informs Framer, "don't wait too long to put your product in front of real users."*

**Michael Flarup** (App Icon Book; Pixelresort) — smashingmagazine.com 2017. *On "bland, overly complicated icons are the enemy of recognisability — try removing details until the concept starts to deteriorate," app icon as visual anchor rather than logo.*

**Tobias van Schneider** (DESK Magazine) — vanschneider.com. *On taste as "a lived sensitivity and recognition of authenticity, care, and substance," "the opposite of good taste and quality is carelessness," the bar-collapse warning.*

**Jason Yuan** (New Computer; ex-Apple HI; MercuryOS) — jasonyuan.design. *On unlearning function-over-form, "form as a function," celebrating playful design (Andy Allen's Not Boring apps).*

**Erik D. Kennedy** (Learn UI Design; Refactoring UI co-author). *On "light comes from the sky" (bottoms darker, tops lighter), up-pop/down-pop hierarchy pair, "double your white space."*

**Khoi Vinh** (Subtraction.com; ex-NYT, ex-Adobe). *On the argument for honest design criticism — "a dearth of thoughtful design criticism has dire consequences for the profession."*

**Frank Chimero** — frankchimero.com. *On "the grain of screens is flux" and the critique of platforms abandoning users.*

**Jordan Singer** (Figma AI; ex-Diagram). *On AI moving "from pixels to patterns," the taste-gap problem (Ira Glass).*

**Soleio Cuervo** (designer-investor; ex-Facebook, ex-Dropbox). *On the diagnostic question "If I joined your team for a month, what would I work on?" and on Guillermo Rauch's "impeccable taste, strong bias for action, hacker's mindset."*

**Meng To** (Design+Code). *On typography as "the single most important thing," 80% opacity on black text for hierarchy.*

### Primary documentation referenced

Linear method, brand, and craft posts (linear.app/method, /now/craft, /brand); Stripe Press behind-the-cover posts; Stripe Design blog on accessible color systems; Vercel Geist documentation (vercel.com/geist, vercel.com/font); Apple HIG and WWDC sessions (WWDC15 Introducing the New System Fonts with Antonio Cavedoni; WWDC20 The Details of UI Typography with Loïc Sander; WWDC22 Meet the Expanded San Francisco Font Family); Anthropic Claude Design announcement (anthropic.com/news, Nov 2025); OpenAI Apps SDK UI guidelines (developers.openai.com/apps-sdk); Spotify Encore documentation (spotify.design); Notion design philosophy posts; Airbnb Cereal typeface launch (design.airbnb.com, May 2018); Raycast brand and product blog (raycast.com/blog, "A Fresh Look and Feel" July 2022); Things 3 (culturedcode.com, Apple Design Award 2017).

### Practitioner taxonomies and detectors

Paul Bakaus, *Impeccable* — impeccable.style and impeccable.style/slop. 46 catalogued tells with CSS/DOM detection logic; the most rigorous single taxonomy of AI-design tells, treated as one opinionated voice rather than 46 independent confirmations.

Adrian Krebs, "Scoring Show HN submissions for AI design patterns" — adriankrebs.ch/blog/design-slop, with the HN discussion thread (item 47864393, 315 points, 229 comments) where senior practitioners corroborated tells. Sixteen deterministic patterns scored across ~1,400 Show HN pages; 21% flagged as heavy slop, 46% mild, 33% clean.

Refactoring UI (Wathan and Schoger), refactoringui.com — the canonical counter-canon: hierarchy via color/weight/placement; HSL with hue rotation; fewer borders; intentional empty states.

Trilogy AI CoE, "Fixing Visual AI Slop" — trilogyai.substack.com/p/fixing-visual-ai-slop. On Google Stitch DESIGN.md standard.

Karl Koch, "On the right tool for the job" — karlkoch.me/writing/on-the-right-tool-for-the-job. *On the design-engineer specificity vocabulary: "Say what polish means. Optical alignment on the icon. Tighter tracking on the heading. A spring curve, not an ease-out. OKLCH so the colours stay perceptually even across the ramp. Tabular numerals on the stat."*

### Reference texts

Matthew Butterick, *Practical Typography* — practicaltypography.com. On straight-vs-curly quotes, dash hierarchy, hanging punctuation.

Ellen Lupton, *Thinking with Type* — on hanging punctuation, optical margin alignment.

Robert Bringhurst, *The Elements of Typographic Style* — referenced via Butterick for spaced en dashes alternative to em dashes.

### Hacker News and community threads

HN discussions on shadcn (items 40861040, 43542734, 46688971, 37808836); the Krebs Show HN slop-scoring thread (47864393); HN commenters whose observations recurred across multiple threads (simonw, vunderba, dang, sen, classified, jerf, nottorp, userbinator, dematz, stingraycharles, toraway, acedTrex).

### Caveats on sourcing

The single biggest concentration of catalogued tells is Bakaus' Impeccable, which is opinionated and should be treated as one rigorous voice rather than 46 independent designer votes. Krebs' designer interviews are anonymized ("a designer friend"). Some quoted Linear design tokens (`-0.022em` letter-spacing, specific Storm Cloud hex, Berkeley Mono use) come from third-party reverse-engineering at refero.design rather than official Linear documentation — treat the spirit (very tight letter-spacing, named gray ramp, custom monospace pairing) as accurate while treating exact hex values as approximations. The "em-dash is an AI tell" claim is contested in the WaPo/Ringer coverage; the strong framing is *overuse density* > 2 per paragraph, not absolute avoidance. The "Anthropic Frontend Design skill" forbidden-list (no Inter, no purple gradients) is widely reported across secondary sources with consistent content but is documented primarily through derivative coverage. Adam Wathan's "purple apology" tweet is quoted consistently across multiple secondary sources with ~1M views claimed; direct X URL not confirmed. The center of gravity for AI-slop critique is Hacker News + design Twitter + the Bakaus/Krebs ecosystem — not Reddit, whose design subs skew beginner-oriented and didn't surface substantive practitioner consensus.