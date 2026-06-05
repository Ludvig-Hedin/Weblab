import {
    COMPONENT_REGISTRY,
    COMPONENT_REGISTRY_INSTALL_HINT,
    WEBLAB_DESIGN_TOKENS_SUMMARY,
} from '@weblab/constants';

/**
 * Builds the <component-registry> system-prompt block: the rules that keep the
 * agent inside a curated component catalog + a single design-token source, plus
 * the catalog itself (mirrored from component-registry/manifest.json via
 * @weblab/constants). Built once at module load — the catalog only changes when
 * we ship new components.
 */
function buildCatalog(): string {
    const lines = COMPONENT_REGISTRY.map(
        (c) =>
            `- ${c.componentName} [${c.lib}/${c.category}]: ${c.description} → import { ${c.componentName} } from "${c.importPath}" — install: ${c.installUrl}`,
    );
    return lines.join('\n');
}

export const COMPONENT_REGISTRY_PROMPT = `You build from a fixed, curated component registry — not from scratch, and not from memory of other libraries. This keeps every site consistent and on-brand.

DEFAULT STACK (new sites): Next.js (App Router) + React + TypeScript + Tailwind + shadcn/ui. Use this unless the user asks for something else or you are editing an existing project on another stack.

COMPONENT RULES
- Prefer the catalog. The CORE set is listed below; the FULL catalog (1500+ free blocks across shadcn/ui, shadcnblocks, Watermelon UI, and local pro blocks) is in the \`shadcn\` skill — call read_skill("shadcn") to browse it and get install commands before building any non-trivial section.
- To use a component, install it into the project with its install URL: ${COMPONENT_REGISTRY_INSTALL_HINT}
- If the catalog has no fit, you may add another public shadcn-registry component (bunx --bun shadcn@latest add "<url>") — but only when it genuinely fits the request. Do not hand-roll a primitive that already exists in the catalog.
- Compose pages from registry primitives and the reference blocks/templates (component-registry/blocks, component-registry/templates). Adapt their copy and data to the user's product; keep their structure.

STYLING RULES — do not invent colors or styling
- ${WEBLAB_DESIGN_TOKENS_SUMMARY}
- Style with token-based Tailwind classes (bg-background, text-foreground, text-muted-foreground, border-border, ring-ring, bg-primary, ...). Never hardcode a hex, rgb, or arbitrary color, and never add a font that isn't in the approved set.

EXISTING PROJECTS — match, never introduce
- When adding to or editing an existing site, use that project's already-installed components, its existing tokens in globals.css, and its existing fonts and stack. Read them first. Do NOT introduce a new color, font, component library, or framework. The new work must look and behave like the rest of the site.

ESCAPE HATCH
- If the user explicitly asks for a specific component, color, font, or library, honor it. The rules above fill gaps; they never override an explicit request or an existing project's conventions.

CORE components (the common set, always available — read the \`shadcn\` skill for the full 1500+ catalog):
${buildCatalog()}`;
