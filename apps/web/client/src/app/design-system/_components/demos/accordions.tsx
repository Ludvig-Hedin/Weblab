'use client';

import { APP_NAME } from '@weblab/constants';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@weblab/ui/accordion';

import { Section } from '../section';

export function AccordionsDemo() {
    return (
        <div id="accordions">
            <Section
                title="Accordion"
                tag="accordions"
                inspectId="accordion"
                filePath="packages/ui/src/components/accordion.tsx"
            >
                <Accordion type="single" collapsible className="w-full max-w-lg">
                    <AccordionItem value="q1">
                        <AccordionTrigger>What is {APP_NAME}?</AccordionTrigger>
                        <AccordionContent>
                            {APP_NAME} is an AI-powered visual editor. Connect your codebase, design
                            visually, and ship PRs.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="q2">
                        <AccordionTrigger>How does it work?</AccordionTrigger>
                        <AccordionContent>
                            Connect your repo, open a file in the visual canvas, make changes, and
                            commit back to your branch.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="q3">
                        <AccordionTrigger>What frameworks are supported?</AccordionTrigger>
                        <AccordionContent>
                            React, Next.js, Vue, Angular, Svelte, and more. Works with Tailwind, CSS
                            Modules, and styled-components.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </Section>
        </div>
    );
}
