'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Routes } from '@/utils/constants';
import { CTASection } from '../_components/landing-page/cta-section';
import { FAQDropdown } from '../_components/landing-page/faq-dropdown';
import { WebsiteLayout } from '../_components/website-layout';

const SECTIONS = [
    { anchor: 'about-weblab', key: 'about', count: 4 },
    { anchor: 'features', key: 'features', count: 4 },
    { anchor: 'compatibility', key: 'compatibility', count: 5 },
    { anchor: 'workflow', key: 'workflow', count: 4 },
    { anchor: 'company', key: 'company', count: 3 },
] as const;

export default function FAQPage() {
    const t = useTranslations('faqPage') as (key: string) => string;
    const faqSections = useMemo(
        () =>
            SECTIONS.map((s) => ({
                anchor: s.anchor,
                title: t(`sections.${s.key}.title`),
                faqs: Array.from({ length: s.count }, (_, idx) => ({
                    question: t(`sections.${s.key}.q${idx + 1}.question`),
                    answer: t(`sections.${s.key}.q${idx + 1}.answer`),
                })),
            })),
        [t],
    );

    const [currentSection, setCurrentSection] = useState(faqSections[0]?.anchor ?? '');
    const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const faqContainerRef = useRef<HTMLDivElement | null>(null);

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
                faqSections[activeIdx]?.anchor &&
                faqSections[activeIdx]?.anchor !== currentSection
            ) {
                setCurrentSection(faqSections[activeIdx]?.anchor ?? '');
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, [currentSection, faqSections]);

    const scrollToSection = (anchor: string) => {
        const element = document.getElementById(anchor);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <WebsiteLayout showFooter={true}>
            <section className="sr-only" aria-label="FAQ Summary">
                <h2>{t('srTitle')}</h2>
                <p>{t('srBody')}</p>
            </section>

            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                <h1 className="text-foreground-primary mb-8 max-w-3xl text-4xl leading-[1.1] font-light text-balance sm:text-5xl md:text-6xl">
                    {t('heading')}
                </h1>
                <p className="text-foreground-secondary mb-16 max-w-2xl text-lg">{t('subhead')}</p>

                <div className="flex flex-col gap-12 lg:flex-row" ref={faqContainerRef}>
                    <nav className="sticky top-32 hidden w-48 flex-shrink-0 self-start lg:block">
                        <div>
                            <h2 className="text-foreground-tertiary mb-4 text-sm font-medium">
                                {t('topics')}
                            </h2>
                            <ul className="flex flex-col gap-2">
                                {faqSections.map((section) => (
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

                    <section className="max-w-[800px] flex-1">
                        {faqSections.map((section, i) => (
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
                                <FAQDropdown faqs={section.faqs} />
                            </div>
                        ))}
                    </section>
                </div>
            </div>

            <CTASection
                ctaText={t('stillQuestions')}
                buttonText={t('getStarted')}
                href={Routes.PROJECTS}
            />
        </WebsiteLayout>
    );
}
