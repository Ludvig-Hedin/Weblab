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
        slug: 'v1-9-assets-panel',
        version: '1.9',
        title: 'Assets Panel',
        description:
            'The Images panel is now Assets and accepts any file type: PDFs, fonts, and documents, not just images. A Webflow-style sidebar with type filters and a folder tree replaces breadcrumb navigation, alongside a designed drop zone, right-click menus, copy URL, folder creation, move-to-folder, in-place compression, sorting, and multi-select bulk actions.',
        date: '2026-05-14',
        tags: ['Editor', 'Assets', 'UX', 'Files'],
    },
    {
        slug: 'v1-8-security-page',
        version: '1.8',
        title: 'Security & Compliance Page',
        description:
            'A new /security page explains how Weblab handles your data — encryption in transit, OAuth sign-in, AI training opt-out, named subprocessors, and our compliance posture. A minimal cookie consent toast now gates analytics and feedback tools so nothing loads before you agree.',
        date: '2026-05-12',
        tags: ['Security', 'Compliance', 'Trust', 'GDPR'],
    },
    {
        slug: 'v1-7-chat-polish',
        version: '1.7',
        title: 'Faster, Cleaner AI Chat',
        description:
            'New Fast / Balanced / Deep reasoning control lets you trade thinking time for speed — Fast skips reasoning entirely so simple edits return instantly. Stalled tool calls now show a Retry affordance instead of a frozen spinner. Tighter spacing, calmer thinking blocks, and clearer tool-call states across the chat.',
        date: '2026-05-10',
        tags: ['AI', 'Chat', 'Performance', 'UX'],
    },
    {
        slug: 'v1-6-restore-editor-session',
        version: '1.6',
        title: 'Restore Where You Left Off',
        description:
            'Reload or come back later — the editor reopens with your last frame, breakpoint, and selected element already in place. No hunting through the canvas to pick up where you stopped.',
        date: '2026-05-09',
        tags: ['Editor', 'UX', 'Persistence'],
    },
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
