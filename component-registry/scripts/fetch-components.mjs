/**
 * Component-registry fetcher.
 *
 * Pulls a curated set of free, copy-paste components from public shadcn-protocol
 * registries (shadcn/ui + Watermelon UI) into this folder so the Weblab AI agent
 * has a fixed, tweakable catalog to build from instead of inventing markup.
 *
 * This is an MVP subset. To add more: append entries to CURATED below (find names
 * at https://ui.shadcn.com/docs/components and https://ui.watermelon.sh) and re-run:
 *
 *     bun run component-registry/scripts/fetch-components.mjs
 *
 * Network note: the registries are outside the default sandbox allowlist. If a
 * fetch times out, run the command with the sandbox disabled.
 *
 * Output:
 *   component-registry/<lib>/<file>.tsx   — raw component source (LF-normalised)
 *   component-registry/manifest.json      — machine-readable catalog (generated)
 *
 * The script is idempotent: re-running overwrites sources and regenerates the
 * manifest. Hand-authored files (tokens.css, lib/utils.ts, blocks/, templates/)
 * are never touched.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** PascalCase a registry name: "animated-accordion" -> "AnimatedAccordion". */
function toComponentName(name) {
    return name
        .split(/[-_]/)
        .filter(Boolean)
        .map((p) => p[0].toUpperCase() + p.slice(1))
        .join('');
}

/**
 * Curated MVP catalog. `installUrl` is what the AI passes to
 * `bunx --bun shadcn@latest add "<installUrl>"` inside a user project.
 * `fetchUrl` is where THIS script reads the source from (may differ when the
 * canonical install host serves a SPA instead of raw JSON).
 */
const SHADCN_STYLE = 'new-york';
const shadcn = (name, category, description) => ({
    lib: 'shadcn',
    name,
    category,
    description,
    installUrl: `https://ui.shadcn.com/r/styles/${SHADCN_STYLE}/${name}.json`,
    fetchUrl: `https://ui.shadcn.com/r/styles/${SHADCN_STYLE}/${name}.json`,
});
const watermelon = (name, category, description) => ({
    lib: 'watermelon',
    name,
    category,
    description,
    installUrl: `https://registry.watermelon.sh/${name}.json`,
    fetchUrl: `https://raw.githubusercontent.com/WatermelonCorp/watermellon-registry/main/public/r/${name}.json`,
});

const CURATED = [
    // shadcn/ui primitives — the base set every site is built from.
    shadcn('button', 'primitive', 'Button with variant + size system'),
    shadcn('card', 'primitive', 'Surface container: Card, Header, Title, Content, Footer'),
    shadcn('input', 'primitive', 'Text input'),
    shadcn('label', 'primitive', 'Form label'),
    shadcn('textarea', 'primitive', 'Multi-line text input'),
    shadcn('badge', 'primitive', 'Status / tag badge'),
    shadcn('separator', 'primitive', 'Hairline divider'),
    shadcn('accordion', 'primitive', 'Disclosure accordion'),
    shadcn('tabs', 'primitive', 'Tabbed sections'),
    shadcn('dialog', 'primitive', 'Modal dialog'),
    shadcn('switch', 'primitive', 'Toggle switch'),
    shadcn('checkbox', 'primitive', 'Checkbox'),
    shadcn('skeleton', 'primitive', 'Loading skeleton'),
    shadcn('tooltip', 'primitive', 'Hover tooltip'),
    shadcn('select', 'primitive', 'Select dropdown'),
    shadcn('avatar', 'primitive', 'Avatar image with fallback'),
    // Watermelon UI — distinctive, motion-aware extras layered on top.
    watermelon('animated-accordion', 'motion', 'Accordion with spring open/close'),
    watermelon('alert', 'feedback', 'Inline alert callout'),
    watermelon('card', 'surface', 'Watermelon card variant'),
    watermelon('badge', 'primitive', 'Watermelon badge variant'),
    watermelon('switch', 'primitive', 'Watermelon toggle variant'),
];

/** Strip a known registry path prefix down to a flat, project-relative file name. */
function flattenPath(p) {
    // shadcn: "ui/button.tsx"; watermelon: "src/components/watermelon-ui/button.tsx"
    const base = p
        .replace(/^src\/components\/watermelon-ui\//, '')
        .replace(/^components\/watermelon-ui\//, '')
        .replace(/^ui\//, '')
        .replace(/^src\//, '');
    return base;
}

async function run() {
    const manifest = [];
    const skipped = [];

    for (const item of CURATED) {
        try {
            const res = await fetch(item.fetchUrl, { headers: { accept: 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            if (text.trimStart().startsWith('<')) throw new Error('got HTML, not JSON');
            const json = JSON.parse(text);
            const files = Array.isArray(json.files) ? json.files : [];
            if (files.length === 0) throw new Error('no files in registry item');

            const writtenFiles = [];
            for (const f of files) {
                const rel = flattenPath(f.path ?? `${item.name}.tsx`);
                const outRel = join(item.lib, rel);
                const outAbs = join(ROOT, outRel);
                await mkdir(dirname(outAbs), { recursive: true });
                const content = String(f.content ?? '').replace(/\r\n/g, '\n');
                await writeFile(outAbs, content, 'utf8');
                writtenFiles.push(outRel.replaceAll('\\', '/'));
            }

            manifest.push({
                name: item.name,
                lib: item.lib,
                category: item.category,
                description: item.description,
                componentName: toComponentName(item.name),
                importPath: `@/components/${item.lib === 'watermelon' ? 'watermelon-ui' : 'ui'}/${item.name}`,
                installUrl: item.installUrl,
                dependencies: json.dependencies ?? [],
                registryDependencies: json.registryDependencies ?? [],
                files: writtenFiles,
            });
            console.log(`✓ ${item.lib}/${item.name} (${writtenFiles.length} file(s))`);
        } catch (err) {
            skipped.push({ ...item, error: String(err?.message ?? err) });
            console.warn(`✗ ${item.lib}/${item.name}: ${err?.message ?? err}`);
        }
    }

    manifest.sort((a, b) => (a.lib + a.name).localeCompare(b.lib + b.name));
    const out = {
        generatedBy: 'component-registry/scripts/fetch-components.mjs',
        note: 'Generated file. Do not edit by hand — re-run the fetcher to update. Hand-edit tokens.css / blocks / templates instead.',
        libraries: {
            shadcn: { style: SHADCN_STYLE, install: 'bunx --bun shadcn@latest add "<installUrl>"' },
            watermelon: { install: 'bunx --bun shadcn@latest add "<installUrl>"' },
        },
        count: manifest.length,
        components: manifest,
        skipped,
    };
    await writeFile(join(ROOT, 'manifest.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`\nWrote manifest.json — ${manifest.length} components, ${skipped.length} skipped.`);
}

await run();
