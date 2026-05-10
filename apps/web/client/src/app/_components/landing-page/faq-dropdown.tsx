import { useEffect, useRef, useState } from 'react';

import { Icons } from '@weblab/ui/icons';

interface FAQ {
    question: string;
    answer: string | React.ReactNode;
}

interface FAQDropdownProps {
    faqs: FAQ[];
}

function FAQItem({ faq, isOpen, onToggle }: { faq: FAQ; isOpen: boolean; onToggle: () => void }) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (contentRef.current) {
            setHeight(contentRef.current.scrollHeight);
        }
    }, [faq.answer]);

    return (
        <div className="px-0 py-1">
            <button
                className="text-foreground-primary flex w-full cursor-pointer items-center justify-between py-2 text-left text-lg focus:outline-none"
                onClick={onToggle}
                aria-expanded={isOpen}
            >
                <span>{faq.question}</span>
                <span className="relative ml-4 flex h-6 w-6 items-center justify-center">
                    {/* Horizontal line (always visible) */}
                    <span className="bg-foreground-primary absolute h-0.5 w-3 rounded-full" />
                    {/* Vertical line (rotates to horizontal when open) */}
                    <span
                        className={`bg-foreground-primary absolute h-0.5 w-3 rounded-full transition-transform duration-300 ${
                            isOpen ? 'rotate-0' : 'rotate-90'
                        }`}
                    />
                </span>
            </button>
            <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                    maxHeight: isOpen ? `${height}px` : '0px',
                    opacity: isOpen ? 1 : 0,
                    marginTop: isOpen ? '16px' : '0px',
                }}
            >
                <div ref={contentRef}>
                    <p className="text-foreground-secondary text-regular leading-relaxed">
                        {faq.answer}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function FAQDropdown({ faqs }: FAQDropdownProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <div className="flex w-full flex-col gap-1">
            {faqs.map((faq, idx) => (
                <FAQItem
                    key={faq.question}
                    faq={faq}
                    isOpen={openIndex === idx}
                    onToggle={() => setOpenIndex(openIndex === idx ? null : idx)}
                />
            ))}
        </div>
    );
}
