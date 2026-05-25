import type { FrameworkAdapter, ProjectFiles, ValidationResult } from '../types';

interface PackageJsonShape {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

function readPackageJson(files: ProjectFiles): PackageJsonShape | null {
    const pkg =
        files.find((f) => f.path === 'package.json') ??
        files.find((f) => f.path.endsWith('/package.json'));
    if (!pkg || typeof pkg.content !== 'string') return null;
    try {
        return JSON.parse(pkg.content) as PackageJsonShape;
    } catch {
        return null;
    }
}

function hasReactRouterV7(deps: Record<string, string> | undefined): boolean {
    if (!deps) return false;
    const version = deps['react-router'];
    if (!version) return false;
    // Strip leading range operators to get a comparable version. Anything
    // starting with "7" or higher counts as v7+.
    const numeric = version.replace(/^[^\d]*/, '');
    return numeric.startsWith('7') || numeric.startsWith('8') || numeric.startsWith('9');
}

/**
 * Adapter for Remix and React Router v7 projects. Remix has been merging
 * into React Router v7, so this single adapter handles both: it validates
 * either an `@remix-run/*` dependency or `react-router` >= 7.
 *
 * NOTE: `template.vercelScaffold` is `'pending'` — no Vercel Sandbox
 * scaffolder exists for Remix yet. Add `scaffoldRemixProject` to the Vercel
 * provider and flip this literal to activate.
 */
export const remixAdapter: FrameworkAdapter = {
    id: 'remix',
    displayName: 'Remix / React Router v7',
    template: {
        // TODO(sandbox-fork): add a Remix Vercel scaffolder.
        vercelScaffold: 'pending',
        port: 3000,
        devTask: 'dev',
    },
    pipelines: ['jsx'],
    validate(files: ProjectFiles): ValidationResult {
        const packageJson = readPackageJson(files);
        if (!packageJson) {
            return { isValid: false, error: 'package.json is missing or unreadable' };
        }
        const { dependencies, devDependencies } = packageJson;
        const allDeps = { ...devDependencies, ...dependencies };
        const hasRemix = Object.keys(allDeps).some((name) => name.startsWith('@remix-run/'));
        const hasModernReactRouter =
            hasReactRouterV7(dependencies) || hasReactRouterV7(devDependencies);
        if (!hasRemix && !hasModernReactRouter) {
            return {
                isValid: false,
                error: 'No @remix-run/* dependency or react-router >= 7 found. Remix and React Router v7 are both supported.',
            };
        }
        const hasReact = dependencies?.react ?? devDependencies?.react;
        if (!hasReact) {
            return { isValid: false, error: 'React not found in dependencies' };
        }
        const hasAppDir = files.some((f) => f.path.startsWith('app/') || f.path.includes('/app/'));
        if (!hasAppDir) {
            return {
                isValid: false,
                error: 'No app/ directory found (Remix and React Router v7 expect routes in app/)',
            };
        }
        return { isValid: true };
    },
};
