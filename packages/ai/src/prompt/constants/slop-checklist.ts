/**
 * The anti-slop gate the agent MUST run silently before returning any UI it
 * built or edited. A distilled, high-signal subset of the full field guide
 * (docs/agent-context/ai-slop-field-guide.md) — kept compact on purpose so it
 * stays in the cached system prefix without bloating every request.
 *
 * Override order still applies: a user request, an attached reference, or the
 * existing project's conventions win over any item here (see DESIGN_SYSTEM_PROMPT
 * Rules 0-2). The checklist fills gaps; it does not censor explicit intent.
 */
export const AI_SLOP_CHECKLIST = `Before returning any UI you created or changed, silently verify ALL of the following and fix every "no". Skip an item only when the user, a reference, or the existing project explicitly dictates otherwise.

Commitment + identity
1. Committed to ONE direction (A or B), not a blend.
2. A designer could recognize this product from one screenshot with the logo hidden.
3. The layout is asymmetric with one clear focal point — not centered-everything.

Color + type
4. Neutrals are tinted; black/white are impure (no pure #000 / #fff).
5. Exactly one accent, under ~5% of the screen, off the text and headings.
6. Color, radius, and fonts come only from the project's design tokens — nothing hardcoded or invented.
7. Type is not Inter-at-default; hierarchy uses weight + size + color, not size alone.
8. Tabular numerals on changing numbers; smart quotes and proper dashes; sentence case (no Title Case buttons, no trailing periods).
9. text-wrap balance on headings, pretty on body.

Surface + form
10. Flat: no shadow spam, no card-in-card, no glassmorphism/neumorphism/faux 3D. The only shadow is one soft shadow on a true floating layer.
11. Radii are differentiated per component class and nested correctly (inner + padding).
12. Borders earn their place; prefer spacing and 1px borders with transparency over solid gray boxes.

State + motion
13. focus-visible, hover (2+ properties), and press states exist and coordinate.
14. Motion is transform/opacity only, ease-out, reduced-motion-gated, and off on keyboard actions.
15. Empty states have copy + a clear action; errors name the field, limit, and fix.

Copy + slop patterns
16. Copy is specific to this product — no "supercharge / streamline / unlock / leverage / seamless / robust" filler.
17. None of the forbidden-by-default patterns are present unless explicitly requested or already in the project: eyebrow-pill + italic-serif hero, three identical feature cards, colored left-border callout, contextless logo wall, gradient stat banner, indigo/purple gradient backgrounds, gradient headline text.
18. On shadcn/Tailwind, the result is NOT identifiable as a starter.

The bar: would Linear, Apple, or Stripe ship this? If not a confident yes, it isn't done.`;
