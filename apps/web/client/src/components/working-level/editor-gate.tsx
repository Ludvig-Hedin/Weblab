'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@weblab/ui/button';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { SettingsTabValue } from '@/components/ui/settings-modal/helpers';
import { useStateManager } from '@/components/store/state';
import { captureWorkingLevelEntry, requiresWorkingLevelTeardown, WorkingLevelLifecycle, type WorkingLevelEntry } from '@/lib/working-level';
import { useWorkingLevel } from './provider';

const LifecycleContext = createContext<WorkingLevelLifecycle | null>(null);
const ActiveContext = createContext(true);
export function useWorkingLevelLifecycle() { return useContext(LifecycleContext); }
export function useWorkingLevelActive() { return useContext(ActiveContext); }

export function WorkingLevelEditorGate({ children, contentChildren, siteId }: { children: ReactNode; contentChildren?: ReactNode; siteId: string }) {
    const preference = useWorkingLevel();
    const t = useTranslations('workingLevel');
    const settings = useStateManager();
    const router = useRouter();
    const [lifecycle] = useState(() => new WorkingLevelLifecycle());
    const [entry, setEntry] = useState<WorkingLevelEntry | null>(null);
    const [closing, setClosing] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const retained = useRef<ReactNode>(null);
    const closeInFlight = useRef(false);
    const previousAttempt = useRef(0);
    const departure = useRef<{ siteId: string; userId: string | null } | null>(null);
    const departing = departure.current?.siteId === siteId && departure.current.userId === preference.userId;
    const desired = !departing && preference.native && !preference.pending && preference.userId && preference.level
        ? captureWorkingLevelEntry(entry, preference.userId, siteId, preference.level) : null;
    const mustClose = requiresWorkingLevelTeardown(entry, desired, preference.userId);

    // Every different site waits for the retained editor to finish its writes.
    // Preference changes on this same site return the captured entry above.
    useEffect(() => {
        if (desired && desired !== entry && !mustClose && !closing && !failed) setEntry(desired);
    }, [desired, entry, mustClose, closing, failed]);
    useEffect(() => lifecycle.onFailure(() => { setClosing(false); setFailed(true); }), [lifecycle]);
    useEffect(() => {
        if (failed && lifecycle.resumeAllowed && !mustClose && entry?.userId === preference.userId && entry.siteId === siteId) setFailed(false);
    }, [failed, lifecycle, mustClose, entry, preference.userId, siteId]);
    const full = preference.native === false || (!departing && !preference.pending && !mustClose && !closing && !failed
        && entry?.userId === preference.userId && entry.siteId === siteId && entry.level === 'full' && desired?.level === 'full');
    const content = !departing && !preference.pending && !closing && !failed && !mustClose && entry?.level === 'content'
        && entry.userId === preference.userId && entry.siteId === siteId;
    const active = full || (content && !!contentChildren);
    const openSettings = () => {
        settings.settingsTab = SettingsTabValue.EDITOR;
        settings.setIsSettingsModalOpen(true);
    };
    const activeChildren = full ? children : <>
        <nav className="border-border flex justify-end gap-2 border-b p-2">
            <Button variant="ghost" onClick={openSettings}>{t('settings')}</Button>
            <Button variant="ghost" onClick={() => {
                if (closeInFlight.current) return;
                departure.current = { siteId, userId: preference.userId };
                closeInFlight.current = true;
                setClosing(true);
                void lifecycle.close().then(() => {
                    closeInFlight.current = false;
                    retained.current = null;
                    setEntry(null);
                    setClosing(false);
                    router.push('/projects');
                }, () => {
                    departure.current = null;
                    closeInFlight.current = false;
                    lifecycle.reportFailure();
                });
            }}>{t('backToSites')}</Button>
        </nav>
        {contentChildren}
    </>;
    if (active) retained.current = activeChildren;

    useEffect(() => {
        const explicitRetry = previousAttempt.current !== attempt;
        previousAttempt.current = attempt;
        if ((!mustClose && !explicitRetry) || closeInFlight.current) return;
        closeInFlight.current = true;
        setClosing(true);
        setFailed(false);
        void lifecycle.close().then(() => {
            closeInFlight.current = false;
            retained.current = null;
            setEntry(null);
            setClosing(false);
        }, () => {
            closeInFlight.current = false;
            setClosing(false);
            setFailed(true);
        });
        // A later identity change cannot cancel disposal of the accepted engine.
        // Failure retries are explicit through `attempt`, never an automatic loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mustClose, lifecycle, attempt]);

    // The retained editor cannot receive global shortcuts while another owner or
    // restricted workflow is pending. It stays mounted only to retain recovery state.
    useLayoutEffect(() => {
        if (active || !retained.current) return;
        const stop = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey) event.preventDefault();
            event.stopImmediatePropagation();
        };
        // React dialogs can render through portals outside the inert subtree.
        const stopPortal = (event: MouseEvent | PointerEvent) => {
            if (event.target instanceof Element && event.target.closest('[data-working-level-access]')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        window.addEventListener('keydown', stop, true);
        window.addEventListener('keyup', stop, true);
        window.addEventListener('pointerdown', stopPortal, true);
        window.addEventListener('click', stopPortal, true);
        window.addEventListener('dblclick', stopPortal, true);
        window.addEventListener('contextmenu', stopPortal, true);
        return () => {
            window.removeEventListener('keydown', stop, true);
            window.removeEventListener('keyup', stop, true);
            window.removeEventListener('pointerdown', stopPortal, true);
            window.removeEventListener('click', stopPortal, true);
            window.removeEventListener('dblclick', stopPortal, true);
            window.removeEventListener('contextmenu', stopPortal, true);
        };
    }, [active]);

    return <LifecycleContext.Provider value={lifecycle}><ActiveContext.Provider value={active}>
        {retained.current && <div style={{ display: active ? 'contents' : 'none' }} inert={!active}>{active ? activeChildren : retained.current}</div>}
        {!active && <div data-working-level-access className="flex min-h-[70vh] items-center justify-center p-6">
            <div className="max-w-md space-y-4 text-center">
                <h1 className="text-lg font-medium">{failed ? t('closeFailed') : closing || mustClose || departing ? t('closing') : content ? t('contentUnavailableTitle') : preference.pending || desired ? t('loading') : t('choiceRequired')}</h1>
                {content && <p className="text-sm text-foreground-secondary">{t('contentUnavailableBody')}</p>}
                {failed && lifecycle.resumeAllowed && <p className="text-sm text-foreground-secondary">{t('unsavedCode')}</p>}
                <div className="flex justify-center gap-2">
                    {failed && <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button>}
                    {failed && lifecycle.resumeAllowed && entry?.userId === preference.userId && entry && <Button variant="outline" asChild>
                        <Link href={`/project/${encodeURIComponent(entry.siteId)}`}>{t('returnToSite')}</Link>
                    </Button>}
                    {content && <Button variant="outline" onClick={openSettings}>{t('settings')}</Button>}
                    {!closing && !mustClose && !failed && <Button variant="ghost" asChild><Link href="/projects">{t('backToSites')}</Link></Button>}
                </div>
            </div>
        </div>}
        {content && <NonProjectSettingsModal />}
    </ActiveContext.Provider></LifecycleContext.Provider>;
}
