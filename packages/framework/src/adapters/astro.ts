import type { FrameworkAdapter, ProjectFiles, ValidationResult } from '../types';

interface PackageJsonShape {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

function readPackageJson(files: ProjectFiles): PackageJsonShape | null {
    const pkg = files.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
    if (!pkg || typeof pkg.content !== 'string') return null;
    try {
        return JSON.parse(pkg.content) as PackageJsonShape;
    } catch {
        return null;
    }
}

/**
 * Adapter for Astro projects. Visual editing is supported in two modes:
 *   - JSX pipeline for `.tsx`/`.jsx` islands
 *   - HTML pipeline for the template body of `.astro` files (frontmatter
 *     scripts are NOT editable; clicks inside frontmatter no-op gracefully)
 *
 * The HTML pipeline implementation lands in Phase 4. Until then, Astro
 * projects can be validated and previewed but not visually edited inside
 * `.astro` template bodies.
 *
 * NOTE: `template.vercelScaffold` is `'pending'` — no Vercel Sandbox
 * scaffolder exists for Astro yet. Add `scaffoldAstroProject` to the Vercel
 * provider and flip this literal to activate.
 */
export const astroAdapter: FrameworkAdapter = {
    id: 'astro',
    displayName: 'Astro',
    template: {
        // TODO(sandbox-fork): add an Astro Vercel scaffolder.
        vercelScaffold: 'pending',
        port: 4321,
        devTask: 'dev',
    },
    pipelines: ['jsx', 'html'],
    validate(files: ProjectFiles): ValidationResult {
        const packageJson = readPackageJson(files);
        if (!packageJson) {
            return { isValid: false, error: 'package.json is missing or unreadable' };
        }
        const { dependencies, devDependencies } = packageJson;
        const hasAstro = dependencies?.astro ?? devDependencies?.astro;
        if (!hasAstro) {
            return { isValid: false, error: 'astro not found in dependencies' };
        }
        const hasSrcDir = files.some((f) => f.path.startsWith('src/') || f.path.includes('/src/'));
        if (!hasSrcDir) {
            return {
                isValid: false,
                error: 'No src/ directory found (Astro expects pages and components in src/)',
            };
        }
        const warnings: string[] = [];
        const hasAstroFiles = files.some((f) => f.path.endsWith('.astro'));
        if (!hasAstroFiles) {
            warnings.push(
                'No .astro files detected. Visual editing will fall back to JSX-only mode for islands.',
            );
        }
        return { isValid: true, warnings };
    },
};
