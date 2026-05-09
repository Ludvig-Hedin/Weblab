import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata = {
    title: 'Offline',
};

export default function OfflinePage() {
    return (
        <main className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="max-w-md text-center">
                <h1 className="text-2xl font-medium tracking-tight">You're offline</h1>
                <p className="text-muted-foreground mt-3 text-sm">
                    Weblab can't reach the network right now. You can still open your last project
                    and any project you've marked "Available offline" in settings.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                    <Link
                        href="/projects"
                        className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm"
                    >
                        Go to projects
                    </Link>
                </div>
            </div>
        </main>
    );
}
