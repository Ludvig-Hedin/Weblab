import { RouterType } from '@weblab/models';

import type { FrameworkAdapter, ProjectFiles, ValidationResult } from '../types';

/**
 * Filename pattern that Next.js uses for `layout` files in the App Router.
 * Mirrors the historical `validateNextJsProject` check; kept private to the
 * Next.js adapter so non-Next frameworks don't accidentally inherit it.
 */
const NEXT_JS_LAYOUT_FILES = [
    'app/layout.tsx',
    'app/layout.jsx',
    'app/layout.ts',
    'app/layout.js',
    'src/app/layout.tsx',
    'src/app/layout.jsx',
    'src/app/layout.ts',
    'src/app/layout.js',
];

const NEXT_JS_PAGES_DIRS = ['pages/', 'src/pages/'];

interface PackageJsonShape {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

function readPackageJson(files: ProjectFiles): PackageJsonShape | null {
    const pkg =
        files.find((f) => f.path === 'package.json') ??
        files
            .filter((f) => f.path.endsWith('/package.json'))
            .sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
    if (!pkg || typeof pkg.content !== 'string') return null;
    try {
        return JSON.parse(pkg.content) as PackageJsonShape;
    } catch {
        return null;
    }
}

function detectRouterTypeFromFiles(files: ProjectFiles): RouterType | null {
    // Strip a single leading slash so paths like "/app/layout.tsx" and
    // "app/layout.tsx" both match the canonical NEXT_JS_* entries.
    const normalize = (p: string) => (p.startsWith('/') ? p.slice(1) : p);
    const hasAppLayout = files.some((f) => {
        const path = normalize(f.path);
        return NEXT_JS_LAYOUT_FILES.some((candidate) => path === candidate);
    });
    if (hasAppLayout) return RouterType.APP;
    const hasPagesDir = files.some((f) => {
        const path = normalize(f.path);
        return NEXT_JS_PAGES_DIRS.some((dir) => path.startsWith(dir));
    });
    if (hasPagesDir) return RouterType.PAGES;
    return null;
}

/**
 * Adapter for Next.js projects. Captures the validation rules historically
 * encoded in `apps/web/client/src/app/projects/import/local/_context/index.tsx`
 * (`validateNextJsProject`). The behavior here is intentionally identical so
 * Phase 1 ships as a pure refactor.
 */
export const nextjsAdapter: FrameworkAdapter = {
    id: 'nextjs',
    displayName: 'Next.js',
    template: {
        // Mirrors `DEFAULT_NEW_PROJECT_TEMPLATE` from packages/constants/src/csb.ts.
        // Phase 1 keeps the existing BLANK template id; this adapter is the new
        // canonical source for new-project creation.
        codesandboxId: 'xzsy8c',
        port: 3000,
        devTask: 'dev',
    },
    pipelines: ['jsx'],
    validate(files: ProjectFiles): ValidationResult {
        const packageJson = readPackageJson(files);
        if (!packageJson) {
            return { isValid: false, error: 'Package.json is not a text file' };
        }
        const { dependencies, devDependencies } = packageJson;
        const hasNext = dependencies?.next ?? devDependencies?.next;
        if (!hasNext) {
            return { isValid: false, error: 'Next.js not found in dependencies' };
        }
        const hasReact = dependencies?.react ?? devDependencies?.react;
        if (!hasReact) {
            return { isValid: false, error: 'React not found in dependencies' };
        }
        const hasTailwind = dependencies?.tailwindcss ?? devDependencies?.tailwindcss;
        if (!hasTailwind) {
            return { isValid: false, error: 'Tailwind CSS not found in dependencies' };
        }
        const routerType = detectRouterTypeFromFiles(files);
        if (!routerType) {
            return {
                isValid: false,
                error: 'No valid Next.js router structure found (missing app/ or pages/ directory)',
            };
        }
        return { isValid: true, routerType };
    },
    detectRouterType: detectRouterTypeFromFiles,
};
