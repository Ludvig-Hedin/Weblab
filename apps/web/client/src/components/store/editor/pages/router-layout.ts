import type { ListFilesOutputFile, Provider } from '@weblab/code-provider';

const MAX_DIRECTORY_LISTINGS = 128;
const MAX_DEPTH = 12;
const LAYOUT_NAME = /^layout\.(tsx|ts|jsx|js)$/;

const isSafeName = (name: string): boolean =>
    name.length > 0 && name !== '.' && name !== '..' && !/[\\/\0]/.test(name);

/** Root layouts can live beneath locale segments or separate route groups. */
export async function hasAppRouterLayout(
    provider: Pick<Provider, 'listFiles'>,
    appPath: string,
): Promise<boolean> {
    const directories = [{ path: appPath, depth: 0 }];
    for (let index = 0; index < directories.length && index < MAX_DIRECTORY_LISTINGS; index++) {
        const directory = directories[index];
        if (!directory) break;
        let entries: ListFilesOutputFile[];
        try {
            entries = (await provider.listFiles({ args: { path: directory.path } })).files;
        } catch {
            continue;
        }
        if (entries.some((entry) =>
            entry.type === 'file' && !entry.isSymlink && LAYOUT_NAME.test(entry.name))) {
            return true;
        }
        if (directory.depth >= MAX_DEPTH) continue;
        for (const entry of entries) {
            if (directories.length >= MAX_DIRECTORY_LISTINGS) break;
            if (entry.type !== 'directory' || entry.isSymlink || !isSafeName(entry.name)
                || /^[._@]/.test(entry.name) || entry.name === 'node_modules') continue;
            directories.push({ path: `${directory.path}/${entry.name}`, depth: directory.depth + 1 });
        }
    }
    return false;
}
