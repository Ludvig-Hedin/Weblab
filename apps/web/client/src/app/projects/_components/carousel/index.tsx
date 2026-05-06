'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

interface CarouselProps {
    children: ReactNode;
    gap?: string;
    className?: string;
    scrollAmount?: number;
    tolerance?: number;
}

const SCROLL_AMOUNT = 300;
const SCROLL_TOLERANCE = 10;

export function Carousel({
    children,
    gap = 'gap-4',
    className,
    scrollAmount = SCROLL_AMOUNT,
    tolerance = SCROLL_TOLERANCE,
}: CarouselProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftButton, setShowLeftButton] = useState(false);
    const [showRightButton, setShowRightButton] = useState(false);

    // Check overflow and handle scroll position
    useEffect(() => {
        const checkOverflow = () => {
            if (scrollRef.current) {
                const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
                const hasOverflow = scrollWidth > clientWidth;
                const isAtEnd = scrollLeft + clientWidth >= scrollWidth - tolerance;

                setShowLeftButton(scrollLeft > tolerance);
                setShowRightButton(hasOverflow && !isAtEnd);
            }
        };

        const handleScroll = () => {
            if (scrollRef.current) {
                const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;

                setShowLeftButton(scrollLeft > tolerance);

                const isAtEnd = scrollLeft + clientWidth >= scrollWidth - tolerance;
                setShowRightButton(!isAtEnd && scrollWidth > clientWidth);
            }
        };

        const scrollContainer = scrollRef.current;
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', handleScroll);
            window.addEventListener('resize', checkOverflow);

            // Initial check
            checkOverflow();

            return () => {
                scrollContainer.removeEventListener('scroll', handleScroll);
                window.removeEventListener('resize', checkOverflow);
            };
        }
    }, [tolerance, children]);

    const scrollLeft = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({
                left: -scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    const scrollRight = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({
                left: scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    return (
        <div className="relative overflow-x-visible">
            {/* Left gradient - only visible when scrolled */}
            <AnimatePresence>
                {showLeftButton && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="from-background pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-16 bg-gradient-to-r to-transparent"
                    />
                )}
            </AnimatePresence>

            {/* Right gradient - only visible when not at end */}
            <AnimatePresence>
                {showRightButton && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="from-background pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-16 bg-gradient-to-l to-transparent"
                    />
                )}
            </AnimatePresence>

            {/* Left scroll button */}
            <AnimatePresence>
                {showLeftButton && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={scrollLeft}
                        className="bg-background/80 border-border hover:bg-secondary text-foreground-secondary hover:text-foreground absolute top-1/2 left-0 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-colors"
                        aria-label="Scroll left"
                    >
                        <Icons.ChevronRight className="h-5 w-5 rotate-180" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Right scroll button */}
            <AnimatePresence>
                {showRightButton && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={scrollRight}
                        className="bg-background/80 border-border hover:bg-secondary text-foreground-secondary hover:text-foreground absolute top-1/2 right-0 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-colors"
                        aria-label="Scroll right"
                    >
                        <Icons.ChevronRight className="h-5 w-5" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Scrollable content */}
            <div
                ref={scrollRef}
                className={cn(
                    'flex overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none]',
                    gap,
                    className,
                )}
            >
                {children}
            </div>
        </div>
    );
}
