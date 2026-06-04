import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/app/w/[slug]/_components/workspace-context';

/**
 * Reads the active workspace id from localStorage. Browser-only — returns
 * `undefined` during SSR or when no workspace is selected, so callers can pass
 * it straight to a Convex create action whose `workspaceId` arg is optional
 * (the action falls back to the caller's personal workspace).
 */
export function readActiveWorkspaceId(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
        const id = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        return id && id.length > 0 ? id : undefined;
    } catch {
        return undefined;
    }
}
