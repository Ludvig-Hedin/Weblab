import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

// TODO: move to i18n keys (welcome.error.*)
const COPY = {
    EYEBROW: 'Authentication error',
    BACK_TO_LOGIN: 'Back to login',
    GO_HOME: 'Go home',
    GET_HELP: 'Get help',
    REASON_LABEL: 'Reason',
    ERROR_CODE_LABEL: 'Error code',
} as const;

const SUPPORT_EMAIL = 'support@weblab.build';

// Reasons emitted by `apps/web/client/src/app/auth/callback/route.ts`. Keep
// in sync — adding a reason here without the callback redirect won't surface,
// and adding a callback redirect without a matching key falls back to default.
// `oauth_*` reasons are emitted dynamically from Supabase error codes
// (`oauth_otp_expired`, `oauth_validation_failed`, ...) and collapse to the
// shared `oauth` copy via the prefix branch in `resolveReasonKey`.
const REASONS = {
    missing_email: {
        title: 'We need your email to sign you in',
        body: 'Your provider returned no email address — usually because your GitHub email is set to private. Make your primary email public in GitHub settings, or sign in with a magic link instead.',
    },
    missing_user_id: {
        title: 'Sign in is incomplete',
        body: 'Your provider returned a partial response. Try again — if it keeps failing, sign in with a magic link instead.',
    },
    db_upsert_failed: {
        title: "We couldn't create your account",
        body: 'We signed you out for safety. Try again in a moment — if it persists, contact support and include the error code below.',
    },
    missing_code: {
        title: 'Sign-in link is incomplete',
        body: 'The sign-in link was missing required information. Try signing in again — if the problem persists, request a new link.',
    },
    callback_exception: {
        title: 'Sign-in was interrupted',
        body: 'Something went wrong on our side while finishing sign-in. Try again in a moment — if it persists, contact support and include the error code below.',
    },
    oauth: {
        title: "Your provider couldn't complete sign-in",
        body: 'The provider rejected the request. The link may have expired, or the window closed too early. Try again, or use a magic link instead.',
    },
    default: {
        title: 'We could not finish sign in',
        body: 'The sign-in link may have expired, or the window closed too early. Try again — if the problem persists, contact support.',
    },
} as const;

type ReasonKey = keyof typeof REASONS;

function resolveReasonKey(value: string | undefined): ReasonKey {
    if (value === undefined || value === 'default') return 'default';
    if (value in REASONS) return value as ReasonKey;
    // Callback emits `oauth_${supabaseErrorCode}` — collapse the open set into
    // the shared `oauth` copy while preserving the raw value for support emails.
    if (value.startsWith('oauth_')) return 'oauth';
    return 'default';
}

// Permit display of the raw reason string only if it's a recognised shape —
// either an explicit REASONS key or an `oauth_*` code. This keeps an attacker
// from rendering arbitrary attacker-controlled query strings as "Reason" text.
function isDisplayableReason(value: string | undefined): value is string {
    if (value === undefined) return false;
    if (value in REASONS) return true;
    return value.startsWith('oauth_') && /^oauth_[a-z0-9_]{1,40}$/.test(value);
}

interface AuthCodeErrorPageProps {
    searchParams: Promise<{ code?: string; reason?: string }>;
}

export default async function AuthCodeErrorPage({ searchParams }: AuthCodeErrorPageProps) {
    const { code, reason } = await searchParams;
    const reasonKey: ReasonKey = resolveReasonKey(reason);
    const { title, body } = REASONS[reasonKey];
    // Prefer the raw reason for display (so `oauth_otp_expired` surfaces
    // verbatim in support emails) but fall back to the resolved key when
    // the raw value isn't a recognised shape.
    const displayReason = isDisplayableReason(reason) ? reason : reasonKey;

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        'Authentication error',
    )}&body=${encodeURIComponent(`Reason: ${displayReason}\nError code: ${code ?? 'unknown'}\n\n`)}`;

    const showDetails = reasonKey !== 'default' || !!code;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm tracking-[0.2em] uppercase">
                    {COPY.EYEBROW}
                </p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">{title}</h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">{body}</p>
                {showDetails && (
                    <div className="border-border bg-background mt-4 space-y-2 rounded-md border p-3 text-left">
                        {reasonKey !== 'default' && (
                            <div>
                                <p className="text-foreground-tertiary text-xs tracking-wide uppercase">
                                    {COPY.REASON_LABEL}
                                </p>
                                <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                                    {displayReason}
                                </p>
                            </div>
                        )}
                        {code && (
                            <div>
                                <p className="text-foreground-tertiary text-xs tracking-wide uppercase">
                                    {COPY.ERROR_CODE_LABEL}
                                </p>
                                <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                                    {code}
                                </p>
                            </div>
                        )}
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
