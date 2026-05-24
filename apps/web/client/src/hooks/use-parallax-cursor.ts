import { useEffect, useRef, useState } from 'react';

interface ParallaxCursorOptions {
    intensity?: number;
    smoothness?: number;
}

export function useParallaxCursor(options?: ParallaxCursorOptions) {
    const { intensity = 0.02, smoothness = 0.1 } = options || {};
    // Latest magnetic target lives in a ref so the animation effect doesn't
    // depend on it — otherwise every mouse move would tear down and restart
    // the requestAnimationFrame loop, fighting the smoothing lerp.
    const mousePositionRef = useRef({ x: 0, y: 0 });
    const [parallaxPosition, setParallaxPosition] = useState({ x: 0, y: 0 });
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const { clientX, clientY } = event;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            // Calculate distance from center (magnetic effect)
            const distanceX = (clientX - centerX) / centerX;
            const distanceY = (clientY - centerY) / centerY;

            // Apply inverse square law for magnetic attraction
            const magneticX = distanceX * Math.abs(distanceX) * intensity;
            const magneticY = distanceY * Math.abs(distanceY) * intensity;

            mousePositionRef.current = { x: magneticX, y: magneticY };
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [intensity]);

    useEffect(() => {
        const animate = () => {
            setParallaxPosition((prev) => ({
                x: prev.x + (mousePositionRef.current.x - prev.x) * smoothness,
                y: prev.y + (mousePositionRef.current.y - prev.y) * smoothness,
            }));

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [smoothness]);

    return parallaxPosition;
}
