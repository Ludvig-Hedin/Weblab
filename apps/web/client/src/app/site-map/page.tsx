'use client';

import { useEffect, useRef, useState } from 'react';

import { Icons } from '@weblab/ui/icons';

import { ExternalRoutes, Routes } from '@/utils/constants';
import { WebsiteLayout } from '../_components/website-layout';

interface SitemapLink {
    title: string;
    href: string;
    description: string;
    external?: boolean;
}

interface SitemapSection {
    title: string;
    anchor: string;
    links: SitemapLink[];
}

const sitemapSections: SitemapSection[] = [
    {
        title: 'Main Pages',
        anchor: 'main',
        links: [
            {
                title: 'Home',
                href: Routes.HOME,
                description:
                    'Weblab homepage — design with your real components and ship PRs, not prototypes. AI-powered visual editor for frontend development.',
            },
            {
                title: 'Pricing',
                href: Routes.PRICING,
                description: 'Weblab pricing plans and tiers for individuals and teams.',
            },
            {
                title: 'About',
                href: Routes.ABOUT,
                description: 'Meet the team behind Weblab. Our mission, values, and story.',
            },
            {
                title: 'FAQ',
                href: Routes.FAQ,
                description:
                    'Frequently asked questions about Weblab features, compatibility, and workflow.',
            },
        ],
    },
    {
        title: 'Features',
        anchor: 'features',
        links: [
            {
                title: 'All Features',
                href: Routes.FEATURES,
                description:
                    'Overview of all Weblab features — infinite canvas, AI, collaboration, and more.',
            },
            {
                title: 'AI',
                href: Routes.FEATURES_AI,
                description: 'AI-powered visual editing constrained to your design system.',
            },
            {
                title: 'AI for Frontend',
                href: Routes.FEATURES_AI_FRONTEND,
                description:
                    'Build frontend UIs with AI using your real React, Vue, or Angular components.',
            },
            {
                title: 'Visual Builder',
                href: Routes.FEATURES_BUILDER,
                description: 'Design with your real components on an infinite canvas.',
            },
            {
                title: 'Prototyping',
                href: Routes.FEATURES_PROTOTYPE,
                description: 'Generate functional React prototypes with real interactions.',
            },
        ],
    },
    {
        title: 'Workflows',
        anchor: 'workflows',
        links: [
            {
                title: 'All Workflows',
                href: Routes.WORKFLOWS,
                description: 'Connect Weblab to your existing AI coding tools.',
            },
            {
                title: 'Claude Code',
                href: Routes.WORKFLOWS_CLAUDE_CODE,
                description: 'Add a visual canvas to your Claude Code workflow.',
            },
            {
                title: 'Vibe Coding',
                href: Routes.WORKFLOWS_VIBE_CODING,
                description: 'Team collaboration for vibe coding workflows.',
            },
        ],
    },
    {
        title: 'Resources',
        anchor: 'resources',
        links: [
            {
                title: 'Documentation',
                href: ExternalRoutes.DOCS,
                description: 'Learn how to use Weblab with guides and API references.',
                external: true,
            },
            {
                title: 'Blog',
                href: Routes.BLOG,
                description: 'News, updates, and insights from the Weblab team.',
            },
            {
                title: 'GitHub',
                href: ExternalRoutes.GITHUB,
                description: 'Browse the open-source codebase, contribute, or report issues.',
                external: true,
            },
        ],
    },
    {
        title: 'Social',
        anchor: 'social',
        links: [
            {
                title: 'LinkedIn',
                href: ExternalRoutes.LINKEDIN,
                description: 'Connect with Weblab on LinkedIn.',
                external: true,
            },
            {
                title: 'YouTube',
                href: ExternalRoutes.YOUTUBE,
                description: 'Watch tutorials, demos, and product updates.',
                external: true,
            },
            {
                title: 'Substack',
                href: ExternalRoutes.SUBSTACK,
                description: 'Subscribe to our newsletter for in-depth articles.',
                external: true,
            },
        ],
    },
    {
        title: 'Legal',
        anchor: 'legal',
        links: [
            {
                title: 'Terms of Service',
                href: '/terms-of-service',
                description: 'Weblab terms of service and usage agreement.',
            },
            {
                title: 'Privacy Policy',
                href: '/privacy-policy',
                description: 'How we collect, use, and protect your data.',
            },
        ],
    },
];

