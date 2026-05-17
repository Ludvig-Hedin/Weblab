'use client';

import { type FC } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

type ThemeConfig = {
    button: string;
    dot: string;
    progress: string;
};

interface CarouselNavigatorProps {
    totalSlides?: number;
    autoDelay?: number;
    /** When true, suppresses the animated progress bar inside the active dot. */
    paused?: boolean;
    /** Reset key — bump to restart the active dot progress animation. */
    progressKey?: number | string;
    themes?: ThemeConfig[];
    currentIndex: number;
    onIndexChange: (index: number) => void;
}

const DEFAULT_TOTAL_SLIDES = 4;
const DEFAULT_AUTO_DELAY = 5000;

const DEFAULT_THEME: ThemeConfig = {
    button: 'bg-foreground-primary text-background',
    dot: 'bg-foreground-primary/25',
    progress: 'bg-foreground-primary/15',
};

export const CarouselNavigator: FC<CarouselNavigatorProps> = ({
    totalSlides = DEFAULT_TOTAL_SLIDES,
    autoDelay = DEFAULT_AUTO_DELAY,
    paused = false,
    progressKey,
    themes,
    currentIndex,
    onIndexChange,
}) => {
    const themeList =
        themes && themes.length >= totalSlides
            ? themes
            : Array.from({ length: totalSlides }, () => DEFAULT_THEME);
    const theme = themeList[currentIndex] ?? DEFAULT_THEME;

    const goPrev = () => onIndexChange((currentIndex - 1 + totalSlides) % totalSlides);
    const goNext = () => onIndexChange((currentIndex + 1) % totalSlides);

    return (
        <motion.div className="bg-muted inline-flex items-center justify-center gap-0.5 rounded-full px-1.5 py-1 font-sans transition-colors duration-300">
            <ArrowButton onClick={goPrev} themeColor={theme.button} aria-label="Previous slide">
                <ChevronLeft size={14} strokeWidth={2.25} />
            </ArrowButton>

            <div className="flex items-center gap-1.5 px-2">
                {Array.from({ length: totalSlides }).map((_, i) => (
                    <Indicator
                        key={i}
                        isActive={i === currentIndex}
                        theme={theme}
                        autoDelay={autoDelay}
                        paused={paused}
                        progressKey={progressKey}
                        onClick={() => onIndexChange(i)}
                        ariaLabel={`Go to slide ${i + 1}`}
                    />
                ))}
            </div>

            <ArrowButton onClick={goNext} themeColor={theme.button} aria-label="Next slide">
                <ChevronRight size={14} strokeWidth={2.25} />
            </ArrowButton>
        </motion.div>
    );
};

interface ArrowButtonProps {
    children: React.ReactNode;
    onClick: () => void;
    themeColor: string;
    disabled?: boolean;
    'aria-label': string;
}

const ArrowButton = ({
    children,
    onClick,
    themeColor,
    disabled,
    'aria-label': ariaLabel,
}: ArrowButtonProps) => {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            whileTap={{ scale: 0.92 }}
            disabled={disabled}
            aria-label={ariaLabel}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full font-sans transition-colors duration-300 ${
                disabled
                    ? 'bg-foreground-primary/5 text-foreground-tertiary cursor-not-allowed opacity-60'
                    : `${themeColor} hover:brightness-110`
            }`}
        >
            {children}
        </motion.button>
    );
};

interface IndicatorProps {
    isActive: boolean;
    theme: ThemeConfig;
    autoDelay: number;
    paused: boolean;
    progressKey: number | string | undefined;
    onClick: () => void;
    ariaLabel: string;
}

const Indicator = ({
    isActive,
    theme,
    autoDelay,
    paused,
    progressKey,
    onClick,
    ariaLabel,
}: IndicatorProps) => {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            layout
            aria-label={ariaLabel}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            style={{ borderRadius: 24 }}
            className={`relative h-1.5 cursor-pointer overflow-hidden focus:outline-none ${
                isActive ? `w-7 ${theme.progress}` : `w-1.5 ${theme.dot}`
            } transition-colors duration-300`}
        >
            {isActive && !paused && (
                <motion.div
                    key={`progress-${progressKey ?? autoDelay}`}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: autoDelay / 1000, ease: 'linear' }}
                    className="bg-foreground-primary absolute inset-0 rounded-full"
                />
            )}
        </motion.button>
    );
};
