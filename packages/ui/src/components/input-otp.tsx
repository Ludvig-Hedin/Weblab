'use client';

import * as React from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';
import { MinusIcon } from 'lucide-react';

import { cn } from '../utils';

function InputOTP({
    className,
    containerClassName,
    ...props
}: React.ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
    return (
        <OTPInput
            data-slot="input-otp"
            containerClassName={cn(
                'flex items-center gap-2 has-disabled:opacity-50',
                containerClassName,
            )}
            className={cn('disabled:cursor-not-allowed', className)}
            {...props}
            data-oid="64242d207c"
        />
    );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="input-otp-group"
            className={cn('flex items-center', className)}
            {...props}
            data-oid="a9bdb400c7"
        />
    );
}

function InputOTPSlot({
    index,
    className,
    ...props
}: React.ComponentProps<'div'> & { index: number }) {
    const inputOTPContext = React.useContext(OTPInputContext);
    const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

    return (
        <div
            data-slot="input-otp-slot"
            data-active={isActive}
            className={cn(
                'relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md',
                // Visible background: white in light, slightly elevated surface in dark
                'bg-white dark:bg-[#252525]',
                // Visible border in both modes (dark overrides the near-invisible --border-input default)
                'border-border-input dark:border-[#3a3a3a]',
                // Active: strong neutral border + subtle ring — no blue
                'data-[active=true]:z-10 data-[active=true]:border-foreground data-[active=true]:ring-[2px] data-[active=true]:ring-foreground/10',
                // Error states
                'aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40',
                className,
            )}
            {...props}
            data-oid="63954a9959"
        >
            {char}
            {hasFakeCaret && (
                <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    data-oid="2d62088dba"
                >
                    <div
                        className="animate-caret-blink bg-foreground h-4 w-px duration-1000"
                        data-oid="4957faeafb"
                    />
                </div>
            )}
        </div>
    );
}

function InputOTPSeparator({ ...props }: React.ComponentProps<'div'>) {
    return (
        <div data-slot="input-otp-separator" role="separator" {...props} data-oid="d4d76ed7bd">
            <MinusIcon data-oid="770751e03f" />
        </div>
    );
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot };
