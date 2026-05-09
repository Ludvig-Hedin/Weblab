'use client';

import { useCallback } from 'react';

interface ContactLinkProps {
    user: string;
    domain: string;
    className?: string;
    title?: string;
    children: React.ReactNode;
}

/**
 * Renders a contact "link" without ever placing a static `mailto:`
 * substring or plain `user@domain` pair in the SSR HTML. Cloudflare's
 * "Email Address Obfuscation" Scrape Shield rewrites any `mailto:user@host`
 * (and adjacent plain emails) it detects to `/cdn-cgi/l/email-protection`,
 * which 404s on this zone.
 *
 * Implementation notes:
 *  - Renders a `<button>` styled as a link rather than an `<a href="#">`,
 *    so a pre-hydration native click is a no-op (no scroll-to-top).
 *  - The user/domain parts are base64-encoded at render time and shipped
 *    as `data-u` / `data-d`, which Cloudflare's email regex does not
 *    recognise as an email and which casual scrapers do not parse.
 *  - The `mailto:` literal is built at click time from concatenated
 *    fragments, so it never appears in the static HTML payload.
 */
export function ContactLink({ user, domain, className, title, children }: ContactLinkProps) {
    // Base64-encode at render time. atob/btoa exist on the server during SSR
    // via Node 16+; safe in both environments.
    const encodedUser = encode(user);
    const encodedDomain = encode(domain);

    const onClick = useCallback(() => {
        const u = decode(encodedUser);
        const d = decode(encodedDomain);
        const scheme = 'mai' + 'lto' + ':';
        window.location.href = `${scheme}${u}${'@'}${d}`;
    }, [encodedUser, encodedDomain]);

    return (
        <button
            type="button"
            data-u={encodedUser}
            data-d={encodedDomain}
            onClick={onClick}
            className={className}
            title={title}
        >
            {children}
        </button>
    );
}

function encode(value: string): string {
    if (typeof globalThis.btoa === 'function') {
        return globalThis.btoa(value);
    }
    return Buffer.from(value, 'utf-8').toString('base64');
}

function decode(value: string): string {
    if (typeof globalThis.atob === 'function') {
        return globalThis.atob(value);
    }
    return Buffer.from(value, 'base64').toString('utf-8');
}
