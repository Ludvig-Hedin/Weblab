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

/**
 * Adapter for TanStack Start projects. Validates the `@tanstack/start`
 * dependency and either the file-based router root (`src/routes/`) or
 * `app/routes/`.
 *
 * NOTE: `template.vercelScaffold` is `'pending'` — no Vercel Sandbox
 * scaffolder exists for TanStack Start yet. Add
 * `scaffoldTanstackStartProject` to the Vercel provider and flip this
 * literal to activate.
 */
export const tanstackStartAdapter: FrameworkAdapter = {
    id: 'tanstack-start',
    displayName: 'TanStack Start',
    template: {
        // TODO(sandbox-fork): add a TanStack Start Vercel scaffolder.
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
        const hasTanstackStart = Object.keys(allDeps).some(
            (name) => name === '@tanstack/start' || name.startsWith('@tanstack/start-'),
        );
        if (!hasTanstackStart) {
            return { isValid: false, error: '@tanstack/start not found in dependencies' };
        }
        const hasReact = dependencies?.react ?? devDependencies?.react;
        if (!hasReact) {
            return { isValid: false, error: 'React not found in dependencies' };
        }
        const hasRoutesDir = files.some(
            (f) =>
                f.path.startsWith('src/routes/') ||
                f.path.startsWith('app/routes/') ||
                f.path.includes('/src/routes/') ||
                f.path.includes('/app/routes/'),
        );
        if (!hasRoutesDir) {
            return {
                isValid: false,
                error: 'No file-based router directory found (expected src/routes/ or app/routes/)',
            };
        }
        return { isValid: true };
    },
};
