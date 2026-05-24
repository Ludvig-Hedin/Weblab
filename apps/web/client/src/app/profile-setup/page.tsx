'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { extractNames } from '@weblab/utility';

import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';

/**
 * Convert "alex.morgan+tag@example.com" → "Alex Morgan".
 * Returns null when the local part is unusable (empty, numeric, single char)
 * so the caller can fall back to "skip without setting a name".
 */
function deriveNameFromEmail(email: string): string | null {
    const local = email.split('@')[0]?.split('+')[0] ?? '';
    if (!local) return null;
    const words = local
        .split(/[._-]+/)
        .map((w) => w.replace(/[^a-zA-Z]/g, ''))
        .filter((w) => w.length > 0)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    if (words.length === 0) return null;
    const candidate = words.join(' ');
    // Single-letter or all-numeric handles produce a useless display name.
    if (candidate.replace(/\s/g, '').length < 2) return null;
    return candidate;
}

/**
 * First-run profile setup. Email-OTP signups land here because the OTP path
 * can't infer a name from the email alone (it inserts a blank name); OAuth
 * signups also pass through but short-circuit to `returnUrl` because their
 * names are populated by the provider in the auth callback.
 *
 * Behavior:
 *   - Loads the current user via `api.users.me`.
 *   - If the user already has a real name on record, redirects to `returnUrl`
 *     immediately (returning OTP users, OAuth users, anyone re-visiting).
 *   - Otherwise shows a single "What should we call you?" name field,
 *     prefilled with a guess derived from the email. On save, calls
 *     `api.users.updateProfile` and routes to `returnUrl`.
 *   - "Skip for now" routes to `returnUrl`, persisting the email-derived
 *     guess so the UI never has to fall back to showing the raw email.
 */
export default function ProfileSetupPage() {
    const t = useTranslations();
    const router = useRouter();
    const searchParams = useSearchParams();

    // The verify page passes `returnUrl` as the post-setup destination — this
    // is the user's pre-login intent, already sanitized server-side. Sanitize
    // again client-side to avoid open-redirect on any future caller.
    const rawReturnUrl = searchParams.get('returnUrl');
    const sanitizedReturnUrl = sanitizeReturnUrl(rawReturnUrl);
    // sanitizeReturnUrl falls back to HOME for invalid input; for the post-auth
    // flow we want PROJECTS to match what /auth/redirect would have done.
    // Also reject a returnUrl that points back to /profile-setup itself —
    // otherwise an auto-redirect from this page can loop indefinitely if the
    // upstream caller (middleware fallback, mistyped link, etc.) hands us
    // our own path.
    const finalRedirect =
        sanitizedReturnUrl === Routes.HOME || sanitizedReturnUrl === Routes.PROFILE_SETUP
            ? Routes.PROJECTS
            : sanitizedReturnUrl;

    const user = useQuery(api.users.me, {});
    const isLoadingUser = user === undefined;
    const updateProfile = useMutation(api.users.updateProfile);

    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // Track whether we've already run the auto-redirect check so the form
    // doesn't flash for users who already have a name on record.
    const [hasCheckedProfile, setHasCheckedProfile] = useState(false);

    // Treat "displayName equals email" as effectively unset — that's the
    // sentinel left by the OTP signup path, and showing the user's email
    // address as their display name everywhere is exactly the bug we're
    // fixing. An empty name is the other shape this can take.
    useEffect(() => {
        if (isLoadingUser) return;
        if (!user) {
            // api.users.me returned null (e.g. session present but no user row).
            // Don't sit on the spinner — let the form render so the user can fill it in.
            setHasCheckedProfile(true);
            return;
        }
        const hasName =
            (user.firstName && user.firstName.trim().length > 0) ||
            (user.lastName && user.lastName.trim().length > 0);
        const displayLooksLikeEmail =
            !!user.displayName && !!user.email && user.displayName === user.email;
        if (hasName && !displayLooksLikeEmail) {
            // User already has a real name — skip setup entirely.
            router.replace(finalRedirect);
            return;
        }
        // Needs setup: prefill the field with a friendly guess from the email
        // so the user usually just confirms instead of typing from scratch.
        if (user.email) {
            const derived = deriveNameFromEmail(user.email);
            // Only prefill an untouched field — never clobber what the user
            // has already typed if this effect re-runs.
            if (derived) setName((current) => (current.length > 0 ? current : derived));
        }
        setHasCheckedProfile(true);
    }, [isLoadingUser, user, router, finalRedirect]);

    const persistName = async (fullName: string) => {
        const trimmed = fullName.trim();
        const { firstName, lastName } = extractNames(trimmed);
        setIsSaving(true);
        try {
            await updateProfile({ firstName, lastName, displayName: trimmed });
            router.push(finalRedirect);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t(transKeys.welcome.profileSetup.errorSaveFailed),
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        const trimmed = name.trim();
        if (!trimmed) {
            setError(t(transKeys.welcome.profileSetup.errorNameRequired));
            return;
        }
        setError(null);
        void persistName(trimmed);
    };

    const handleSkip = () => {
        if (isSaving) return;
        // Don't leave the user with `displayName === email`. Persist the
        // email-derived guess so the rest of the UI (avatar dropdown, comments,
        // share dialogs) doesn't leak the raw email address everywhere it
        // reads displayName. Fall back to a plain navigation only when the
        // email yields nothing usable.
        const derived = user?.email ? deriveNameFromEmail(user.email) : null;
        if (derived) {
            void persistName(derived);
            return;
        }
        router.push(finalRedirect);
    };

    // Avoid rendering the form until we've confirmed the user actually needs
    // setup — otherwise the form briefly flashes for users who already have
    // names (returning OTP users, OAuth users routed through here in the future).
    if (isLoadingUser || !hasCheckedProfile) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <Icons.LoadingSpinner className="text-foreground-secondary h-6 w-6 animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex h-screen w-screen justify-center">
            <div className="flex h-full w-full max-w-xl flex-col justify-between space-y-8 overflow-auto p-16">
                <div className="flex items-center space-x-2">
                    <Link href={Routes.HOME} className="transition-opacity hover:opacity-80">
                        <BrandLogo className="h-5" />
                    </Link>
                </div>
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="space-y-4">
                        <h1 className="text-title1 leading-tight">
                            {t(transKeys.welcome.profileSetup.title)}
                        </h1>
                        <p className="text-foreground-weblab text-regular">
                            {t(transKeys.welcome.profileSetup.description)}
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="profile-setup-name" className="text-small">
                                {t(transKeys.welcome.profileSetup.name)}
                            </Label>
                            <Input
                                id="profile-setup-name"
                                type="text"
                                autoComplete="name"
                                autoFocus
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t(transKeys.welcome.profileSetup.namePlaceholder)}
                                disabled={isSaving}
                                required
                            />
                        </div>
                        {error && <p className="text-small text-destructive">{error}</p>}
                        <div className="flex flex-col space-y-2 pt-2">
                            <Button
                                type="submit"
                                variant="outline"
                                className="w-full"
                                disabled={isSaving || !name.trim()}
                            >
                                {isSaving ? (
                                    <>
                                        <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                        {t(transKeys.welcome.profileSetup.saving)}
                                    </>
                                ) : (
                                    t(transKeys.welcome.profileSetup.continue)
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full"
                                onClick={handleSkip}
                                disabled={isSaving}
                            >
                                {t(transKeys.welcome.profileSetup.skip)}
                            </Button>
                        </div>
                    </div>
                </form>
                <div />
            </div>
        </div>
    );
}
