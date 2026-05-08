import { useRouter } from 'next/navigation';

import { BrandWordmark } from '@weblab/ui/brand';
import { Icons } from '@weblab/ui/icons';

import { ExternalRoutes, Routes } from '@/utils/constants';

const linkClass =
    'relative inline-block text-foreground-secondary transition-colors duration-200 hover:text-foreground-primary after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-foreground-primary after:transition-all after:duration-200 hover:after:w-full';

export function Footer() {
    const router = useRouter();

    return (
        <footer className="text-foreground-primary border-foreground-primary/10 mt-24 w-full border-t pb-24">
            <div className="mx-auto flex max-w-6xl flex-col gap-24 px-8 pt-16 pb-24 md:flex-row md:items-start">
                {/* Left: Logo */}
                <div
                    className="flex cursor-pointer flex-col gap-8"
                    onClick={() => router.push('/')}
                >
                    <BrandWordmark className="text-foreground-primary h-5 w-24" />
                </div>
                {/* Center: Links */}
                <div className="flex flex-1 flex-col justify-center gap-12 md:flex-row md:gap-12">
                    <div>
                        <h3 className="text-regularPlus text-foreground-primary mb-4">Company</h3>
                        <ul className="text-regular flex flex-col gap-4">
                            <li>
                                <a href={Routes.ABOUT} className={linkClass}>
                                    About
                                </a>
                            </li>
                            <li>
                                <a
                                    href={ExternalRoutes.DOCS}
                                    target="_blank"
                                    className={linkClass}
                                    title="View Weblab documentation"
                                >
                                    Docs
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.FAQ}
                                    className={linkClass}
                                    title="Frequently Asked Questions"
                                >
                                    FAQ
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.BLOG}
                                    className={linkClass}
                                    title="Read the Weblab blog"
                                >
                                    Blog
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.CHANGELOG}
                                    className={linkClass}
                                    title="See what's new in Weblab"
                                >
                                    Changelog
                                </a>
                            </li>
                            <li>
                                <a
                                    href="mailto:contact@weblab.build"
                                    className={linkClass}
                                    title="Contact Weblab support"
                                >
                                    Contact
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-regularPlus text-foreground-primary mb-4">Product</h3>
                        <ul className="text-regular flex flex-col gap-4">
                            <li>
                                <a
                                    href={Routes.PROJECTS}
                                    className={linkClass}
                                    title="View your projects"
                                >
                                    My Projects
                                </a>
                            </li>
                            <li>
                                <a
                                    href={ExternalRoutes.GITHUB}
                                    target="_blank"
                                    className={linkClass}
                                    title="View Weblab on GitHub"
                                >
                                    GitHub Repo
                                </a>
                            </li>
                            <li>
                                <a
                                    href="/features"
                                    className={linkClass}
                                    title="View Weblab features"
                                >
                                    Features
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.FEATURES_AI}
                                    className={linkClass}
                                    title="AI-powered development tools"
                                >
                                    AI
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.FEATURES_AI_FRONTEND}
                                    className={linkClass}
                                    title="AI constrained to your design system"
                                >
                                    AI for Frontend
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.FEATURES_PROTOTYPE}
                                    className={linkClass}
                                    title="Rapid prototyping features"
                                >
                                    Prototyping
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.FEATURES_BUILDER}
                                    className={linkClass}
                                    title="Visual builder tools"
                                >
                                    Visual Builder
                                </a>
                            </li>
                            <li>
                                <a
                                    href="/pricing"
                                    className={linkClass}
                                    title="View Weblab pricing"
                                >
                                    Pricing
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-regularPlus text-foreground-primary mb-4">Workflows</h3>
                        <ul className="text-regular flex flex-col gap-4">
                            <li>
                                <a
                                    href={Routes.WORKFLOWS_CLAUDE_CODE}
                                    className={linkClass}
                                    title="Use Weblab with Claude Code"
                                >
                                    Claude Code
                                </a>
                            </li>
                            <li>
                                <a
                                    href={Routes.WORKFLOWS_VIBE_CODING}
                                    className={linkClass}
                                    title="Vibe coding for teams"
                                >
                                    Vibe Coding
                                </a>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-regularPlus text-foreground-primary mb-4">Follow Us</h3>
                        <div className="mt-2 flex items-center gap-6">
                            <a
                                href={ExternalRoutes.GITHUB}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View Weblab on GitHub"
                                aria-label="View Weblab on GitHub"
                                className="transition-all duration-150 hover:scale-110"
                            >
                                <Icons.GitHubLogo className="text-foreground-secondary hover:text-foreground-primary h-5.5 w-5.5 transition-colors duration-150" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            {/* Bottom Bar */}
            <div className="mx-auto max-w-6xl px-8 pt-24 pb-4">
                <div className="border-foreground-primary/10 flex w-full flex-col items-center justify-center gap-0 border-t pt-6 md:flex-row md:items-center md:justify-between md:gap-4">
                    {/* Center: Links */}
                    <div className="text-foreground-tertiary text-small mb-4 flex w-full justify-center gap-8 md:mb-0 md:w-auto">
                        <a
                            href="/terms-of-service"
                            className={linkClass}
                            title="Read our Terms of Service"
                        >
                            Terms of Service
                        </a>
                        <a
                            href="/privacy-policy"
                            className={linkClass}
                            title="Read our Privacy Policy"
                        >
                            Privacy Policy
                        </a>
                        <a href="/site-map" className={linkClass} title="View the sitemap">
                            Sitemap
                        </a>
                    </div>
                    {/* Right: Copyright */}
                    <div className="text-foreground-tertiary text-small flex w-full justify-center md:w-auto md:justify-end">
                        © {new Date().getFullYear()} Weblab
                    </div>
                </div>
            </div>
        </footer>
    );
}
