import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import copy from '../../lib/copy.json';
import { isSampleMode } from '../../lib/server-content';

import './globals.css';

export const metadata: Metadata = { title: copy.siteName };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
    const sampleMode = isSampleMode();

    return (
        <html lang="sv">
            <body>
                {sampleMode && (
                    <p className="bg-ink text-paper px-6 py-3 text-center text-sm" role="status">
                        {copy.sampleNotice}
                    </p>
                )}
                <header className="border-line mx-auto flex max-w-5xl items-center justify-between border-b px-6 py-6">
                    <Link href="/" className="text-lg font-semibold">
                        {copy.siteName}
                    </Link>
                    <nav className="flex gap-6">
                        <Link href="/" className="hover:underline">
                            {copy.home}
                        </Link>
                        <Link href="/blog" className="hover:underline">
                            {copy.blog}
                        </Link>
                    </nav>
                </header>
                {children}
            </body>
        </html>
    );
}
