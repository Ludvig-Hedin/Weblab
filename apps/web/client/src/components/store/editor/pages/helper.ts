import type { Provider } from '@weblab/code-provider';
import type { FileEntry } from '@weblab/file-system';
import type { PageMetadata, PageNode, RouterConfig } from '@weblab/models';
import { RouterType } from '@weblab/models';
import type { T } from '@weblab/parser';
import { formatContent, generate, getAstFromContent, t, traverse } from '@weblab/parser';
import { nanoid } from 'nanoid';
import type { SandboxManager } from '../sandbox';

const DEFAULT_LAYOUT_CONTENT = `export default function Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}`;

export const normalizeRoute = (route: string): string => {
    return route
        .replace(/\\/g, '/') // Replace backslashes with forward slashes
        .replace(/\/+/g, '/') // Replace multiple slashes with single slash
        .replace(/^\/|\/$/g, '') // Remove leading and trailing slashes
        .toLowerCase(); // Ensure lowercase
};

export const validateNextJsRoute = (route: string): { valid: boolean; error?: string } => {
    if (!route) {
        return { valid: false, error: 'Page name is required' };
    }

    // Checks if it's a dynamic route
    const hasMatchingBrackets = /\[[^\]]*\]/.test(route);
    if (hasMatchingBrackets) {
        const dynamicRegex = /^\[([a-z0-9-]+)\]$/;
        if (!dynamicRegex.test(route)) {
            return {
                valid: false,
                error: 'Invalid dynamic route format. Example: [id] or [blog]',
            };
        }
        return { valid: true };
    }

    // For regular routes, allow lowercase letters, numbers, and hyphens
    const validCharRegex = /^[a-z0-9-]+$/;
    if (!validCharRegex.test(route)) {
        return {
            valid: false,
            error: 'Page name can only contain lowercase letters, numbers, and hyphens',
        };
    }

    return { valid: true };
};

export const normalizePagePath = (path: string): string => {
    const normalizedPath = normalizeRoute(path);
    return normalizedPath.length === 0 ? '/' : `/${normalizedPath}`;
};

export const getParentPagePath = (path: string): string => {
    const normalizedPath = normalizePagePath(path);
    if (normalizedPath === '/') {
        return '/';
    }

    const segments = normalizedPath.split('/').filter(Boolean);
    segments.pop();

    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
};

export const getNestedPagePath = (parentPath: string, slug: string): string => {
    const normalizedParent = normalizePagePath(parentPath);
    const normalizedSlug = normalizeRoute(slug);

    if (!normalizedSlug) {
        return normalizedParent;
    }

    if (normalizedParent === '/') {
        return `/${normalizedSlug}`;
    }

    return `${normalizedParent}/${normalizedSlug}`;
};

export const isPageNode = (node: PageNode): boolean => node.kind === 'page';

export const isFolderNode = (node: PageNode): boolean => node.kind === 'folder';

export const findPageNodeByPath = (nodes: PageNode[], route: string): PageNode | null => {
    const normalizedRoute = normalizePagePath(route);

    const checkNode = (treeNodes: PageNode[]): PageNode | null => {
        for (const node of treeNodes) {
            if (isPageNode(node) && normalizePagePath(node.path) === normalizedRoute) {
                return node;
            }
            if (node.children?.length) {
                const childMatch = checkNode(node.children);
                if (childMatch) {
                    return childMatch;
                }
            }
        }
        return null;
    };

    return checkNode(nodes);
};

export const findFolderNodeByPath = (nodes: PageNode[], route: string): PageNode | null => {
    const normalizedRoute = normalizePagePath(route);

    const checkNode = (treeNodes: PageNode[]): PageNode | null => {
        for (const node of treeNodes) {
            if (isFolderNode(node) && normalizePagePath(node.path) === normalizedRoute) {
                return node;
            }
            if (node.children?.length) {
                const childMatch = checkNode(node.children);
                if (childMatch) {
                    return childMatch;
                }
            }
        }
        return null;
    };

    return checkNode(nodes);
};

export const doesRouteExist = (
    nodes: PageNode[],
    route: string,
    kind: 'page' | 'folder' = 'page',
): boolean => {
    const normalizedRoute = normalizePagePath(route);

    const checkNode = (treeNodes: PageNode[]): boolean => {
        for (const node of treeNodes) {
            if (node.kind === kind && normalizePagePath(node.path) === normalizedRoute) {
                return true;
            }
            if (node.children?.length && checkNode(node.children)) {
                return true;
            }
        }
        return false;
    };

    return checkNode(nodes);
};

export const getPageNodes = (nodes: PageNode[]): PageNode[] => {
    const pages: PageNode[] = [];

    const visit = (treeNodes: PageNode[]) => {
        for (const node of treeNodes) {
            if (isPageNode(node)) {
                pages.push(node);
            }
            if (node.children?.length) {
                visit(node.children);
            }
        }
    };

    visit(nodes);
    return pages;
};

export const getFolderNodes = (nodes: PageNode[]): PageNode[] => {
    const folders: PageNode[] = [];

    const visit = (treeNodes: PageNode[]) => {
        for (const node of treeNodes) {
            if (isFolderNode(node)) {
                folders.push(node);
            }
            if (node.children?.length) {
                visit(node.children);
            }
        }
    };

    visit(nodes);
    return folders;
};

