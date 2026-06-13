'use client';

import { useState } from 'react';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Textarea } from '@weblab/ui/textarea';

function labelize(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
}

/**
 * Edit a block's content. Top-level string fields (headings, CTA labels, …) get
 * plain inputs; nested fields (arrays/objects like items/plans) get a JSON
 * editor. The server (`setWireframeContent`) re-validates against the block's
 * schema and falls back to defaults if the shape is wrong, so a bad edit can
 * never corrupt the section.
 */
export function ContentEditor({
    content,
    onSave,
    onCancel,
}: {
    content: unknown;
    onSave: (next: unknown) => void;
    onCancel: () => void;
}) {
    const record =
        content && typeof content === 'object' && !Array.isArray(content)
            ? (content as Record<string, unknown>)
            : {};
    const stringKeys = Object.keys(record).filter((k) => typeof record[k] === 'string');
    const restKeys = Object.keys(record).filter((k) => typeof record[k] !== 'string');

    const [strings, setStrings] = useState<Record<string, string>>(() =>
        Object.fromEntries(stringKeys.map((k) => [k, record[k] as string])),
    );
    const [restJson, setRestJson] = useState<string>(() =>
        restKeys.length > 0
            ? JSON.stringify(Object.fromEntries(restKeys.map((k) => [k, record[k]])), null, 2)
            : '',
    );
    const [error, setError] = useState<string | null>(null);

    function save() {
        let rest: Record<string, unknown> = {};
        if (restJson.trim().length > 0) {
            try {
                const parsed: unknown = JSON.parse(restJson);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('not an object');
                }
                rest = parsed as Record<string, unknown>;
            } catch {
                setError('Advanced fields must be valid JSON.');
                return;
            }
        }
        onSave({ ...rest, ...strings });
    }

    return (
        <div className="flex flex-col gap-3">
            {stringKeys.map((k) => (
                <div key={k} className="flex flex-col gap-1">
                    <Label className="text-muted-foreground text-xs">{labelize(k)}</Label>
                    <Input
                        value={strings[k] ?? ''}
                        onChange={(e) => setStrings((s) => ({ ...s, [k]: e.target.value }))}
                    />
                </div>
            ))}
            {restKeys.length > 0 && (
                <div className="flex flex-col gap-1">
                    <Label className="text-muted-foreground text-xs">Advanced (JSON)</Label>
                    <Textarea
                        rows={8}
                        value={restJson}
                        onChange={(e) => {
                            setRestJson(e.target.value);
                            setError(null);
                        }}
                        className="font-mono text-xs"
                    />
                </div>
            )}
            {error && <p className="text-destructive text-xs">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button size="sm" onClick={save}>
                    Save copy
                </Button>
            </div>
        </div>
    );
}