function SitemapLinkItem({ link }: { link: SitemapLink }) {
    return (
        <a
            href={link.href}
            target={link.external ? '_blank' : undefined}
            rel={link.external ? 'noopener noreferrer' : undefined}
            className="group border-foreground-primary/10 block border-b py-4 last:border-b-0"
        >
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-foreground-primary text-lg group-hover:underline">
                            {link.title}
                        </span>
                        {link.external && (
                            <Icons.ExternalLink className="text-foreground-tertiary h-4 w-4" />
                        )}
                    </div>
                    <p className="text-foreground-secondary text-regular mt-1">
                        {link.description}
                    </p>
                </div>
                <Icons.ArrowRight className="text-foreground-tertiary group-hover:text-foreground-primary h-5 w-5 transition-colors" />
            </div>
        </a>
    );
}

export default function SitemapPage() {
    const [currentSection, setCurrentSection] = useState(sitemapSections[0]?.anchor || '');
    const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleScroll = () => {
            const offset = 120;
            let activeIdx = 0;
            for (let i = 0; i < sectionRefs.current.length; i++) {
                const ref = sectionRefs.current[i];
                if (ref) {
                    const top = ref.getBoundingClientRect().top;
                    if (top <= offset) {
                        activeIdx = i;
                    }
                }
            }
            if (
                sitemapSections[activeIdx]?.anchor &&
                sitemapSections[activeIdx]?.anchor !== currentSection
            ) {
                setCurrentSection(sitemapSections[activeIdx]?.anchor || '');
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, [currentSection]);

    const scrollToSection = (anchor: string) => {
        const element = document.getElementById(anchor);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <WebsiteLayout showFooter={true}>
            {/* Hidden AI-friendly summary — single paragraph, no duplicated headings */}
            <section className="sr-only" aria-label="Sitemap Summary">
                <p>
                    Complete sitemap for Weblab.com — the AI-powered visual editor for frontend
                    development. Browse all pages including features, workflows, resources, and
                    documentation.
                </p>
            </section>

            <div className="mx-auto w-full max-w-6xl px-4 py-32 md:px-8">
                <h1 className="text-foreground-primary mb-8 max-w-3xl text-5xl leading-[1.1] font-light text-balance md:text-6xl">
                    Sitemap
                </h1>
                <p className="text-foreground-secondary mb-16 max-w-2xl text-lg">
                    Browse all pages on Weblab.build.
                </p>

                <div className="flex flex-col gap-12 lg:flex-row" ref={containerRef}>
                    {/* Sidebar Navigation */}
                    <nav className="sticky top-32 hidden w-48 flex-shrink-0 self-start lg:block">
                        <div>
                            <h2 className="text-foreground-tertiary mb-4 text-sm font-medium">
                                Sections
                            </h2>
                            <ul className="flex flex-col gap-2">
                                {sitemapSections.map((section) => (
                                    <li key={section.anchor}>
                                        <button
                                            onClick={() => scrollToSection(section.anchor)}
                                            className={`text-left text-sm transition-colors ${
                                                currentSection === section.anchor
                                                    ? 'text-foreground-primary'
                                                    : 'text-foreground-tertiary hover:text-foreground-secondary'
                                            }`}
                                        >
                                            {section.title}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </nav>

                    {/* Sitemap Content */}
                    <section className="max-w-[800px] flex-1">
                        {sitemapSections.map((section, i) => (
                            <div
                                key={section.anchor}
                                id={section.anchor}
                                className="mb-16 scroll-mt-24"
                                ref={(el) => {
                                    sectionRefs.current[i] = el;
                                }}
                            >
                                <h2 className="text-foreground-primary mb-6 text-2xl font-medium">
                                    {section.title}
                                </h2>
                                <div className="flex flex-col">
                                    {section.links.map((link) => (
                                        <SitemapLinkItem key={link.href} link={link} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>
                </div>
            </div>
        </WebsiteLayout>
    );
}
