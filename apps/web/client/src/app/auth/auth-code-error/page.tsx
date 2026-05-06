import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

// TODO: move to i18n keys (welcome.error.*)
const COPY = {
    EYEBROW: 'Authentication error',
    TITLE: 'We could not finish sign in',
    BODY: 'Something went wrong while signing you in. This can happen if the link expired or the sign-in window was closed too early. Please try again — if the problem persists, contact support.',
    BACK_TO_LOGIN: 'Back to login',
    GO_HOME: 'Go home',
    GET_HELP: 'Get help',
    ERROR_CODE_LABEL: 'Error code',
} as const;

const SUPPORT_EMAIL = 'support@weblab.build';

interface AuthCodeErrorPageProps {
    searchParams: Promise<{ code?: string }>;
}

export default async function AuthCodeErrorPage({ searchParams }: AuthCodeErrorPageProps) {
    const { code } = await searchParams;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        'Authentication error',
    )}&body=${encodeURIComponent(`Error code: ${code ?? 'unknown'}\n\n`)}`;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm tracking-[0.2em] uppercase">
                    {COPY.EYEBROW}
                </p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">{COPY.TITLE}</h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">{COPY.BODY}</p>
                {code && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs tracking-wide uppercase">
                            {COPY.ERROR_CODE_LABEL}
                        </p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {code}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button asChild>
                        <Link href={Routes.LOGIN}>{COPY.BACK_TO_LOGIN}</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.HOME}>{COPY.GO_HOME}</Link>
                    </Button>
                </div>
                <div className="text-foreground-secondary mt-4 text-xs">
                    <a
                        href={mailto}
                        className="hover:text-foreground-primary underline transition-colors"
                    >
                        {COPY.GET_HELP}
                    </a>
                </div>
            </div>
        </div>
    );
}
