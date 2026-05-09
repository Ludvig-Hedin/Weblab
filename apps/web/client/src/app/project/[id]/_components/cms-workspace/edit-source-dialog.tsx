'use client';

import { useEffect, useState } from 'react';

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

import { api } from '@/trpc/react';

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
    const sourceQuery = api.cms.source.get.useQuery(
        { projectId, sourceId: sourceId ?? '' },
        { enabled: !!sourceId },
    );
    const utils = api.useUtils();
    const updateMutation = api.cms.source.update.useMutation();
    const testExistingMutation = api.cms.source.testExisting.useMutation();
    const testNewMutation = api.cms.source.testConnection.useMutation();

    const [name, setName] = useState('');
    const [rotate, setRotate] = useState(false);
    const [creds, setCreds] = useState<Record<string, string>>({});
    const [testStatus, setTestStatus] = useState<
        { ok: true } | { ok: false; reason: string } | null
    >(null);

    useEffect(() => {
        if (!open || !sourceQuery.data) return;
        setName(sourceQuery.data.name);
        setRotate(false);
        setCreds({});
        setTestStatus(null);
    }, [open, sourceQuery.data]);

    const handleTest = async () => {
        if (!sourceId) return;
        setTestStatus(null);
        try {
            // Rotating creds → test the new ones before persisting. Otherwise
            // re-test the stored creds.
            const result =
                rotate && Object.keys(creds).length > 0
                    ? await testNewMutation.mutateAsync({
                          projectId,
                          type: sourceQuery.data!.type as Exclude<
                              CmsSourceType,
                              CmsSourceType.WEBLAB
                          >,
                          credentials: Object.fromEntries(
                              Object.entries(creds).filter(([, v]) => v && v.trim() !== ''),
                          ),
                      })
                    : await testExistingMutation.mutateAsync({ projectId, sourceId });
            setTestStatus(result);
            if (!result.ok) toast.error(result.reason);
            else toast.success('Connection works');
        } catch (err) {
            const reason = err instanceof Error ? err.message : 'Connection test failed';
            setTestStatus({ ok: false, reason });
            toast.error(reason);
        }
    };

    const handleSave = async () => {
        if (!sourceId || !name.trim()) {
            toast.error('Source name is required');
            return;
        }
        const credsToSend =
            rotate && Object.keys(creds).length > 0
                ? Object.fromEntries(Object.entries(creds).filter(([, v]) => v && v.trim() !== ''))
                : undefined;
        try {
            await updateMutation.mutateAsync({
                projectId,
                sourceId,
                name: name.trim(),
                credentials: credsToSend,
            });
            await utils.cms.source.list.invalidate({ projectId });
            toast.success('Source updated');
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update source');
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
                                onChange={(e) => setRotate(e.target.checked)}
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
                                            onChange={(e) =>
                                                setCreds((prev) => ({
                                                    ...prev,
                                                    [key]: e.target.value,
                                                }))
                                            }
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
                            disabled={testExistingMutation.isPending || testNewMutation.isPending}
                        >
                            Test connection
                        </Button>
                        <Button
                            onClick={() => void handleSave()}
                            disabled={updateMutation.isPending}
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
