'use client';

import { observer } from 'mobx-react-lite';

import { colors } from '@weblab/ui/tokens';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Dims everything outside the active master-edit scope. Rendered as the
 * bottom layer of the canvas overlay: a viewport-sized rect (clipped by the
 * canvas container's overflow) with an SVG mask cutout over the scope root,
 * plus a 1px purple ring around the cutout. Pointer-events stay off so
 * click-outside-to-exit travels through to the frames.
 */
export const EditModeDim = observer(() => {
    const editorEngine = useEditorEngine();
    const session = editorEngine.components.editing;
    const rect = editorEngine.components.editingScopeRect;

    if (!session || !rect) return null;

    const PAD = 4;
    const cutout = {
        x: rect.left - PAD,
        y: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
    };

    return (
        <div
            data-weblab-ignore="true"
            style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                // No z-index: painted in overlay DOM order (above frames,
                // below the top bar / side panels, which come later in the
                // editor shell and carry z-49/z-50).
            }}
        >
            <svg width="100%" height="100%" className="transition-opacity duration-150">
                <defs>
                    <mask id="weblab-component-edit-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <rect
                            x={cutout.x}
                            y={cutout.y}
                            width={cutout.width}
                            height={cutout.height}
                            rx={2}
                            fill="black"
                        />
                    </mask>
                </defs>
                <rect
                    width="100%"
                    height="100%"
                    fill="black"
                    fillOpacity={0.45}
                    mask="url(#weblab-component-edit-mask)"
                />
                <rect
                    x={cutout.x}
                    y={cutout.y}
                    width={cutout.width}
                    height={cutout.height}
                    rx={2}
                    fill="none"
                    stroke={colors.purple[500]}
                    strokeOpacity={0.6}
                    strokeWidth={1}
                />
            </svg>
        </div>
    );
});