const IGNORED_DIRECTORIES = ['api', 'components', 'lib', 'utils', 'node_modules'];
const APP_ROUTER_PATHS = ['src/app', 'app'];
const PAGES_ROUTER_PATHS = ['src/pages', 'pages'];
const ALLOWED_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
const ROOT_PAGE_NAME = 'Home';
const ROOT_PATH_IDENTIFIERS = ['', '/', '.'];
const ROOT_PAGE_COPY_NAME = 'landing-page-copy';

const DEFAULT_PAGE_CONTENT = `export default function Page() {
    return (
        <div className="w-full min-h-screen flex items-center justify-center bg-white dark:bg-black transition-colors duration-200 flex-col p-4 gap-[32px]">
            <div className="text-center text-gray-900 dark:text-gray-100 p-4">
                <h1 className="text-4xl md:text-5xl font-semibold mb-4 tracking-tight">
                    This is a blank page
                </h1>
            </div>
        </div>
    );
}
`;

const getFileExtension = (fileName: string): string => {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot !== -1 ? fileName.substring(lastDot) : '';
};

const getBaseName = (filePath: string): string => {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || '';
};

const getDirName = (filePath: string): string => {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.slice(0, -1).join('/');
};

const joinPath = (...parts: string[]): string => {
    return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
};

const getDefaultNodeName = (path: string, isRoot = false): string => {
    if (isRoot) {
        return ROOT_PAGE_NAME;
    }
    const normalizedPath = normalizeRoute(path);
    const lastSegment = normalizedPath.split('/').pop();
    return lastSegment || ROOT_PAGE_NAME;
};

const createPageNode = ({
    path,
    metadata,
    isRoot = false,
}: {
    path: string;
    metadata?: PageMetadata;
    isRoot?: boolean;
}): PageNode => {
    const normalizedPath = normalizePagePath(path);
    const defaultName = getDefaultNodeName(normalizedPath, isRoot);

    return {
        id: `page:${normalizedPath}:${nanoid()}`,
        kind: 'page',
        path: normalizedPath,
        slug: isRoot ? '' : getBaseName(normalizedPath),
        defaultName,
        name: defaultName,
        metadata: metadata ?? {},
        settings: undefined,
        children: [],
        isActive: false,
        isRoot,
    };
};

const createFolderNode = ({
    path,
    children,
}: {
    path: string;
    children: PageNode[];
}): PageNode => {
    const normalizedPath = normalizePagePath(path);
    const defaultName = getDefaultNodeName(normalizedPath);

    return {
        id: `folder:${normalizedPath}:${nanoid()}`,
        kind: 'folder',
        path: normalizedPath,
        slug: getBaseName(normalizedPath),
        defaultName,
        name: defaultName,
        children,
        isActive: false,
        isRoot: false,
    };
};

const sortPageNodes = (nodes: PageNode[]): PageNode[] => {
    return [...nodes].sort((a, b) => {
        if (a.kind !== b.kind) {
            return a.kind === 'page' ? -1 : 1;
        }
        if (a.isRoot !== b.isRoot) {
            return a.isRoot ? -1 : 1;
        }
        return a.path.localeCompare(b.path);
    });
};

const isRouteGroupSegment = (segment: string): boolean => {
    return segment.startsWith('(') && segment.endsWith(')');
};

const getRoutePathFromSegments = (segments: string[]): string => {
    const filteredSegments = segments.filter((segment) => !isRouteGroupSegment(segment));
    return filteredSegments.length === 0 ? '/' : `/${filteredSegments.join('/')}`;
};

const getSandboxRoutePath = (route: string): string => {
    return normalizePagePath(route).replace(/^\/|\/$/g, '');
};

const getRouteDirectoryPath = (basePath: string, route: string): string => {
    return joinPath(basePath, getSandboxRoutePath(route));
};

const getPageFilePathForRoute = (basePath: string, route: string): string => {
    return joinPath(getRouteDirectoryPath(basePath, route), 'page.tsx');
};

const createObjectPropertyKey = (key: string): T.Identifier | T.StringLiteral => {
    return /^[$A-Z_][0-9A-Z_$]*$/i.test(key) ? t.identifier(key) : t.stringLiteral(key);
};

const createMetadataValueNode = (
    value: unknown,
    key?: string,
): T.Expression => {
    if (value instanceof URL || (key === 'metadataBase' && typeof value === 'string')) {
        return t.newExpression(t.identifier('URL'), [t.stringLiteral(value.toString())]);
    }

    if (typeof value === 'string') {
        return t.stringLiteral(value);
    }

    if (typeof value === 'number') {
        return t.numericLiteral(value);
    }

    if (typeof value === 'boolean') {
        return t.booleanLiteral(value);
    }

    if (value === null || value === undefined) {
        return t.nullLiteral();
    }

    if (Array.isArray(value)) {
        return t.arrayExpression(value.map((item) => createMetadataValueNode(item)));
    }

    if (typeof value === 'object') {
        return t.objectExpression(
            Object.entries(value).flatMap(([entryKey, entryValue]) => {
                if (entryValue === undefined) {
                    return [];
                }

                return [
                    t.objectProperty(
                        createObjectPropertyKey(entryKey),
                        createMetadataValueNode(entryValue, entryKey),
                    ),
                ];
            }),
        );
    }

    return t.stringLiteral(String(value));
};

