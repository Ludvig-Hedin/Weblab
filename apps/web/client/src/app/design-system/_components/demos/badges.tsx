'use client';

import { Badge } from '@weblab/ui/badge';
import { Icons } from '@weblab/ui/icons';

import { Section } from '../section';

export function BadgesDemo() {
    return (
        <div id="badges">
            <Section
                title="Badge variants"
                tag="badges"
                inspectId="badge"
                filePath="packages/ui/src/components/badge.tsx"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                    <Badge>
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                        Active
                    </Badge>
                    <Badge variant="outline">
                        <Icons.Bookmark className="mr-1 h-3 w-3" />
                        Featured
                    </Badge>
                    <Badge variant="secondary">New</Badge>
                    <Badge variant="secondary">Beta</Badge>
                    <Badge>Pro</Badge>
                </div>
            </Section>
        </div>
    );
}
