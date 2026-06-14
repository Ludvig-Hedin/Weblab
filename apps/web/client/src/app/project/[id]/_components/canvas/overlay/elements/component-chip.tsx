'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { EditorMode } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Compact name chip rendered above a selected component instance, with a
 * pencil affordance that enters master editing. Only shown on the instance
 * boundary (the element carrying `instanceId`), single selection, outside an
 * active edit session.
 */
export const ComponentChip = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations('editor.canvas.overlay.componentChip');
    const selected = editorEngine.elements.selected;
    const selectedRect = editorEngine.overlay.state.clickRects[0] ?? null;
    const isPreview = editorEngine.state.editorMode === EditorMode.PREVIEW;

    const el = selected.length === 1 ? selected[0] : null;
    if (isPreview || !el?.instanceId || !selectedRect || editorEngine.components.editing) {
        return null;
    }

    const layerNode = editorEngine.ast.mappings.getLayerNode(el.frameId, el.domId);
    const componentName = layerNode?.component ?? t('defaultName');

    const CHIP_HEIGHT = 20;
    const MARGIN = 6;
    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: Math.max(0, selectedRect.top - CHIP_HEIGHT - MARGIN),
        left: selectedRect.left,
        pointerEvents: 'none',
        zIndex: 60,
    };

    return (
        <div style={containerStyle}>
            <div className="bg-background-primary flex h-5 items-center gap-1 rounded-sm border border-purple-500/50 px-1.5 font-mono text-[11px] text-purple-700 dark:text-purple-200">
                <Icons.Component className="h-3 w-3 text-purple-500 dark:text-purple-400" />
                <span className="max-w-[160px] truncate" title={componentName}>
                    {componentName}
                </span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            className="pointer-events-auto -mr-0.5 flex h-4 w-4 items-center justify-center rounded-[3px] text-purple-600 hover:bg-purple-500/20 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-100"
                            onClick={() => void editorEngine.components.enterEditMode(el)}
                            aria-label={t('editAriaLabel', { name: componentName })}
                        >
                            <Icons.Pencil className="h-2.5 w-2.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                        {t('editTooltip')}
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
});
