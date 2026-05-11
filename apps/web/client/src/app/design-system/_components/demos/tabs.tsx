'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';

import { Section } from '../section';

export function TabsDemo() {
    return (
        <div id="tabs">
            <Section
                title="Tabs"
                tag="tabs"
                inspectId="tabs"
                filePath="packages/ui/src/components/tabs.tsx"
            >
                <Tabs defaultValue="overview" className="w-full max-w-lg">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                        <TabsTrigger value="analytics">Analytics</TabsTrigger>
                        <TabsTrigger value="disabled" disabled>
                            Disabled
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent
                        value="overview"
                        className="text-foreground-secondary mt-4 text-sm"
                    >
                        Overview tab — summary, recent activity, quick actions.
                    </TabsContent>
                    <TabsContent
                        value="settings"
                        className="text-foreground-secondary mt-4 text-sm"
                    >
                        Settings tab — configure project name, domain, and access.
                    </TabsContent>
                    <TabsContent
                        value="analytics"
                        className="text-foreground-secondary mt-4 text-sm"
                    >
                        Analytics tab — view traffic, conversions, and engagement.
                    </TabsContent>
                </Tabs>
            </Section>
        </div>
    );
}
