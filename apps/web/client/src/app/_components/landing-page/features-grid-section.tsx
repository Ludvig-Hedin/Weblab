import React from 'react';

import { APP_NAME } from '@weblab/constants';

export function FeaturesGridSection() {
    return (
        <div className="mx-auto w-full max-w-6xl px-8 py-32">
            <div className="grid grid-cols-1 gap-x-16 gap-y-20 md:grid-cols-3">
                <div>
                    <h3 className="text-foreground-secondary text-small mb-4 tracking-wider uppercase">
                        Your Real Components
                    </h3>
                    <p className="text-foreground-primary mb-6 text-lg font-light text-balance md:text-xl">
                        Design with what engineers built
                    </p>
                    <p className="text-foreground-secondary text-regular leading-relaxed text-balance">
                        Use the buttons, cards, and layouts your team already created. Not generic
                        HTML — your actual design system, ready to drag onto the canvas.
                    </p>
                </div>

                <div>
                    <h3 className="text-foreground-secondary text-small mb-4 tracking-wider uppercase">
                        Built for Teams
                    </h3>
                    <p className="text-foreground-primary mb-6 text-lg font-light text-balance md:text-xl">
                        Real-time collaboration
                    </p>
                    <p className="text-foreground-secondary text-regular leading-relaxed text-balance">
                        Share your canvas. Leave spatial comments. Work together on designs that
                        become real PRs. No more "now how do I share this?"
                    </p>
                </div>

                <div>
                    <h3 className="text-foreground-secondary text-small mb-4 tracking-wider uppercase">
                        Ship PRs, Not Prototypes
                    </h3>
                    <p className="text-foreground-primary mb-6 text-lg font-light text-balance md:text-xl">
                        Changes become pull requests
                    </p>
                    <p className="text-foreground-secondary text-regular leading-relaxed text-balance">
                        Your changes become a real pull request. Engineers review and merge — no
                        handoff, no translation, no rebuilding from specs.
                    </p>
                </div>

                <div>
                    <h3 className="text-foreground-secondary text-small mb-4 tracking-wider uppercase">
                        Layer Management
                    </h3>
                    <p className="text-foreground-primary mb-6 text-lg font-light text-balance md:text-xl">
                        Navigate your component tree
                    </p>
                    <p className="text-foreground-secondary text-regular leading-relaxed text-balance">
                        See your React component hierarchy in a visual layer panel. Click any layer
                        to select it on the canvas. No more hunting through JSX.
                    </p>
                </div>

                <div>
                    <h3 className="text-foreground-secondary text-small mb-4 tracking-wider uppercase">
                        Works With Your Codebase
                    </h3>
                    <p className="text-foreground-primary mb-6 text-lg font-light text-balance md:text-xl">
                        Connect existing projects
                    </p>
                    <p className="text-foreground-secondary text-regular leading-relaxed text-balance">
                        Connect your existing React or Next.js project. No rebuilding. No migration.
                        Start designing in minutes.
                    </p>
                </div>

                <div>
                    <h3 className="text-foreground-secondary text-small mb-4 tracking-wider uppercase">
                        Version History
                    </h3>
                    <p className="text-foreground-primary mb-6 text-lg font-light text-balance md:text-xl">
                        Never lose your progress
                    </p>
                    <p className="text-foreground-secondary text-regular leading-relaxed text-balance">
                        {APP_NAME} automatically saves project snapshots. Experiment with confidence
                        — roll back to any previous version with one click.
                    </p>
                </div>
            </div>
        </div>
    );
}