const extractNodeValue = (node: T.Node | null | undefined): unknown => {
    if (!node) {
        return undefined;
    }

    if (t.isStringLiteral(node)) {
        return node.value;
    }

    if (t.isNumericLiteral(node)) {
        return node.value;
    }

    if (t.isBooleanLiteral(node)) {
        return node.value;
    }

    if (t.isNullLiteral(node)) {
        return null;
    }

    if (
        t.isNewExpression(node) &&
        t.isIdentifier(node.callee) &&
        node.callee.name === 'URL'
    ) {
        const firstArgument = node.arguments[0];
        if (firstArgument && t.isStringLiteral(firstArgument)) {
            return firstArgument.value;
        }
    }

    if (t.isObjectExpression(node)) {
        const result: Record<string, unknown> = {};
        for (const prop of node.properties) {
            if (t.isObjectProperty(prop)) {
                const key = t.isIdentifier(prop.key)
                    ? prop.key.name
                    : t.isStringLiteral(prop.key)
                      ? prop.key.value
                      : null;
                if (!key) {
                    continue;
                }
                result[key] = extractNodeValue(prop.value);
            }
        }
        return result;
    }

    if (t.isArrayExpression(node)) {
        return node.elements.map((element) => extractNodeValue(element));
    }

    return undefined;
};

// Helper function to extract metadata from file content
const extractMetadata = async (content: string | Uint8Array): Promise<PageMetadata | undefined> => {
    try {
        if (typeof content !== 'string') {
            throw new Error('Content is not a string');
        }
        const ast = getAstFromContent(content);
        if (!ast) {
            throw new Error('Failed to parse page file');
        }

        let metadata: PageMetadata | undefined;

        // Traverse the AST to find metadata export
        traverse(ast, {
            ExportNamedDeclaration(path) {
                const declaration = path.node.declaration;
                if (t.isVariableDeclaration(declaration)) {
                    const declarator = declaration.declarations[0];
                    if (
                        declarator &&
                        t.isIdentifier(declarator.id) &&
                        declarator.id.name === 'metadata' &&
                        t.isObjectExpression(declarator.init)
                    ) {
                        metadata = {};
                        // Extract properties from the object expression
                        for (const prop of declarator.init.properties) {
                            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                                const key = prop.key.name;
                                try {
                                    (metadata as Record<string, unknown>)[key] = extractNodeValue(
                                        prop.value,
                                    );
                                } catch (error) {
                                    console.error(`Error extracting metadata:`, error);
                                }
                            }
                        }
                    }
                }
            },
        });

        return metadata;
    } catch (error) {
        console.error(`Error reading metadata:`, error);
        return undefined;
    }
};

export const scanAppDirectory = async (
    sandboxManager: SandboxManager,
    dir: string,
    parentPath = '',
): Promise<PageNode[]> => {
    let entries: FileEntry[];

    try {
        entries = await sandboxManager.readDir(dir);
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
        return [];
    }

    const { pageFile, layoutFile } = getPageAndLayoutFiles(entries);
    const childDirectories = entries.filter(
        (entry) => entry.isDirectory && !IGNORED_DIRECTORIES.includes(entry.name),
    );
    const childResults = await Promise.all(
        childDirectories.map((entry) => {
            const fullPath = `${dir}/${entry.name}`;
            const relativePath = joinPath(parentPath, entry.name);
            return scanAppDirectory(sandboxManager, fullPath, relativePath);
        }),
    );
    const childNodes = sortPageNodes(childResults.flat());
    const currentPath = getRoutePathFromSegments(parentPath.split('/').filter(Boolean));
    const isRoot = ROOT_PATH_IDENTIFIERS.includes(currentPath);

    if (!pageFile) {
        if (isRoot) {
            return childNodes;
        }

        if (childNodes.length === 0 && !parentPath) {
            return [];
        }

        return [createFolderNode({ path: currentPath, children: childNodes })];
    }

    const fileEntries: (FileEntry | null)[] = [pageFile, layoutFile || null];
    const { pageMetadata, layoutMetadata } = await getPageAndLayoutMetadata(
        fileEntries,
        sandboxManager,
        dir,
    );
    const metadata = {
        ...layoutMetadata,
        ...pageMetadata,
    };

    const pageNode = createPageNode({
        path: currentPath,
        metadata: metadata ?? {},
        isRoot,
    });

    if (isRoot) {
        return sortPageNodes([pageNode, ...childNodes]);
    }

    if (childNodes.length > 0) {
        return [
            createFolderNode({
                path: currentPath,
                children: sortPageNodes([pageNode, ...childNodes]),
            }),
        ];
    }

    return [pageNode];
};

