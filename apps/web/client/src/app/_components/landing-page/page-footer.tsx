import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { BrandSymbol, BrandWordmark } from '@weblab/ui/brand';
import { Icons } from '@weblab/ui/icons';

import { ExternalRoutes, Routes } from '@/utils/constants';
import { ContactLink } from './contact-link';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitcher } from './theme-switcher';

const linkClass =
    'relative inline-block text-foreground-primary after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-foreground-primary after:transition-all after:duration-200 hover:after:w-full';

const headingClass = 'text-small text-foreground-tertiary mb-6';

const columnClass = 'flex flex-col gap-4 text-regular';

export function Footer() {
    const t = useTranslations('landing.footer');

    return (
        <footer className="text-foreground-primary border-foreground-primary/10 mt-24 w-full border-t">
            <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-10 sm:px-6 md:px-8 lg:pt-24">
                {/* Giant wordmark */}
                <BrandWordmark
                    aria-hidden="true"
                    className="text-foreground-primary block h-auto w-full"
                />

                {/* Column groups */}
                <div className="mt-12 flex flex-col gap-y-12 sm:mt-16 lg:mt-20 lg:flex-row lg:items-start lg:justify-between lg:gap-x-12">
                    {/* Left group: small mark + Company / Resources / Product / Legal */}
                    <div className="grid grid-cols-2 gap-x-10 gap-y-12 sm:grid-cols-3 md:grid-cols-4 lg:flex lg:flex-nowrap lg:items-start lg:gap-x-12">
                        <Link
                            href="/"
                            aria-label={t('brandHomeAria')}
                            className="hidden lg:block lg:shrink-0 lg:pt-1"
                        >
                            <BrandSymbol className="text-foreground-primary h-8 w-8" />
                        </Link>

                        <div>
                            <h3 className={headingClass}>{t('company.title')}</h3>
                            <ul className={columnClass}>
                                <li>
                                    <a href={Routes.ABOUT} className={linkClass}>
                                        {t('company.about.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.FAQ}
                                        className={linkClass}
                                        title={t('company.faq.title')}
                                    >
                                        {t('company.faq.label')}
                                    </a>
                                </li>
                                <li>
                                    <ContactLink
                                        user="contact"
                                        domain="weblab.build"
                                        className={linkClass}
                                        title={t('company.contact.title')}
                                    >
                                        {t('company.contact.label')}
                                    </ContactLink>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className={headingClass}>{t('resources.title')}</h3>
                            <ul className={columnClass}>
                                <li>
                                    <a
                                        href={ExternalRoutes.DOCS}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={linkClass}
                                        title={t('resources.docs.title')}
                                    >
                                        {t('resources.docs.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.BLOG}
                                        className={linkClass}
                                        title={t('resources.blog.title')}
                                    >
                                        {t('resources.blog.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={ExternalRoutes.GITHUB}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={linkClass}
                                        title={t('resources.githubRepo.title')}
                                    >
                                        {t('resources.githubRepo.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.CHANGELOG}
                                        className={linkClass}
                                        title={t('resources.changelog.title')}
                                    >
                                        {t('resources.changelog.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.COMPARE}
                                        className={linkClass}
                                        title={t('resources.compare.title')}
                                    >
                                        {t('resources.compare.label')}
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className={headingClass}>{t('product.title')}</h3>
                            <ul className={columnClass}>
                                <li>
                                    <a
                                        href={Routes.PRICING}
                                        className={linkClass}
                                        title={t('product.pricing.title')}
                                    >
                                        {t('product.pricing.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.DOWNLOAD}
                                        className={linkClass}
                                        title={t('product.download.title')}
                                    >
                                        {t('product.download.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.PROJECTS}
                                        className={linkClass}
                                        title={t('product.myProjects.title')}
                                    >
                                        {t('product.myProjects.label')}
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className={headingClass}>{t('legal.title')}</h3>
                            <ul className={columnClass}>
                                <li>
                                    <a
                                        href="/terms-of-service"
                                        className={linkClass}
                                        title={t('legal.terms.title')}
                                    >
                                        {t('legal.terms.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="/privacy-policy"
                                        className={linkClass}
                                        title={t('legal.privacy.title')}
                                    >
                                        {t('legal.privacy.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.SECURITY}
                                        className={linkClass}
                                        title={t('legal.security.title')}
                                    >
                                        {t('legal.security.label')}
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Right group: Follow Us / Workflows / Features */}
                    <div className="grid grid-cols-2 gap-x-10 gap-y-12 sm:grid-cols-3 lg:flex lg:flex-nowrap lg:items-start lg:gap-x-12">
                        <div>
                            <h3 className={headingClass}>{t('followUs.title')}</h3>
                            <div className="flex items-center gap-6">
                                <a
                                    href={ExternalRoutes.GITHUB}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t('followUs.github.title')}
                                    aria-label={t('followUs.github.title')}
                                    className="text-foreground-secondary hover:text-foreground-primary transition-colors duration-150 hover:scale-110"
                                >
                                    <Icons.GitHubLogo className="h-5 w-5" />
                                </a>
                            </div>
                        </div>

                        <div>
                            <h3 className={headingClass}>{t('workflows.title')}</h3>
                            <ul className={columnClass}>
                                <li>
                                    <a
                                        href={Routes.WORKFLOWS_CLAUDE_CODE}
                                        className={linkClass}
                                        title={t('workflows.claudeCode.title')}
                                    >
                                        {t('workflows.claudeCode.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.WORKFLOWS_VIBE_CODING}
                                        className={linkClass}
                                        title={t('workflows.vibeCoding.title')}
                                    >
                                        {t('workflows.vibeCoding.label')}
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className={headingClass}>{t('features.title')}</h3>
                            <ul className={columnClass}>
                                <li>
                                    <a
                                        href={Routes.FEATURES}
                                        className={linkClass}
                                        title={t('features.overview.title')}
                                    >
                                        {t('features.overview.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.FEATURES_AI}
                                        className={linkClass}
                                        title={t('features.ai.title')}
                                    >
                                        {t('features.ai.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.FEATURES_BUILDER}
                                        className={linkClass}
                                        title={t('features.visualBuilder.title')}
                                    >
                                        {t('features.visualBuilder.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.FEATURES_PROTOTYPE}
                                        className={linkClass}
                                        title={t('features.prototyping.title')}
                                    >
                                        {t('features.prototyping.label')}
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={Routes.FEATURES_AI_FRONTEND}
                                        className={linkClass}
                                        title={t('features.aiFrontend.title')}
                                    >
                                        {t('features.aiFrontend.label')}
                                    </a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="border-foreground-primary/10 mt-16 flex flex-col items-start justify-between gap-4 border-t pt-6 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                        <ThemeSwitcher />
                        <LocaleSwitcher />
                    </div>
                    <div className="text-foreground-tertiary text-small flex items-center gap-3">
                        <span>
                            {t('legal.copyright', { year: String(new Date().getFullYear()) })}
                        </span>
                        <span
                            aria-hidden="true"
                            className="bg-foreground-tertiary/40 inline-block h-1 w-1 shrink-0 rounded-full"
                        />
                        <a
                            href={Routes.SITEMAP}
                            className={linkClass}
                            title={t('legal.sitemap.title')}
                        >
                            {t('legal.sitemap.label')}
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
