'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';

import { useEditorEngine } from '@/components/store/editor';
import type { CleanHandoffFile } from '@/components/store/editor/git/handoff-clean';
import { useProjectCapabilitiesContext } from '@/hooks/use-project-capabilities-context';
import {
    acquirePublishingRequest, releasePublishingRequest, canBuildRelease, canPublishRelease, cancelPublishing, matchesAcceptLiveReview, matchesRollbackReview, prepareAcceptLiveReview, prepareRollbackReview, preparePublishingReview, previewReady, publishingNeedsStatus,
    publishingFreezeSchema, publishingPlanSchema, publishingStateSchema, requestPublishing,
    type PublishingAuth, type PublishingInputs, type PublishingMethod,
    type AcceptLiveReview, type PublishingReview, type PublishingState, type RollbackReview,
} from '@/lib/local-publishing';
import { useSafeClerkAuth } from '@/utils/auth/safe-clerk';
import { CodeDiff } from '../right-panel/chat-tab/code-display/code-diff';
import { NativeContentPreparation } from '@/components/sanity-blog/native-preparation';

export const LocalPublishing = observer(() => {
    const t = useTranslations('editor.publishing');
    const engine = useEditorEngine();
    const auth = useSafeClerkAuth();
    const { canPublish, isLoading } = useProjectCapabilitiesContext();
    const [open, setOpen] = useState(false);
    const [state, setState] = useState<PublishingState | null>(null);
    const [draft, setDraft] = useState<PublishingReview | null>(null);
    const [diffs, setDiffs] = useState<Record<string, CleanHandoffFile[]>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [checkedId, setCheckedId] = useState<string | null>(null);
    const [openedId, setOpenedId] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<'publish' | 'rollback' | 'acceptLive' | null>(null);
    const rollbackTarget = useRef<RollbackReview | null>(null);
    const acceptLiveTarget = useRef<AcceptLiveReview | null>(null);
    const confirmedTarget = useRef<PublishingState['target']>(null);
    const [token, setToken] = useState('');
    const [project, setProject] = useState('');
    const [team, setTeam] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const nativeOwner = useRef<symbol | null>(null);
    const busyRef = useRef(false);
    const refreshNeeded = useRef(false);
    const epoch = useRef(0);
    const alive = useRef(true);
    const branchId = engine.branches.hasActiveBranch ? engine.branches.activeBranch.id : null;
    const userId = 'userId' in auth ? auth.userId : null;
    const scopeKey = `${engine.projectId}:${branchId}:${userId}`;
    const previousScope = useRef(scopeKey);
    const current = useRef({ scopeKey, canPublish, isLoading, auth, open });
    current.current = { scopeKey, canPublish, isLoading, auth, open };

    function cancelNative() {
        if (!nativeOwner.current) { epoch.current++; return; }
        void cancelPublishing(window.weblabNative?.publishing, () => { epoch.current++; }).then((success) => {
            if (!success && alive.current) setError(t('cancelFailed'));
        });
    }

    function close() {
        cancelNative();
        setOpen(false);
        refreshNeeded.current = false;
        setState(null);
        setSelectedId(null);
        setToken('');
        setDraft(null);
        setCheckedId(null);
        setOpenedId(null);
        setConfirmation(null);
        setDiffs({});
    }

    useEffect(() => {
        if (previousScope.current !== scopeKey) {
            cancelNative();
            previousScope.current = scopeKey;
        }
        setOpen(false);
        setToken('');
        setDraft(null);
        setCheckedId(null);
        setOpenedId(null);
        setConfirmation(null);
        setState(null);
        setDiffs({});
        setSelectedId(null);
        setError(null);
    }, [scopeKey]);

    useEffect(() => {
        alive.current = true;
        return () => {
            cancelNative(); alive.current = false;
        };
    }, []);

    // The latch covers token acquisition too. Switching account/branch or closing
    // invalidates the result, while native status remains the source of truth.
    async function run(task: (request: <M extends PublishingMethod>(method: M, input: Omit<PublishingInputs[M], keyof PublishingAuth>) => Promise<unknown>, assertCurrent: () => void) => Promise<void>) {
        if (busyRef.current || !branchId) return;
        const owner = acquirePublishingRequest();
        if (!owner) { setError(t('working')); return; }
        nativeOwner.current = owner;
        const captured = { projectId: engine.projectId, branchId };
        const key = scopeKey;
        const generation = epoch.current;
        const assertCurrent = () => {
            const now = current.current;
            if (!alive.current || epoch.current !== generation || now.scopeKey !== key || !now.open ||
                !now.canPublish || now.isLoading || !now.auth.isSignedIn) throw new Error(t('scopeChanged'));
        };
        busyRef.current = true;
        setBusy(true);
        setError(null);
        try {
            assertCurrent();
            const bridge = window.weblabNative?.publishing;
            if (!bridge) throw new Error(t('unavailable'));
            const request = <M extends PublishingMethod>(method: M, input: Omit<PublishingInputs[M], keyof PublishingAuth>) =>
                requestPublishing(bridge, captured, method, input, async () => {
                    const latest = current.current.auth;
                    return 'getToken' in latest ? latest.getToken() : null;
                }, assertCurrent);
            await task(request, assertCurrent);
        } catch (cause) {
            if (alive.current && generation === epoch.current && current.current.scopeKey === key) {
                setError(cause instanceof Error ? cause.message : t('failed'));
            }
        } finally {
            releasePublishingRequest(owner);
            if (nativeOwner.current === owner) nativeOwner.current = null;
            busyRef.current = false;
            if (alive.current) setBusy(false);
        }
    }

    function accept(result: unknown): PublishingState {
        const next = publishingStateSchema.parse(result);
        setState((previous) => ({ ...next, connected: next.connected ?? previous?.connected }));
        return next;
    }

    async function refresh() {
        await run(async (request) => { accept(await request('status', {})); });
    }
    const refreshLatest = useRef(refresh);
    refreshLatest.current = refresh;

    useEffect(() => {
        refreshNeeded.current = open;
        if (open) {
            setState(null);
            setSelectedId(null);
        }
    }, [open, scopeKey]);

    useEffect(() => {
        if (!open || busy || busyRef.current || isLoading || !canPublish || !branchId || !refreshNeeded.current) return;
        // One fresh status per opening, including when a canceled call held the latch.
        refreshNeeded.current = false;
        void refreshLatest.current();
    }, [open, busy, isLoading, canPublish, branchId, scopeKey]);

    useEffect(() => {
        if (!open || busy || !publishingNeedsStatus(state)) return;
        const timer = setTimeout(() => { void refreshLatest.current(); }, 4000);
        return () => clearTimeout(timer);
    }, [open, state, busy]);

    const release = state?.releases.find((item) => item.id === selectedId) ?? state?.releases.at(-1);
    const changes = draft?.changes ?? (release ? diffs[release.id] : undefined);
    const reviewed = !!release && diffs[release.id] !== undefined;
    const blocked = busy || !!state?.pending || !!state?.routingChanged;

    async function flushEdits(assertCurrent: () => void) {
        if (engine.chat.isStreaming) throw new Error(t('editing'));
        // Use the existing strict preparation lease without disposing the editor.
        // Ordinary commits can consume a refused write and are insufficient here.
        const preparation = engine.branches.beginDisposalPreparation();
        try {
            await engine.text.finalizeForDisposal(preparation.leases);
            assertCurrent();
            for (const [history, lease] of preparation.leases) await history.commitForDisposal(lease);
            await engine.action.flushAndWaitForPendingRebases(preparation);
            const checkpoints = [];
            for (const [history, lease] of preparation.leases) {
                checkpoints.push({ history, lease, checkpoint: await history.flushForDisposal(lease) });
                assertCurrent();
            }
            if (engine.branches.allBranches.length !== preparation.branches.size || [...preparation.branches].some(([id, branch]) => engine.branches.getBranchDataById(id) !== branch)) throw new Error(t('scopeChanged'));
            for (const { history, lease, checkpoint } of checkpoints) history.assertDisposalCheckpoint(lease, checkpoint);
            if (engine.code.hasPendingWrites || engine.action.hasPendingRebases || engine.action.hasPendingStylePreflights || engine.chat.isStreaming) throw new Error(t('editing'));
        } finally {
            engine.branches.cancelDisposalPreparation(preparation);
        }
    }

    async function review() {
        setConfirmation(null);
        setDraft(null);
        setCheckedId(null);
        setOpenedId(null);
        await run(async (request, assertCurrent) => {
            await flushEdits(assertCurrent);
            setDraft(preparePublishingReview(publishingPlanSchema.parse(await request('plan', {}))));
        });
    }

    async function freeze() {
        if (!draft) return;
        const reviewed = draft;
        const priorIds = new Set(state?.releases.map((item) => item.id));
        // A plan is single-use even when the transport response is ambiguous.
        setDraft(null);
        await run(async (request) => {
            const frozen = publishingFreezeSchema.parse(await request('review', { planToken: reviewed.planToken, cleanedFiles: reviewed.cleanedFiles }));
            const next = accept(frozen);
            const added = next.releases.find((item) => item.id === frozen.createdReleaseId);
            if (!added || priorIds.has(added.id)) throw new Error(t('statusNeeded'));
            setSelectedId(added.id);
            setDiffs((previous) => ({ ...previous, [added.id]: reviewed.changes }));
        });
    }

    async function build(production: boolean) {
        if (!state || !release || !canBuildRelease(state, release, reviewed, production, checkedId)) return;
        await run(async (request) => { accept(await request('startBuild', { releaseId: release.id, production })); });
    }

    async function confirmPublish() {
        if (!release || !reviewed) return;
        await run(async (request) => {
            const latest = accept(await request('status', {}));
            const selected = latest.releases.find((item) => item.id === release.id);
            if (!canPublishRelease(latest, selected, checkedId)) throw new Error(t('statusNeeded'));
            confirmedTarget.current = latest.target ? { ...latest.target, domains: [...latest.target.domains] } : null;
            setConfirmation('publish');
        });
    }

    async function finish() {
        const action = confirmation;
        setConfirmation(null);
        await run(async (request) => {
            const latest = accept(await request('status', {}));
            if (action !== 'acceptLive' && JSON.stringify(confirmedTarget.current) !== JSON.stringify(latest.target)) throw new Error(t('statusNeeded'));
            if (action === 'acceptLive' && acceptLiveTarget.current && matchesAcceptLiveReview(latest, acceptLiveTarget.current)) {
                accept(await request('acceptLive', acceptLiveTarget.current));
                setCheckedId(null);
                setOpenedId(null);
                setDraft(null);
                setDiffs({});
            } else if (action === 'publish' && release && reviewed && canPublishRelease(latest, latest.releases.find((item) => item.id === release.id), checkedId)) {
                accept(await request('publish', { releaseId: release.id }));
            } else if (action === 'rollback' && rollbackTarget.current && matchesRollbackReview(latest, rollbackTarget.current)) {
                accept(await request('rollback', rollbackTarget.current));
            } else throw new Error(t('statusNeeded'));
        });
    }

    return <>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t('button')}</Button>
        <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
            <DialogContent className="bg-background border-border-popover flex max-h-[85vh] flex-col gap-4 p-5 sm:max-w-[760px]">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 space-y-4 overflow-y-auto text-small">
                    {error && <p role="alert" className="text-red-400">{error}</p>}
                    {busy && <p role="status">{t('working')}</p>}
                    {state?.pending && <p role="status">{t(state.pending.kind === 'switch' ? 'pendingSwitch' : 'pendingBuild')}</p>}
                    {state && !state.productionSwitchEnabled && <p role="status">{t('coordinationUnavailable')}</p>}
                    {state?.routingChanged && <p role="alert">{t('routingChanged')}</p>}
                    {state?.routingChanged && state.observedRouting && <div className="space-y-2"><p className="font-medium">{t('observedLive')}</p><p className="break-all">{state.observedRouting.deploymentId}</p><p>{state.observedRouting.domains.join(', ')}</p><Button variant="outline" disabled={busy || !!state.pending} onClick={() => { acceptLiveTarget.current = prepareAcceptLiveReview(state); if (acceptLiveTarget.current) setConfirmation('acceptLive'); }}>{t('acceptLive')}</Button></div>}
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>{t('refresh')}</Button>
                    {branchId && <NativeContentPreparation projectId={engine.projectId} branchId={branchId} dialog={false} blocked={busy || !!state?.pending} onBegin={() => {
                        setDraft(null); setDiffs({}); setCheckedId(null); setOpenedId(null); setConfirmation(null);
                    }} beforePrepare={flushEdits} />}
                    {!state?.connected && <form className="space-y-3" onSubmit={(event) => {
                        event.preventDefault();
                        const vercelToken = token.trim();
                        setToken('');
                        void run(async (request) => { accept(await request('connect', { vercelToken, vercelProjectId: project.trim(), ...(team.trim() ? { teamId: team.trim() } : {}) })); });
                    }}>
                        <p>{t('connectDescription')}</p>
                        <label className="block space-y-1"><span>{t('token')}</span><Input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} required disabled={busy} /></label>
                        <label className="block space-y-1"><span>{t('project')}</span><Input value={project} onChange={(event) => setProject(event.target.value)} required disabled={busy} /></label>
                        <label className="block space-y-1"><span>{t('team')}</span><Input value={team} onChange={(event) => setTeam(event.target.value)} disabled={busy} /></label>
                        <Button type="submit" disabled={busy || !token.trim() || !project.trim()}>{t('connect')}</Button>
                    </form>}
                    {state?.connected && <>
                        <p>{t('sourceOnly')}</p>
                        {state.target && <div><p className="font-medium">{state.target.name}</p><p>{state.target.domains.join(', ')}</p><p className="text-foreground-tertiary break-all">{state.target.projectId}{state.target.teamId ? ` / ${state.target.teamId}` : ''}</p></div>}
                        <Button variant="outline" disabled={blocked} onClick={() => void review()}>{t('review')}</Button>
                        {state.releases.length > 0 && <label className="block space-y-1"><span>{t('version')}</span><select className="bg-background w-full rounded border p-2" value={release?.id ?? ''} disabled={blocked} onChange={(event) => {
                            setSelectedId(event.target.value); setDraft(null); setCheckedId(null); setOpenedId(null); setConfirmation(null);
                        }}>{[...state.releases].reverse().map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.sourceHash.slice(0, 12)}</option>)}</select></label>}
                        {(draft || release) && <section className="space-y-2">
                            <h3 className="font-medium">{draft ? t('reviewTitle') : t('frozenTitle')}</h3>
                            {release && !draft && <><p className="text-foreground-tertiary break-all">{release.sourceHash}</p>{release.target && <p>{release.target.name} · {release.target.domains.join(', ')}</p>}</>}
                            {changes ? changes.length === 0 ? <p>{t('unchanged')}</p> : changes.map((file) => <details key={file.path} className="min-w-0"><summary className="cursor-pointer break-all py-1">{file.path}{file.reformatted ? ` · ${t('reformatted')}` : ''}</summary><div className="max-h-[480px] overflow-auto"><CodeDiff originalCode={file.original ?? ''} modifiedCode={file.updated ?? ''} /></div></details>) : <><p>{t('savedReview')}</p>{release?.changedFiles.map((path) => <p key={path} className="break-all">{path}</p>)}</>}
                            {draft && <Button disabled={blocked} onClick={() => void freeze()}>{t('freeze')}</Button>}
                            {draft && <details><summary className="cursor-pointer">{t('reviewedFiles', { count: String(draft.cleanedFiles.length) })}</summary>{draft.cleanedFiles.map((file) => <p key={file.path} className="break-all">{file.path}</p>)}</details>}
                        </section>}
                        {release && !draft && <section className="space-y-3">
                            {release.includedPaths.length === 0 ? <p>{t('manifestMissing')}</p> : <details><summary className="cursor-pointer">{t('includedFiles', { count: String(release.includedPaths.length) })}</summary>{release.includedPaths.map((path) => <p key={path} className="break-all">{path}</p>)}</details>}
                            <details><summary className="cursor-pointer">{t('skippedFiles', { count: String(release.skippedPaths.length) })}</summary>{release.skippedPaths.map((path) => <p key={path} className="break-all">{path}</p>)}</details>
                            {release.sharedPublicConfig.length > 0 && <div><h3 className="font-medium">{t('sharedConfig')}</h3><p>{t('sharedConfigDescription')}</p><dl className="mt-2 space-y-1">{release.sharedPublicConfig.map((item) => <div key={item.key}><dt className="break-all font-mono">{item.key}</dt><dd className="break-all">{item.value}</dd></div>)}</dl></div>}
                            <p>{t('preview')} {release.preview?.readyState ?? t('notBuilt')}</p>
                            {!release.preview && <Button disabled={busy || !canBuildRelease(state, release, reviewed, false, checkedId)} onClick={() => void build(false)}>{t('buildPreview')}</Button>}
                            {previewReady(release) && <><Button variant="outline" disabled={busy} onClick={() => { void run(async (_request, assertCurrent) => {
                                const url = release.preview?.url;
                                if (!url || !window.weblabNative?.openExternal || !await window.weblabNative.openExternal(url)) throw new Error(t('openFailed'));
                                assertCurrent(); setOpenedId(release.id);
                            }); }}>{t('openPreview')}</Button><label className="flex items-center gap-2"><Checkbox checked={checkedId === release.id} disabled={blocked || openedId !== release.id} onCheckedChange={(value) => setCheckedId(value === true ? release.id : null)} />{t('checkedPreview')}</label></>}
                            <p>{t('production')} {release.production?.readyState ?? t('notBuilt')}</p>
                            {!release.production && <Button disabled={busy || !canBuildRelease(state, release, reviewed, true, checkedId)} onClick={() => void build(true)}>{t('buildProduction')}</Button>}
                            {[release.preview, release.production].some((deployment) => deployment && ['ERROR', 'CANCELED'].includes(deployment.readyState)) && <p>{t('failedBuild')}</p>}
                            {release.production && state.live?.deploymentId === release.production.id && !state.pending && !state.routingChanged ? <p role="status">{t('live')}</p> : <Button disabled={busy || !reviewed || !release.includedPaths.length || !canPublishRelease(state, release, checkedId)} onClick={() => void confirmPublish()}>{t('publish')}</Button>}
                        </section>}
                        {state.live?.previousDeploymentId && <Button variant="outline" disabled={blocked || !state.productionSwitchEnabled} onClick={() => { rollbackTarget.current = prepareRollbackReview(state); confirmedTarget.current = state.target ? { ...state.target, domains: [...state.target.domains] } : null; if (rollbackTarget.current) setConfirmation('rollback'); }}>{t('rollback')}</Button>}
                        {confirmation && <div className="space-y-2 border-t pt-3" role="group" aria-label={t('confirmTitle')}><p className="font-medium">{t(confirmation === 'publish' ? 'confirmPublish' : confirmation === 'rollback' ? 'confirmRollback' : 'confirmAcceptLive')}</p><p>{(confirmation === 'acceptLive' ? acceptLiveTarget.current?.expectedDomains : confirmedTarget.current?.domains)?.join(', ')}</p>{confirmation === 'acceptLive' && <p className="break-all">{acceptLiveTarget.current?.expectedLiveDeploymentId}</p>}{confirmation === 'rollback' && rollbackTarget.current && <div className="space-y-1"><p>{t('rollbackCurrentVersion')}</p><p className="break-all">{rollbackTarget.current.expectedLiveDeploymentId}</p><p>{t('rollbackPreviousVersion')}</p><p className="break-all">{rollbackTarget.current.expectedPreviousDeploymentId}</p></div>}{confirmation === 'publish' && <p className="break-all text-foreground-tertiary">{release?.sourceHash}</p>}<div className="flex gap-2"><Button disabled={busy || !!state.pending || (confirmation !== 'acceptLive' && (!!state.routingChanged || !state.productionSwitchEnabled))} onClick={() => void finish()}>{t(confirmation === 'publish' ? 'publishNow' : confirmation === 'rollback' ? 'rollbackNow' : 'acceptLiveNow')}</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirmation(null)}>{t('cancel')}</Button></div></div>}
                    </>}
                </div>
            </DialogContent>
        </Dialog>
    </>;
});
