/**
 * Central, hand-editable config for the Weblab component registry.
 *
 * This is the file a human (or the agent, in-repo) tweaks to change the AI's
 * defaults: which libraries are in play, the default stack, the committed design
 * direction, and where the tokens / fonts live. The prompt catalog in
 * `@weblab/constants` (component-registry.ts) and the manifest.json are the
 * machine-readable companions; this file documents intent and defaults.
 */

export type RegistryLib = 'shadcn' | 'watermelon';

export interface RegistryLibConfig {
    enabled: boolean;
    /** Base install command. The AI appends the per-component installUrl. */
    install: string;
    /** Where browsable docs live, for humans extending the catalog. */
    docs: string;
}

export const REGISTRY_CONFIG = {
    /** New sites default to this stack. Do not change without updating the prompt. */
    defaultStack: {
        framework: 'nextjs',
        language: 'tsx',
        styling: 'tailwind',
        componentLib: 'shadcn',
    },

    /** Default committed design direction when the user gives no reference. */
    defaultDirection: 'A' as 'A' | 'B',

    /** Single source of truth for color + radius. Copied into new projects. */
    tokensPath: 'component-registry/theme/tokens.css',
    fontsPath: 'component-registry/theme/fonts.md',

    /** Component sources the agent may draw from. Flip `enabled` to gate a lib. */
    libraries: {
        shadcn: {
            enabled: true,
            install: 'bunx --bun shadcn@latest add',
            docs: 'https://ui.shadcn.com/docs/components',
        },
        watermelon: {
            enabled: true,
            install: 'bunx --bun shadcn@latest add',
            docs: 'https://ui.watermelon.sh',
        },
    } satisfies Record<RegistryLib, RegistryLibConfig>,
} as const;

export type RegistryConfig = typeof REGISTRY_CONFIG;
