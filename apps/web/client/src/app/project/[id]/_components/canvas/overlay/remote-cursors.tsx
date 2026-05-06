'use client';

import { observer } from 'mobx-react-lite';

import { useEditorEngine } from '@/components/store/editor';

/**
 * Renders a floating cursor + name label for every remote user who has an
 * active canvas position. Coordinates are stored in canvas-space and
 * converted to screen-space using the current pan/zoom transform so cursors
 * track correctly as the local user scrolls or zooms.
 */
export const RemoteCursors = observer(() => {
    const editorEngine = useEditorEngine();
    const remoteUsers = editorEngine.presence.remoteUsers;
    const { position, scale } = editorEngine.canvas;

    return (
        <>
            {Array.from(remoteUsers.values()).map((user) => {
                if (user.cursorX === null || user.cursorY === null) return null;

                // Convert canvas-space → screen-space using the active transform
                const screenX = user.cursorX * scale + position.x;
                const screenY = user.cursorY * scale + position.y;

                return (
                    <div
                        key={user.userId}
                        className="pointer-events-none absolute z-50 select-none"
                        style={{
                            left: screenX,
                            top: screenY,
                            // Bug fix #6: smooth transitions prevent the choppy 50ms jump effect
                            transition: 'left 80ms linear, top 80ms linear',
                        }}
                    >
                        {/* Cursor arrow */}
                        <svg
                            width="16"
                            height="20"
                            viewBox="0 0 16 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M0 0L0 14L4 10.5L6.5 16L8.5 15.2L6 9.5H11L0 0Z"
                                fill={user.color}
                                stroke="white"
                                strokeWidth="1"
                            />
                        </svg>
                        {/* Name label */}
                        <div
                            className="mt-0.5 rounded px-1.5 py-0.5 text-xs whitespace-nowrap text-white shadow-sm"
                            style={{ backgroundColor: user.color }}
                        >
                            {user.displayName}
                        </div>
                    </div>
                );
            })}
        </>
    );
});
