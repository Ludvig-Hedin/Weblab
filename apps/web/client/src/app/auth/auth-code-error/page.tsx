import { Routes } from '@/utils/constants';
import { Button } from '@weblab/ui/button';
import Link from 'next/link';

export default function AuthCodeErrorPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
                <p className="text-sm uppercase tracking-[0.2em] text-foreground-tertiary">Authentication error</p>
                <h1 className="mt-3 text-3xl font-semibold text-foreground">We could not finish sign in</h1>
                <p className="mt-4 text-sm leading-6 text-foreground-secondary">
                    The OAuth callback failed. Check that your Railway URL is set in Supabase,
                    and that the callback URL is allowed in your Supabase Auth redirect settings.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button asChild>
                        <Link href={Routes.LOGIN}>Back to login</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.HOME}>Go home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