const scanPagesDirectory = async (
    sandboxManager: SandboxManager,
    dir: string,
    parentPath = '',
): Promise<PageNode[]> => {
    let entries: FileEntry[];

    try {
        entries = await sandboxManager.readDir(dir);
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
        return [];
    }

    const pageNodes: PageNode[] = [];

    // Process files first
    for (const entry of entries) {
        const fileName = entry.name?.split('.')[0];

        if (!fileName) {
            console.error(`Error reading file ${entry.name}`);
            continue;
        }

        if (
            !entry.isDirectory &&
            ALLOWED_EXTENSIONS.includes(getFileExtension(entry.name)) &&
            !IGNORED_DIRECTORIES.includes(fileName)
        ) {
            const isDynamicRoute = fileName.startsWith('[') && fileName.endsWith(']');

            let cleanPath;
            if (fileName === 'index') {
                cleanPath = parentPath ? `/${parentPath}` : '/';
            } else {
                if (isDynamicRoute) {
                    const paramName = fileName.slice(1, -1);
                    cleanPath = joinPath(parentPath, paramName);
                } else {
                    cleanPath = joinPath(parentPath, fileName);
                }
                // Normalize path
                cleanPath = '/' + cleanPath.replace(/\\/g, '/').replace(/^\/|\/$/g, '');
            }

            const isRoot = ROOT_PATH_IDENTIFIERS.includes(cleanPath);

            // Extract metadata from the page file
            let metadata: PageMetadata | undefined;
            try {
                const fileContent = await sandboxManager.readFile(`${dir}/${entry.name}`);
                if (typeof fileContent !== 'string') {
                    throw new Error(`File ${dir}/${entry.name} is not a text file`);
                }
                metadata = await extractMetadata(fileContent);
            } catch (error) {
                console.error(`Error reading file ${dir}/${entry.name}:`, error);
            }

            pageNodes.push(
                createPageNode({
                    path: cleanPath,
                    metadata: metadata || {},
                    isRoot,
                }),
            );
        }
    }

    const folderNodes: PageNode[] = [];

    // Process directories
    for (const entry of entries) {
        if (IGNORED_DIRECTORIES.includes(entry.name)) {
            continue;
        }

        const fullPath = `${dir}/${entry.name}`;
        const isDynamicDir = entry.name.startsWith('[') && entry.name.endsWith(']');

        const dirNameForPath = isDynamicDir ? entry.name.slice(1, -1) : entry.name;
        const relativePath = joinPath(parentPath, dirNameForPath);

        if (entry.isDirectory) {
            const children = await scanPagesDirectory(sandboxManager, fullPath, relativePath);
            if (children.length > 0) {
                folderNodes.push(
                    createFolderNode({
                        path: relativePath,
                        children,
                    }),
                );
            }
        }
    }

    const currentPath = normalizePagePath(parentPath);
    const indexPage = pageNodes.find(
        (node) => normalizePagePath(node.path) === currentPath,
    );
    const otherPages = pageNodes.filter(
        (node) => normalizePagePath(node.path) !== currentPath,
    );
    const siblings = sortPageNodes([...otherPages, ...folderNodes]);

    if (!ROOT_PATH_IDENTIFIERS.includes(currentPath) && indexPage && siblings.length > 0) {
        return [
            createFolderNode({
                path: currentPath,
                children: sortPageNodes([indexPage, ...siblings]),
            }),
        ];
    }

    return sortPageNodes([...pageNodes, ...folderNodes]);
};

export const scanPagesFromSandbox = async (sandboxManager: SandboxManager): Promise<PageNode[]> => {
    // Use router config from sandbox manager
    const routerConfig = await sandboxManager.getRouterConfig();

    if (!routerConfig) {
        console.log('No Next.js router detected, returning empty pages');
        return [];
    }

    if (routerConfig.type === RouterType.APP) {
        return await scanAppDirectory(sandboxManager, routerConfig.basePath);
    } else {
        return await scanPagesDirectory(sandboxManager, routerConfig.basePath);
    }
};


// TODO: We're calling getRouterConfig in a lot of places before the provider is initialized.
// We should ensure it's initialized earlier during setup.
export const detectRouterConfig = async (
    provider: Provider,
): Promise<RouterConfig | null> => {
    // Check for App Router
    for (const appPath of APP_ROUTER_PATHS) {
        try {
            const result = await provider.listFiles({ args: { path: appPath } });
            const entries = result.files;
            if (entries && entries.length > 0) {
                // Check for layout file (required for App Router)
                const hasLayout = entries.some(
                    (entry) =>
                        entry.type === 'file' &&
                        entry.name.startsWith('layout.') &&
                        ALLOWED_EXTENSIONS.includes(getFileExtension(entry.name)),
                );

                if (hasLayout) {
                    return { type: RouterType.APP, basePath: appPath };
                }
            }
        } catch (error) {
            // Directory doesn't exist, continue checking
        }
    }

    // Check for Pages Router if App Router not found
    for (const pagesPath of PAGES_ROUTER_PATHS) {
        try {
            const result = await provider.listFiles({ args: { path: pagesPath } });
            const entries = result.files;
            if (entries && entries.length > 0) {
                // Check for index file (common in Pages Router)
                const hasIndex = entries.some(
                    (entry) =>
                        entry.type === 'file' &&
                        entry.name.startsWith('index.') &&
                        ALLOWED_EXTENSIONS.includes(getFileExtension(entry.name)),
                );

                if (hasIndex) {
                    console.log(`Found Pages Router at: ${pagesPath}`);
                    return { type: RouterType.PAGES, basePath: pagesPath };
                }
            }
        } catch (error) {
            // Directory doesn't exist, continue checking
        }
    }

    return null;
};

// checks if file/directory exists
const pathExists = async (sandboxManager: SandboxManager, filePath: string): Promise<boolean> => {
    try {
        return await sandboxManager.fileExists(filePath);
    } catch (error) {
        return false;
    }
};

