import path from 'path';

import type { NodeFsProvider, Provider } from '@weblab/code-provider';
import type { RouterConfig } from '@weblab/models';
import {
    DEPRECATED_IX_RUNTIME_SRCS,
    DEPRECATED_PRELOAD_SCRIPT_SRCS,
    EditorAttributes,
    NEXT_JS_FILE_EXTENSIONS,
    WEBLAB_DEV_IX_RUNTIME_PATH,
    WEBLAB_DEV_IX_RUNTIME_SRC,
    WEBLAB_DEV_PRELOAD_SCRIPT_PATH,
    WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
    WEBLAB_INTERACTIONS_STATIC_HTML_PATH,
    WEBLAB_IX_RUNTIME_SRC,
    WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';
import { RouterType } from '@weblab/models';
import {
    addOidsToAst,
    getAstFromContent,
    getContentFromAst,
    htmlPipeline,
    injectWeblabBootstrapScripts,
    t,
    traverse,
} from '@weblab/parser';
import { isRootLayoutFile, normalizePath } from '@weblab/utility';

/**
 * Path the static-HTML preload script is written to in the project root.
 * Static HTML projects don't have a `public/` directory; the explicit native
 * local preview serves project-root web assets, so this path is reachable.
 */
const STATIC_HTML_PRELOAD_FILENAME = '__weblab-preload.js';
/**
 * Marker comment used to detect whether the preload script tag has already
 * been injected into an HTML file. Avoids duplicate injections on subsequent
 * sandbox starts.
 */
const STATIC_HTML_PRELOAD_MARKER = 'data-weblab-preload="1"';

/** IX runtime equivalents for static HTML projects. */
const STATIC_HTML_IX_RUNTIME_FILENAME = '__weblab-ix-runtime.js';
const STATIC_HTML_IX_RUNTIME_MARKER = 'data-weblab-ix-runtime="1"';

export interface LocalPreparationFile {
    path: string;
    original: string | null;
    updated: string;
    expectedSha256: string | null;
}

export interface LocalPreparationPlan {
    files: LocalPreparationFile[];
    /** Reviewed creation of a missing Next.js asset directory. Only public/ is supported. */
    createDirectories?: string[];
}

const LOCAL_SOURCE_EXCLUSIONS = new Set([
    '.weblab', '.git', '.next', 'node_modules', 'dist', 'build', 'out', 'coverage',
    'public', '__tests__',
]);

function localSourcePath(path: string, framework: 'nextjs' | 'static-html'): boolean {
    if (path.split('/').slice(0, -1).some((part) => LOCAL_SOURCE_EXCLUSIONS.has(part))) {
        return false;
    }
    if (/\.(test|spec|stories)\.[jt]sx?$/i.test(path)) return false;
    return framework === 'nextjs'
        ? /\.[jt]sx?$/i.test(path) && !/\.d\.ts$/i.test(path)
        : /\.html?$/i.test(path);
}

function sourceOids(content: string): string[] {
    const attribute = EditorAttributes.DATA_WEBLAB_ID;
    const matches = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'g');
    return [...content.matchAll(matches)]
        .map((match) => match[1])
        .filter((oid): oid is string => Boolean(oid));
}

function localizeBootstrapScripts(ast: NonNullable<ReturnType<typeof getAstFromContent>>): void {
    traverse(ast, {
        JSXOpeningElement(path) {
            if (!t.isJSXIdentifier(path.node.name, { name: 'Script' })) return;
            const attributes = path.node.attributes.filter((attr) => t.isJSXAttribute(attr));
            const id = attributes.find((attr) => t.isJSXIdentifier(attr.name, { name: 'id' }));
            const src = attributes.find((attr) => t.isJSXIdentifier(attr.name, { name: 'src' }));
            if (!src || !t.isStringLiteral(src.value) || !id || !t.isStringLiteral(id.value)) return;
            if (id.value.value === 'weblab-preload-script') {
                src.value.value = WEBLAB_DEV_PRELOAD_SCRIPT_SRC;
            } else if (id.value.value === 'weblab-ix-runtime') {
                src.value.value = WEBLAB_DEV_IX_RUNTIME_SRC;
            }
        },
    });
}

