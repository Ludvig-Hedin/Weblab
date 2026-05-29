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
        slug: 'v2-4-generate-images-in-chat',
        version: '2.4',
        title: 'Generate images in chat',
        description:
            'The AI can now generate images directly in chat with Nano Banana (Google Gemini) alongside GPT Image. Image generation draws from your usage credits with per-day and per-minute limits, so it stays predictable and never runs away.',
        date: '2026-05-29',
        tags: ['AI', 'Images', 'Chat'],
    },
    {
        slug: 'v2-3-skills-upload-and-built-ins',
        version: '2.3',
        title: 'Upload skills + more built-ins',
        description:
            'Import a skill by dropping in a SKILL.md or a .zip — upload is now the default, with paste and URL still available. The settings Skills tab also explains the All / My skills / This project scopes, and ships more built-in skills enabled by default.',
        date: '2026-05-29',
        tags: ['Skills', 'Settings', 'AI', 'UX'],
    },
    {
        slug: 'v2-2-claude-opus-4-8',
        version: '2.2',
        title: 'Claude Opus 4.8',
        description:
            "Anthropic's newest flagship, Claude Opus 4.8, is now selectable in the model picker — from the hero prompt and in-editor chat alike. The picker also got a polish pass: the real Claude mark replaces the old Anthropic glyph, a clearer hover highlight, and tighter model titles.",
        date: '2026-05-28',
        tags: ['AI', 'Models', 'Chat'],
    },
    {
        slug: 'v2-1-vercel-only-sandbox',
        version: '2.1',
        title: 'Faster sandbox runtime',
        description:
            'New projects now boot on Vercel Sandbox end-to-end. Next.js scaffolds with Turbopack from a pre-baked snapshot when one is configured, and static-HTML projects ship with a built-in serve dev server. The legacy CodeSandbox runtime is archived. Forks and publish are temporarily disabled while we wire the Vercel-native equivalents; existing CodeSandbox-backed projects need to be re-imported to migrate.',
        date: '2026-05-24',
        tags: ['Infra', 'Performance', 'Sandbox'],
    },
    {
        slug: 'v2-0-publish-dropdown-polish',
        version: '2.0',
        title: 'Refined Publish Menu',
        description:
            'The Publish menu got a cleaner pass: one clear primary action, consistent button sizes and pill shapes, tighter width and spacing, and a uniform row treatment for Custom Domain and Advanced Settings. Stronger visual hierarchy makes it obvious what to do next.',
        date: '2026-05-14',
        tags: ['Editor', 'Publish', 'UX', 'Design'],
    },
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
