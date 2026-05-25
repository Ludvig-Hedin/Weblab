import type { FrameworkAdapter, ProjectFiles, ValidationResult } from '../types';

/**
 * Adapter for plain static HTML websites. Unlike the React framework
 * adapters this does NOT require a `package.json` — users can drop a folder
 * containing `index.html` (and optional CSS/JS/asset files) and get a
 * working preview.
 *
 * Visual editing for this framework requires the HTML editor pipeline
 * (Phase 4); validation alone is sufficient for upload + preview to work.
 */
export const staticHtmlAdapter: FrameworkAdapter = {
    id: 'static-html',
    displayName: 'Static HTML',
    template: {
        // Provisioned via `VercelSandboxProvider.createProject({ framework:
        // 'static-html' })` — writes a single index.html + tiny package.json
        // with `serve` and runs `npm run dev` (which binds serve to
        // 0.0.0.0:8080). Port matches `STATIC_HTML_PORT` in vercel-sandbox.
        vercelScaffold: 'static-html',
        port: 8080,
        devTask: 'dev',
        staticHosting: true,
    },
    pipelines: ['html'],
    validate(files: ProjectFiles): ValidationResult {
        // Match index.html case-insensitively so projects authored on
        // case-insensitive filesystems (Windows/macOS) with `Index.html` or
        // `INDEX.HTML` validate correctly.
        const hasIndexHtml = files.some((f) => f.path.toLowerCase() === 'index.html');
        if (!hasIndexHtml) {
            return {
                isValid: false,
                error: 'No index.html found at the project root. Static HTML projects require an index.html file.',
            };
        }
        return { isValid: true };
    },
};
