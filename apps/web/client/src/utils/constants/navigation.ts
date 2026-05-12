import { ExternalRoutes, Routes } from './index';

export interface NavigationLink {
    titleKey: string;
    href: string;
    descriptionKey: string;
    external?: boolean;
}

export const PRODUCT_LINKS: NavigationLink[] = [
    {
        titleKey: 'nav.categories.product.links.ai.title',
        href: Routes.FEATURES_AI,
        descriptionKey: 'nav.categories.product.links.ai.description',
    },
    {
        titleKey: 'nav.categories.product.links.aiFrontend.title',
        href: Routes.FEATURES_AI_FRONTEND,
        descriptionKey: 'nav.categories.product.links.aiFrontend.description',
    },
    {
        titleKey: 'nav.categories.product.links.visualBuilder.title',
        href: Routes.FEATURES_BUILDER,
        descriptionKey: 'nav.categories.product.links.visualBuilder.description',
    },
    {
        titleKey: 'nav.categories.product.links.prototyping.title',
        href: Routes.FEATURES_PROTOTYPE,
        descriptionKey: 'nav.categories.product.links.prototyping.description',
    },
    {
        titleKey: 'nav.categories.product.links.claudeCode.title',
        href: Routes.WORKFLOWS_CLAUDE_CODE,
        descriptionKey: 'nav.categories.product.links.claudeCode.description',
    },
    {
        titleKey: 'nav.categories.product.links.vibeCoding.title',
        href: Routes.WORKFLOWS_VIBE_CODING,
        descriptionKey: 'nav.categories.product.links.vibeCoding.description',
    },
    {
        titleKey: 'nav.categories.product.links.allFeatures.title',
        href: Routes.FEATURES,
        descriptionKey: 'nav.categories.product.links.allFeatures.description',
    },
];

export const RESOURCES_LINKS: NavigationLink[] = [
    {
        titleKey: 'nav.categories.resources.links.documentation.title',
        href: ExternalRoutes.DOCS,
        descriptionKey: 'nav.categories.resources.links.documentation.description',
        external: true,
    },
    {
        titleKey: 'nav.categories.resources.links.blog.title',
        href: Routes.BLOG,
        descriptionKey: 'nav.categories.resources.links.blog.description',
    },
    {
        titleKey: 'nav.categories.resources.links.github.title',
        href: ExternalRoutes.GITHUB,
        descriptionKey: 'nav.categories.resources.links.github.description',
        external: true,
    },
];

export const ABOUT_LINKS: NavigationLink[] = [
    {
        titleKey: 'nav.categories.about.links.aboutUs.title',
        href: Routes.ABOUT,
        descriptionKey: 'nav.categories.about.links.aboutUs.description',
    },
    {
        titleKey: 'nav.categories.about.links.faq.title',
        href: Routes.FAQ,
        descriptionKey: 'nav.categories.about.links.faq.description',
    },
    {
        titleKey: 'nav.categories.about.links.security.title',
        href: Routes.SECURITY,
        descriptionKey: 'nav.categories.about.links.security.description',
    },
];

export interface NavigationCategory {
    labelKey: string;
    links: NavigationLink[];
}

export const NAVIGATION_CATEGORIES: NavigationCategory[] = [
    { labelKey: 'nav.categories.product.label', links: PRODUCT_LINKS },
    { labelKey: 'nav.categories.resources.label', links: RESOURCES_LINKS },
    { labelKey: 'nav.categories.about.label', links: ABOUT_LINKS },
];
