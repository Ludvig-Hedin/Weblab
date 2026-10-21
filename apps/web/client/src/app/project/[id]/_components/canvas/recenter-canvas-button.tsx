'use client';

import { Scan } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';

import { useEditorEngine } from '@/components/store/editor';

export const RecenterCanvasButton = observer(() => {
    const editorEngine = useEditorEngine();
    const frameEvent = editorEngine.frameEvent;
    const { left, right } = frameEvent.visibleBounds;
    const isVisible = frameEvent.isCanvasOutOfView && frameEvent.canShowRecenter;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    // Centered in the canvas area between the side panels.
                    className="pointer-events-none absolute top-1/2 flex -translate-y-full justify-center"
                    style={{ left, right }}
                >
                    <div className="pointer-events-auto flex flex-col items-center text-center">
                        <p className="text-foreground-secondary mb-2">
                            Your website is out of view
                        </p>
                        <Button onClick={() => frameEvent.recenterCanvas()}>
                            <Scan className="size-4" />
                            <span>Back to website</span>
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});
