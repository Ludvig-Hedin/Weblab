import type { ReactNode } from 'react';

// A separate root layout keeps the website's Tailwind reset and navigation out of Studio.
export default function StudioLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="sv">
            <body>{children}</body>
        </html>
    );
}
