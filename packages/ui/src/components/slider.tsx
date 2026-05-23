'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '../utils';

function Slider({
    className,
    defaultValue,
    value,
    min = 0,
    max = 100,
    ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
    const _values = React.useMemo(
        () =>
            Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max],
        [value, defaultValue, min, max],
    );

    return (
        <SliderPrimitive.Root
            data-slot="slider"
            defaultValue={defaultValue}
            value={value}
            min={min}
            max={max}
            className={cn(
                'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
                className,
            )}
            {...props}
            data-oid="a29b54e55b"
        >
            <SliderPrimitive.Track
                data-slot="slider-track"
                className={cn(
                    'bg-background-tertiary relative grow overflow-hidden rounded-full shadow-inner data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1',
                )}
                data-oid="365a1918a4"
            >
                <SliderPrimitive.Range
                    data-slot="slider-range"
                    className={cn(
                        'bg-foreground-brand absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
                    )}
                    data-oid="ba9aa7d525"
                />
            </SliderPrimitive.Track>
            {Array.from({ length: _values.length }, (_, index) => (
                <SliderPrimitive.Thumb
                    data-slot="slider-thumb"
                    key={index}
                    className="ring-foreground-brand/30 block size-3.5 shrink-0 rounded-full border-0 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.6),0_0_0_0.5px_rgba(0,0,0,0.4)] transition-all hover:scale-110 hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    data-oid="866459c667"
                />
            ))}
        </SliderPrimitive.Root>
    );
}

export { Slider };
