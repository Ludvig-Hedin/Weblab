import { getLocale } from 'next-intl/server';

import en from '../../../messages/offline/en.json';
import sv from '../../../messages/offline/sv.json';

export const dynamic = 'force-static';

async function offlineMessages() {
    return (await getLocale()) === 'sv' ? sv : en;
}

export async function generateMetadata() {
    return { title: (await offlineMessages()).title };
}

export default async function OfflinePage() {
    const messages = await offlineMessages();
    return (
        <main className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="max-w-md text-center">
                <h1 className="text-2xl font-medium tracking-tight">{messages.heading}</h1>
                <p className="text-muted-foreground mt-3 text-sm">
                    {messages.description}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                    <a
                        href="/projects"
                        className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm"
                    >
                        {messages.retry}
                    </a>
                </div>
            </div>
        </main>
    );
}
