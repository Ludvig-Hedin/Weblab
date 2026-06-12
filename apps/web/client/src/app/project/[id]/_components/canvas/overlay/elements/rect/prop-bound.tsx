'use client';

import { observer } from 'mobx-react-lite';

import { colors } from '@weblab/ui/tokens';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Dotted green outlines marking prop-bound elements while a master component
 * is edited in-context (Webflow's "connected to a property" affordance).
 */
export const PropBoundRects = observer(() => {
    const editorEngine = useEditorEngine();
    const session = editorEngine.components.editing;
    const rects = editorEngine.components.propBoundRects;

    if (!session || rects.length === 0) return null;

    return (
        <>
            {rects.map(({ propName, rect }, index) => (
                <div
                    key={`${propName}-${index}`}
                    style={{
                        position: 'absolute',
                        top: `${rect.top}px`,
                        left: `${rect.left}px`,
                        pointerEvents: 'none',
                    }}
                    data-weblab-ignore="true"
                >
                    <svg
                        overflow="visible"
                        width={rect.width}
                        height={rect.height}
                        viewBox={`0 0 ${rect.width} ${rect.height}`}
                    >
                        <rect
                            width={rect.width}
                            height={rect.height}
                            fill="none"
                            stroke={colors.green[400]}
                            strokeWidth={1}
                            strokeDasharray="4 3"
                        />
                    </svg>
                </div>
            ))}
        </>
    );
});
