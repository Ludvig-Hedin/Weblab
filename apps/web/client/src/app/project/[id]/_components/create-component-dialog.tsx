'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { PropExtraction } from '@weblab/parser';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';

/**
 * "Create component from selection" — names the component, reviews the
 * suggested properties (static text → text props, img srcs → image props,
 * hrefs → link props; unchecked stay hardcoded), then extracts the subtree
 * into `components/<Name>.tsx` and swaps the selection for an instance.
 */
export const CreateComponentDialog = observer(() => {
    const editorEngine = useEditorEngine();
    const target = editorEngine.components.createDialogTarget;

    const [name, setName] = useState('');
    const [suggestions, setSuggestions] = useState<PropExtraction[]>([]);
    const [enabled, setEnabled] = useState<Record<string, boolean>>({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!target) return;
        setName('');
        setSuggestions([]);
        setEnabled({});
        void editorEngine.components.getSuggestedExtractions(target).then((next) => {
            setSuggestions(next);
            setEnabled(Object.fromEntries(next.map((s) => [s.sourceOid + s.propName, true])));
        });
    }, [target, editorEngine.components]);

    if (!target) return null;

    const validName = /^[A-Z][A-Za-z0-9]*$/.test(name.trim());

    const create = async () => {
        if (!validName || busy) return;
        setBusy(true);
        try {
            const extractions = suggestions.filter((s) => enabled[s.sourceOid + s.propName]);
            const result = await editorEngine.components.createFromSelection(
                target,
                name.trim(),
                extractions,
            );
            if (!result.ok) {
                toast.error('Could not create component', { description: result.error });
                return;
            }
            toast.success(`Component ${name.trim()} created`);
            editorEngine.components.closeCreateDialog();
        } finally {
            setBusy(false);
        }
    };

    return (
        <AlertDialog
            open
            onOpenChange={(open) => {
                if (!open) editorEngine.components.closeCreateDialog();
            }}
        >
            <AlertDialogContent className="max-w-sm">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Icons.Component className="h-4 w-4 text-purple-400" />
                        Create component
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        The selection becomes a reusable component; this copy becomes its first
                        instance.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <Input
                            autoFocus
                            value={name}
                            placeholder="ComponentName"
                            className="h-8 font-mono text-[12px]"
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void create();
                            }}
                        />
                        <span className="text-foreground-tertiary text-tiny font-mono">
                            {validName
                                ? `components/${name.trim()}.tsx`
                                : 'PascalCase, e.g. HeroCard'}
                        </span>
                    </div>

                    {suggestions.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <span className="text-foreground-secondary text-mini font-medium">
                                Suggested properties
                            </span>
                            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                                {suggestions.map((suggestion) => {
                                    const key = suggestion.sourceOid + suggestion.propName;
                                    return (
                                        <label
                                            key={key}
                                            className="flex h-6 cursor-pointer items-center gap-2 text-[11px]"
                                        >
                                            <Checkbox
                                                checked={enabled[key] ?? false}
                                                onCheckedChange={(checked) =>
                                                    setEnabled((prev) => ({
                                                        ...prev,
                                                        [key]: checked === true,
                                                    }))
                                                }
                                            />
                                            <span className="text-foreground-primary font-mono">
                                                {suggestion.propName}
                                            </span>
                                            <span className="text-foreground-tertiary ml-auto">
                                                {suggestion.kind}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            <span className="text-foreground-tertiary text-tiny">
                                Checked values become editable per instance; unchecked stay fixed.
                            </span>
                        </div>
                    )}
                </div>

                <AlertDialogFooter>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editorEngine.components.closeCreateDialog()}
                    >
                        Cancel
                    </Button>
                    <Button size="sm" disabled={!validName || busy} onClick={() => void create()}>
                        {busy ? 'Creating…' : 'Create'}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
});
