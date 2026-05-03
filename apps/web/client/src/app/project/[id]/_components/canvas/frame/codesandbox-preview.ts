import { CSB_DOMAIN } from '@weblab/constants';

export function isCodeSandboxPreviewUrl(url: string): boolean {
    try {
        return new URL(url).hostname.endsWith(CSB_DOMAIN);
    } catch {
        return false;
    }
}
