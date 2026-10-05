/**
 * Editor scope for the local release: a small visual editor for existing
 * Next.js App Router + Tailwind projects. Text, color, typography, spacing,
 * size, basic flex layout, borders, layers, and pages stay on.
 *
 * Features below are off because they are unfinished, unverified for local
 * projects, or write CSS the source writer cannot round-trip. Flip a flag only
 * after that feature passes a live desktop edit → reload → undo check.
 */
export const EDITOR_SCOPE = {
    /** AI chat panel and the canvas AI menu. Needs credits and multi-file writes. */
    aiChat: false,
    /** Interactions / animation tab. */
    interactions: false,
    /** Comment mode, pins, and panel. */
    comments: false,
    /** CMS mode, bindings, and data pusher. */
    cms: false,
    /** Component masters/instances, chips, and edit mode. */
    components: false,
    /** Brand tab (theme token manager). */
    brand: false,
    /** Variables tab: design tokens in globals.css, plus bind/detach in the style panel. */
    variables: true,
    /** Branch tab and branch chips. */
    branches: false,
    /** Image upload tab and background-image picker. Local writes are text-only. */
    imageUpload: false,
    /** Version history and diff buttons in the top bar. */
    versionHistory: false,
    /** Members / sharing. */
    members: false,
    /** First-run onboarding tour. */
    onboardingTour: false,
    /** Remote cursors and presence. */
    presence: false,
    /** Frame layout guides. */
    layoutGuides: false,
    /**
     * Rare CSS: effects, filters, transitions, transforms, cursor, text shadow,
     * float/clear, custom properties, grid flow, overflow behavior.
     */
    advancedCss: false,
} satisfies Record<string, boolean>;

export type EditorScopeFeature = keyof typeof EDITOR_SCOPE;

export function isEditorFeatureEnabled(feature: EditorScopeFeature): boolean {
    return EDITOR_SCOPE[feature];
}
