'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Kbd } from '@weblab/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Floating bar shown while editing a master component in-context. Makes the
 * blast radius explicit ("applies to N instances") and offers the Done exit.
 */
export const ComponentEditBanner = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations('editor.canvas.overlay.componentEditBanner');
    const session = editorEngine.components.editing;
    if (!session) return null;

    const { def, instanceCount } = session;
    const instancesLabel =
        instanceCount === 1
            ? t('instanceSingular')
            : t('instancePlural', { count: String(instanceCount) });

    return (
        <div
            className="pointer-events-none fixed bottom-12 left-1/2 z-40 -translate-x-1/2"
            data-weblab-ignore="true"
        >
            <div className="bg-background-primary border-border pointer-events-auto flex h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-[11px] shadow-sm">
                <Icons.Component className="h-3 w-3 text-purple-400" />
                <span className="text-foreground-primary">
                    {t('editing')} <span className="font-medium">{def.name}</span>
                </span>
                <span className="text-foreground-tertiary">· {instancesLabel}</span>
                <div className="bg-border h-3.5 w-px" />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => editorEngine.components.exitEditMode()}
                        >
                            {t('done')}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="flex items-center gap-1">
                        {t('exitTooltip')} <Kbd>Esc</Kbd>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
});