const cleanupEmptyFolders = async (
    sandboxManager: SandboxManager,
    folderPath: string,
): Promise<void> => {
    while (folderPath && folderPath !== getDirName(folderPath)) {
        try {
            const entries = await sandboxManager.readDir(folderPath);
            if (entries.length === 0) {
                // Delete empty directory using remove method
                await sandboxManager.deleteDirectory(folderPath);
                folderPath = getDirName(folderPath);
            } else {
                break;
            }
        } catch (error) {
            // Directory doesn't exist or can't be accessed
            break;
        }
    }
};

const getUniqueDir = async (
    sandboxManager: SandboxManager,
    basePath: string,
    dirName: string,
    maxAttempts = 100,
): Promise<string> => {
    let uniquePath = dirName;
    let counter = 1;

    const baseName = dirName.replace(/-copy(-\d+)?$/, '');

    while (counter <= maxAttempts) {
        const fullPath = joinPath(basePath, uniquePath);
        if (!(await pathExists(sandboxManager, fullPath))) {
            return uniquePath;
        }
        uniquePath = `${baseName}-copy-${counter}`;
        counter++;
    }

    throw new Error(`Unable to find available directory name for ${dirName}`);
};

export const createPageInSandbox = async (
    sandboxManager: SandboxManager,
    pagePath: string,
): Promise<void> => {
    try {
        const routerConfig = await sandboxManager.getRouterConfig();

        if (!routerConfig) {
            throw new Error('Could not detect Next.js router type');
        }

        if (routerConfig.type !== RouterType.APP) {
            throw new Error('Page creation is only supported for App Router projects.');
        }

        // Validate and normalize the path
        const normalizedPagePath = pagePath.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        if (!/^[a-zA-Z0-9\-_[\]()/]+$/.test(normalizedPagePath)) {
            throw new Error('Page path contains invalid characters');
        }

        const fullPath = joinPath(routerConfig.basePath, normalizedPagePath);
        const pageFilePath = joinPath(fullPath, 'page.tsx');

        if (await pathExists(sandboxManager, pageFilePath)) {
            throw new Error('Page already exists at this path');
        }

        await sandboxManager.writeFile(pageFilePath, DEFAULT_PAGE_CONTENT);

        console.log(`Created page at: ${pageFilePath}`);
    } catch (error) {
        console.error('Error creating page:', error);
        throw error;
    }
};

export const createFolderInSandbox = async (
    sandboxManager: SandboxManager,
    folderPath: string,
): Promise<void> => {
    const routerConfig = await sandboxManager.getRouterConfig();

    if (!routerConfig || routerConfig.type !== RouterType.APP) {
        throw new Error('Folder creation is only supported for App Router projects.');
    }

    const normalizedFolderPath = normalizePagePath(folderPath);
    if (normalizedFolderPath === '/') {
        throw new Error('Cannot create the root folder');
    }

    const fullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedFolderPath);
    if (await pathExists(sandboxManager, fullPath)) {
        throw new Error('This folder already exists');
    }

    await sandboxManager.createDirectory(fullPath);
};

export const deletePageInSandbox = async (
    sandboxManager: SandboxManager,
    pagePath: string,
    isDir: boolean,
): Promise<void> => {
    try {
        const routerConfig = await sandboxManager.getRouterConfig();

        if (!routerConfig) {
            throw new Error('Could not detect Next.js router type');
        }

        if (routerConfig.type !== RouterType.APP) {
            throw new Error('Page deletion is only supported for App Router projects.');
        }

        const normalizedPath = pagePath.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        if (normalizedPath === '' || normalizedPath === '/') {
            throw new Error('Cannot delete root page');
        }

        const fullPath = joinPath(routerConfig.basePath, normalizedPath);

        if (!(await pathExists(sandboxManager, fullPath))) {
            throw new Error('Selected page not found');
        }

        if (isDir) {
            // Delete entire directory
            await sandboxManager.deleteDirectory(fullPath);
        } else {
            // Delete just the page.tsx file
            const pageFilePath = joinPath(fullPath, 'page.tsx');
            await sandboxManager.deleteFile(pageFilePath);

            // Clean up empty parent directories
            await cleanupEmptyFolders(sandboxManager, fullPath);
        }

        console.log(`Deleted: ${fullPath}`);
    } catch (error) {
        console.error('Error deleting page:', error);
        throw error;
    }
};

export const deleteFolderInSandbox = async (
    sandboxManager: SandboxManager,
    folderPath: string,
): Promise<void> => {
    const routerConfig = await sandboxManager.getRouterConfig();

    if (!routerConfig || routerConfig.type !== RouterType.APP) {
        throw new Error('Folder deletion is only supported for App Router projects.');
    }

    const normalizedFolderPath = normalizePagePath(folderPath);
    if (normalizedFolderPath === '/') {
        throw new Error('Cannot delete the root folder');
    }

    const fullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedFolderPath);
    if (!(await pathExists(sandboxManager, fullPath))) {
        throw new Error('Selected folder not found');
    }

    await sandboxManager.deleteDirectory(fullPath);
    await cleanupEmptyFolders(sandboxManager, getDirName(fullPath));
};

