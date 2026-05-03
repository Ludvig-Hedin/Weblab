import type { PageEditorSettings, PageNode } from '@weblab/models/pages';
import type { SandboxManager } from '../sandbox';

const PAGE_SETTINGS_PATH = '.weblab/page-settings.json';

interface PageSettingsFile {
    version: 1;
    pages: Record<string, PageEditorSettings>;
}

const EMPTY_SETTINGS_FILE: PageSettingsFile = {
    version: 1,
    pages: {},
};

export function normalizePageSettingsPath(path: string): string {
    const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    return normalized.length === 0 ? '/' : `/${normalized}`;
}

function pruneSettings(settings: PageEditorSettings): PageEditorSettings | null {
    const next: PageEditorSettings = {
        displayName: settings.displayName?.trim() || undefined,
        editorIcon: settings.editorIcon ?? undefined,
        draft: settings.draft ?? undefined,
        published: settings.published ?? undefined,
    };

    const hasValue = Object.values(next).some((value) => value !== undefined);
    return hasValue ? next : null;
}

async function readSettingsFile(sandboxManager: SandboxManager): Promise<PageSettingsFile> {
    try {
        const file = await sandboxManager.readFile(PAGE_SETTINGS_PATH);
        if (typeof file !== 'string') {
            return { version: 1, pages: {} };
        }
        const parsed = JSON.parse(file) as Partial<PageSettingsFile>;
        return {
            version: 1,
            pages: parsed.pages ?? {},
        };
    } catch {
        return { version: 1, pages: {} };
    }
}

async function writeSettingsFile(
    sandboxManager: SandboxManager,
    file: PageSettingsFile,
): Promise<void> {
    await sandboxManager.writeFile(PAGE_SETTINGS_PATH, JSON.stringify(file, null, 2));
}

export async function getPageSettingsMap(
    sandboxManager: SandboxManager,
): Promise<Record<string, PageEditorSettings>> {
    const file = await readSettingsFile(sandboxManager);
    return file.pages;
}

export async function updatePageSettingsInSandbox(
    sandboxManager: SandboxManager,
    path: string,
    settings: PageEditorSettings,
): Promise<void> {
    const file = await readSettingsFile(sandboxManager);
    const normalizedPath = normalizePageSettingsPath(path);
    const prunedSettings = pruneSettings(settings);

    if (prunedSettings) {
        file.pages[normalizedPath] = prunedSettings;
    } else {
        delete file.pages[normalizedPath];
    }

    await writeSettingsFile(sandboxManager, file);
}

export async function deletePageSettingsInSandbox(
    sandboxManager: SandboxManager,
    path: string,
): Promise<void> {
    const file = await readSettingsFile(sandboxManager);
    delete file.pages[normalizePageSettingsPath(path)];
    await writeSettingsFile(sandboxManager, file);
}

export async function deletePageSettingsByPrefixInSandbox(
    sandboxManager: SandboxManager,
    pathPrefix: string,
): Promise<void> {
    const file = await readSettingsFile(sandboxManager);
    const normalizedPrefix = normalizePageSettingsPath(pathPrefix);
    const nextPages = Object.fromEntries(
        Object.entries(file.pages).filter(([path]) => {
            return !isSameOrChildPath(path, normalizedPrefix);
        }),
    );
    await writeSettingsFile(sandboxManager, {
        ...file,
        pages: nextPages,
    });
}

export async function movePageSettingsByPrefixInSandbox(
    sandboxManager: SandboxManager,
    oldPathPrefix: string,
    newPathPrefix: string,
): Promise<void> {
    const file = await readSettingsFile(sandboxManager);
    const normalizedOldPrefix = normalizePageSettingsPath(oldPathPrefix);
    const normalizedNewPrefix = normalizePageSettingsPath(newPathPrefix);
    const nextPages: Record<string, PageEditorSettings> = {};

    for (const [path, settings] of Object.entries(file.pages)) {
        if (!isSameOrChildPath(path, normalizedOldPrefix)) {
            nextPages[path] = settings;
            continue;
        }

        const suffix =
            normalizedOldPrefix === '/'
                ? path
                : path.slice(normalizedOldPrefix.length);
        const targetPath =
            normalizedNewPrefix === '/'
                ? normalizePageSettingsPath(suffix)
                : normalizePageSettingsPath(`${normalizedNewPrefix}${suffix}`);
        nextPages[targetPath] = settings;
    }

    await writeSettingsFile(sandboxManager, {
        ...file,
        pages: nextPages,
    });
}

function isSameOrChildPath(path: string, prefix: string): boolean {
    if (path === prefix) {
        return true;
    }
    if (prefix === '/') {
        return path.startsWith('/');
    }
    return path.startsWith(`${prefix}/`);
}

export function applyPageSettingsToNodes(
    nodes: PageNode[],
    settingsMap: Record<string, PageEditorSettings>,
): PageNode[] {
    return nodes.map((node) => {
        const nextNode: PageNode = {
            ...node,
            settings: node.kind === 'page' ? settingsMap[normalizePageSettingsPath(node.path)] : undefined,
        };

        if (node.kind === 'page') {
            const displayName = nextNode.settings?.displayName?.trim();
            nextNode.name = displayName || node.defaultName;
        }

        if (node.children?.length) {
            nextNode.children = applyPageSettingsToNodes(node.children, settingsMap);
        }

        return nextNode;
    });
}
