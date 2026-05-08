import path from 'path';

import type { Provider } from '@weblab/code-provider';
import type { RouterConfig } from '@weblab/models';
import {
    DEPRECATED_PRELOAD_SCRIPT_SRCS,
    NEXT_JS_FILE_EXTENSIONS,
    WEBLAB_DEV_PRELOAD_SCRIPT_PATH,
    WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';
import { RouterType } from '@weblab/models';
import { getAstFromContent, getContentFromAst, injectPreloadScript } from '@weblab/parser';
import { isRootLayoutFile, normalizePath } from '@weblab/utility';

/**
 * Path the static-HTML preload script is written to in the project root.
 * Static HTML projects don't have a `public/` directory; the dev task
 * (`npx serve .`) serves project root, so a root-level path is publicly
 * reachable without configuration.
 */
const STATIC_HTML_PRELOAD_FILENAME = '__weblab-preload.js';
/**
 * Marker comment used to detect whether the preload script tag has already
 * been injected into an HTML file. Avoids duplicate injections on subsequent
 * sandbox starts.
 */
const STATIC_HTML_PRELOAD_MARKER = 'data-weblab-preload="1"';

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

        await injectPreloadScriptIntoLayout(provider, routerConfig);
    } catch (error) {
        console.error('[PreloadScript] Failed to copy preload script:', error);
        throw error;
    }
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

    const result = await provider.listFiles({ args: { path: routerConfig.basePath } });
    const [layoutFile] = result.files.filter(
        (file) =>
            file.type === 'file' &&
            isRootLayoutFile(`${routerConfig.basePath}/${file.name}`, routerConfig.type),
    );

    if (!layoutFile) {
        throw new Error(`No layout files found in ${routerConfig.basePath}`);
    }

    const layoutPath = `${routerConfig.basePath}/${layoutFile.name}`;

    const layoutResponse = await provider.readFile({ args: { path: layoutPath } });
    if (typeof layoutResponse.file.content !== 'string') {
        throw new Error(`Layout file ${layoutPath} is not a text file`);
    }

    const content = layoutResponse.file.content;
    const ast = getAstFromContent(content);
    if (!ast) {
        throw new Error(`Failed to parse layout file: ${layoutPath}`);
    }

    injectPreloadScript(ast);
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

    const original = response.file.content;
    if (original.includes(STATIC_HTML_PRELOAD_MARKER)) {
        // Already injected — no-op so repeated sandbox starts don't pile
        // up duplicate <script> tags.
        return;
    }

    const tag = `<script defer src="/${STATIC_HTML_PRELOAD_FILENAME}" ${STATIC_HTML_PRELOAD_MARKER}></script>`;
    // Prefer to inject before </head>. If there's no <head> element (rare —
    // some hand-written demos skip it), fall back to inserting before <body>
    // or as the very first content. parse5 would be more correct, but a
    // bounded string operation matches what parse5 would do for the common
    // case and keeps the dependency surface small for this hot path.
    let modified: string;
    if (/<\/head\s*>/i.test(original)) {
        modified = original.replace(/<\/head\s*>/i, `    ${tag}\n  </head>`);
    } else if (/<body[\s>]/i.test(original)) {
        modified = original.replace(/<body([\s>])/i, `<head>\n    ${tag}\n  </head>\n<body$1`);
    } else {
        modified = `${tag}\n${original}`;
    }

    await provider.writeFile({
        args: {
            path: indexHtmlPath,
            content: modified,
            overwrite: true,
        },
    });
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
