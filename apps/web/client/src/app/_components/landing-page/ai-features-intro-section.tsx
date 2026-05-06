import React from 'react';

export function AiFeaturesIntroSection() {
    return (
        <div className="mx-auto w-full max-w-6xl px-8 py-32 text-center">
            <div className="mx-auto max-w-3xl">
                <h2 className="text-foreground-secondary mb-6 text-sm font-medium tracking-wider uppercase">
                    Design on an Infinite Canvas
                </h2>
                <p className="text-foreground-primary mb-8 text-2xl leading-[1.1] font-light text-balance md:text-5xl">
                    Point at what you want. AI knows exactly what you mean.
                </p>
                <p className="text-foreground-secondary mx-auto max-w-xl text-lg text-balance">
                    No more describing "the button in the top right" — just click it. AI is
                    constrained to your design system, so outputs stay on-brand every time.
                </p>
            </div>
        </div>
    );
}
