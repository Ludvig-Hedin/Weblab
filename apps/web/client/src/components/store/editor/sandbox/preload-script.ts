import type { Provider } from '@weblab/code-provider';
import {
    DEPRECATED_PRELOAD_SCRIPT_SRCS,
    NEXT_JS_FILE_EXTENSIONS,
    WEBLAB_DEV_PRELOAD_SCRIPT_PATH,
    WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';
import { RouterType, type RouterConfig } from '@weblab/models';
import { getAstFromContent, getContentFromAst, injectPreloadScript } from '@weblab/parser';
import { isRootLayoutFile, normalizePath } from '@weblab/utility';
import path from 'path';

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

export async function copyPreloadScriptToPublic(provider: Provider, routerConfig: RouterConfig): Promise<void> {
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
                overwrite: true
            }
        });

        await injectPreloadScriptIntoLayout(provider, routerConfig);
    } catch (error) {
        console.error('[PreloadScript] Failed to copy preload script:', error);
        throw error;
    }
}

export async function injectPreloadScriptIntoLayout(provider: Provider, routerConfig: RouterConfig): Promise<void> {
    if (!routerConfig) {
        throw new Error('Could not detect router type for script injection. This is required for iframe communication.');
    }

    const result = await provider.listFiles({ args: { path: routerConfig.basePath } });
    const [layoutFile] = result.files.filter(file =>
        file.type === 'file' && isRootLayoutFile(`${routerConfig.basePath}/${file.name}`, routerConfig.type)
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
            overwrite: true
        }
    });
}

export async function getLayoutPath(routerConfig: RouterConfig, fileExists: (path: string) => Promise<boolean>): Promise<string | null> {
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