function hasLocalBootstrapScripts(ast: NonNullable<ReturnType<typeof getAstFromContent>>): boolean {
    let preloadCount = 0;
    let runtimeCount = 0;
    traverse(ast, {
        JSXOpeningElement(path) {
            if (!t.isJSXIdentifier(path.node.name, { name: 'Script' })) return;
            const attributes = path.node.attributes.filter((attr) => t.isJSXAttribute(attr));
            const id = attributes.find((attr) => t.isJSXIdentifier(attr.name, { name: 'id' }));
            const src = attributes.find((attr) => t.isJSXIdentifier(attr.name, { name: 'src' }));
            if (!src || !t.isStringLiteral(src.value) || !id || !t.isStringLiteral(id.value)) return;
            if (id.value.value === 'weblab-preload-script' && src.value.value === WEBLAB_DEV_PRELOAD_SCRIPT_SRC) {
                preloadCount++;
            }
            if (id.value.value === 'weblab-ix-runtime' && src.value.value === WEBLAB_DEV_IX_RUNTIME_SRC) {
                runtimeCount++;
            }
        },
    });
    return preloadCount === 1 && runtimeCount === 1;
}

async function fetchCurrentAsset(source: string): Promise<string> {
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${source}: HTTP ${response.status}`);
    const content = await response.text();
    // Local editing must not copy an old public bundle that still resolves a
    // stale domId to <body>. The marker is emitted by the guarded preload API.
    if (source === WEBLAB_DEV_PRELOAD_SCRIPT_SRC && !content.includes('Weblab stale domId lookup blocked:')) {
        throw new Error('The local preload bundle is stale. Rebuild the Weblab preload asset before preparing this project.');
    }
    return content;
}

/** Read-only, exact before/after plan for an existing local folder. */
export async function planLocalProjectPreparation(
    provider: NodeFsProvider,
    framework: 'nextjs' | 'static-html',
    paths: string[],
    routerConfig?: RouterConfig | null,
): Promise<LocalPreparationPlan> {
    const available = new Set(paths.map((path) => path.replace(/^\/+/, '')));
    const sourcePaths = [...available].filter((path) => localSourcePath(path, framework)).sort();
    if (sourcePaths.length > 500) throw new Error('This project has over 500 source files to review.');
    if (sourcePaths.length === 0) throw new Error('No supported source files were found.');

    let layoutPath: string | null = null;
    const createDirectories: string[] = [];
    if (framework === 'nextjs') {
        if (!routerConfig || routerConfig.type !== RouterType.APP) {
            throw new Error('Local preparation currently supports Next.js App Router projects.');
        }
        layoutPath = await getLayoutPath(routerConfig, async (path) => available.has(path));
        if (!layoutPath || !available.has(layoutPath)) {
            throw new Error('A root app/layout file is required for local preparation.');
        }
        const rootEntries = await provider.listFiles({ args: { path: '' } });
        const publicEntry = rootEntries.files.find((entry) => entry.name === 'public');
        if (!publicEntry) createDirectories.push('public');
        else if (publicEntry.type !== 'directory' || publicEntry.isSymlink) {
            throw new Error('The public path must be a real directory for local preparation.');
        }
    } else if (!available.has('index.html')) {
        throw new Error('Static HTML projects require an index.html at the project root.');
    }

    const originals = new Map<string, { content: string; sha256: string }>();
    let totalSourceBytes = 0;
    for (const path of sourcePaths) {
        const file = await provider.readFileWithHash(path);
        totalSourceBytes += file.content.length;
        if (file.content.length > 500_000) {
            throw new Error(`${path} is too large for a safe source review.`);
        }
        if (totalSourceBytes > 10_000_000) {
            throw new Error('This project has over 10 MB of source to review. No files were changed.');
        }
        originals.set(path, file);
    }
    const globalOids = new Set<string>();
    for (const [path, file] of originals) {
        for (const oid of sourceOids(file.content)) {
            if (globalOids.has(oid)) {
                throw new Error(`Duplicate element ID ${oid} found while reading ${path}. No files were changed.`);
            }
            globalOids.add(oid);
        }
    }

    const files: LocalPreparationFile[] = [];
    for (const path of sourcePaths) {
        const original = originals.get(path)!;
        let updated = original.content;
        if (framework === 'nextjs') {
            const ast = getAstFromContent(updated);
            if (!ast) throw new Error(`Could not parse ${path}; no files were changed.`);
            if (path === layoutPath) {
                if (!hasLocalBootstrapScripts(ast)) injectWeblabBootstrapScripts(ast);
                localizeBootstrapScripts(ast);
            }
            const { modified } = addOidsToAst(ast, globalOids);
            if (modified || path === layoutPath) {
                updated = await getContentFromAst(ast, updated);
            }
        } else {
            const ast = htmlPipeline.parse(updated);
            if (!ast) throw new Error(`Could not parse ${path}; no files were changed.`);
            // HTML replaces IDs found in globalOids. Exclude this file's own
            // valid IDs so a review does not churn them on every run.
            const otherOids = new Set(globalOids);
            for (const oid of sourceOids(original.content)) otherOids.delete(oid);
            const { modified } = htmlPipeline.injectOids(ast, { globalOids: otherOids });
            if (modified) updated = await htmlPipeline.generate(ast, updated);
            updated = prepareStaticHtmlBootstrap(updated);
        }
        for (const oid of sourceOids(updated)) globalOids.add(oid);
        if (updated !== original.content) {
            files.push({ path, original: original.content, updated, expectedSha256: original.sha256 });
        }
    }

    const assets = framework === 'nextjs'
        ? [
            { path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH, url: WEBLAB_DEV_PRELOAD_SCRIPT_SRC },
            { path: WEBLAB_DEV_IX_RUNTIME_PATH, url: WEBLAB_DEV_IX_RUNTIME_SRC },
        ]
        : [
            { path: STATIC_HTML_PRELOAD_FILENAME, url: WEBLAB_DEV_PRELOAD_SCRIPT_SRC },
            { path: STATIC_HTML_IX_RUNTIME_FILENAME, url: WEBLAB_DEV_IX_RUNTIME_SRC },
        ];
    for (const asset of assets) {
        const updated = await fetchCurrentAsset(asset.url);
        const original = available.has(asset.path) ? await provider.readFileWithHash(asset.path) : null;
        if (original?.content !== updated) {
            files.push({
                path: asset.path,
                original: original?.content ?? null,
                updated,
                expectedSha256: original?.sha256 ?? null,
            });
        }
    }
    return { files, createDirectories };
}

export async function getPreloadScriptContent(): Promise<string> {
    const candidateSources = Array.from(
        new Set([WEBLAB_PRELOAD_SCRIPT_SRC, ...DEPRECATED_PRELOAD_SCRIPT_SRCS]),
    );
    const failures: string[] = [];

    for (const source of candidateSources) {
        try {
            const response = await fetch(source);
            if (!response.ok) {
                failures.push(`${source}: ${response.status} ${response.statusText}`);
                continue;
            }
            return await response.text();
        } catch (error) {
            failures.push(
                `${source}: ${error instanceof Error ? error.message : 'Unknown fetch error'}`,
            );
        }
    }

    throw new Error(`Failed to load preload script. Attempts: ${failures.join(' | ')}`);
}

export async function copyPreloadScriptToPublic(
    provider: Provider,
    routerConfig: RouterConfig,
): Promise<void> {
    try {
        try {
            await provider.createDirectory({ args: { path: 'public' } });
        } catch {
            // Directory might already exist, ignore error
        }

        const scriptContent = await getPreloadScriptContent();
        await provider.writeFile({
            args: {
                path: WEBLAB_DEV_PRELOAD_SCRIPT_PATH,
                content: scriptContent,
                overwrite: true,
            },
        });

        try {
            const ixRuntimeContent = await getIxRuntimeContent();
            await provider.writeFile({
                args: {
                    path: WEBLAB_DEV_IX_RUNTIME_PATH,
                    content: ixRuntimeContent,
                    overwrite: true,
                },
            });
        } catch (err) {
            console.warn(
                '[PreloadScript] Failed to copy IX runtime bundle (continuing without it):',
                err,
            );
        }

        await injectPreloadScriptIntoLayout(provider, routerConfig);
    } catch (error) {
        console.error('[PreloadScript] Failed to copy preload script:', error);
        throw error;
    }
}

async function getIxRuntimeContent(): Promise<string> {
    const candidateSources = Array.from(
        new Set([WEBLAB_IX_RUNTIME_SRC, ...DEPRECATED_IX_RUNTIME_SRCS]),
    );
    const failures: string[] = [];
    for (const source of candidateSources) {
        try {
            const response = await fetch(source);
            if (!response.ok) {
                failures.push(`${source}: ${response.status} ${response.statusText}`);
                continue;
            }
            return await response.text();
        } catch (error) {
            failures.push(
                `${source}: ${error instanceof Error ? error.message : 'Unknown fetch error'}`,
            );
        }
    }
    throw new Error(`Failed to load IX runtime. Attempts: ${failures.join(' | ')}`);
}

export async function injectPreloadScriptIntoLayout(
    provider: Provider,
    routerConfig: RouterConfig,
): Promise<void> {
    if (!routerConfig) {
        throw new Error(
            'Could not detect router type for script injection. This is required for iframe communication.',
        );
    }

    const result = await provider.listFiles({
        args: { path: routerConfig.basePath },
    });
    const [layoutFile] = result.files.filter(
        (file) =>
            file.type === 'file' &&
            isRootLayoutFile(`${routerConfig.basePath}/${file.name}`, routerConfig.type),
    );

    if (!layoutFile) {
        throw new Error(`No layout files found in ${routerConfig.basePath}`);
    }

    const layoutPath = `${routerConfig.basePath}/${layoutFile.name}`;

    const layoutResponse = await provider.readFile({
        args: { path: layoutPath },
    });
    if (typeof layoutResponse.file.content !== 'string') {
        throw new Error(`Layout file ${layoutPath} is not a text file`);
    }

    const content = layoutResponse.file.content;
    const ast = getAstFromContent(content);
    if (!ast) {
        throw new Error(`Failed to parse layout file: ${layoutPath}`);
    }

    injectWeblabBootstrapScripts(ast);
    const modifiedContent = await getContentFromAst(ast, content);

    await provider.writeFile({
        args: {
            path: layoutPath,
            content: modifiedContent,
            overwrite: true,
        },
    });
}

/**
 * Static-HTML equivalent of `copyPreloadScriptToPublic` + `injectPreloadScriptIntoLayout`.
 * Writes the preload bundle to the project root (no public/ for static
 * sites) and adds a `<script>` tag to the `<head>` of `index.html`. Idempotent —
 * subsequent calls detect the marker and no-op.
 */
export async function copyPreloadScriptToStaticHtml(provider: Provider): Promise<void> {
    try {
        const scriptContent = await getPreloadScriptContent();
        await provider.writeFile({
            args: {
                path: STATIC_HTML_PRELOAD_FILENAME,
                content: scriptContent,
                overwrite: true,
            },
        });

        try {
            const ixRuntimeContent = await getIxRuntimeContent();
            await provider.writeFile({
                args: {
                    path: STATIC_HTML_IX_RUNTIME_FILENAME,
                    content: ixRuntimeContent,
                    overwrite: true,
                },
            });
        } catch (err) {
            console.warn(
                '[PreloadScript] Failed to copy static-HTML IX runtime (continuing without it):',
                err,
            );
        }

        await injectPreloadScriptIntoStaticHtml(provider);
    } catch (error) {
        console.error('[PreloadScript] Failed to copy static-HTML preload script:', error);
        throw error;
    }
}

export async function injectPreloadScriptIntoStaticHtml(provider: Provider): Promise<void> {
    const indexHtmlPath = 'index.html';
    let response;
    try {
        response = await provider.readFile({ args: { path: indexHtmlPath } });
    } catch (err) {
        throw new Error(
            `Could not read index.html for static-HTML preload injection. ` +
                `Static HTML projects require an index.html at the project root. ` +
                `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (typeof response.file.content !== 'string') {
        throw new Error(`index.html is not a text file`);
    }
    const modified = prepareStaticHtmlBootstrap(response.file.content);
    if (modified === response.file.content) return;
    await provider.writeFile({
        args: {
            path: indexHtmlPath,
            content: modified,
            overwrite: true,
        },
    });
}

