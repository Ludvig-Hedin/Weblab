'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { MoveUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

const heroImage =
    'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/photos/tiny-home/erik-mclean-g3U7sqtdJ1w-unsplash.jpg';

const gridImages2 = [
    'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/photos/tiny-home/erik-mclean-u9-yqtr6YrM-unsplash.jpg',
    'https://deifkwefumgah.cloudfront.net/shadcnblocks/block/photos/tiny-home/erik-mclean-VEaI2ftIV2M-unsplash.jpg',
];

const projectDetails = [
    { label: 'Client', value: 'Private Residence' },
    { label: 'Location', value: 'Østfold, Norway' },
    { label: 'Year', value: '2024' },
    {
        label: 'Scope',
        value: 'Prefab Design, Sustainable Materials, Off-Grid Systems',
    },
] as const;

const FadeUpOnScroll = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const isInView = useInView(ref, { once: true, margin: '-50px' });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay, ease: 'easeOut' }}
        >
            {children}
        </motion.div>
    );
};

interface Project1Props {
    className?: string;
}

const Project1 = ({ className }: Project1Props) => {
    return (
        <section className={cn('py-8 lg:py-32', className)}>
            <div className="container space-y-6">
                <FadeUpOnScroll>
                    <header className="border-b border-slate-200 pb-6 md:pb-8 dark:border-slate-800">
                        <div className="flex flex-row gap-2 md:flex-row md:gap-3">
                            <h1 className="text-3xl text-slate-950 md:text-2xl lg:text-5xl dark:text-slate-50">
                                Project
                            </h1>
                            <h2 className="text-3xl font-light text-slate-500 md:text-2xl lg:text-5xl dark:text-slate-400">
                                Nordic Retreat
                            </h2>
                        </div>
                    </header>
                </FadeUpOnScroll>

                <div className="flex justify-between font-medium">
                    <p className="max-w-3xl leading-relaxed font-medium text-slate-500 dark:text-slate-400">
                        A minimalist sanctuary that embraces hygge living and the quiet beauty of
                        the Scandinavian forest.
                    </p>
                    <a
                        href="#"
                        className="inline-flex items-center gap-1 text-slate-900 hover:underline dark:text-slate-50"
                    >
                        Visit the website <MoveUpRight className="h-4 w-5" />
                    </a>
                </div>

                <FadeUpOnScroll delay={0.15}>
                    <div className="overflow-hidden rounded-sm border border-slate-200 dark:border-slate-800">
                        <img
                            src={heroImage}
                            alt="Scandinavian tiny home with light timber cladding nestled among birch trees."
                            className="aspect-[16/7] w-full object-cover"
                        />
                    </div>
                </FadeUpOnScroll>

                <FadeUpOnScroll delay={0.25}>
                    <div className="flex flex-col items-end justify-end py-4 md:py-6">
                        <div className="space-y-6 lg:w-1/2">
                            <p className="text-sm leading-relaxed text-slate-500 md:text-base lg:text-lg dark:text-slate-400">
                                Nestled among birch and pine on a quiet Norwegian lakeside, this 380
                                sq ft tiny home distills Scandinavian design to its essence. Light
                                timber framing and triple-glazed windows maximize natural light
                                during long winters, while a compact footprint leaves the
                                surrounding forest undisturbed.
                            </p>
                            <p className="text-sm leading-relaxed text-slate-500 md:text-base lg:text-lg dark:text-slate-400">
                                Every square meter is considered—built-in storage, a fold-down
                                dining table, and a sleeping loft create flexible living without
                                compromise. Heated by a single wood-burning stove and powered by
                                rooftop solar, the retreat operates fully off-grid, embodying the
                                Scandinavian values of simplicity and environmental harmony.
                            </p>
                            <div className="space-y-4">
                                {projectDetails.map((detail) => (
                                    <div
                                        key={detail.label}
                                        className="flex flex-col border-b border-slate-200 py-3 text-sm sm:flex-row sm:items-center sm:justify-between md:text-base dark:border-slate-800"
                                    >
                                        <span className="text-xs font-medium text-slate-500 md:text-sm dark:text-slate-400">
                                            {detail.label}
                                        </span>
                                        <span className="font-semibold text-slate-950 dark:text-slate-50">
                                            {detail.value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </FadeUpOnScroll>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:gap-6">
                    {gridImages2.map((src, i) => (
                        <div
                            key={i}
                            className="overflow-hidden rounded-sm border border-slate-200 dark:border-slate-800"
                        >
                            <img
                                src={src}
                                alt={
                                    i === 0
                                        ? 'Compact interior with light wood finishes, built-in seating, and a wood-burning stove.'
                                        : 'Sleeping loft with large skylight window framing views of the forest canopy.'
                                }
                                className="w-full object-cover transition-transform duration-500"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export { Project1 };
