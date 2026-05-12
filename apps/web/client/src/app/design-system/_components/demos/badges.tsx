'use client';

import { Badge } from '@weblab/ui/badge';
import { Icons } from '@weblab/ui/icons';

import { Section } from '../section';

export function BadgesDemo() {
    return (
        <div id="badges">
            <Section
                title="Variants"
                tag="badges"
                inspectId="badge"
                filePath="packages/ui/src/components/badge.tsx"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <Badge>Default</Badge>
                    <Badge variant="secondary">Secondary</Badge>
                    <Badge variant="outline">Outline</Badge>
                    <Badge variant="destructive">Destructive</Badge>
                </div>
            </Section>

            <Section title="With status dot" tag="badges" inspectId="badge">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                        Online
                    </Badge>
                    <Badge variant="outline">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Away
                    </Badge>
                    <Badge variant="outline">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                        Offline
                    </Badge>
                    <Badge variant="outline">
                        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                        Live
                    </Badge>
                </div>
            </Section>

            <Section title="With icon" tag="badges" inspectId="badge">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge>
                        <Icons.CheckCircled className="mr-1 h-3 w-3" /> Verified
                    </Badge>
                    <Badge variant="secondary">
                        <Icons.Sparkles className="mr-1 h-3 w-3" /> Pro
                    </Badge>
                    <Badge variant="outline">
                        <Icons.Bookmark className="mr-1 h-3 w-3" /> Featured
                    </Badge>
                    <Badge variant="destructive">
                        <Icons.ExclamationTriangle className="mr-1 h-3 w-3" /> Critical
                    </Badge>
                </div>
            </Section>

            <Section title="Counts" tag="badges" inspectId="badge">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="text-foreground-secondary relative inline-flex text-sm">
                        Inbox
                        <Badge className="absolute -top-2 -right-4 h-4 px-1 text-[10px]">12</Badge>
                    </div>
                    <div className="text-foreground-secondary relative inline-flex text-sm">
                        Notifications
                        <Badge
                            variant="destructive"
                            className="absolute -top-2 -right-4 h-4 px-1 text-[10px]"
                        >
                            99+
                        </Badge>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                        v1.6.0
                    </Badge>
                </div>
            </Section>

            <Section title="Semantic statuses" tag="badges" inspectId="badge">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground-success bg-background-success/40 border-success/30 text-mini rounded-md border px-2 py-1">
                        Added · success
                    </span>
                    <span className="text-foreground-warning bg-background-warning/40 border-warning/30 text-mini rounded-md border px-2 py-1">
                        Modified · warning
                    </span>
                    <span className="text-destructive bg-destructive/10 border-destructive/30 text-mini rounded-md border px-2 py-1">
                        Deleted · destructive
                    </span>
                    <span className="text-foreground-brand bg-background-brand/30 border-foreground-brand/30 text-mini rounded-md border px-2 py-1">
                        Brand
                    </span>
                </div>
            </Section>
        </div>
    );
}