function prepareStaticHtmlBootstrap(original: string): string {
    const preloadAlready = original.includes(STATIC_HTML_PRELOAD_MARKER);
    const ixAlready = original.includes(STATIC_HTML_IX_RUNTIME_MARKER);
    // "Needs module" === a marker tag exists with NO `type=` attribute (the old
    // `defer`-only shape we used to inject). The predicate is kept identical to
    // the replacement regex below so detection can never flag a tag the replace
    // step then no-ops on (which previously caused a redundant rewrite + write).
    // A marker tag carrying a non-module `type` is never produced by our own
    // injector, so it is intentionally out of scope.
    const preloadNeedsModule =
        preloadAlready &&
        /<script\b(?=[^>]*data-weblab-preload=["']?1["']?)(?![^>]*\btype=)[^>]*>/i.test(original);
    const ixNeedsModule =
        ixAlready &&
        /<script\b(?=[^>]*data-weblab-ix-runtime=["']?1["']?)(?![^>]*\btype=)[^>]*>/i.test(original);

    if (preloadAlready && ixAlready && !preloadNeedsModule && !ixNeedsModule) {
        return original;
    }

    const preloadTag = `<script type="module" src="/${STATIC_HTML_PRELOAD_FILENAME}" ${STATIC_HTML_PRELOAD_MARKER}></script>`;
    const ixTag = `<script type="module" src="/${STATIC_HTML_IX_RUNTIME_FILENAME}" data-interactions-src="/${WEBLAB_INTERACTIONS_STATIC_HTML_PATH}" ${STATIC_HTML_IX_RUNTIME_MARKER}></script>`;

    const tagsToInject = [preloadAlready ? null : preloadTag, ixAlready ? null : ixTag]
        .filter((s): s is string => Boolean(s))
        .join('\n    ');

    let modified = original;
    if (preloadNeedsModule) {
        modified = modified.replace(
            /<script\b(?=[^>]*data-weblab-preload=["']?1["']?)(?![^>]*\btype=)([^>]*)>/i,
            '<script type="module"$1>',
        );
    }
    if (ixNeedsModule) {
        modified = modified.replace(
            /<script\b(?=[^>]*data-weblab-ix-runtime=["']?1["']?)(?![^>]*\btype=)([^>]*)>/i,
            '<script type="module"$1>',
        );
    }

    if (!preloadAlready || !ixAlready) {
        if (/<\/head\s*>/i.test(modified)) {
            modified = modified.replace(/<\/head\s*>/i, `    ${tagsToInject}\n  </head>`);
        } else if (/<body[\s>]/i.test(modified)) {
            modified = modified.replace(
                /<body([\s>])/i,
                `<head>\n    ${tagsToInject}\n  </head>\n<body$1`,
            );
        } else {
            modified = `${tagsToInject}\n${modified}`;
        }
    }

    return modified;
}

export async function getLayoutPath(
    routerConfig: RouterConfig,
    fileExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
    if (!routerConfig) {
        console.log('Could not detect Next.js router type');
        return null;
    }

    let layoutFileName: string;

    if (routerConfig.type === RouterType.PAGES) {
        layoutFileName = '_app';
    } else {
        layoutFileName = 'layout';
    }

    for (const extension of NEXT_JS_FILE_EXTENSIONS) {
        const layoutPath = path.join(routerConfig.basePath, `${layoutFileName}${extension}`);
        if (await fileExists(layoutPath)) {
            return normalizePath(layoutPath);
        }
    }

    console.log('Could not find layout file');
    return null;
}
