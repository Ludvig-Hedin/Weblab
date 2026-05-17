'use client';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { Reveal } from '@/components/motion/reveal';
import { ContactLink } from '../landing-page/contact-link';

const GITHUB_ADVISORY_URL = 'https://github.com/Ludvig-Hedin/Weblab/security/advisories/new';

export function SecurityContact() {
    const t = useTranslations('security.contact');

    return (
        <section id="contact" className="scroll-mt-24">
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                <div className="mb-12 max-w-3xl">
                    <Reveal
                        as="p"
                        delay={0}
                        y={12}
                        className="heading-style-h6 text-foreground-secondary mb-4"
                    >
                        Contact
                    </Reveal>
                    <Reveal
                        as="h2"
                        delay={0.1}
                        y={16}
                        className="heading-style-h3 text-foreground-primary mb-4 text-balance"
                    >
                        {t('title')}
                    </Reveal>
                    <Reveal
                        as="p"
                        delay={0.2}
                        y={12}
                        className="text-foreground-secondary text-regularPlus text-balance"
                    >
                        {t('subtitle')}
                    </Reveal>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Reveal delay={0.3} y={20}>
                        <div className="border-foreground-primary/10 hover:border-foreground-primary/25 flex h-full flex-col gap-4 rounded-lg border p-8 transition-colors">
                            <div className="text-foreground-primary border-foreground-primary/15 mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md border">
                                <Icons.EnvelopeClosed className="h-4 w-4" />
                            </div>
                            <h3 className="text-foreground-primary text-regularPlus">
                                {t('emailCard.title')}
                            </h3>
                            <p className="text-foreground-secondary text-regular leading-relaxed">
                                {t('emailCard.body')}
                            </p>
                            <ContactLink
                                user="contact"
                                domain="weblab.build"
                                className="text-foreground-primary text-small mt-auto inline-flex items-center gap-1.5 font-mono hover:underline"
                                title={t('emailCard.cta')}
                            >
                                contact@weblab.build
                                <Icons.ArrowRight className="h-3.5 w-3.5" />
                            </ContactLink>
                        </div>
                    </Reveal>
                    <Reveal delay={0.4} y={20}>
                        <div className="border-foreground-primary/10 hover:border-foreground-primary/25 flex h-full flex-col gap-4 rounded-lg border p-8 transition-colors">
                            <div className="text-foreground-primary border-foreground-primary/15 mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md border">
                                <Icons.GitHubLogo className="h-4 w-4" />
                            </div>
                            <h3 className="text-foreground-primary text-regularPlus">
                                {t('githubCard.title')}
                            </h3>
                            <p className="text-foreground-secondary text-regular leading-relaxed">
                                {t('githubCard.body')}
                            </p>
                            <a
                                href={GITHUB_ADVISORY_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground-primary text-small mt-auto inline-flex items-center gap-1.5 font-mono hover:underline"
                                title={t('githubCard.cta')}
                            >
                                {t('githubCard.cta')}
                                <Icons.ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
