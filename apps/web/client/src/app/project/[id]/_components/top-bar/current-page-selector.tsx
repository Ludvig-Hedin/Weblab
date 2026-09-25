import { observer } from 'mobx-react-lite';

import { useEditorEngine } from '@/components/store/editor';
import { PageSelector } from '../canvas/frame/top-bar/page-selector';

/**
 * One page picker for the whole canvas. Navigating any frame moves its whole
 * breakpoint group, so the selected frame (or the first one) stands in for all.
 */
export const CurrentPageSelector = observer(() => {
    const editorEngine = useEditorEngine();
    const frame = editorEngine.frames.selected[0]?.frame ?? editorEngine.frames.getAll()[0]?.frame;

    if (!frame) return null;

    return (
        <>
            <span className="text-foreground-secondary/50 text-small">/</span>
            <PageSelector
                frame={frame}
                tooltipSide="bottom"
                showIcon
                buttonClassName="text-small text-foreground-secondary hover:text-foreground-primary"
            />
        </>
    );
});
