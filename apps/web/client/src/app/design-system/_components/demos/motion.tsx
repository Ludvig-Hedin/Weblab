'use client';

import { Icons } from '@weblab/ui/icons';
import { MotionCard } from '@weblab/ui/motion-card';
import { ShineBorder } from '@weblab/ui/shine-border';
import { cn } from '@weblab/ui/utils';

import { useOverrides } from '../overrides-context';
import { Section } from '../section';

export function MotionDemo() {
    const { transitionSpeed, setTransitionSpeed } = useOverrides();
    return (
        <div id="motion">
            <Section
                title="Transitions"
                tag="motion"
                controls={
                    <div className="flex items-center gap-2">
                        <span className="text-foreground-tertiary text-xs">speed</span>
                        <input
                            type="range"
                            min={0.1}
                            max={5}
                            step={0.1}
                            value={transitionSpeed}
                            onChange={(e) => setTransitionSpeed(parseFloat(e.target.value))}
                            className="w-20 accent-white"
                        />
                        <span className="text-foreground-tertiary w-8 text-right font-mono text-xs">
                            {transitionSpeed.toFixed(1)}×
                        </span>
                        {transitionSpeed !== 1 && (
                            <button
                                onClick={() => setTransitionSpeed(1)}
                                className="text-foreground-tertiary hover:text-foreground text-tiny transition-colors"
                            >
                                reset
                            </button>
                        )}
                    </div>
                }
            >
                <div className="flex flex-wrap gap-4">
                    {[
                        {
                            label: 'color',
                            cls: 'bg-background-secondary hover:bg-foreground/10',
                            prop: 'background-color',
                        },
                        {
                            label: 'scale',
                            cls: 'bg-background-secondary hover:scale-105',
                            prop: 'transform',
                        },
                        {
                            label: 'opacity',
                            cls: 'bg-background-secondary hover:opacity-30',
                            prop: 'opacity',
                        },
                    ].map(({ label, cls, prop }) => (
                        <div
                            key={label}
                            className={cn(
                                'border-border text-foreground-tertiary flex h-20 w-36 cursor-default items-center justify-center rounded-xl border text-xs',
                                cls,
                            )}
                            style={{
                                transitionDuration: `var(--ds-anim-duration, 300ms)`,
                                transitionTimingFunction: 'ease-in-out',
                                transitionProperty: prop,
                            }}
                        >
                            {label}
                        </div>
                    ))}
                    <div className="border-border bg-background-secondary flex h-20 w-36 items-center justify-center gap-2 rounded-xl border">
                        <Icons.LoadingSpinner
                            className="text-foreground-tertiary h-5 w-5 animate-spin"
                            style={
                                {
                                    animationDuration: `var(--ds-anim-duration, 300ms)`,
                                } as React.CSSProperties
                            }
                        />
                        <span className="text-foreground-tertiary text-xs">spinner</span>
                    </div>
                </div>
                <p className="text-foreground-tertiary mt-3 text-xs">
                    Duration:{' '}
                    <span className="font-mono">{Math.round(transitionSpeed * 300)}ms</span>
                </p>
            </Section>

            <Section
                title="Motion card"
                tag="motion"
                inspectId="motion-card"
                filePath="packages/ui/src/components/motion-card.tsx"
            >
                <MotionCard className="w-64 p-4">
                    <p className="text-foreground text-sm font-medium">Motion card</p>
                    <p className="text-foreground-tertiary mt-1 text-xs">
                        Tilts on hover for tactile feedback.
                    </p>
                </MotionCard>
            </Section>

            <Section
                title="Shine border"
                tag="motion"
                inspectId="shine-border"
                filePath="packages/ui/src/components/shine-border.tsx"
            >
                <ShineBorder autoShine borderRadius={12} className="w-64">
                    <div className="bg-background-secondary rounded-xl p-4">
                        <p className="text-foreground text-sm font-medium">Shine border</p>
                        <p className="text-foreground-tertiary mt-1 text-xs">
                            Animated highlight on the container edge.
                        </p>
                    </div>
                </ShineBorder>
            </Section>
        </div>
    );
}
