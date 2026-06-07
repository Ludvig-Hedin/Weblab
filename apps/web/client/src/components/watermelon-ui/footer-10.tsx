import * as React from 'react';
import { FaArrowRight } from 'react-icons/fa6';

import { Input } from '@/components/ui/input';

export interface Footer10NavLink {
    label: string;
    href: string;
}

export interface Footer10LinkColumn {
    title: string;
    links: Footer10NavLink[];
}

export interface Footer10Props {
    /** Label for the contact area (e.g. "Reach out :") */
    contactLabel?: string;
    /** Contact email address */
    contactEmail?: string;
    /** Custom href for the contact email link */
    contactEmailHref?: string;
    /** Custom description text displayed on the left column */
    description?: string;
    /** Placeholder for the newsletter email input */
    newsletterPlaceholder?: string;
    /** Action handler when subscribing to the newsletter */
    onSubscribe?: (email: string) => void;
    /** Navigation links grouped into columns */
    linkColumns?: Footer10LinkColumn[];
    /** Custom brand logo or text at the bottom left */
    brandName?: string;
    /** Copyright text displayed at the bottom right */
    copyright?: string;
}

export function Footer10({
    contactLabel = 'Reach out :',
    contactEmail = 'hello@halcyon.io',
    contactEmailHref = 'mailto:hello@halcyon.io',
    description = 'Real-time analytics that turn raw activity into decisions your team can act on — clear, fast, and built to scale.',
    newsletterPlaceholder = 'Email address',
    onSubscribe,
    linkColumns = [],
    brandName = 'Halcyon',
    copyright = '© 2026 Halcyon, Inc. All rights reserved.',
}: Footer10Props) {
    const [email, setEmail] = React.useState('');

    const handleSubscribeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (onSubscribe && email.trim()) {
            onSubscribe(email.trim());
            setEmail('');
        }
    };

    return (
        <footer className="text-foreground selection:bg-primary/20 w-full">
            <div className="mx-auto w-full max-w-7xl pb-10">
                <div className="grid grid-cols-1 gap-12 px-8 pt-12 lg:grid-cols-12 lg:gap-16">
                    <div className="flex flex-col justify-between gap-2 lg:col-span-5">
                        <div>
                            <p className="text-lg font-medium text-zinc-600">{contactLabel}</p>

                            <a
                                href={contactEmailHref}
                                className="group focus:ring-ring inline-flex items-baseline gap-2.5 rounded text-2xl font-medium tracking-tight text-zinc-800 transition-colors duration-200 hover:text-zinc-500 focus:ring-2 focus:outline-none sm:text-3xl"
                            >
                                <span>{contactEmail}</span>
                                <FaArrowRight className="size-6 fill-zinc-800 transition-all duration-200 ease-in-out group-hover:translate-x-2 group-hover:fill-zinc-600" />
                            </a>
                        </div>

                        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
                            {description}
                        </p>
                    </div>

                    <div className="flex flex-col gap-12 lg:col-span-7">
                        <form onSubmit={handleSubscribeSubmit} className="w-full max-w-md self-end">
                            <div className="border-border flex items-center justify-between border-b-2 border-zinc-200 pb-1 transition-colors duration-200 focus-within:border-zinc-500">
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder={newsletterPlaceholder}
                                    required
                                    className="placeholder:text-muted-foreground/60 h-10 w-full rounded-none border-0 bg-transparent px-0 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                                    aria-label="Subscribe to our newsletter"
                                />

                                <button
                                    type="submit"
                                    className="group text-muted-foreground hover:text-primary focus:ring-primary/40 rounded p-2 transition-colors duration-200 focus:ring-2 focus:outline-none"
                                    aria-label="Submit newsletter subscription"
                                >
                                    <FaArrowRight className="fill-muted-foreground group-hover:fill-primary h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                                </button>
                            </div>
                        </form>

                        {linkColumns.length > 0 && (
                            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-6">
                                {linkColumns.map((column) => (
                                    <div key={column.title} className="flex flex-col">
                                        <h3 className="text-sm font-medium tracking-wide text-zinc-900 uppercase">
                                            {column.title}
                                        </h3>

                                        <ul className="mt-4 flex flex-col gap-3">
                                            {column.links.map((link) => (
                                                <li key={link.label}>
                                                    <a
                                                        href={link.href}
                                                        className="text-muted-foreground hover:text-foreground focus:ring-primary/40 rounded text-sm transition-colors duration-200 focus:ring-2 focus:outline-none"
                                                    >
                                                        {link.label}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-16 flex flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-base font-medium text-zinc-900">{brandName}</span>

                    <span className="text-base font-semibold text-zinc-900">{copyright}</span>
                </div>
            </div>
        </footer>
    );
}
