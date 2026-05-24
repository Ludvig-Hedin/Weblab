/**
 * @deprecated CodeSandbox runtime was archived 2026-05-24. Vercel Sandbox is
 * the only supported provider. The constants in this file (template IDs,
 * CSB_DOMAIN, getSandboxPreviewUrl) are retained for legacy project rows
 * that still carry a CodeSandbox sandbox id; no new code should reference
 * them. Slated for full deletion once all CSB-backed projects have been
 * migrated to Vercel.
 *
 * See docs/notes/2026-05-13-vercel-sandbox-provider.md.
 */
import type { SandboxTemplate } from '@weblab/models';

export enum Templates {
    BLANK = 'BLANK',
    EMPTY_NEXTJS = 'EMPTY_NEXTJS',
}

export const SandboxTemplates: Record<Templates, SandboxTemplate> = {
    BLANK: {
        // Working Next.js 15 App Router template scaffolded by
        // scripts/create-csb-template.mjs. The previous BLANK (`xzsy8c`)
        // was an empty sandbox with no package.json or .codesandbox/tasks.json,
        // causing every fresh project to surface "Script not found 'dev'"
        // and a permanent 502 on the preview iframe. This template:
        //  - has a `dev` script (`next dev -p 3000`)
        //  - registers a `dev` task in .codesandbox/tasks.json with runAtStart
        //  - ships node_modules pre-installed so cold-boot is just `next dev`
        id: 'pf2nqh',
        port: 3000,
    },
    EMPTY_NEXTJS: {
        id: 'pt_EphPmsurimGCQdiB44wa7s',
        port: 3000,
    },
};

// New project creation uses the BLANK template. EMPTY_NEXTJS has a broken
// getPreviewInfo call inside its bundled Next.js server that returns a JSON
// error for every request — keep BLANK as the default.
export const DEFAULT_NEW_PROJECT_TEMPLATE = SandboxTemplates[Templates.BLANK];

// Sandbox ID for the static HTML starter template. Exported so
// packages/framework/src/adapters/static-html.ts can reference the same value
// without duplication.
export const STATIC_HTML_SANDBOX_ID = 'html-qz83hv';

// Public sandbox IDs that any signed-in user is allowed to fork. These are
// canonical templates (the BLANK seed plus pre-seeded external templates
// referenced from the templates page); they have no `branches` row, so the
// owner-based IDOR check used elsewhere would reject them. Keep this in sync
// with EXTERNAL_TEMPLATES whenever a template gains a `sandboxId`.
export const PUBLIC_TEMPLATE_SANDBOX_IDS = new Set<string>([
    SandboxTemplates[Templates.BLANK].id,
    SandboxTemplates[Templates.EMPTY_NEXTJS].id,
    STATIC_HTML_SANDBOX_ID,
]);

export const CSB_PREVIEW_TASK_NAME = 'dev';
export const CSB_DOMAIN = 'csb.app';

export function getSandboxPreviewUrl(sandboxId: string, port: number, previewToken?: string) {
    const url = `https://${sandboxId}-${port}.${CSB_DOMAIN}`;
    return previewToken ? `${url}?preview_token=${encodeURIComponent(previewToken)}` : url;
}
