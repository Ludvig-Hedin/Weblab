import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '../vendor/ui/accordion';
import { Eyebrow } from './_ui';

export interface FaqItem {
    question: string;
    answer: string;
}

export interface Faq2Content {
    eyebrow?: string;
    heading: string;
    items: FaqItem[];
}

export default function Faq2({ content }: { content: Faq2Content }) {
    return (
        <section className="bg-background py-16 lg:py-24" aria-labelledby="faq2-heading">
            <div className="mx-auto max-w-3xl px-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    {content.eyebrow ? <Eyebrow>{content.eyebrow}</Eyebrow> : null}
                    <h2
                        id="faq2-heading"
                        className="text-foreground text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                        {content.heading}
                    </h2>
                </div>
                <Accordion type="single" collapsible className="mt-10 w-full">
                    {content.items.map((item, i) => (
                        <AccordionItem key={i} value={`item-${i}`}>
                            <AccordionTrigger className="text-left text-base font-medium">
                                {item.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                                {item.answer}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </section>
    );
}
