'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useMutation, useQuery } from 'convex/react';

import type { CmsSourceType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';

import type { Id } from '@convex/_generated/dataModel';

interface Props {
    projectId: string;
    sourceId: string | null;
    onClose: () => void;
}

/**
 * Lightweight edit dialog for an external CMS source. Lets the user
 * rename and (optionally) rotate every credential at once. Field-level
 * editing is deferred — it's rare and the connect wizard handles full
 * re-entry well.
 */
export const EditSourceDialog = ({ projectId, sourceId, onClose }: Props) => {
    const open = !!sourceId;
    const source = useQuery(
        api.cmsSources.get,
        sourceId
            ? {
                  projectId: projectId as Id<'projects'>,
                  sourceId: sourceId as Id<'cmsSources'>,
              }
            : 'skip',
    );
    // Convex live queries auto-revalidate — no useUtils equivalent needed.
    // Action wraps mutation + encrypts credentials server-side.
    const updateMutation = useAction(api.cmsActions.sourceUpdate);
    const testExistingAction = useAction(api.cmsActions.sourceTestExisting);
    const testNewAction = useAction(api.cmsActions.sourceTestConnection);
    const [isTesting, setIsTesting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const [name, setName] = useState('');
    const [rotate, setRotate] = useState(false);
    const [creds, setCreds] = useState<Record<string, string>>({});
    const [testStatus, setTestStatus] = useState<
        { ok: true } | { ok: false; reason: string } | null
    >(null);
    // Monotonic request id, mirrors connect-source-dialog.tsx. Without it,
    // a user could click Test, edit credentials while the request is in
    // flight, and the late result would set `testStatus={ ok: true }` for
    // the OLD creds. The Save button (gated on `testStatus?.ok === true`)
    // would then accept untested credentials.
    const testReqRef = useRef(0);

    // Seed once per (open × sourceId). After init, a background refetch
    // (Convex realtime / window focus) must NOT overwrite the user's
    // in-progress edits — otherwise typing into "name" would silently
    // revert when another client updates the source. Mirrors the pattern
    // in bind-dialog.tsx and routing-dialog.tsx.
    const initializedRef = useRef(false);
    const lastSourceIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!open) {
            initializedRef.current = false;
            lastSourceIdRef.current = null;
            return;
        }
        if (lastSourceIdRef.current !== sourceId) {
            initializedRef.current = false;
            lastSourceIdRef.current = sourceId;
        }
        if (initializedRef.current) return;
        if (!source) return;
        initializedRef.current = true;
        setName(source.name);
        setRotate(false);
        setCreds({});
        setTestStatus(null);
    }, [open, source, sourceId]);

    const handleTest = async () => {
        if (!sourceId) return;
        // Guard against the user clicking Test before the source query has
        // resolved — accessing `source.type` via non-null assertion in that
        // window would throw a TypeError and tear down the dialog.
        if (rotate && Object.keys(creds).length > 0 && !source) {
            toast.error('Source not loaded yet — try again in a moment');
            return;
        }
        const reqId = ++testReqRef.current;
        setTestStatus(null);
        setIsTesting(true);
        try {
            // Rotating creds → test the new ones before persisting. Otherwise
            // re-test the stored creds.
            const result =
                rotate && Object.keys(creds).length > 0 && source
                    ? await testNewAction({
                          projectId: projectId as Id<'projects'>,
                          type: source.type as Exclude<CmsSourceType, CmsSourceType.WEBLAB>,
                          credentials: Object.fromEntries(
                              Object.entries(creds).filter(([, v]) => v && v.trim() !== ''),
                          ),
                      })
                    : await testExistingAction({
                          projectId: projectId as Id<'projects'>,
                          sourceId: sourceId as Id<'cmsSources'>,
                      });
            if (reqId !== testReqRef.current) return; // stale — user edited creds mid-test
            setTestStatus(result);
            if (!result.ok) toast.error(result.reason);
            else toast.success('Connection works');
        } catch (err) {
            if (reqId !== testReqRef.current) return;
            const reason = err instanceof Error ? err.message : 'Connection test failed';
            setTestStatus({ ok: false, reason });
            toast.error(reason);
        } finally {
            if (reqId === testReqRef.current) setIsTesting(false);
        }
    };

    // Invalidate any in-flight test + cached success state whenever the
    // user edits a cred field, toggles `rotate`, or switches between
    // testing new vs stored creds — otherwise Save could persist creds
    // that were never validated against the remote.
    const invalidatePendingTest = () => {
        testReqRef.current += 1;
        setTestStatus(null);
    };

    const handleSave = async () => {
        if (!sourceId || !name.trim()) {
            toast.error('Source name is required');
            return;
        }
        const filteredCreds = Object.fromEntries(
            Object.entries(creds).filter(([, v]) => v && v.trim() !== ''),
        );
        // Sending an empty object would replace (wipe) the stored credentials
        // blob — treat "rotate checked but every field blank" as keep-existing.
        const credsToSend =
            rotate && Object.keys(filteredCreds).length > 0 ? filteredCreds : undefined;
        setIsUpdating(true);
        try {
            // Action encrypts `credentials` server-side via lib/cmsCredentials.
            await updateMutation({
                projectId: projectId as Id<'projects'>,
                sourceId: sourceId as Id<'cmsSources'>,
                name: name.trim(),
                credentials: credsToSend as never | undefined,
            });
            // Convex live queries auto-revalidate — no manual invalidate needed.
            toast.success('Source updated');
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update source');
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit source</DialogTitle>
                    <DialogDescription>
                        Rename the source or rotate its credentials. Existing collections that
                        reference it stay mapped — only the credentials change.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit-source-name">Display name</Label>
                        <Input
                            id="edit-source-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-small flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={rotate}
                                onChange={(e) => {
                                    // Invalidate any cached `testStatus={ok:true}`
                                    // — toggling rotate flips between testing
                                    // the new creds vs the stored creds, so
                                    // the prior result is no longer relevant.
                                    invalidatePendingTest();
                                    setRotate(e.target.checked);
                                }}
                            />
                            Replace credentials
                        </label>
                        {rotate ? (
                            <div className="border-border space-y-2 rounded-md border p-3">
                                <p className="text-foreground-tertiary text-mini">
                                    Enter the new credentials. Fields you leave blank keep their
                                    existing value (the whole credentials blob is replaced, so
                                    re-enter every value you want kept).
                                </p>
                                {COMMON_CRED_KEYS.map((key) => (
                                    <div key={key} className="space-y-1">
                                        <Label
                                            htmlFor={`edit-source-${key}`}
                                            className="text-foreground-secondary text-mini"
                                        >
                                            {key}
                                        </Label>
                                        <Input
                                            id={`edit-source-${key}`}
                                            type={isSecret(key) ? 'password' : 'text'}
                                            autoComplete="off"
                                            value={creds[key] ?? ''}
                                            onChange={(e) => {
                                                // Invalidate any cached "ok" so
                                                // Save can't accept untested
                                                // creds (mirrors connect-
                                                // source-dialog.tsx).
                                                invalidatePendingTest();
                                                setCreds((prev) => ({
                                                    ...prev,
                                                    [key]: e.target.value,
                                                }));
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
                {testStatus ? (
                    <p
                        className={
                            testStatus.ok
                                ? 'text-foreground-positive text-mini'
                                : 'text-red text-mini'
                        }
                    >
                        {testStatus.ok
                            ? 'Connection works'
                            : `Connection failed: ${testStatus.reason}`}
                    </p>
                ) : null}
                <DialogFooter className="flex-row justify-between sm:justify-between">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => void handleTest()}
                            disabled={isTesting}
                        >
                            Test connection
                        </Button>
                        <Button
                            onClick={() => void handleSave()}
                            disabled={
                                isUpdating ||
                                // When the user is rotating creds with at least
                                // one non-blank value, require a passing test
                                // before allowing Save. Otherwise the new creds
                                // get persisted without ever validating against
                                // the remote — mirrors the connect-source gate.
                                (rotate &&
                                    Object.values(creds).some((v) => v && v.trim() !== '') &&
                                    testStatus?.ok !== true)
                            }
                        >
                            Save
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const COMMON_CRED_KEYS = [
    'baseUrl',
    'apiKey',
    'apiToken',
    'usersSlug',
    'collectionSlugs',
    'contentTypes',
    'endpointsJson',
];

function isSecret(key: string): boolean {
    return /key|token|secret|password/i.test(key);
}
