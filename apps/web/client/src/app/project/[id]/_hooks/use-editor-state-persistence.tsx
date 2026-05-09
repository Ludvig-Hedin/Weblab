'use client';

import { useEffect, useRef } from 'react';
import { reaction } from 'mobx';

import type { BreakpointId } from '@weblab/models';

import type { EditorEngine } from '@/components/store/editor/engine';
import type { EditorPersistedState } from '@/services/editor/state-persistence';
import { loadEditorState, patchEditorState } from '@/services/editor/state-persistence';

const ELEMENT_RESTORE_TIMEOUT_MS = 5_000;
const ELEMENT_RESTORE_POLL_MS = 250;
const PERSIST_DEBOUNCE_MS = 400;

/**
 * Watches editor selection state for `projectId` and persists it to
 * localStorage so the editor can re-open where the user left off.
 *
 * Restored on `isReady`:
 *   - last-active frame (and the breakpoint it implies, via FramesManager.select)
 *   - explicitly-saved active breakpoint, in case the user changed breakpoint
 *     without changing frame (e.g. breakpoint switcher)
 *   - last-selected DOM element — best-effort, polls until the iframe view
 *     can resolve the OID via penpal, then gives up after a short window
 *
 * Re-persists on selection changes via MobX reactions. Patches are
 * accumulated across reactions and flushed by a single debounced timer so
 * concurrent updates (e.g. frame + element changing in the same tick) don't
 * clobber each other.
 *
 * Caveat: restoring the element via `elements.click([el])` may flip the
 * active breakpoint to the element's frame breakpoint (per BreakpointsManager
 * docstring). The element is treated as the more specific signal, so this
 * overrides any explicitly-saved breakpoint when both apply.
 */
export function useEditorStatePersistence(
    projectId: string,
    editorEngine: EditorEngine,
    isReady: boolean,
) {
    // Track which projectId we last restored for. Re-arming on projectId
    // change lets users navigate project → project without losing restore.
    // A boolean flag would silently skip restore for every project after the
    // first within the same component instance.
    const restoredForRef = useRef<string | null>(null);

    // Restore once everything we need is hydrated. Guarded by `restoredForRef`
    // so a transient !isReady (e.g. tab-reactivate triggering reconnect)
    // doesn't re-trigger restore and clobber user actions taken since.
    useEffect(() => {
        if (!isReady || restoredForRef.current === projectId) return;
        restoredForRef.current = projectId;

        // Cancellation flag: any in-flight async element lookup checks this
        // before mutating editor state. Without it, `elements.click([el])`
        // could fire after the effect cleanup ran (route change, project
        // switch), reviving stale selection.
        let cancelled = false;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        const stopPolling = () => {
            if (pollTimer !== null) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        };

        const persisted = loadEditorState(projectId);
        if (!persisted) {
            return () => {
                cancelled = true;
                stopPolling();
            };
        }

        try {
            const allFrames = editorEngine.frames.getAll();
            const targetFrame = persisted.selectedFrameId
                ? allFrames.find((f) => f.frame.id === persisted.selectedFrameId)
                : null;
            if (targetFrame) {
                editorEngine.frames.select([targetFrame.frame]);
            }
            // Apply the saved breakpoint AFTER frames.select so it wins if the
            // user explicitly switched breakpoint without changing frame.
            if (persisted.activeBreakpointId) {
                editorEngine.breakpoints.setActive(persisted.activeBreakpointId as BreakpointId);
            }
        } catch (err) {
            console.warn('[editor-state] failed to restore frame/breakpoint', err);
        }

        const oid = persisted.selectedElementOid;
        const elementFrameId = persisted.selectedElementFrameId;
        if (!oid || !elementFrameId) {
            return () => {
                cancelled = true;
                stopPolling();
            };
        }

        const deadline = Date.now() + ELEMENT_RESTORE_TIMEOUT_MS;
        const tryRestoreElement = async () => {
            if (cancelled) return;
            if (Date.now() > deadline) {
                stopPolling();
                return;
            }
            const frameData = editorEngine.frames.get(elementFrameId);
            if (!frameData?.view) return;
            try {
                const el = await frameData.view.getElementByOid(oid, false);
                // Re-check after await: the effect may have torn down or the
                // user may have manually clicked something else mid-flight.
                if (cancelled) return;
                if (el) {
                    editorEngine.elements.click([el]);
                    stopPolling();
                }
            } catch {
                // swallow — keep polling until deadline
            }
        };
        void tryRestoreElement();
        pollTimer = setInterval(() => void tryRestoreElement(), ELEMENT_RESTORE_POLL_MS);

        return () => {
            cancelled = true;
            stopPolling();
        };
    }, [isReady, projectId, editorEngine]);

    // Subscribe to selection changes once mounted. Reactions persist
    // independently of restore — even before restore runs we want to capture
    // any new selection the user makes immediately.
    useEffect(() => {
        let pendingPatch: Partial<EditorPersistedState> = {};
        let timer: ReturnType<typeof setTimeout> | null = null;

        const flush = () => {
            timer = null;
            const patch = pendingPatch;
            pendingPatch = {};
            if (Object.keys(patch).length === 0) return;
            patchEditorState(projectId, patch);
        };

        const queue = (patch: Partial<EditorPersistedState>) => {
            pendingPatch = { ...pendingPatch, ...patch };
            if (timer) clearTimeout(timer);
            timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
        };

        const disposeFrame = reaction(
            () => editorEngine.frames.selected[0]?.frame.id ?? null,
            (frameId) => queue({ selectedFrameId: frameId ?? undefined }),
        );

        const disposeBreakpoint = reaction(
            () => editorEngine.breakpoints.activeId,
            (activeId) => queue({ activeBreakpointId: activeId }),
        );

        const disposeElement = reaction(
            () => {
                const first = editorEngine.elements.selected[0];
                if (!first) return null;
                const elementOid = first.instanceId ?? first.oid;
                if (!elementOid) return null;
                return { oid: elementOid, frameId: first.frameId };
            },
            (selection) =>
                queue({
                    selectedElementOid: selection?.oid,
                    selectedElementFrameId: selection?.frameId,
                }),
        );

        return () => {
            disposeFrame();
            disposeBreakpoint();
            disposeElement();
            if (timer) {
                clearTimeout(timer);
                // Flush whatever was pending so a fast unmount (route change)
                // doesn't drop the user's last selection.
                flush();
            }
        };
    }, [projectId, editorEngine]);
}
