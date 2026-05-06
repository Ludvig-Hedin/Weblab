import React from 'react';

export function FeaturesIntroSection() {
    return (
        <div className="mx-auto w-full max-w-6xl px-8 py-32 text-center">
            <div className="mx-auto max-w-3xl">
                <h2 className="text-foreground-secondary mb-6 text-sm font-medium tracking-wider uppercase">
                    Native Design Tool Features
                </h2>
                <p className="text-foreground-primary mb-8 text-2xl leading-[1.1] font-light text-balance md:text-5xl">
                    Familiar to Designers. Trusted by Engineers.
                </p>
                <p className="text-foreground-secondary mx-auto max-w-xl text-lg text-balance">
                    A canvas that feels intuitive, with real code underneath. Engineers can merge
                    what you create directly — no handoff, no rebuilding.
                </p>
            </div>
        </div>
    );
}
