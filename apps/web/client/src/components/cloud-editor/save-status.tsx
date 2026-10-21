'use client';

import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';

import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';

type RecoveryAction = 'save' | 'reload' | 'preview' | 'download' | 'permissions';

export const SaveStatus = observer(({ source }: { source: CloudSource }) => {
    const copy = useCloudEditorCopy();
    const state = source.state;
    const [action, setAction] = useState<RecoveryAction | null>(null);
    const actionInFlight = useRef(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [confirmReload, setConfirmReload] = useState(false);
    const busy = state.pending || state.loading || action !== null;
    const previewFailed = !!state.runtimeError || state.runtime?.status === 'error';
    const sourceProblem = state.conflict || state.needsReload || !!state.error;

    let label: string;
    if (state.discardReloadRequested) label = copy.discardReloadPending;
    else if (state.accessError) label = copy.permissionsUnavailable;
    else if (state.pending) label = copy.saving;
    else if (state.loading || (state.savedRevision === 0 && !sourceProblem))
        label = copy.loadingSource;
    else if (state.conflict) label = copy.conflict;
    else if (source.canRetrySave) label = copy.saveUnconfirmed;
    else if (source.hasLocalWork) label = copy.unsaved;
    else if (sourceProblem && state.saveAcknowledged) label = copy.savedReload;
    else if (sourceProblem)
        label =
            source.hasPendingChanges || state.savedRevision === 0
                ? copy.saveError
                : copy.savedReload;
    else if (state.runtime?.enabled === false) label = `${copy.saved} · ${copy.paused}`;
    else if (previewFailed) label = copy.previewFailed;
    else if (state.runtime?.status === 'stopped') label = `${copy.saved} · ${copy.previewIdle}`;
    else if (state.runtime?.status !== 'ready') label = `${copy.saved} · ${copy.previewStarting}`;
    else if (state.runtime.appliedRevision !== state.savedRevision) label = copy.previewUpdating;
    else label = copy.saved;

    async function perform(kind: RecoveryAction, discardRecovery = false): Promise<boolean> {
        if (actionInFlight.current || state.pending || state.loading) return false;
        actionInFlight.current = true;
        setAction(kind);
        setActionError(null);
        try {
            if (kind === 'permissions') await source.refreshCapabilities();
            else if (kind === 'save') await source.retryPending();
            else if (kind === 'reload') await source.reloadSavedSource({ discardRecovery });
            else if (kind === 'preview') await source.retryPreview();
            else source.downloadPendingChanges();
            return true;
        } catch {
            // Source and preview keep their own error states. Downloads and
            // unexpected failures still need visible feedback here.
            setActionError(state.discardReloadRequested || state.discardReloadFailed
                ? copy.discardReloadFailed : source.hasLocalWork ? copy.finishEdit : copy.genericError);
            return false;
        } finally {
            actionInFlight.current = false;
            setAction(null);
        }
    }

    function requestReload() {
        if (source.hasPendingChanges || source.hasRecoverableText || source.hasLocalWork) setConfirmReload(true);
        else void perform('reload');
    }

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
            <span
                role="status"
                aria-live="polite"
                title={label}
                className={`max-w-xs truncate px-1 ${sourceProblem ? 'text-destructive' : 'text-foreground-secondary'}`}
            >
                {label}
            </span>
            {(source.hasPendingChanges || source.hasRecoverableText) && (
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    onClick={() => {
                        void perform('download');
                    }}
                >
                    {copy.download}
                </Button>
            )}
            {source.canRetrySave && (
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    loading={action === 'save'}
                    onClick={() => {
                        void perform('save');
                    }}
                >
                    {copy.retrySave}
                </Button>
            )}
            {sourceProblem && !source.canRetrySave && (
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    loading={action === 'reload'}
                    onClick={requestReload}
                >
                    {copy.reload}
                </Button>
            )}
            {previewFailed &&
                !sourceProblem &&
                source.canEditContent &&
                state.runtime?.enabled !== false && (
                    <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        loading={action === 'preview'}
                        onClick={() => {
                            void perform('preview');
                        }}
                    >
                        {copy.retryPreview}
                    </Button>
                )}
            {state.accessError && (
                <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    loading={action === 'permissions'}
                    onClick={() => {
                        void perform('permissions');
                    }}
                >
                    {copy.retryPermissions}
                </Button>
            )}
            {state.discardReloadRequested && (
                <span role="status" className="text-foreground-secondary w-full px-1">
                    {copy.discardReloadRetained}
                </span>
            )}
            {actionError && (
                <span role="alert" className="text-destructive w-full px-1">
                    {actionError}
                </span>
            )}
            <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{copy.reload}</AlertDialogTitle>
                        <AlertDialogDescription>{copy.confirmReload}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>{copy.cancel}</AlertDialogCancel>
                        {(source.hasPendingChanges || source.hasRecoverableText) && (
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    void perform('download');
                                }}
                            >
                                {copy.download}
                            </Button>
                        )}
                        <AlertDialogAction
                            disabled={busy || source.canRetrySave}
                            onClick={(event) => {
                                event.preventDefault();
                                void perform('reload', true).then((reloaded) => {
                                    if (reloaded) setConfirmReload(false);
                                });
                            }}
                        >
                            {copy.reload}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                    {actionError && (
                        <p role="alert" className="text-destructive text-sm">
                            {actionError}
                        </p>
                    )}
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
});
