'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import UnicornScene from 'unicornstudio-react/next';

export function UnicornBackground() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'auto' });
        };
        container.addEventListener('wheel', handleWheel, { passive: false });

        // On touch devices there is no real cursor, so drive a slow Lissajous
        // path to keep the background alive without any user input.
        let rafId: number | null = null;
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        if (isTouchDevice) {
            let t = 0;
            const tick = () => {
                t += 0.003; // ~35 s per full cycle at 60 fps — very slow
                const w = window.innerWidth;
                const h = window.innerHeight;
                const x = w / 2 + Math.sin(t) * w * 0.35;
                const y = h / 2 + Math.sin(t * 0.71) * h * 0.25;
                container.dispatchEvent(
                    new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }),
                );
                rafId = requestAnimationFrame(tick);
            };
            rafId = requestAnimationFrame(tick);
        }

        return () => {
            container.removeEventListener('wheel', handleWheel);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, []);

    return (
        <motion.div
            ref={containerRef}
            className="absolute inset-0 z-0 h-screen w-screen"
            style={{
                willChange: 'opacity',
                transform: 'translateZ(0)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 1 }}
        >
            <UnicornScene
                jsonFilePath="/scenes/flow-background.json"
                width="100%"
                height="100%"
                scale={1}
                dpi={1}
                fps={60}
                onError={(error) => console.error('UnicornScene error:', error)}
                onLoad={() => console.log('UnicornScene loaded successfully')}
            />
        </motion.div>
    );
}
