import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';

export interface FAQItem {
    question: string;
    answer: string;
}

export interface FAQCategory {
    id: string;
    label: string;
    icon: React.ReactNode;
    items: FAQItem[];
}

export interface FAQSectionProps {
    badge?: string;
    title?: string;
    subtitle?: string;
    categories: FAQCategory[];
    contactLabel?: string;
    contactEmail?: string;
}

export default function FAQ2({
    badge = 'Need help?',
    title = 'Frequently asked questions',
    subtitle = 'Find quick answers about our pricing, onboarding, and performance tracking tools.',
    categories,
}: FAQSectionProps) {
    // Single flat list — no category tabs.
    const items = categories.flatMap((c) => c.items);

    return (
        <section className="bg-background flex w-full flex-col items-center px-4 py-16 md:py-20">
            <div className="mx-auto mb-10 w-full max-w-[560px] text-center md:mb-12">
                <p className="text-muted-foreground mb-4 inline-flex items-center gap-1.5 text-xs font-medium tracking-widest uppercase">
                    <span className="bg-muted-foreground inline-block h-1 w-1 rounded-full" />
                    {badge}
                </p>

                <h2 className="text-foreground mb-4 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                    {title}
                </h2>

                <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed md:text-base">
                    {subtitle}
                </p>
            </div>

            <div className="mx-auto w-full max-w-[640px]">
                <Accordion type="single" collapsible className="flex w-full flex-col gap-2.5">
                    {items.map((item, index) => (
                        <AccordionItem
                            key={index}
                            value={`faq-${index}`}
                            className="border-border bg-muted/50 hover:bg-accent hover:border-border/80 data-[state=open]:bg-background overflow-hidden rounded-xl border transition-all duration-300 ease-in-out data-[state=open]:shadow-sm"
                        >
                            <AccordionTrigger className="group flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:no-underline">
                                <span className="text-muted-foreground group-hover:text-foreground group-data-[state=open]:text-foreground text-sm leading-snug font-medium transition-colors duration-200 md:text-base">
                                    {item.question}
                                </span>
                            </AccordionTrigger>
                            <AccordionContent className="bg-muted rounded-xl px-5 pb-4">
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    {item.answer}
                                </p>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </section>
    );
}
