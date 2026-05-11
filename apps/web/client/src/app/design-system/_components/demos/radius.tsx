'use client';

import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import { Card } from '@weblab/ui/card';
import { Input } from '@weblab/ui/input';
import { cn } from '@weblab/ui/utils';

import { useOverrides } from '../overrides-context';
import { Section } from '../section';
import { RADII, RADIUS_PRESETS } from './data';

export function RadiusDemo() {
    const { radiusScale, setRadiusScale } = useOverrides();
    return (
        <div id="radius">
            <Section
                title="Radius scale"
                tag="radius"
                controls={
                    <div className="flex items-center gap-2">
                        {RADIUS_PRESETS.map((p) => (
                            <button
                                key={p.label}
                                onClick={() => setRadiusScale(p.value)}
                                className={cn(
                                    'rounded px-2 py-1 text-xs transition-colors',
                                    Math.abs(radiusScale - p.value) < 0.05
                                        ? 'text-foreground bg-foreground/10'
                                        : 'text-foreground-tertiary hover:text-foreground',
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                        <input
                            type="range"
                            min={0.05}
                            max={3}
                            step={0.05}
                            value={radiusScale}
                            onChange={(e) => setRadiusScale(parseFloat(e.target.value))}
                            className="w-20 accent-white"
                        />
                        <span className="text-foreground-tertiary w-8 text-right font-mono text-xs">
                            {radiusScale.toFixed(2)}×
                        </span>
                    </div>
                }
            >
                <div className="flex flex-wrap items-end gap-4">
                    {RADII.map((r) => (
                        <div key={r.name} className="flex flex-col items-center gap-2">
                            <div
                                className="bg-foreground/10 border-border h-12 w-12 border"
                                style={{
                                    borderRadius:
                                        r.name === 'full'
                                            ? '9999px'
                                            : `calc(${r.value} * ${radiusScale})`,
                                }}
                            />
                            <p className="text-foreground-tertiary font-mono text-[10px]">
                                {r.name}
                            </p>
                            <p className="text-foreground-tertiary font-mono text-[10px] opacity-60">
                                {r.tailwind}
                            </p>
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Button>Default button</Button>
                    <Button variant="outline">Outline</Button>
                    <Input className="w-48" placeholder="Input field…" />
                    <Badge>Badge</Badge>
                    <Card className="w-40 p-3">
                        <p className="text-foreground text-xs">Card</p>
                    </Card>
                </div>
            </Section>
        </div>
    );
}
