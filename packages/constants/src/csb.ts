import type { SandboxTemplate } from '@weblab/models';

export enum Templates {
    BLANK = 'BLANK',
    EMPTY_NEXTJS = 'EMPTY_NEXTJS',
}

export const SandboxTemplates: Record<Templates, SandboxTemplate> = {
    BLANK: {
        id: 'xzsy8c',
        port: 3000,
    },
    EMPTY_NEXTJS: {
        id: 'pt_EphPmsurimGCQdiB44wa7s',
        port: 3000,
    },
};

// New project creation should use the stable public blank template.
// EMPTY_NEXTJS (pt_EphPmsurimGCQdiB44wa7s) has a broken getPreviewInfo call inside
// its bundled Next.js server that returns a JSON error for every request.
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
