'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';

/**
 * First-run profile setup. Email-OTP signups land here because the OTP path
 * can't infer a name from the email alone (it inserts blank firstName/lastName);
 * OAuth signups also pass through but short-circuit to `returnUrl` because their
 * names are populated by the provider in the auth callback.
 *
 * Behavior:
 *   - Loads the current user via `api.user.get`.
 *   - If the user already has a real name on record, redirects to `returnUrl`
 *     immediately (returning OTP users, OAuth users, anyone re-visiting).
 *   - Otherwise shows a single "What should we call you?" form. On save,
 *     calls `api.user.updateProfile` and routes to `returnUrl`.
 *   - "Skip for now" routes to `returnUrl` without saving.
 */
export default function ProfileSetupPage() {
    const t = useTranslations();
    const router = useRouter();
    const searchParams = useSearchParams();
    const apiUtils = api.useUtils();

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

    const { data: user, isLoading: isLoadingUser } = api.user.get.useQuery();
    const { mutate: updateProfile, isPending: isSaving } = api.user.updateProfile.useMutation({
        onSuccess: () => {
            void apiUtils.user.get.invalidate();
            router.push(finalRedirect);
        },
        onError: (error) => {
            setError(error.message || t(transKeys.welcome.profileSetup.errorSaveFailed));
        },
    });

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [error, setError] = useState<string | null>(null);
    // Track whether we've already run the auto-redirect check so the form
    // doesn't flash for users who already have a name on record.
    const [hasCheckedProfile, setHasCheckedProfile] = useState(false);

    // Treat "displayName equals email" as effectively unset — that's the
    // sentinel left by the OTP signup path, and showing the user's email
    // address as their display name everywhere is exactly the bug we're
    // fixing. Empty firstName + lastName is the other shape this can take.
    useEffect(() => {
        if (isLoadingUser) return;
        if (!user) {
            // api.user.get returned null (e.g. session present but no public.users row).
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
        setHasCheckedProfile(true);
    }, [isLoadingUser, user, router, finalRedirect]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        const trimmedFirst = firstName.trim();
        const trimmedLast = lastName.trim();
        if (!trimmedFirst) {
            setError(t(transKeys.welcome.profileSetup.errorFirstNameRequired));
            return;
        }
        setError(null);
        // Build a sensible displayName from the parts. Don't leave it blank —
        // we want it populated everywhere the UI reads it.
        const displayName = trimmedLast ? `${trimmedFirst} ${trimmedLast}` : trimmedFirst;
        updateProfile({
            firstName: trimmedFirst,
            lastName: trimmedLast,
            displayName,
        });
    };

    const handleSkip = () => {
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
                            <Label htmlFor="profile-setup-first-name" className="text-small">
                                {t(transKeys.welcome.profileSetup.firstName)}
                            </Label>
                            <Input
                                id="profile-setup-first-name"
                                type="text"
                                autoComplete="given-name"
                                autoFocus
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder={t(transKeys.welcome.profileSetup.firstNamePlaceholder)}
                                disabled={isSaving}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="profile-setup-last-name" className="text-small">
                                {t(transKeys.welcome.profileSetup.lastName)}{' '}
                                <span className="text-foreground-tertiary text-xs">
                                    {t(transKeys.welcome.profileSetup.optional)}
                                </span>
                            </Label>
                            <Input
                                id="profile-setup-last-name"
                                type="text"
                                autoComplete="family-name"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder={t(transKeys.welcome.profileSetup.lastNamePlaceholder)}
                                disabled={isSaving}
                            />
                        </div>
                        {error && <p className="text-small text-red-500">{error}</p>}
                        <div className="flex flex-col space-y-2 pt-2">
                            <Button
                                type="submit"
                                variant="outline"
                                className="w-full"
                                disabled={isSaving || !firstName.trim()}
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