export const renamePageInSandbox = async (
    sandboxManager: SandboxManager,
    oldPath: string,
    newName: string,
): Promise<void> => {
    try {
        const routerConfig = await sandboxManager.getRouterConfig();

        if (!routerConfig || routerConfig.type !== RouterType.APP) {
            throw new Error('Page renaming is only supported for App Router projects.');
        }

        if (ROOT_PATH_IDENTIFIERS.includes(oldPath)) {
            throw new Error('Cannot rename root page');
        }

        // Validate new name
        if (!/^[a-zA-Z0-9\-_[\]()]+$/.test(newName)) {
            throw new Error('Page name contains invalid characters');
        }

        const normalizedOldPath = normalizePagePath(oldPath);
        const oldFullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedOldPath);
        const newRoutePath = getNestedPagePath(getParentPagePath(normalizedOldPath), newName);
        const newFullPath = getRouteDirectoryPath(routerConfig.basePath, newRoutePath);

        if (!(await pathExists(sandboxManager, oldFullPath))) {
            throw new Error(`Source page not found: ${oldFullPath}`);
        }

        if (await pathExists(sandboxManager, newFullPath)) {
            throw new Error(`Target path already exists: ${newFullPath}`);
        }

        await sandboxManager.moveDirectory(oldFullPath, newFullPath);

        console.log(`Renamed page from ${oldFullPath} to ${newFullPath}`);
    } catch (error) {
        console.error('Error renaming page:', error);
        throw error;
    }
};

export const renameFolderInSandbox = async (
    sandboxManager: SandboxManager,
    oldPath: string,
    newName: string,
): Promise<void> => {
    const routerConfig = await sandboxManager.getRouterConfig();

    if (!routerConfig || routerConfig.type !== RouterType.APP) {
        throw new Error('Folder renaming is only supported for App Router projects.');
    }

    const normalizedOldPath = normalizePagePath(oldPath);
    if (normalizedOldPath === '/') {
        throw new Error('Cannot rename the root folder');
    }

    if (!/^[a-zA-Z0-9\-_[\]()]+$/.test(newName)) {
        throw new Error('Folder name contains invalid characters');
    }

    const oldFullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedOldPath);
    if (!(await pathExists(sandboxManager, oldFullPath))) {
        throw new Error(`Source folder not found: ${oldFullPath}`);
    }

    const newRoutePath = getNestedPagePath(getParentPagePath(normalizedOldPath), newName);
    const newFullPath = getRouteDirectoryPath(routerConfig.basePath, newRoutePath);
    if (await pathExists(sandboxManager, newFullPath)) {
        throw new Error(`Target path already exists: ${newFullPath}`);
    }

    await sandboxManager.moveDirectory(oldFullPath, newFullPath);
};

export const movePageInSandbox = async (
    sandboxManager: SandboxManager,
    sourcePath: string,
    targetPath: string,
): Promise<void> => {
    const routerConfig = await sandboxManager.getRouterConfig();

    if (!routerConfig || routerConfig.type !== RouterType.APP) {
        throw new Error('Page moving is only supported for App Router projects.');
    }

    const normalizedSourcePath = normalizePagePath(sourcePath);
    const normalizedTargetPath = normalizePagePath(targetPath);

    if (normalizedSourcePath === '/' || normalizedTargetPath === '/') {
        throw new Error(
            normalizedSourcePath === '/'
                ? 'Root page cannot be moved'
                : 'Cannot move a page to the root path',
        );
    }

    const sourceFullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedSourcePath);
    const targetFullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedTargetPath);

    if (!(await pathExists(sandboxManager, sourceFullPath))) {
        throw new Error(`Source page not found: ${sourceFullPath}`);
    }
    if (await pathExists(sandboxManager, targetFullPath)) {
        throw new Error('Target page already exists');
    }

    await sandboxManager.moveDirectory(sourceFullPath, targetFullPath);
    await cleanupEmptyFolders(sandboxManager, getDirName(sourceFullPath));
};

export const moveFolderInSandbox = async (
    sandboxManager: SandboxManager,
    sourcePath: string,
    targetPath: string,
): Promise<void> => {
    const routerConfig = await sandboxManager.getRouterConfig();

    if (!routerConfig || routerConfig.type !== RouterType.APP) {
        throw new Error('Folder moving is only supported for App Router projects.');
    }

    const normalizedSourcePath = normalizePagePath(sourcePath);
    const normalizedTargetPath = normalizePagePath(targetPath);

    if (normalizedSourcePath === '/' || normalizedTargetPath === '/') {
        throw new Error(
            normalizedSourcePath === '/'
                ? 'Root folder cannot be moved'
                : 'Cannot move a folder to the root path',
        );
    }

    const sourceFullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedSourcePath);
    const targetFullPath = getRouteDirectoryPath(routerConfig.basePath, normalizedTargetPath);

    if (!(await pathExists(sandboxManager, sourceFullPath))) {
        throw new Error(`Source folder not found: ${sourceFullPath}`);
    }
    if (await pathExists(sandboxManager, targetFullPath)) {
        throw new Error('Target folder already exists');
    }

    await sandboxManager.moveDirectory(sourceFullPath, targetFullPath);
    await cleanupEmptyFolders(sandboxManager, getDirName(sourceFullPath));
};

