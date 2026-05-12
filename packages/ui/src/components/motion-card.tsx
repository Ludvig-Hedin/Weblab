import type { HTMLMotionProps } from 'motion/react';
import * as React from 'react';
import { motion } from 'motion/react';

import { cn } from '../utils';

type MotionDivProps = HTMLMotionProps<'div'>;

const MotionCard = React.forwardRef<HTMLDivElement, MotionDivProps>(
    ({ className, style, ...props }, ref) => (
        <motion.div
            ref={ref}
            className={cn('relative', className)}
            style={{
                borderRadius: '12px',
                backdropFilter: 'blur(12px)',
                backgroundColor: 'color-mix(in srgb, var(--background) 60%, transparent)',
                boxShadow: `
                    0px 0px 0px 0.5px color-mix(in srgb, var(--foreground) 20%, transparent)
                `,
                color: 'var(--card-foreground)',
                ...style,
            }}
            {...props}
            data-oid="1a22abbb5e"
        >
            {props.children}
        </motion.div>
    ),
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
