import { BLOCK_SOURCES, CN_SOURCE, EMIT_DEPS, UI_SOURCES } from './emit-assets.generated';

/** A file to write into an emitted project (path is project-root-relative). */
export interface EmitFile {
    path: string;
    content: string;
}

export interface EmitSection {
    blockId: string;
    content: unknown;
}

export interface EmitPage {
    slug: string;
    title: string;
    sections: EmitSection[];
}

export { EMIT_DEPS };

const PROJECT_BLOCKS_DIR = 'src/components/wireframe-blocks';
const PROJECT_UI_DIR = 'src/components/ui';

/** Slugify to a URL/path-safe segment. Empty / "home" → the index route. */
export function normalizeSlug(slug: string): string {
    const s = slug
        .trim()
        .toLowerCase()
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-z0-9/-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return s === 'home' || s === 'index' ? '' : s;
}

/** Resolve the App Router page path for a slug, de-duplicating collisions. */
export function pagePathForSlug(slug: string, taken: Set<string>): string {
    const norm = normalizeSlug(slug);
    let candidate = norm;
    let n = 2;
    while (taken.has(candidate)) {
        candidate = `${norm || 'page'}-${n}`;
        n += 1;
    }
    taken.add(candidate);
    return candidate === '' ? 'src/app/page.tsx' : `src/app/${candidate}/page.tsx`;
}

function componentVar(blockId: string): string {
    return `Block_${blockId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/** Generate the source of a single App Router page from its sections. */
export function emitPageFile(page: EmitPage): string {
    const usedIds = [...new Set(page.sections.map((s) => s.blockId))];
    const imports = usedIds
        .map((id) => `import ${componentVar(id)} from '@/components/wireframe-blocks/${id}';`)
        .join('\n');

    const body =
        page.sections.length === 0
            ? '            {/* No sections yet */}'
            : page.sections
                  .map((s) => {
                      const literal = JSON.stringify(s.content ?? {});
                      return `            <${componentVar(s.blockId)} content={${literal}} />`;
                  })
                  .join('\n');

    return `${imports}

export default function Page() {
    return (
        <main className="min-h-screen">
${body}
        </main>
    );
}
`;
}

/**
 * Build the file set to overlay onto a scaffolded Next.js project: an App Router
 * page per wireframe page, the standard shadcn primitives + cn the blocks import,
 * the block sources, the shared `_ui` helpers, and (optionally) a globals.css
 * with the active style guide applied. Pair with `EMIT_DEPS` (merge into the
 * project's package.json + install).
 */
export function buildEmitFiles(pages: EmitPage[], opts?: { globalsCss?: string }): EmitFile[] {
    const files: EmitFile[] = [];
    const takenPaths = new Set<string>();

    for (const page of pages) {
        files.push({ path: pagePathForSlug(page.slug, takenPaths), content: emitPageFile(page) });
    }

    // cn + all vendored primitives (small set; guarantees any block import resolves).
    files.push({ path: 'src/lib/utils.ts', content: CN_SOURCE });
    for (const [name, src] of Object.entries(UI_SOURCES)) {
        files.push({ path: `${PROJECT_UI_DIR}/${name}.tsx`, content: src });
    }

    // Shared block helpers.
    const helper = BLOCK_SOURCES._ui;
    if (helper) files.push({ path: `${PROJECT_BLOCKS_DIR}/_ui.tsx`, content: helper });

    // Only the blocks actually used.
    const usedIds = new Set<string>();
    for (const page of pages) for (const s of page.sections) usedIds.add(s.blockId);
    for (const id of usedIds) {
        const src = BLOCK_SOURCES[id];
        if (src) files.push({ path: `${PROJECT_BLOCKS_DIR}/${id}.tsx`, content: src });
    }

    if (opts?.globalsCss) {
        files.push({ path: 'src/app/globals.css', content: opts.globalsCss });
    }

    return files;
}

/**
 * Merge the emit deps into an existing package.json's `dependencies`, preserving
 * any versions the project already pins (existing wins; we only add what's
 * missing). Returns pretty-printed JSON.
 */
export function mergeEmitDeps(packageJsonText: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(packageJsonText);
    } catch {
        parsed = {};
    }
    const pkg: Record<string, unknown> =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    const existingDeps =
        pkg.dependencies && typeof pkg.dependencies === 'object' && !Array.isArray(pkg.dependencies)
            ? (pkg.dependencies as Record<string, string>)
            : {};
    return JSON.stringify({ ...pkg, dependencies: { ...EMIT_DEPS, ...existingDeps } }, null, 2);
}
