'use client';

import { Icons } from '@weblab/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';

import { Section } from '../section';

export function TabsDemo() {
    return (
        <div id="tabs">
            <Section
                title="Default"
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

            <Section title="With icons" tag="tabs" inspectId="tabs">
                <Tabs defaultValue="files" className="w-full max-w-lg">
                    <TabsList>
                        <TabsTrigger value="files">
                            <Icons.File className="mr-1.5 h-3.5 w-3.5" /> Files
                        </TabsTrigger>
                        <TabsTrigger value="commits">
                            <Icons.Commit className="mr-1.5 h-3.5 w-3.5" /> Commits
                        </TabsTrigger>
                        <TabsTrigger value="team">
                            <Icons.Person className="mr-1.5 h-3.5 w-3.5" /> Team
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="files" className="text-foreground-secondary mt-4 text-sm">
                        12 files modified this week.
                    </TabsContent>
                    <TabsContent value="commits" className="text-foreground-secondary mt-4 text-sm">
                        47 commits across 3 branches.
                    </TabsContent>
                    <TabsContent value="team" className="text-foreground-secondary mt-4 text-sm">
                        5 team members active today.
                    </TabsContent>
                </Tabs>
            </Section>

            <Section title="Stretched (full width)" tag="tabs" inspectId="tabs">
                <Tabs defaultValue="a" className="w-full max-w-xl">
                    <TabsList className="w-full">
                        <TabsTrigger value="a" className="flex-1">
                            Account
                        </TabsTrigger>
                        <TabsTrigger value="b" className="flex-1">
                            Password
                        </TabsTrigger>
                        <TabsTrigger value="c" className="flex-1">
                            Notifications
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </Section>
        </div>
    );
}