export const duplicatePageInSandbox = async (
    sandboxManager: SandboxManager,
    sourcePath: string,
    targetPath: string,
): Promise<void> => {
    try {
        const routerConfig = await sandboxManager.getRouterConfig();

        if (!routerConfig || routerConfig.type !== RouterType.APP) {
            throw new Error('Page duplication is only supported for App Router projects.');
        }

        // Handle root path case
        const isRootPath = ROOT_PATH_IDENTIFIERS.includes(sourcePath);

        if (isRootPath) {
            const sourcePageFile = joinPath(routerConfig.basePath, 'page.tsx');
            const targetDir = await getUniqueDir(
                sandboxManager,
                routerConfig.basePath,
                ROOT_PAGE_COPY_NAME,
            );
            const targetDirPath = joinPath(routerConfig.basePath, targetDir);
            const targetPageFile = joinPath(targetDirPath, 'page.tsx');

            if (await pathExists(sandboxManager, targetDirPath)) {
                throw new Error('Target path already exists');
            }

            await sandboxManager.copyFile(sourcePageFile, targetPageFile);

            console.log(`Duplicated root page to: ${targetPageFile}`);
            return;
        }

        // Handle non-root pages
        const normalizedSourcePath = sourcePath.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        const normalizedTargetPath = await getUniqueDir(
            sandboxManager,
            routerConfig.basePath,
            targetPath,
        );

        const sourceFull = joinPath(routerConfig.basePath, normalizedSourcePath);
        const targetFull = joinPath(routerConfig.basePath, normalizedTargetPath);

        if (await pathExists(sandboxManager, targetFull)) {
            throw new Error('Target path already exists');
        }

        // Check if source directory exists
        const sourceEntries = await sandboxManager.readDir(getDirName(sourceFull));
        const sourceEntry = sourceEntries.find(
            (entry: FileEntry) => entry.name === getBaseName(sourceFull),
        );

        if (!sourceEntry) {
            throw new Error('Source page not found');
        }

        // App Router pages are always directories containing page.tsx and other files
        await sandboxManager.copyDirectory(sourceFull, targetFull);

        console.log(`Duplicated page from ${sourceFull} to ${targetFull}`);
    } catch (error) {
        console.error('Error duplicating page:', error);
        throw error;
    }
};

export const updatePageMetadataInSandbox = async (
    sandboxManager: SandboxManager,
    pagePath: string,
    metadata: PageMetadata,
): Promise<void> => {
    const routerConfig = await sandboxManager.getRouterConfig();

    if (!routerConfig) {
        throw new Error('Could not detect Next.js router type');
    }

    if (routerConfig.type !== RouterType.APP) {
        throw new Error('Metadata update is only supported for App Router projects for now.');
    }

    const fullPath = getRouteDirectoryPath(routerConfig.basePath, pagePath);
    const pageFilePath = getPageFilePathForRoute(routerConfig.basePath, pagePath);
    // check if page.tsx exists
    const pageExists = await pathExists(sandboxManager, pageFilePath);

    if (!pageExists) {
        throw new Error('Page not found');
    }

    const file = await sandboxManager.readFile(pageFilePath);
    if (typeof file !== 'string') {
        throw new Error('Page file is not a text file');
    }
    const pageContent = file;
    const hasUseClient =
        pageContent.includes("'use client'") || pageContent.includes('"use client"');

    if (hasUseClient) {
        // check if layout.tsx exists
        const layoutFilePath = joinPath(fullPath, 'layout.tsx');
        const layoutExists = await pathExists(sandboxManager, layoutFilePath);

        if (layoutExists) {
            await updateMetadataInFile(sandboxManager, layoutFilePath, metadata);
        } else {
            await sandboxManager.writeFile(layoutFilePath, DEFAULT_LAYOUT_CONTENT);
            await updateMetadataInFile(sandboxManager, layoutFilePath, metadata);
        }
    } else {
        await updateMetadataInFile(sandboxManager, pageFilePath, metadata);
    }
};

