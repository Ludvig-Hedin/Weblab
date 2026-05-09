'use client';

import { useEffect, useState } from 'react';

interface ContactLinkProps {
    user: string;
    domain: string;
    className?: string;
    title?: string;
    children: React.ReactNode;
}

/**
 * Renders an email contact link without ever placing a static `mailto:`
 * substring in the SSR HTML. Cloudflare's "Email Address Obfuscation"
 * Scrape Shield rewrites any `mailto:user@host` it detects to
 * `/cdn-cgi/l/email-protection`, which 404s on this zone.
 *
 * SSR markup: <a href="#" data-mu data-md>Contact</a> (no `mailto:`).
 * After hydration: real `mailto:` href is wired up and click is native.
 * Pre-hydration click: handler builds the address at runtime and navigates.
 */
export function ContactLink({ user, domain, className, title, children }: ContactLinkProps) {
    const [href, setHref] = useState<string | undefined>(undefined);

    useEffect(() => {
        setHref(`${'mai' + 'lto:'}${user}${'@'}${domain}`);
    }, [user, domain]);

    return (
        <a
            href={href ?? '#contact'}
            data-mu={user}
            data-md={domain}
            onClick={(e) => {
                if (!href) {
                    e.preventDefault();
                    const target = e.currentTarget;
                    const u = target.getAttribute('data-mu') ?? user;
                    const d = target.getAttribute('data-md') ?? domain;
                    window.location.href = `${'mai' + 'lto:'}${u}${'@'}${d}`;
                }
            }}
            className={className}
            title={title}
        >
            {children}
        </a>
    );
}
