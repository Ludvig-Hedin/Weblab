'use client';

import { useGetBackground } from '@/hooks/use-get-background';
import { MotionCard } from '@weblab/ui/motion-card';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import useResizeObserver from 'use-resize-observer';
import { FigmaCredentials } from './_components/credentials';
import { FigmaFinalizing } from './_components/finalizing';
import { FigmaSelectFrames } from './_components/select-frames';
import { useFigmaImport } from './_context';

const steps = [<FigmaCredentials key="credentials" />, <FigmaSelectFrames key="select" />, <FigmaFinalizing key="finalizing" />];

const variants = {
    initial: (direction: number) => ({ x: `${120 * direction}%`, opacity: 0 }),
    active: { x: '0%', opacity: 1 },
    exit: (direction: number) => ({ x: `${-120 * direction}%`, opacity: 0 }),
};

const Page = () => {
    const { currentStep } = useFigmaImport();
    const { ref } = useResizeObserver();
    const backgroundUrl = useGetBackground('create');

    return (
        <div className="fixed inset-0">
            <div
                className="relative w-full h-full flex items-center justify-center"
                style={{
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundImage: `url(${backgroundUrl})`,
                }}
            >
                <div className="absolute inset-0 bg-background/50" />
                <div className="relative z-10">
                    <MotionConfig transition={{ duration: 0.5, type: 'spring', bounce: 0 }}>
                        <MotionCard
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="w-[30rem] min-h-[12rem] backdrop-blur-md bg-background/30 overflow-hidden p-0"
                        >
                            <motion.div ref={ref} layout="position" className="flex flex-col">
                                <AnimatePresence mode="popLayout" initial={false}>
                                    <motion.div
                                        key={currentStep}
                                        custom={1}
                                        variants={variants}
                                        initial="initial"
                                        animate="active"
                                        exit="exit"
                                    >
                                        {steps[currentStep]}
                                    </motion.div>
                                </AnimatePresence>
                            </motion.div>
                        </MotionCard>
                    </MotionConfig>
                </div>
            </div>
        </div>
    );
};

export default Page;
