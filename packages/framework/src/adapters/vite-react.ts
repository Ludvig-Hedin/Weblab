import type { FrameworkAdapter, ProjectFiles, ValidationResult } from '../types';

interface PackageJsonShape {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

function readPackageJson(files: ProjectFiles): PackageJsonShape | null {
    const pkg = files.find((f) => f.path === 'package.json');
    if (!pkg || typeof pkg.content !== 'string') return null;
    try {
        return JSON.parse(pkg.content) as PackageJsonShape;
    } catch {
        return null;
    }
}

/**
 * Adapter for Vite + React projects. Validates that the project has Vite,
 * React, and an `index.html` entrypoint at the project root (Vite's
 * convention for the host page).
 *
 * NOTE: `template.vercelScaffold` is `'pending'` — no Vercel Sandbox
 * scaffolder exists for Vite + React yet. To activate Vite project creation,
 * add `scaffoldViteReactProject` to
 * `packages/code-provider/src/providers/vercel-sandbox/index.ts`, extend the
 * `VercelScaffoldFramework` union, and flip `vercelScaffold` to
 * `'vite-react'` (or whichever literal the new scaffolder dispatches on).
 */
export const viteReactAdapter: FrameworkAdapter = {
    id: 'vite-react',
    displayName: 'Vite + React',
    template: {
        // TODO(sandbox-fork): add a Vite + React Vercel scaffolder, then
        // flip this to the new union literal.
        vercelScaffold: 'pending',
        port: 5173,
        devTask: 'dev',
    },
    pipelines: ['jsx'],
    validate(files: ProjectFiles): ValidationResult {
        const packageJson = readPackageJson(files);
        if (!packageJson) {
            return { isValid: false, error: 'package.json is missing or unreadable' };
        }
        const { dependencies, devDependencies } = packageJson;
        const hasVite = dependencies?.vite ?? devDependencies?.vite;
        if (!hasVite) {
            return { isValid: false, error: 'Vite not found in dependencies' };
        }
        const hasReact = dependencies?.react ?? devDependencies?.react;
        if (!hasReact) {
            return { isValid: false, error: 'React not found in dependencies' };
        }
        const hasIndexHtml = files.some((f) => f.path === 'index.html');
        if (!hasIndexHtml) {
            return {
                isValid: false,
                error: 'No index.html found at the project root (required by Vite)',
            };
        }
        const warnings: string[] = [];
        const hasTailwind = dependencies?.tailwindcss ?? devDependencies?.tailwindcss;
        if (!hasTailwind) {
            warnings.push(
                'Tailwind CSS not detected; visual style edits may produce raw className strings.',
            );
        }
        return { isValid: true, warnings };
    },
};
