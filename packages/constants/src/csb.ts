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

export const CSB_PREVIEW_TASK_NAME = 'dev';
export const CSB_DOMAIN = 'csb.app';

export function getSandboxPreviewUrl(sandboxId: string, port: number, previewToken?: string) {
    const url = `https://${sandboxId}-${port}.${CSB_DOMAIN}`;
    return previewToken ? `${url}?preview_token=${encodeURIComponent(previewToken)}` : url;
}
