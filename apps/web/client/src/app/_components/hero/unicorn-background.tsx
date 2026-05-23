'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import UnicornScene from 'unicornstudio-react/next';

function hasWebGL(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const canvas = document.createElement('canvas');
        const gl =
            canvas.getContext('webgl2') ||
            canvas.getContext('webgl') ||
            canvas.getContext('experimental-webgl');
        return !!gl;
    } catch {
        return false;
    }
}

export function UnicornBackground() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
    const [sceneFailed, setSceneFailed] = useState(false);

    useEffect(() => {
        setWebglSupported(hasWebGL());
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'auto' });
        };
        container.addEventListener('wheel', handleWheel, { passive: false });

        let rafId: number | null = null;
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        if (isTouchDevice) {
            let t = 0;
            const tick = () => {
                t += 0.003;
                const w = window.innerWidth;
                const h = window.innerHeight;
                const x = w / 2 + Math.sin(t) * w * 0.35;
                const y = h / 2 + Math.sin(t * 0.71) * h * 0.25;
                container.dispatchEvent(
                    new MouseEvent('mousemove', {
                        bubbles: true,
                        clientX: x,
                        clientY: y,
                    }),
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

    if (webglSupported === null || webglSupported === false || sceneFailed) {
        return (
            <div
                ref={containerRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 h-screen w-screen bg-[radial-gradient(ellipse_at_center,_var(--background-secondary)_0%,_var(--background)_70%)]"
            />
        );
    }

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
                onError={() => setSceneFailed(true)}
            />
        </motion.div>
    );
}
