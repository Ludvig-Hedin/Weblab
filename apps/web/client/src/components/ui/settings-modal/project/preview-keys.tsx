import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Separator } from '@weblab/ui/separator';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';

type PreviewEnvResult = { names?: string[]; restartNeeded?: boolean; error?: string };

interface PreviewEnvBridge {
    previewEnvNames?: (root: string) => Promise<PreviewEnvResult>;
    previewEnvUpdate?: (
        root: string,
        set: Record<string, string>,
        remove: string[],
    ) => Promise<PreviewEnvResult>;
}

function getPreviewEnvBridge(): PreviewEnvBridge | null {
    if (typeof window === 'undefined') return null;
    const bridge = (window as unknown as { weblabNative?: { localdev?: PreviewEnvBridge } })
        .weblabNative?.localdev;
    return bridge?.previewEnvNames && bridge.previewEnvUpdate ? bridge : null;
}

/**
 * Test keys for the local preview of a private working copy. The desktop app
 * keeps the values beside the copy and only ever returns the names.
 */
export const PreviewKeysSection = observer(() => {
    const t = useTranslations('settings.project.previewKeys');
    const editorEngine = useEditorEngine();
    const root = editorEngine.branches.activeBranch.runtime.local?.rootPath;
    const [bridge] = useState(getPreviewEnvBridge);
    const [names, setNames] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!bridge?.previewEnvNames || !root) return;
        let cancelled = false;
        void bridge.previewEnvNames(root).then((result) => {
            if (!cancelled && result.names) setNames(result.names);
        });
        return () => {
            cancelled = true;
        };
    }, [bridge, root]);

    if (!bridge?.previewEnvUpdate || !root) return null;

    async function update(set: Record<string, string>, remove: string[]): Promise<boolean> {
        if (!bridge?.previewEnvUpdate || !root) return false;
        setBusy(true);
        try {
            const result = await bridge.previewEnvUpdate(root, set, remove);
            if (result.error || !result.names) {
                toast.error(t('saveFailed'), { description: result.error });
                return false;
            }
            setNames(result.names);
            if (result.restartNeeded) {
                const restarted = await editorEngine.activeSandbox.session.restartDevServer();
                if (restarted) toast.success(t('restarted'));
                else toast.warning(t('restartFailed'));
            } else {
                toast.success(t('saved'));
            }
            return true;
        } finally {
            setBusy(false);
        }
    }

    const trimmedName = name.trim();

    return (
        <>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <h2 className="text-largePlus">{t('title')}</h2>
                    <p className="text-small text-foreground-secondary">{t('description')}</p>
                </div>
                {names.length > 0 && (
                    <ul className="flex flex-col gap-1">
                        {names.map((saved) => (
                            <li key={saved} className="flex items-center justify-between gap-4">
                                <p className="text-foreground-secondary truncate font-mono text-xs">
                                    {saved}
                                </p>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={busy}
                                    aria-label={t('remove', { name: saved })}
                                    onClick={() => void update({}, [saved])}
                                >
                                    <Icons.Trash className="h-4 w-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
                <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!trimmedName) return;
                        void update({ [trimmedName]: value }, []).then((saved) => {
                            if (!saved) return;
                            setName('');
                            setValue('');
                        });
                    }}
                >
                    <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t('namePlaceholder')}
                        aria-label={t('nameLabel')}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={busy}
                        className="w-2/5 font-mono text-xs"
                    />
                    <Input
                        type="password"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={t('valuePlaceholder')}
                        aria-label={t('valueLabel')}
                        autoComplete="off"
                        disabled={busy}
                        className="flex-1 font-mono text-xs"
                    />
                    <Button type="submit" variant="outline" disabled={busy || !trimmedName}>
                        {t('add')}
                    </Button>
                </form>
            </div>
            <Separator />
        </>
    );
});
