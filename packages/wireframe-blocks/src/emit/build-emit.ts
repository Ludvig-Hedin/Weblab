import { BLOCK_SOURCES } from './emit-assets.generated';

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

const PROJECT_BLOCKS_DIR = 'src/components/wireframe-blocks';

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
        .map((id) => `import ${componentVar(id)} from '@/components/${'wireframe-blocks'}/${id}';`)
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
 * Build the full set of files to overlay onto a scaffolded Next.js project:
 * one App Router page per wireframe page, the self-contained block sources each
 * page imports, the shared `_ui` helpers, and (optionally) a globals.css with
 * the active style guide's tokens applied.
 */
export function buildEmitFiles(pages: EmitPage[], opts?: { globalsCss?: string }): EmitFile[] {
    const files: EmitFile[] = [];
    const takenPaths = new Set<string>();

    for (const page of pages) {
        files.push({ path: pagePathForSlug(page.slug, takenPaths), content: emitPageFile(page) });
    }

    const usedIds = new Set<string>();
    for (const page of pages) for (const s of page.sections) usedIds.add(s.blockId);

    // Always include the shared helpers the blocks import.
    const uiSource = BLOCK_SOURCES._ui;
    if (uiSource) files.push({ path: `${PROJECT_BLOCKS_DIR}/_ui.tsx`, content: uiSource });

    for (const id of usedIds) {
        const source = BLOCK_SOURCES[id];
        if (source) files.push({ path: `${PROJECT_BLOCKS_DIR}/${id}.tsx`, content: source });
    }

    if (opts?.globalsCss) {
        files.push({ path: 'src/app/globals.css', content: opts.globalsCss });
    }

    return files;
}
