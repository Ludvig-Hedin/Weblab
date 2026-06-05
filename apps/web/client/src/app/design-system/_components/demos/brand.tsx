'use client';

import { BrandLogo, BrandWordmark } from '@weblab/ui/brand';

import { Section } from '../section';

export function BrandDemo() {
    return (
        <Section
            title="Brand"
            tag="brand"
            id="brand"
            filePath="packages/ui/src/components/brand.tsx"
        >
            <div className="flex flex-wrap items-center gap-8">
                <div className="flex flex-col gap-2">
                    <BrandLogo className="h-4" />
                    <p className="text-foreground-tertiary text-tiny">
                        BrandLogo (symbol + wordmark)
                    </p>
                </div>
                <div className="flex flex-col gap-2">
                    <BrandWordmark className="h-4" />
                    <p className="text-foreground-tertiary text-tiny">
                        BrandWordmark (text only)
                    </p>
                </div>
                {['h-8', 'h-5', 'h-4'].map((h) => (
                    <div key={h} className="flex flex-col items-center gap-2">
                        <BrandLogo className={h} />
                        <p className="text-foreground-tertiary text-tiny">{h}</p>
                    </div>
                ))}
            </div>
        </Section>
    );
}
