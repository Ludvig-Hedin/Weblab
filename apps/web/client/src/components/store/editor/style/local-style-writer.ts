/**
 * A local project may contain Tailwind dependencies without compiling the
 * classes the editor writes. Enable visual styling only for the known Next.js
 * App Router + Tailwind v4 path used by the local scaffold.
 */
export async function hasLocalTailwindStyleWriter(
    readFile: (path: string) => Promise<string | Uint8Array>,
): Promise<boolean> {
    const readText = async (path: string): Promise<string | null> => {
        try {
            const content = await readFile(path);
            return typeof content === 'string' ? content : null;
        } catch {
            return null;
        }
    };

    const packageJson = await readText('package.json');
    if (!packageJson) return false;
    let dependencies: Record<string, unknown>;
    try {
        const pkg: unknown = JSON.parse(packageJson);
        if (!pkg || typeof pkg !== 'object') return false;
        const record = pkg as Record<string, unknown>;
        const deps = record.dependencies;
        const devDeps = record.devDependencies;
        dependencies = {
            ...(deps && typeof deps === 'object' && !Array.isArray(deps) ? deps : {}),
            ...(devDeps && typeof devDeps === 'object' && !Array.isArray(devDeps) ? devDeps : {}),
        };
    } catch {
        return false;
    }
    const isVersionFour = (value: unknown): boolean =>
        typeof value === 'string' && /^(?:[~^]|>=?)?4(?:\.|$)/.test(value);
    if (
        typeof dependencies.next !== 'string' ||
        !isVersionFour(dependencies.tailwindcss) ||
        !isVersionFour(dependencies['@tailwindcss/postcss'])
    ) return false;

    const postcss = await Promise.all(
        ['postcss.config.mjs', 'postcss.config.js', 'postcss.config.cjs', 'postcss.config.ts']
            .map(readText),
    );
    // A dependency or a mention in a comment does not make the CSS build work.
    const uncommented = (value: string): string => value.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
    if (!postcss.some((content) => content &&
        /\bplugins\s*:\s*\{[^}]*['"]@tailwindcss\/postcss['"]\s*:/.test(uncommented(content)))) {
        return false;
    }

    for (const appRoot of ['src/app', 'app', 'src/app/(site)', 'app/(site)']) {
        const [layout, css] = await Promise.all([
            readText(`${appRoot}/layout.tsx`),
            readText(`${appRoot}/globals.css`),
        ]);
        if (
            layout && css &&
            /\bimport\s*['"]\.\/globals\.css['"]/.test(uncommented(layout)) &&
            /@import\s+['"]tailwindcss['"]/.test(uncommented(css)) &&
            !/source\s*\(\s*none\s*\)/.test(css)
        ) return true;
    }
    return false;
}

/** A change to these files can disconnect the editor's generated classes. */
export function affectsLocalTailwindStyleWriter(path: string): boolean {
    const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
    return normalized === 'package.json' ||
        /^postcss\.config\.(?:mjs|js|cjs|ts)$/.test(normalized) ||
        /^(?:src\/)?app\/(?:\(site\)\/)?(?:layout\.[jt]sx|globals\.css)$/.test(normalized);
}

/**
 * The Tailwind translator cannot express a font stack with a breakpoint
 * prefix. Named color tokens are fine: the main write prefixes them.
 */
export function hasUnsupportedResponsiveStyleValue(
    targets: Array<{
        branchId: string;
        breakpoint?: { minWidth: number };
        change: { updated: Record<string, { type: string }> };
    }>,
    frames: Array<{ frame: { branchId: string; breakpoint?: { width: number } } }>,
): boolean {
    return targets.some((target) => {
        if (!Object.keys(target.change.updated).some((property) =>
            property === 'font-family' || property === 'fontFamily')) return false;
        const widths = frames.filter((frame) => frame.frame.branchId === target.branchId)
            .map((frame) => frame.frame.breakpoint?.width)
            .filter((width): width is number => width !== undefined);
        const base = widths.length > 0 ? Math.min(...widths) : null;
        return target.breakpoint !== undefined &&
            (base === null || target.breakpoint.minWidth > base);
    });
}
