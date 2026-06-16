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
        slug: 'v4-5-token-cost-credits',
        version: '4.5',
        title: 'Credits now reflect real usage',
        description:
            'Credits are now metered by the actual model cost of each request instead of a flat one-per-message. A quick edit or autocomplete costs a fraction of a credit, while a long, heavy turn costs more — so light sessions stretch much further and your plan stays fairly priced. Your monthly credit allotment is unchanged; only how fast it draws down now tracks what each request genuinely uses.',
        date: '2026-06-17',
        tags: ['Billing', 'Credits'],
    },
    {
        slug: 'v4-4-ai-wireframes',
        version: '4.4',
        title: 'AI wireframes: from a brief to a real site',
        description:
            'A new Relume-style workflow turns a short brief into a working site. Describe your company, audience, and offer, and Weblab drafts a sitemap in seconds — pages and sections you can rename, reorder, add to, and re-prompt. Click Generate Wireframes and every section is mapped to a real, reusable block from our library and filled with copy specific to you; edit text inline, swap block variants, or regenerate. Generate a style guide (colors, type, radius), apply it, and the Design tab shows your pages fully styled. When you’re happy, hit Create code and Weblab spins up a real Next.js project from your design and opens it in the editor — no throwaway prototypes. It lives in its own workspace so it never gets in the way of the editor.',
        date: '2026-06-13',
        tags: ['AI', 'Wireframes', 'Editor', 'Design'],
    },
    {
        slug: 'v4-3-figma-import',
        version: '4.3',
        title: 'Import your designs straight from Figma',
        description:
            'Import from Figma is live. Paste a Figma file URL, drop in a personal access token, and Weblab pulls the file’s top-level frames so you can pick exactly which ones to bring in. Hit Create Project and we spin up a real Next.js project for you — one editable React component per frame, already wired into the page and ready to build on. No more “coming soon”: the whole flow now works end to end, from frame selection to an open editor.',
        date: '2026-06-13',
        tags: ['Import', 'Figma', 'Editor'],
    },
    {
        slug: 'v4-2-components',
        version: '4.2',
        title: 'Components: master/instance editing, properties, and variants',
        description:
            'Weblab now has a full component system. Select anything and press ⌘⌥K to turn it into a reusable component — your copy becomes the first instance, and suggested properties (headings, images, links) are hoisted automatically. Double-click any instance to edit the main component in place: the rest of the canvas dims, a banner shows how many instances your changes apply to, and Esc takes you back. Each instance gets its own property values in a new panel at the top of the Style tab — text, images, links, numbers, switches, and a variant picker — with one-click reset back to the component default. Add variants (like “dark” or “outline”) without duplicating the component, drop content into slots, or unlink an instance to make it standalone. It works with components you already have: exported React components in imported projects appear in the Components tab automatically, and static-HTML projects get the same system via editor-managed partials.',
        date: '2026-06-12',
        tags: ['Editor', 'Components', 'Design System'],
    },
    {
        slug: 'v4-1-pop-out-preview',
        version: '4.1',
        title: 'Pop the preview out into its own window',
        description:
            'You can now open your live preview in its own browser tab or window — drag it to a second monitor and watch it update while you keep editing. It hot-reloads on every edit, and (for cloud projects) it quietly recovers on its own when the sandbox cold-boots or recycles: instead of a dead page you get a small “Reconnecting” chip and the preview reloads the moment it’s back. There’s an Auto-recover toggle if you’d rather see the raw page, plus a width selector for quick responsive checks. Open it from the new button next to the Preview play control, or “Pop out” from the full-screen preview.',
        date: '2026-06-12',
        tags: ['Editor', 'Preview'],
    },
    {
        slug: 'v4-0-calmer-start-and-drag-drop',
        version: '4.0',
        title: 'A calmer start screen, and drag-and-drop a folder to open it',
        description:
            'The “Start a new project” screen is lighter: a smaller title and a tidy row of icon buttons (hover for details) instead of a wall of large cards. “Start blank” now opens a cleaner dialog where you choose where it runs — Weblab Cloud or, in the desktop app, Local on your machine (Next.js/React or plain HTML) — then pick a stack. And in the desktop app you can now drag a folder straight from Finder into the window, or drop it on the dock icon, to open it as a project (an empty folder starts a fresh one).',
        date: '2026-06-12',
        tags: ['Desktop', 'Design'],
    },
    {
        slug: 'v3-9-cleaner-terminal',
        version: '3.9',
        title: 'A cleaner, more integrated terminal',
        description:
            'The in-editor terminal now reads as a single calm surface instead of a black box floating inside a panel. Output renders directly on the panel background (no more harsh nested card), tabs are quiet text on a flat header, and everything is set in a proper monospace with comfortable line spacing — closer to the terminal in Cursor or VS Code.',
        date: '2026-06-12',
        tags: ['Editor', 'Design'],
    },
    {
        slug: 'v3-8-local-first-desktop',
        version: '3.8',
        title: 'Edit local projects in the desktop app',
        description:
            'The desktop app can now open a folder on your machine and edit it live — the project runs its own dev server locally and renders on the canvas, every change saves straight to disk, and edits you make elsewhere (VS Code, your terminal, an AI CLI) sync back both ways. Create a fresh local project or open an existing one; nothing leaves your machine.',
        date: '2026-06-05',
        tags: ['Desktop', 'Editor'],
    },
    {
        slug: 'v3-7-bigger-component-library',
        version: '3.7',
        title: 'A bigger, on-brand component library',
        description:
            'The AI can now build from 1,500+ vetted components and blocks — every free shadcn/ui, shadcnblocks, and Watermelon UI block, plus a set of premium pro blocks — each with a clear description so it picks the right one. New blank projects also start with the Weblab design tokens already applied, so your site looks intentional from the very first screen.',
        date: '2026-06-05',
        tags: ['AI', 'Design'],
    },
    {
        slug: 'v3-6-on-brand-by-default',
        version: '3.6',
        title: 'On-brand sites by default',
        description:
            'The AI now builds from a curated component library (shadcn/ui + Watermelon UI) and a single design-token palette instead of inventing markup and colors — so generated sites look consistent and deliberate, not like a generic AI template. When it edits an existing site it matches that project’s stack, colors, and fonts. Defaults to Next.js + React + shadcn for new projects.',
        date: '2026-06-05',
        tags: ['AI', 'Design'],
    },
    {
        slug: 'v3-5-standard-text-scale',
        version: '3.5',
        title: 'Crisper, standard-sized text',
        description:
            'The app now renders on a standard 16px type scale, so text is a touch larger and easier to read — and it no longer shrinks for a moment each time a page loads. The Appearance → Font size setting (Small / Medium / Large) now scales every text size together.',
        date: '2026-06-05',
        tags: ['Polish', 'Design'],
    },
    {
        slug: 'v3-4-copy-to-figma',
        version: '3.4',
        title: 'Copy to Figma',
        description:
            'Right-click an element (or select a frame) and choose Copy to Figma — then paste straight into a Figma file as real, editable layers, not a flat screenshot. A Figma button also appears in the frame toolbar and next to a selected element. No plugin required.',
        date: '2026-06-04',
        tags: ['Editor', 'Integration'],
    },
    {
        slug: 'v3-3-element-ai-button',
        version: '3.3',
        title: 'Edit any element with the AI button',
        description:
            'Select an element on the canvas and a small AI button appears at its top-right corner. Click it to describe a change and send it straight to the AI, or add the element to the chat to build a longer request — no hunting for the right panel.',
        date: '2026-06-04',
        tags: ['AI', 'Editor'],
    },
    {
        slug: 'v3-2-readable-workspace-urls',
        version: '3.2',
        title: 'Readable workspace URLs',
        description:
            'Your workspace address now reads like its name — /w/martins-workspace instead of a long random ID. New and existing personal workspaces both pick up the cleaner slug, and old bookmarked links still resolve automatically.',
        date: '2026-06-03',
        tags: ['Workspaces', 'Polish'],
    },
    {
        slug: 'v3-1-folder-github-import',
        version: '3.1',
        title: 'Import a local folder or a GitHub repo',
        description:
            'Two more ways to start a project are back: import a local folder (your files upload into a fresh cloud workspace) or import a public GitHub repository by URL. Both drop you straight into the editor.',
        date: '2026-06-03',
        tags: ['Create', 'Import'],
    },
    {
        slug: 'v3-0-clone-website',
        version: '3.0',
        title: 'Clone any website into an editable project',
        description:
            'Cloning is back. Paste a URL (or drop a screenshot) and Weblab reads the page, spins up a sandbox, and hands the layout, content, and a screenshot to the AI to rebuild as an editable Next.js or static-HTML project. Pick the output stack and add notes to steer the result.',
        date: '2026-06-03',
        tags: ['AI', 'Create'],
    },
    {
        slug: 'v2-9-settings-polish-folders',
        version: '2.9',
        title: 'Dark-mode favicons, folders in settings, and a cleaner look',
        description:
            'Upload a separate favicon for dark mode in the Site tab — visitors see the version that fits their color scheme. Organize a project into a folder right from its settings (the same folders as your projects dashboard). And the settings modal reads cleaner: the active tab is now full-contrast and section subtitles are less muted.',
        date: '2026-06-03',
        tags: ['Settings', 'Design'],
    },
    {
        slug: 'v2-8-project-settings',
        version: '2.8',
        title: 'More in project settings',
        description:
            'Project settings grew up. A new Overview shows your Site ID, page count, and when the site was last published, updated, and created. A new Site Access tab lets you invite people by email, set their role (manager, editor, reviewer, viewer), and remove members. And a new SEO tab gives you editors for robots.txt (with one-click crawler and AI-bot controls), llms.txt, and a custom sitemap.xml — written straight into your site so search engines and AI assistants see them.',
        date: '2026-06-02',
        tags: ['Settings', 'Collaboration', 'SEO'],
    },
    {
        slug: 'v2-7-settings-refined',
        version: '2.7',
        title: 'Settings, refined',
        description:
            'Project settings got a cleanup pass. Claim your free Weblab domain right in the Domain tab — pick your <name>.weblab.app subdomain and save it. Upgrade prompts are now calm and monochrome with one clear button, instead of the old high-contrast callout. The Appearance, Language, Editor, and Domain tabs are translated (Swedish included), so switching language updates them live. Form spacing is tidied throughout, and the Density toggle that did nothing is gone.',
        date: '2026-06-02',
        tags: ['Settings', 'Domains', 'i18n', 'Design'],
    },
    {
        slug: 'v2-6-terminal-tabs-ai',
        version: '2.6',
        title: 'A real terminal in the editor',
        description:
            'The editor terminal got a full upgrade. Open it and the bottom toolbar stays put — the terminal opens as a window right below it. Type commands directly in the input below the tabs, open multiple terminal tabs with the + button, close and drag-reorder them, and drag the top edge to resize the panel height. Flip on AI mode to describe what you want in plain language and let it write the command for you (it previews first, so you press Enter to run — switch to auto-run in settings).',
        date: '2026-06-02',
        tags: ['Editor', 'Terminal', 'AI'],
    },
    {
        slug: 'v2-5-desktop-app',
        version: '2.5',
        title: 'Weblab for desktop',
        description:
            'The desktop app is now available to download for macOS, with Windows and Linux builds published alongside it. Sign in with Google, GitHub, Vercel, or email — auth hands off to your real browser and lands you straight back in the app. Drag the window from anywhere along the top to move it. Get it from the Download page.',
        date: '2026-06-01',
        tags: ['Desktop', 'Auth', 'Release'],
    },
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