async function updateMetadataInFile(
    sandboxManager: SandboxManager,
    filePath: string,
    metadata: PageMetadata,
) {
    // Read the current file content
    const file = await sandboxManager.readFile(filePath);
    if (typeof file !== 'string') {
        throw new Error('File is not a text file');
    }
    const content = file;

    // Parse the file content using Babel
    const ast = getAstFromContent(content);
    if (!ast) {
        throw new Error(`Failed to parse file ${filePath}`);
    }

    let hasMetadataImport = false;
    let metadataNode: T.ExportNamedDeclaration | null = null;

    // Traverse the AST to find metadata import and export
    traverse(ast, {
        ImportDeclaration(path) {
            if (
                path.node.source.value === 'next' &&
                path.node.specifiers.some(
                    (spec) =>
                        t.isImportSpecifier(spec) &&
                        t.isIdentifier(spec.imported) &&
                        spec.imported.name === 'Metadata',
                )
            ) {
                hasMetadataImport = true;
            }
        },
        ExportNamedDeclaration(path) {
            const declaration = path.node.declaration;
            if (t.isVariableDeclaration(declaration)) {
                const declarator = declaration.declarations[0];
                if (
                    declarator &&
                    t.isIdentifier(declarator.id) &&
                    declarator.id.name === 'metadata'
                ) {
                    metadataNode = path.node;
                }
            }
        },
    });

    // Add Metadata import if not present
    if (!hasMetadataImport) {
        const metadataImport = t.importDeclaration(
            [t.importSpecifier(t.identifier('Metadata'), t.identifier('Metadata'))],
            t.stringLiteral('next'),
        );
        ast.program.body.unshift(metadataImport);
    }
    // Create metadata object expression
    const metadataObject = t.objectExpression(
        Object.entries(metadata).flatMap(([key, value]) => {
            if (value === undefined) {
                return [];
            }

            return [
                t.objectProperty(createObjectPropertyKey(key), createMetadataValueNode(value, key)),
            ];
        }),
    );

    // Create metadata variable declaration
    const metadataVarDecl = t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier('metadata'), metadataObject),
    ]);

    // Add type annotation
    const metadataTypeAnnotation = t.tsTypeAnnotation(t.tsTypeReference(t.identifier('Metadata')));
    (metadataVarDecl.declarations[0]?.id as T.Identifier).typeAnnotation = metadataTypeAnnotation;

    // Create metadata export
    const metadataExport = t.exportNamedDeclaration(metadataVarDecl);

    if (metadataNode) {
        // Replace existing metadata export
        const metadataExportIndex = ast.program.body.findIndex((node) => {
            if (!t.isExportNamedDeclaration(node) || !t.isVariableDeclaration(node.declaration)) {
                return false;
            }
            const declarator = node.declaration.declarations[0];
            return t.isIdentifier(declarator?.id) && declarator.id.name === 'metadata';
        });

        if (metadataExportIndex !== -1) {
            ast.program.body[metadataExportIndex] = metadataExport;
        }
    } else {
        // Find the default export and add metadata before it
        const defaultExportIndex = ast.program.body.findIndex((node) =>
            t.isExportDefaultDeclaration(node),
        );

        if (defaultExportIndex === -1) {
            throw new Error('Could not find default export in the file');
        }

        ast.program.body.splice(defaultExportIndex, 0, metadataExport);
    }

    // Generate the updated code
    const { code } = generate(ast);

    const formattedContent = await formatContent(filePath, code);

    // Write the updated content back to the file
    await sandboxManager.writeFile(filePath, formattedContent);
}

export const addSetupTask = async (sandboxManager: SandboxManager) => {
    const tasks = {
        setupTasks: ['bun install'],
        tasks: {
            dev: {
                name: 'Dev Server',
                command: 'bun run dev',
                preview: {
                    port: 3000,
                },
                runAtStart: true,
            },
        },
    };
    const content = JSON.stringify(tasks, null, 2);
    await sandboxManager.writeFile('./.codesandbox/tasks.json', content);
};

export const updatePackageJson = async (sandboxManager: SandboxManager) => {
    const file = await sandboxManager.readFile('./package.json');
    if (typeof file !== 'string') {
        throw new Error('Package.json is not a text file');
    }
    const pkgJson = JSON.parse(file);

    pkgJson.scripts = pkgJson.scripts || {};
    pkgJson.scripts.dev = 'next dev';

    await sandboxManager.writeFile('./package.json', JSON.stringify(pkgJson, null, 2));
};

export const parseRepoUrl = (repoUrl: string): { owner: string; repo: string } => {
    const match = /github\.com\/([^/]+)\/([^/]+)(?:\.git)?/.exec(repoUrl);
    if (!match?.[1] || !match[2]) {
        throw new Error('Invalid GitHub URL');
    }

    return {
        owner: match[1],
        repo: match[2],
    };
};

const getPageAndLayoutFiles = (entries: FileEntry[]) => {
    const pageFile = entries.find(
        (entry) =>
            !entry.isDirectory &&
            entry.name.startsWith('page.') &&
            ALLOWED_EXTENSIONS.includes(getFileExtension(entry.name)),
    );

    const layoutFile = entries.find(
        (entry) =>
            !entry.isDirectory &&
            entry.name.startsWith('layout.') &&
            ALLOWED_EXTENSIONS.includes(getFileExtension(entry.name)),
    );

    return { pageFile, layoutFile };
};

const getPageAndLayoutMetadata = async (
    fileResults: (FileEntry | null)[],
    sandboxManager: SandboxManager,
    dir?: string,
): Promise<{
    pageMetadata: PageMetadata | undefined;
    layoutMetadata: PageMetadata | undefined;
}> => {
    if (!fileResults || fileResults.length === 0) {
        return { pageMetadata: undefined, layoutMetadata: undefined };
    }

    const [pageFileResult, layoutFileResult] = fileResults;

    let pageMetadata: PageMetadata | undefined;
    let layoutMetadata: PageMetadata | undefined;

    if (pageFileResult && !pageFileResult.isDirectory) {
        try {
            const filePath = dir ? `${dir}/${pageFileResult.name}` : pageFileResult.path;
            const fileContent = await sandboxManager.readFile(filePath);
            pageMetadata = await extractMetadata(fileContent);
        } catch (error) {
            console.error(`Error reading page file ${pageFileResult.path}:`, error);
        }
    }

    if (layoutFileResult && !layoutFileResult.isDirectory) {
        try {
            const filePath = dir ? `${dir}/${layoutFileResult.name}` : layoutFileResult.path;
            const fileContent = await sandboxManager.readFile(filePath);
            layoutMetadata = await extractMetadata(fileContent);
        } catch (error) {
            console.error(`Error reading layout file ${layoutFileResult.path}:`, error);
        }
    }

    return { pageMetadata, layoutMetadata };
};
