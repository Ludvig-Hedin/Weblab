import { APP_NAME } from '@weblab/constants';

import { ExternalRoutes, Routes } from './index';

export interface NavigationLink {
    title: string;
    href: string;
    description: string;
    external?: boolean;
}

export const PRODUCT_LINKS: NavigationLink[] = [
    {
        title: 'AI',
        href: Routes.FEATURES_AI,
        description: 'AI-powered design',
    },
    {
        title: 'AI for Frontend',
        href: Routes.FEATURES_AI_FRONTEND,
        description: 'AI constrained to your design system',
    },
    {
        title: 'Visual Builder',
        href: Routes.FEATURES_BUILDER,
        description: 'Craft on a canvas',
    },
    {
        title: 'Prototyping',
        href: Routes.FEATURES_PROTOTYPE,
        description: 'Rapid prototype creation',
    },
    {
        title: 'Claude Code',
        href: Routes.WORKFLOWS_CLAUDE_CODE,
        description: 'Visual layer for Claude Code',
    },
    {
        title: 'Vibe Coding',
        href: Routes.WORKFLOWS_VIBE_CODING,
        description: 'Team collaboration for vibe coding',
    },
    {
        title: 'All Features',
        href: Routes.FEATURES,
        description: `See everything ${APP_NAME} offers`,
    },
];

export const RESOURCES_LINKS: NavigationLink[] = [
    {
        title: 'Documentation',
        href: ExternalRoutes.DOCS,
        description: `Learn how to use ${APP_NAME}`,
        external: true,
    },
    {
        title: 'Blog',
        href: Routes.BLOG,
        description: 'News and updates',
    },
    {
        title: 'GitHub',
        href: ExternalRoutes.GITHUB,
        description: 'View the source code',
        external: true,
    },
];

export const ABOUT_LINKS: NavigationLink[] = [
    {
        title: 'About Us',
        href: Routes.ABOUT,
        description: 'Learn about our mission',
    },
    {
        title: 'FAQ',
        href: Routes.FAQ,
        description: 'Common questions',
    },
];

export interface NavigationCategory {
    label: string;
    links: NavigationLink[];
}

export const NAVIGATION_CATEGORIES: NavigationCategory[] = [
    { label: 'Product', links: PRODUCT_LINKS },
    { label: 'Resources', links: RESOURCES_LINKS },
    { label: 'About', links: ABOUT_LINKS },
];
