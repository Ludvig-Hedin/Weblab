import type { HTMLMotionProps } from 'motion/react';
import * as React from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

import { cn } from '../utils';

type MotionDivProps = HTMLMotionProps<'div'>;

type MotionCardProps = MotionDivProps & {
    /**
     * 3D pointer-tracking tilt on hover. Defaults to `true` (preserves the
     * marketing/pricing card flourish). Pass `false` for flat product surfaces
     * such as the import/setup cards, where the tilt reads as gimmicky.
     */
    tilt?: boolean;
};

const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
    ({ className, style, onMouseMove, onMouseLeave, tilt = true, ...props }, ref) => {
        const x = useMotionValue(0);
        const y = useMotionValue(0);

        const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), {
            stiffness: 300,
            damping: 30,
        });
        const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), {
            stiffness: 300,
            damping: 30,
        });

        function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
            if (tilt) {
                const rect = e.currentTarget.getBoundingClientRect();
                x.set((e.clientX - rect.left) / rect.width - 0.5);
                y.set((e.clientY - rect.top) / rect.height - 0.5);
            }
            onMouseMove?.(e);
        }

        function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
            if (tilt) {
                x.set(0);
                y.set(0);
            }
            onMouseLeave?.(e);
        }

        return (
            <motion.div
                ref={ref}
                className={cn('relative', className)}
                style={{
                    borderRadius: '12px',
                    backdropFilter: 'blur(12px)',
                    backgroundColor: 'color-mix(in srgb, var(--background) 60%, transparent)',
                    boxShadow: `0px 0px 0px 0.5px color-mix(in srgb, var(--foreground) 20%, transparent)`,
                    color: 'var(--card-foreground)',
                    // Only enable the 3D transform context when tilting — a static
                    // perspective/preserve-3d on a flat card can subtly blur text.
                    ...(tilt
                        ? {
                              rotateX,
                              rotateY,
                              transformStyle: 'preserve-3d',
                              perspective: 800,
                          }
                        : {}),
                    ...style,
                }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                {...props}
                data-oid="1a22abbb5e"
            >
                {props.children}
            </motion.div>
        );
    },
);
MotionCard.displayName = 'MotionCard';

const MotionCardHeader = React.forwardRef<HTMLDivElement, MotionDivProps>(
    ({ className, ...props }, ref) => (
        <motion.div
            ref={ref}
            className={cn('flex flex-col space-y-1.5 p-6', className)}
            {...props}
            data-oid="2ebc7c2f1e"
        />
    ),
);
MotionCardHeader.displayName = 'MotionCardHeader';

const MotionCardTitle = React.forwardRef<HTMLHeadingElement, HTMLMotionProps<'h3'>>(
    ({ className, ...props }, ref) => (
        <motion.h3
            ref={ref}
            className={cn('text-title3', className)}
            {...props}
            data-oid="91c749058d"
        />
    ),
);
MotionCardTitle.displayName = 'MotionCardTitle';

const MotionCardDescription = React.forwardRef<HTMLParagraphElement, HTMLMotionProps<'p'>>(
    ({ className, ...props }, ref) => (
        <motion.p
            ref={ref}
            className={cn('text-regular text-muted-foreground', className)}
            {...props}
            data-oid="b7b9cffcd3"
        />
    ),
);
MotionCardDescription.displayName = 'MotionCardDescription';

const MotionCardContent = React.forwardRef<HTMLDivElement, MotionDivProps>(
    ({ className, ...props }, ref) => (
        <motion.div
            ref={ref}
            className={cn('p-6 pt-0', className)}
            {...props}
            data-oid="1bc88a6b65"
        />
    ),
);
MotionCardContent.displayName = 'MotionCardContent';

const MotionCardFooter = React.forwardRef<HTMLDivElement, MotionDivProps>(
    ({ className, ...props }, ref) => (
        <motion.div
            ref={ref}
            className={cn('flex items-center p-6 pt-0', className)}
            {...props}
            data-oid="2348fed6bc"
        />
    ),
);
MotionCardFooter.displayName = 'MotionCardFooter';

export {
    MotionCard,
    MotionCardContent,
    MotionCardDescription,
    MotionCardFooter,
    MotionCardHeader,
    MotionCardTitle,
};
