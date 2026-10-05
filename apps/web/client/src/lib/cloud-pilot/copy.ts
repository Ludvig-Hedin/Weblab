import { ConvexError } from 'convex/values';
import { useLocale } from 'next-intl';

import en from '../../../messages/cloud-pilot/en.json';
import sv from '../../../messages/cloud-pilot/sv.json';

export type PilotCopy = typeof en;
export function usePilotCopy(): PilotCopy {
    return useLocale().startsWith('sv') ? sv : en;
}

export function pilotErrorMessage(
    error: unknown,
    copy: PilotCopy,
    fallback: 'generic' | 'create' = 'generic',
): string {
    const code = error instanceof ConvexError && typeof error.data === 'string' ? error.data : null;
    if (code && Object.hasOwn(copy.errors, code))
        return copy.errors[code as keyof typeof copy.errors];
    return copy.errors[fallback];
}
