'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';

import type { CloudEditorScope } from '@/lib/cloud-editor/api';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { cloudContentApi } from './content-api';

export function CloudPreviewAllowance({ scope }: { scope: CloudEditorScope }) {
    const copy = useCloudEditorCopy();
    const allowance = useQuery(cloudContentApi.previewAllowance, scope);
    const setAllowance = useMutation(cloudContentApi.setPreviewAllowance);
    const [starts, setStarts] = useState('1');
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const sending = useRef(false);
    const count = Number(starts);
    const valid = starts !== '' && Number.isSafeInteger(count) && count >= 0 && count <= 8;
    return (
        <section className="space-y-2 border-t pt-4 text-xs">
            <h3 className="font-medium">{copy.previewAllowanceTitle}</h3>
            <p className="text-foreground-secondary">{copy.previewAllowanceDescription}</p>
            <p role="status">
                {copy.previewAllowanceRemaining.replace(
                    '{count}',
                    String(allowance?.remainingStarts ?? 0),
                )}
            </p>
            <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!valid || sending.current) return;
                    sending.current = true;
                    setPending(true);
                    setFailed(false);
                    void setAllowance({ ...scope, starts: count })
                        .catch(() => setFailed(true))
                        .finally(() => {
                            sending.current = false;
                            setPending(false);
                        });
                }}
            >
                <Input
                    aria-label={copy.previewAllowanceCount}
                    type="number"
                    min={0}
                    max={8}
                    step={1}
                    value={starts}
                    onChange={(event) => setStarts(event.target.value)}
                    disabled={pending}
                    className="w-20"
                />
                <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={pending || !valid}
                    loading={pending}
                >
                    {copy.previewAllowanceSave}
                </Button>
            </form>
            {failed && (
                <p role="alert" className="text-destructive">
                    {copy.memberFailed}
                </p>
            )}
        </section>
    );
}
