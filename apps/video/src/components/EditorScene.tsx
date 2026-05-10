import React from 'react';

import type { EditorMockupProps } from './EditorMockup';
import { palette } from '../utils/tokens';
import { EditorMockup } from './EditorMockup';

export interface EditorSceneProps extends EditorMockupProps {
    /** Outer padding around the editor (for the dark background to show). */
    inset?: number;
    /** Children rendered absolutely on top of the editor (cursor, ripple, etc.). */
    overlay?: React.ReactNode;
}

/**
 * Standard "editor in a frame" scene shell. Centers the editor with a
 * 60px inset by default and exposes an overlay layer for cursor/ripple
 * elements that need viewport-space coordinates.
 */
export const EditorScene: React.FC<EditorSceneProps> = ({
    inset = 60,
    overlay,
    leftPanel,
    canvas,
    rightPanel,
    leftPanelWidth,
    rightPanelWidth,
    projectName,
    activeTab,
    showEditorBar,
    bottomBar,
    title,
}) => {
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                background: palette.background,
            }}
        >
            <div style={{ position: 'absolute', inset }}>
                <EditorMockup
                    leftPanel={leftPanel}
                    canvas={canvas}
                    rightPanel={rightPanel}
                    leftPanelWidth={leftPanelWidth}
                    rightPanelWidth={rightPanelWidth}
                    projectName={projectName}
                    activeTab={activeTab}
                    showEditorBar={showEditorBar}
                    bottomBar={bottomBar}
                    title={title}
                />
            </div>
            {overlay}
        </div>
    );
};
