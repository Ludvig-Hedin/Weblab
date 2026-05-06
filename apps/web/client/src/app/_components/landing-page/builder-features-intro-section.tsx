import React from 'react';

export function BuilderFeaturesIntroSection() {
    return (
        <div className="mx-auto w-full max-w-6xl px-8 py-32 text-center">
            <div className="mx-auto max-w-3xl">
                <h2 className="text-foreground-secondary mb-6 text-sm font-medium tracking-wider uppercase">
                    Works With Your Codebase
                </h2>
                <p className="text-foreground-primary mb-8 text-2xl leading-[1.1] font-light text-balance md:text-5xl">
                    Connect Your Existing Project. Start Designing in Minutes.
                </p>
                <p className="text-foreground-secondary mx-auto max-w-xl text-lg text-balance">
                    No rebuilding. No migration. Connect your React, Next.js, or Vue project and
                    design with your real components — the ones your engineers already built.
                </p>
            </div>
        </div>
    );
}
