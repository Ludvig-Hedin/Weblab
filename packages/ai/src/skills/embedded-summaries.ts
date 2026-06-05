/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: <repoRoot>/skills/<name>/SKILL.md (frontmatter only).
 * Regenerate via `bun run generate:skills` from packages/ai.
 *
 * Client-safe: name + description ONLY — no skill bodies — so importing this
 * into the browser bundle (e.g. the Skills settings tab) does NOT ship the full
 * skill content, which can be hundreds of KB across all built-ins.
 *
 * Generated at: 2026-06-05T20:16:20.376Z
 * Skill count:  12
 */
import type { SkillSummary } from './types';

export const EMBEDDED_SKILL_SUMMARIES: ReadonlyArray<SkillSummary> = [
    {
        "name": "accessibility",
        "description": "Apply WCAG 2.2 AA — semantic HTML, keyboard navigation, focus management, ARIA only when needed, color contrast, screen-reader behavior."
    },
    {
        "name": "apple-design",
        "description": "Design or redesign UIs in Apple's modern aesthetic (iOS 26 / macOS Tahoe / apple.com 2024-2026 era). Use whenever the user asks to create, design, redesign, restyle, beautify, or polish any UI — iOS/macOS apps, SwiftUI views, websites, landing pages, React components, dashboards, or web apps — AND wants an Apple look (mentions Apple, Apple-style, clean, minimal Apple aesthetic, looks like apple.com, iOS design, SwiftUI Liquid Glass, or Human Interface Guidelines). Routes by stack: SwiftUI for iOS/macOS/visionOS with Liquid Glass APIs, React + Tailwind + shadcn/ui for web apps, HTML/CSS for static sites. Encodes Apple's checkable rules: SF Pro typography with exact tracking, semantic color palette with hex codes, 8pt grid spacing, restrained weights (400/500/600 only, no bold), correct corner radii, when Liquid Glass or backdrop-blur is appropriate, and the catalog of almost-Apple-but-not-quite mistakes. Do NOT use for non-Apple aesthetics like Material Design, Fluent, or Carbon."
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
        "name": "design-review",
        "description": "|"
    },
    {
        "name": "frontend-design",
        "description": "Build refined, minimal, product-ready UI on Tailwind + shadcn/ui — restrained palette, tight spacing, intentional typography, no AI-dashboard slop."
    },
    {
        "name": "performance",
        "description": "Make the app fast — Core Web Vitals, bundle size, image/font loading, server vs client boundaries, caching, MobX/React render hygiene."
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
        "name": "ui-ux-pro-max",
        "description": "UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, and HTML/CSS). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, and check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, and mobile app. Elements: button, modal, navbar, sidebar, card, table, form, and chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, and flat design. Topics: color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, and gradient. Integrations: shadcn/ui MCP for component search and examples."
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
