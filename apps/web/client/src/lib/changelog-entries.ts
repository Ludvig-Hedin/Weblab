export interface ChangelogEntry {
    slug: string;
    version: string;
    title: string;
    description: string;
    date: string;
    tags: string[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
    {
        slug: 'v1-5-ai-component-generation',
        version: '1.5',
        title: 'AI Component Generation',
        description:
            'Describe a UI component in plain English and Weblab generates production-ready code — fully typed, styled with your design tokens, and inserted directly into your project.',
        date: '2026-05-01',
        tags: ['AI', 'Components', 'Code Generation'],
    },
    {
        slug: 'v1-4-github-sync',
        version: '1.4',
        title: 'GitHub Sync',
        description:
            'Connect any project to a GitHub repository. Changes made in Weblab are committed automatically, and you can pull upstream updates without leaving the editor.',
        date: '2026-04-01',
        tags: ['GitHub', 'Version Control', 'Collaboration'],
    },
    {
        slug: 'v1-3-component-library',
        version: '1.3',
        title: 'Component Library',
        description:
            'Browse, search, and insert components from shadcn/ui, Radix, and your own design system — directly from the sidebar. No copy-pasting, no manual installs.',
        date: '2026-03-01',
        tags: ['Components', 'Design System', 'UI'],
    },
    {
        slug: 'v1-2-live-collaboration',
        version: '1.2',
        title: 'Live Collaboration',
        description:
            "Multiple people can now edit the same project at the same time. See teammates' cursors, selections, and changes in real time — like Figma, but for code.",
        date: '2026-02-01',
        tags: ['Collaboration', 'Real-time', 'Teams'],
    },
    {
        slug: 'v1-1-weblab-launch',
        version: '1.1',
        title: 'Weblab is Live',
        description:
            'The visual-first web development platform is officially out of private beta. Build, design, and deploy web apps by editing them directly in the browser.',
        date: '2026-01-01',
        tags: ['Launch', 'Platform'],
    },
];
