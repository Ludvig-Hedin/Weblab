'use client';

import { observer } from 'mobx-react-lite';

import type { FrameData } from '@/components/store/editor/frames';
import { useEditorEngine } from '@/components/store/editor';
import { FrameView } from './frame';

export const Frames = observer(
    ({ framesInDragSelection }: { framesInDragSelection: Set<string> }) => {
        const editorEngine = useEditorEngine();
        // `getAll()` can return undefined briefly while FramesManager is still
        // initialising (no bootstrap canvas → frames array empty → MobX
        // observable not yet seeded). Guard so the canvas mounts as an empty
        // grid instead of throwing `Cannot read properties of undefined`.
        const frames = editorEngine.frames.getAll() ?? [];

        return (
            <div className="grid grid-flow-col gap-72">
                {frames.map((frame: FrameData) => (
                    <FrameView
                        key={frame.frame.id}
                        frame={frame.frame}
                        isInDragSelection={framesInDragSelection.has(frame.frame.id)}
                    />
                ))}
            </div>
        );
    },
);
