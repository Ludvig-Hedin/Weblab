import React from 'react';

import { APP_NAME } from '@weblab/constants';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';
import { ButtonLink } from '../button-link';
import { FAQDropdown } from './faq-dropdown';

interface FAQ {
    question: string;
    answer: string | React.ReactNode;
}

interface FAQSectionProps {
    faqs?: FAQ[];
    title?: string;
    buttonText?: string;
    buttonHref?: string;
    className?: string;
}

const defaultFaqs = [
    {
        question: `What is ${APP_NAME}?`,
        answer: `${APP_NAME} is a visual design canvas that connects to your existing codebase. Designers drag real components onto an infinite canvas, make changes visually, and submit pull requests — no coding required.`,
    },
    {
        question: `How is ${APP_NAME} different from other design tools?`,
        answer: `Traditional design tools create static mockups that must be rebuilt in code. ${APP_NAME} works with your real components — what you design IS the code. Changes become PRs, not handoff specs.`,
    },
    {
        question: `How is ${APP_NAME} different from AI code generators?`,
        answer: `AI generators create new code from scratch. ${APP_NAME} constrains AI to YOUR existing components, so outputs match your design system. No translation, no drift.`,
    },
    {
        question: 'Do I need to know how to code?',
        answer: "No. Designers use a visual canvas with familiar tools. Real code runs underneath — you don't need to touch it unless you want to.",
    },
    {
        question: 'Can my team collaborate?',
        answer: 'Yes. Share your canvas, leave spatial comments, and work together in real-time. Changes sync to code and can be submitted as PRs for engineers to review.',
    },
    {
        question: `What tech stack does ${APP_NAME} support?`,
        answer: 'React, Next.js, and any CSS approach (Tailwind, CSS modules, styled-components). Works with any component library.',
    },
    {
        question: `Is there a free version of ${APP_NAME}?`,
        answer: `Yes, ${APP_NAME} can be self-hosted for free on GitHub. For the hosted cloud version, please contact our team.`,
    },
    {
        question: 'Who owns the code?',
        answer: `The code you make with ${APP_NAME} is all yours. Export it locally, publish to GitHub, or deploy to a custom domain.`,
    },
];

export function FAQSection({
    faqs = defaultFaqs,
    title = 'Frequently\nasked questions',
    buttonText = 'Read our FAQs',
    buttonHref = Routes.FAQ,
    className = '',
}: FAQSectionProps) {
    return (
        <div className={`bg-background-weblab/80 w-full px-8 py-48 ${className}`} id="faq">
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-24 md:flex-row md:gap-12">
                <div className="flex flex-1 flex-col items-start">
                    <h3 className="text-foreground-primary mt-4 mb-12 max-w-3xl text-5xl leading-[1.1] font-light text-balance md:text-6xl">
                        {title.split('\n').map((line, index) => (
                            <React.Fragment key={index}>
                                {line}
                                {index < title.split('\n').length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </h3>
                    <ButtonLink
                        href={buttonHref}
                        rightIcon={<Icons.ArrowRight className="h-5 w-5" />}
                    >
                        {buttonText}
                    </ButtonLink>
                </div>
                <div className="flex flex-1 flex-col gap-6">
                    <FAQDropdown faqs={faqs} />
                </div>
            </div>
        </div>
    );
}
