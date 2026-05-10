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
    themes?: ThemeConfig[];
    currentIndex: number;
    onIndexChange: (index: number) => void;
}

const DEFAULT_TOTAL_SLIDES = 4;
const DEFAULT_AUTO_DELAY = 5000;

const DEFAULT_THEME: ThemeConfig = {
    button: 'bg-foreground-primary text-background',
    dot: 'bg-foreground-primary/25',
    progress: 'bg-foreground-primary/25',
};

export const CarouselNavigator: FC<CarouselNavigatorProps> = ({
    totalSlides = DEFAULT_TOTAL_SLIDES,
    autoDelay = DEFAULT_AUTO_DELAY,
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
        <motion.div className="border-foreground-primary/10 bg-background-weblab/60 inline-flex items-center justify-center gap-1 rounded-full border px-3 py-2 font-sans backdrop-blur-md transition-colors duration-300">
            <ArrowButton onClick={goPrev} themeColor={theme.button}>
                <ChevronLeft size={18} strokeWidth={2.5} />
            </ArrowButton>

            <div className="flex items-center gap-2 px-2">
                {Array.from({ length: totalSlides }).map((_, i) => (
                    <Indicator
                        key={i}
                        isActive={i === currentIndex}
                        theme={theme}
                        autoDelay={autoDelay}
                        onClick={() => onIndexChange(i)}
                    />
                ))}
            </div>

            <ArrowButton onClick={goNext} themeColor={theme.button}>
                <ChevronRight size={18} strokeWidth={2.5} />
            </ArrowButton>
        </motion.div>
    );
};

interface ArrowButtonProps {
    children: React.ReactNode;
    onClick: () => void;
    themeColor: string;
    disabled?: boolean;
}

const ArrowButton = ({ children, onClick, themeColor, disabled }: ArrowButtonProps) => {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            whileTap={{ scale: 0.92 }}
            disabled={disabled}
            className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full font-sans shadow-sm transition-colors duration-300 ${
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
    onClick: () => void;
}

const Indicator = ({ isActive, theme, autoDelay, onClick }: IndicatorProps) => {
    return (
        <motion.button
            type="button"
            onClick={onClick}
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ borderRadius: 24 }}
            className={`relative h-2 cursor-pointer overflow-hidden focus:outline-none ${
                isActive ? `w-10 ${theme.progress}` : `w-2 ${theme.dot}`
            } transition-colors duration-300`}
        >
            {isActive && (
                <motion.div
                    key={`progress-${autoDelay}`}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: autoDelay / 1000, ease: 'linear' }}
                    className="bg-foreground-primary absolute inset-0 rounded-full"
                />
            )}
        </motion.button>
    );
};
