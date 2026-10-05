'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTitle } from '@weblab/ui/dialog';
import { parseWorkingLevel, readWorkingLevel, saveWorkingLevel, workingLevelKey, type WorkingLevel } from '@/lib/working-level';
import { useSafeClerkAuth } from '@/utils/auth/safe-clerk';
import { WorkingLevelSelector } from './selector';

interface PreferenceState { userId: string; level: WorkingLevel | null; storageFailed: boolean }
interface WorkingLevelContextValue {
    native: boolean | null;
    pending: boolean;
    userId: string | null;
    level: WorkingLevel | null;
    storageFailed: boolean;
    choose: (level: WorkingLevel) => void;
}
const WorkingLevelContext = createContext<WorkingLevelContextValue | null>(null);
export function useWorkingLevel() {
    const context = useContext(WorkingLevelContext);
    if (!context) throw new Error('Working level provider missing');
    return context;
}

export function WorkingLevelProvider({ children }: { children: ReactNode }) {
    const t = useTranslations('workingLevel');
    const auth = useSafeClerkAuth();
    const pathname = usePathname();
    const [native, setNative] = useState<boolean | null>(null);
    const [preference, setPreference] = useState<PreferenceState | null>(null);
    const onboardingHeading = useRef<HTMLHeadingElement>(null);
    const userId = auth.isSignedIn && 'userId' in auth ? auth.userId : null;
    const identity = useRef(userId);
    identity.current = userId;
    useEffect(() => { setNative(window.weblabNative?.target === 'desktop'); }, []);

    useEffect(() => {
        if (!native || !auth.isLoaded || !userId) { setPreference(null); return; }
        let saved: ReturnType<typeof readWorkingLevel>;
        try { saved = readWorkingLevel(window.localStorage, userId); }
        catch { saved = { level: null, storageFailed: true }; }
        setPreference({ userId, ...saved });
        const receive = (event: StorageEvent) => {
            if (identity.current !== userId || (event.key !== null && event.key !== workingLevelKey(userId))) return;
            setPreference({ userId, level: parseWorkingLevel(event.newValue), storageFailed: false });
        };
        window.addEventListener('storage', receive);
        return () => window.removeEventListener('storage', receive);
    }, [native, auth.isLoaded, userId]);

    const choose = useCallback((level: WorkingLevel) => {
        if (!native || !auth.isLoaded || !userId || identity.current !== userId) return;
        let persisted = false;
        try { persisted = saveWorkingLevel(window.localStorage, userId, level); }
        catch { /* The explicit choice still applies for this signed-in session. */ }
        setPreference({ userId, level, storageFailed: !persisted });
    }, [native, auth.isLoaded, userId]);

    // Owner equality is checked during render, before the reset effect can run.
    const ownedPreference = userId !== null && preference?.userId === userId ? preference : null;
    const pending = native === null || (native && (!auth.isLoaded || !userId || !ownedPreference));
    const level = ownedPreference?.level ?? null;
    const appRoute = pathname?.startsWith('/project/') || pathname?.startsWith('/w/') || pathname === '/projects' || pathname === '/settings';
    const onboarding = !!native && !pending && !!appRoute && level === null;

    return <WorkingLevelContext.Provider value={{ native, pending, userId, level, storageFailed: ownedPreference?.storageFailed ?? false, choose }}>
        <div style={{ display: onboarding ? 'none' : 'contents' }} inert={onboarding}>{children}</div>
        <Dialog open={onboarding}>
            <DialogContent data-working-level-access aria-describedby={undefined}
                className="bg-background fixed inset-0 left-0 top-0 z-[100] flex min-h-dvh w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 px-6 py-12 shadow-none duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-w-none sm:px-10 [&>button:last-child]:hidden"
                onOpenAutoFocus={(event) => { event.preventDefault(); onboardingHeading.current?.focus(); }}
                onEscapeKeyDown={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}>
                <main className="m-auto w-full max-w-[720px]">
                    <DialogTitle asChild className="text-foreground mb-8 text-2xl font-medium tracking-tight outline-none sm:text-3xl">
                        <h1 ref={onboardingHeading} tabIndex={-1}>{t('title')}</h1>
                    </DialogTitle>
                    <WorkingLevelSelector level={level} onChange={choose} variant="onboarding" sessionOnly={ownedPreference?.storageFailed ?? false} />
                    <p className="text-foreground-secondary mt-6 text-small">{t('firstOpen')}</p>
                </main>
            </DialogContent>
        </Dialog>
    </WorkingLevelContext.Provider>;
}
