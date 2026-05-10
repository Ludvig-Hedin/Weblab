/**
 * Default `globals.css` token scaffold for new (or migrated) Weblab projects.
 *
 * Includes:
 *  - A `@theme { ... }` block with raw Variables (color/space/font/radius)
 *    and Color Style aliases (e.g. `--color-brand-primary: var(--color-blue-600);`).
 *  - A `.dark` block that swaps the raw color tokens.
 *  - A handful of starter `@utility text-style-*` blocks (Heading 1, Heading 2,
 *    Body M) so the right-panel "Apply Text Style" picker has options on first
 *    open.
 *
 * The scaffold is **prepended** to the existing `globals.css` content; we do
 * not overwrite anything the user already wrote.
 */
export const DEFAULT_GLOBALS_TOKENS_SCAFFOLD = `/* Weblab design tokens — managed by the editor.
   Edit values in the left panel: Brand → Variables / Color Styles / Text Styles. */
@theme {
    /* Variables (raw tokens) */
    --color-bg: oklch(1 0 0);
    --color-bg-subtle: oklch(0.97 0 0);
    --color-fg: oklch(0.15 0 0);
    --color-fg-muted: oklch(0.45 0 0);

    --space-xs: 0.25rem;
    --space-sm: 0.5rem;
    --space-md: 1rem;
    --space-lg: 2rem;
    --space-xl: 4rem;

    --radius-sm: 0.25rem;
    --radius-md: 0.5rem;
    --radius-lg: 1rem;

    --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
    --font-display: "Inter", ui-sans-serif, system-ui, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, monospace;

    --color-blue-600: oklch(0.55 0.2 260);
    --color-blue-700: oklch(0.45 0.2 260);
    --color-zinc-800: oklch(0.27 0.01 260);

    /* Color Styles (semantic aliases — reference Variables) */
    --color-brand-primary: var(--color-blue-600);
    --color-brand-primary-hover: var(--color-blue-700);
    --color-brand-secondary: var(--color-zinc-800);
    --color-surface: var(--color-bg);
    --color-surface-subtle: var(--color-bg-subtle);
    --color-text-primary: var(--color-fg);
    --color-text-secondary: var(--color-fg-muted);
}

.dark {
    --color-bg: oklch(0.15 0 0);
    --color-bg-subtle: oklch(0.20 0 0);
    --color-fg: oklch(0.97 0 0);
    --color-fg-muted: oklch(0.65 0 0);
}

@utility text-style-heading-1 {
    @apply font-display font-semibold text-4xl leading-tight tracking-tight;
}
@utility text-style-heading-2 {
    @apply font-display font-semibold text-3xl leading-tight tracking-tight;
}
@utility text-style-heading-3 {
    @apply font-display font-semibold text-2xl leading-snug tracking-tight;
}
@utility text-style-body-l {
    @apply font-sans font-normal text-lg leading-normal;
}
@utility text-style-body-m {
    @apply font-sans font-normal text-base leading-normal;
}
@utility text-style-body-s {
    @apply font-sans font-normal text-sm leading-normal;
}
`;
