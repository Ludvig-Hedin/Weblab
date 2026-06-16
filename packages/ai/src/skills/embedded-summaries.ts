/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: <repoRoot>/skills/<name>/SKILL.md (frontmatter only).
 * Regenerate via `bun run generate:skills` from packages/ai.
 *
 * Client-safe: name + description ONLY — no skill bodies — so importing this
 * into the browser bundle (e.g. the Skills settings tab) does NOT ship the full
 * skill content, which can be hundreds of KB across all built-ins.
 *
 * Generated at: 2026-06-16T18:10:06.068Z
 * Skill count:  27
 */
import type { SkillSummary } from './types';

export const EMBEDDED_SKILL_SUMMARIES: ReadonlyArray<SkillSummary> = [
    {
        "name": "accessibility",
        "description": "Apply WCAG 2.2 AA — semantic HTML, keyboard navigation, focus management, ARIA only when needed, color contrast, screen-reader behavior."
    },
    {
        "name": "ai-slop-audit",
        "description": "Detect and fix \"AI slop\" in web interfaces — the generic, templated, machine-averaged look (Inter on slate, purple gradients, three rounded icon-cards, everything centered, shadcn defaults, drop-shadow spam). Use this whenever the user asks to audit, review, or critique a UI's design quality; asks \"does this look AI-generated / cheap / generic / templated / unfinished\"; says \"de-slop\", \"make it not look like AI made it\", \"why does my site look like every other AI site\"; or shares a screenshot, URL, or frontend code (Tailwind, shadcn, React, HTML, CSS) and wants it judged or improved on craft. Trigger it even when the user does not say the word \"slop\" — any request to assess or raise the visual taste of an existing interface qualifies. Works on rendered output (screenshots, live pages) and on source code, and can both report problems and apply fixes."
    },
    {
        "name": "ai-tells",
        "description": "Reviews any draft for AI writing tells and produces a clean rewrite. Catches vocabulary fingerprints (delve, tapestry, leverage, robust, multifaceted, navigate, foster), structural fingerprints (negative parallelism like \"It's not X, it's Y\", bullet-everything, Title Case headings, adjective triads), tone fingerprints (\"Great question!\", \"I'd be happy to help\", \"In conclusion\"), and punctuation fingerprints (em dash overuse, knowledge-cutoff disclaimers). Use this skill whenever the user asks to humanize, de-AI, edit, polish, or sanity-check writing, including phrases like \"does this sound like ChatGPT\", \"make this less AI\", \"humanize this\", \"edit this draft\", \"remove the AI smell\", \"is this AI-y\", or \"clean this up\". Also trigger when the user pastes a draft and asks for feedback on the writing without naming AI specifically."
    },
    {
        "name": "apple-design",
        "description": "Design or redesign UIs in Apple's modern aesthetic (iOS 26 / macOS Tahoe / apple.com 2024-2026 era). Use whenever the user asks to create, design, redesign, restyle, beautify, or polish any UI — iOS/macOS apps, SwiftUI views, websites, landing pages, React components, dashboards, or web apps — AND wants an Apple look (mentions Apple, Apple-style, clean, minimal Apple aesthetic, looks like apple.com, iOS design, SwiftUI Liquid Glass, or Human Interface Guidelines). Routes by stack: SwiftUI for iOS/macOS/visionOS with Liquid Glass APIs, React + Tailwind + shadcn/ui for web apps, HTML/CSS for static sites. Encodes Apple's checkable rules: SF Pro typography with exact tracking, semantic color palette with hex codes, 8pt grid spacing, restrained weights (400/500/600 only, no bold), correct corner radii, when Liquid Glass or backdrop-blur is appropriate, and the catalog of almost-Apple-but-not-quite mistakes. Do NOT use for non-Apple aesthetics like Material Design, Fluent, or Carbon."
    },
    {
        "name": "beautiful-web-design",
        "description": "Design and build distinctive, high-taste web interfaces that avoid the generic \"AI slop\" look. Use this whenever the user wants to create or redesign any website, landing page, marketing page, dashboard, app UI, or frontend component (React, Vue, Svelte, HTML/CSS, Tailwind, shadcn) — and especially when they say \"make it beautiful\", \"design a site for\", \"build a landing page\", \"redesign this\", or want something that looks intentionally designed rather than templated. Trigger it for frontend generation even when the user does not say the word \"design\", since producing UI is producing design. It commits to one of two named aesthetic directions (soft-modern or editorial-premium), applies operational craft rules, and self-audits against a slop checklist before shipping."
    },
    {
        "name": "benchmark",
        "description": "|"
    },
    {
        "name": "browse",
        "description": "|"
    },
    {
        "name": "bug-hunt",
        "description": ">-"
    },
    {
        "name": "design-audit",
        "description": ">-"
    },
    {
        "name": "design-consultation",
        "description": "|"
    },
    {
        "name": "design-review",
        "description": "|"
    },
    {
        "name": "document-release",
        "description": "|"
    },
    {
        "name": "documentation-sync",
        "description": ""
    },
    {
        "name": "frontend-design",
        "description": "Build refined, minimal, product-ready UI on Tailwind + shadcn/ui — restrained palette, tight spacing, intentional typography, no AI-dashboard slop."
    },
    {
        "name": "inconsistency-hunter",
        "description": "Hunt for inconsistencies across an app's pages/screens, or across multiple versions of an app (web vs macOS vs iOS vs Android). Catches visual/styling drift, UX pattern divergence, copy/label mismatches, logic differences, code pattern violations, and feature parity gaps. Uses a team of specialized sub-agents running in parallel — one each for styling, UX, copy, logic, code patterns, and feature parity. Trigger this whenever the user asks to 'find inconsistencies', 'compare web vs ios', 'audit my app', 'check if pages look the same', 'find UX drift', 'what's different between versions', 'audit cross-platform parity', or any audit of consistency across screens or platforms — even if they don't use the word 'inconsistency'."
    },
    {
        "name": "local-review",
        "description": ">-"
    },
    {
        "name": "nano-banana",
        "description": "REQUIRED for all image generation requests. Generate and edit images using Nano Banana (Gemini CLI). Handles blog featured images, YouTube thumbnails, icons, diagrams, patterns, illustrations, photos, visual assets, graphics, artwork, pictures. Use this skill whenever the user asks to create, generate, make, draw, design, or edit any image or visual content."
    },
    {
        "name": "performance",
        "description": "Make the app fast — Core Web Vitals, bundle size, image/font loading, server vs client boundaries, caching, MobX/React render hygiene."
    },
    {
        "name": "remotion-best-practices",
        "description": "Best practices for Remotion - Video creation in React"
    },
    {
        "name": "review",
        "description": "|"
    },
    {
        "name": "seo",
        "description": "Apply technical and on-page SEO to Next.js App Router pages — metadata, Open Graph, structured data, sitemaps, canonicals, robots, performance signals."
    },
    {
        "name": "shadcn",
        "description": "shadcn/ui design system + the full Weblab component catalog (1500+ free blocks across shadcn/ui, shadcnblocks, Watermelon UI, and local pro blocks). Use when building or editing any UI to pick, install, and style components on-brand instead of hand-writing markup."
    },
    {
        "name": "transitions-dev",
        "description": "Production-ready CSS transitions for web apps. Use when implementing notification badges, dropdowns, modals, panel reveals, page transitions, card resizes, number pop-ins, text swaps, icon swaps, success checks, avatar group hovers, error state shakes, search/input clear, skeleton loaders, shimmer text, sliding tabs, tooltips, or staggered text reveals. Triggers on \"add a transition\", \"animate the dropdown\", \"make the modal open smoothly\", \"swap icon\", \"page slide\", \"stagger animation\", \"open / close transition\", \"make it animate\", \"fade between\", \"success animation\", \"form error\", \"shake on invalid\", \"hover lift\", \"avatar stack hover\", \"clear the search\", \"skeleton loader\", \"loading shimmer\", \"shimmer text\", \"sliding tabs\", \"segmented control\", \"tooltip\", \"reveal text\". Also transitions reveal, transitions review, transitions apply."
    },
    {
        "name": "ui-ux-pro-max",
        "description": "UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, and HTML/CSS). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, and check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, and mobile app. Elements: button, modal, navbar, sidebar, card, table, form, and chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, and flat design. Topics: color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, and gradient. Integrations: shadcn/ui MCP for component search and examples."
    },
    {
        "name": "ux-assesment",
        "description": "Perform a UX assessment of the app or a specific area."
    },
    {
        "name": "ux-polish",
        "description": ">-"
    },
    {
        "name": "vercel-react-best-practices",
        "description": "React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements."
    }
];
