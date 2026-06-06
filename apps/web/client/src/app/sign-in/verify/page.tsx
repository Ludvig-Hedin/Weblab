'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
// See clerk-auth-form.tsx for why we import from the legacy subpath.
import { useSignIn, useSignUp } from '@clerk/nextjs/legacy';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@weblab/ui/input-otp';

import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';

const RESEND_COOLDOWN = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN * 1000;

// Must match the keys written by /sign-in/_components/clerk-auth-form.tsx.
const SIGN_IN_EMAIL_KEY = 'weblab-clerk-sign-in-email';
const SIGN_IN_MODE_KEY = 'weblab-clerk-sign-in-mode';
type ClerkOtpMode = 'sign-in' | 'sign-up';
type ClerkSignUpResult = {
    status: string | null;
    createdSessionId: string | null;
    missingFields?: string[];
    update?: (params: {
        firstName?: string;
        lastName?: string;
        password?: string;
        username?: string;
    }) => Promise<ClerkSignUpResult>;
};
// Cross-tab durable key written by the same form on send. We don't clear it
// on session-end; only on successful verify, when the user has clearly
// committed to this email and we don't need to keep it staged any more.
const LAST_USED_EMAIL_KEY = 'weblab-clerk-last-email';

function getEmailNameParts(emailAddress: string) {
    const [rawLocalPart] = emailAddress.split('@');
    const localPart = rawLocalPart?.trim() || 'weblab-user';
    const words = localPart
        .replace(/[._+-]+/g, ' ')
        .split(/\s+/)
        .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(Boolean);
    const [firstWord, ...rest] = words;
    const fallback = 'Weblab';
    const capitalize = (word: string) =>
        word ? word.charAt(0).toUpperCase() + word.slice(1, 32).toLowerCase() : fallback;

    return {
        firstName: capitalize(firstWord ?? fallback),
        lastName: rest.length > 0 ? rest.map(capitalize).join(' ') : 'User',
        username: localPart
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^[_-]+|[_-]+$/g, '')
            .slice(0, 32),
    };
}

async function satisfySupportedSignUpRequirements(result: ClerkSignUpResult, emailAddress: string) {
    const missingFields = result.missingFields ?? [];
    if (result.status !== 'missing_requirements' || missingFields.length === 0 || !result.update) {
        return result;
    }

    const supportedFields = new Set(['first_name', 'last_name', 'username']);
    const unsupportedFields = missingFields.filter((field) => !supportedFields.has(field));
    if (unsupportedFields.length > 0) {
        return result;
    }

    const params: Parameters<NonNullable<ClerkSignUpResult['update']>>[0] = {};
    const nameParts = getEmailNameParts(emailAddress);
    if (missingFields.includes('first_name')) params.firstName = nameParts.firstName;
    if (missingFields.includes('last_name')) params.lastName = nameParts.lastName;
    if (missingFields.includes('username')) params.username = nameParts.username || 'weblab_user';

    return result.update(params);
}

/**
 * Clerk-backed OTP verify page. Mirrors the Supabase /login/verify layout so
 * the two flows look identical end-to-end; only the API calls differ.
 */
export default function ClerkVerifyPage() {
    const t = useTranslations();
    const router = useRouter();
    const searchParams = useSearchParams();
    const returnUrl = searchParams.get(LocalForageKeys.RETURN_URL);
    const sentAtParam = searchParams.get('sentAt');
    const sentAt = sentAtParam ? Number(sentAtParam) : null;

    const { isLoaded: isSignInLoaded, signIn, setActive } = useSignIn();
    const { isLoaded: isSignUpLoaded, signUp } = useSignUp();
    const { isLoaded: isUserLoaded, isSignedIn } = useUser();
    const isLoaded = isSignInLoaded && isSignUpLoaded;

    const [email, setEmail] = useState<string | null>(null);
    const [mode, setMode] = useState<ClerkOtpMode>('sign-in');
    const [pendingRedirectUrl, setPendingRedirectUrl] = useState<string | null>(null);

    const initialCountdown = (() => {
        if (!sentAt || Number.isNaN(sentAt)) return 0;
        const elapsed = Math.max(0, Date.now() - sentAt);
        if (elapsed >= RESEND_COOLDOWN_MS) return 0;
        return Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    })();

    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [missingSignUpFields, setMissingSignUpFields] = useState<string[]>([]);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isCompletingPassword, setIsCompletingPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendCountdown, setResendCountdown] = useState(initialCountdown);
    const [isResending, setIsResending] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Hydrate email + mode from sessionStorage. If email is missing (direct
    // nav, refresh in a new tab, sessionStorage threw), bounce back to
    // /sign-in. The mode tells us which Clerk attempt method to call —
    // `signIn.attemptFirstFactor` for existing users, `signUp.attemptEmail-
    // AddressVerification` for new ones. Defaults to 'sign-in' so an
    // upgrade path from an older session that wrote only the email key
    // still works.
    useEffect(() => {
        let stored: string | null = null;
        let storedMode: string | null = null;
        try {
            stored = sessionStorage.getItem(SIGN_IN_EMAIL_KEY);
            storedMode = sessionStorage.getItem(SIGN_IN_MODE_KEY);
        } catch {
            stored = null;
        }
        if (!stored) {
            router.replace('/sign-in');
            return;
        }
        setEmail(stored);
        if (storedMode === 'sign-up') setMode('sign-up');
    }, [router]);

    // Mirror the Supabase verify page: clear the stash on tab close so it
    // doesn't survive "Continue where you left off".
    useEffect(() => {
        const clearEmail = () => {
            try {
                sessionStorage.removeItem(SIGN_IN_EMAIL_KEY);
            } catch {
                // ignore — best-effort
            }
        };
        window.addEventListener('beforeunload', clearEmail);
        return () => window.removeEventListener('beforeunload', clearEmail);
    }, []);

    useEffect(() => {
        if (initialCountdown <= 0) return;
        intervalRef.current = setInterval(() => {
            setResendCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current!);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
        // initialCountdown is derived from URL params on mount; eslint can't
        // see that and would otherwise want it in deps and restart the timer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!pendingRedirectUrl || !isUserLoaded || !isSignedIn) return;
        router.replace(pendingRedirectUrl);
    }, [isSignedIn, isUserLoaded, pendingRedirectUrl, router]);

    async function completeVerifiedResult(result: ClerkSignUpResult) {
        if (result.status !== 'complete') return false;
        if (!setActive) {
            setError('Sign-in is not ready yet. Please try again.');
            return true;
        }
        // Clerk's types declare `createdSessionId` as `string | null`.
        // For a complete email_code flow it's always set, but the guard keeps
        // us from silently calling setActive with null if Clerk ever regresses
        // — that would log the user out of any existing session without
        // creating a new one.
        if (!result.createdSessionId) {
            setError('Sign-in did not complete. Please try again.');
            setOtp('');
            return true;
        }
        try {
            sessionStorage.removeItem(SIGN_IN_EMAIL_KEY);
            sessionStorage.removeItem(SIGN_IN_MODE_KEY);
            // Drop the durable prefill too — the user is now signed in, so the
            // next visit to /sign-in is presumably a *different* user on this
            // device.
            localStorage.removeItem(LAST_USED_EMAIL_KEY);
        } catch {
            // best-effort cleanup
        }
        await setActive({ session: result.createdSessionId });
        const safe = sanitizeReturnUrl(returnUrl);
        // New users land on /profile-setup so they can pick a name; existing
        // users go straight to projects (or their returnUrl).
        const fallback = mode === 'sign-up' ? Routes.PROFILE_SETUP : Routes.PROJECTS;
        const finalReturnUrl = returnUrl && safe !== Routes.HOME ? safe : fallback;
        setPendingRedirectUrl(finalReturnUrl);
        return true;
    }

    async function handlePasswordComplete() {
        if (!signUp || !email || !missingSignUpFields.includes('password')) return;
        if (password.length < 8 || isCompletingPassword || pendingRedirectUrl) return;
        setIsCompletingPassword(true);
        setError(null);
        try {
            const result = await satisfySupportedSignUpRequirements(
                await signUp.update({ password }),
                email,
            );
            if (await completeVerifiedResult(result)) return;

            if (result.status === 'missing_requirements') {
                const missingFields = result.missingFields ?? [];
                setMissingSignUpFields(missingFields);
                setError(
                    missingFields.length > 0
                        ? `This sign-up needs additional information: ${missingFields.join(', ')}.`
                        : 'This sign-up needs additional information before it can be completed.',
                );
                return;
            }

            router.replace(`/sign-in?reason=${encodeURIComponent(`status:${result.status}`)}`);
        } catch (err) {
            type ClerkAPIErrorLike = {
                errors?: Array<{ message?: string; longMessage?: string }>;
                message?: string;
            };
            const apiErr = err as ClerkAPIErrorLike;
            const first = apiErr?.errors?.[0];
            setError(
                first?.longMessage ??
                    first?.message ??
                    apiErr.message ??
                    'Could not complete sign-up.',
            );
        } finally {
            setIsCompletingPassword(false);
        }
    }

    async function handleVerify(value: string) {
        if (value.length !== 6 || isVerifying || pendingRedirectUrl) return;
        if (!isLoaded || !signIn || !signUp || !setActive || !email) return;
        setIsVerifying(true);
        setError(null);
        setMissingSignUpFields([]);
        try {
            // Call the matching Clerk attempt method for the active mode.
            // `signIn.attemptFirstFactor` finalizes an existing user; for new
            // signups Clerk uses `signUp.attemptEmailAddressVerification`.
            const initialResult =
                mode === 'sign-up'
                    ? await signUp.attemptEmailAddressVerification({ code: value })
                    : await signIn.attemptFirstFactor({
                          strategy: 'email_code',
                          code: value,
                      });
            const result =
                mode === 'sign-up'
                    ? await satisfySupportedSignUpRequirements(initialResult, email)
                    : initialResult;

            if (await completeVerifiedResult(result)) return;

            if (mode === 'sign-up' && result.status === 'missing_requirements') {
                const missingFields = result.missingFields ?? [];
                setMissingSignUpFields(missingFields);
                setError(
                    missingFields.length > 0
                        ? `This sign-up needs additional information: ${missingFields.join(', ')}.`
                        : 'This sign-up needs additional information before it can be completed.',
                );
                setOtp('');
                return;
            }

            // Non-'complete' statuses on email_code mean a second factor was
            // required (MFA enrolled mid-flow), the identifier was abandoned,
            // or Clerk needs a step we don't support yet. Don't leave the user
            // on a dead-end "contact support" screen — bounce back to /sign-in
            // so they can restart. Log status server-side via the URL param so
            // ops can grep for it if it ever fires in production.
            router.replace(`/sign-in?reason=${encodeURIComponent(`status:${result.status}`)}`);
            return;
        } catch (err) {
            type ClerkAPIErrorLike = {
                errors?: Array<{ message?: string; longMessage?: string }>;
                message?: string;
            };
            const apiErr = err as ClerkAPIErrorLike;
            const first = apiErr?.errors?.[0];
            setError(
                first?.longMessage ??
                    first?.message ??
                    apiErr.message ??
                    'Verification failed.',
            );
            setOtp('');
        } finally {
            setIsVerifying(false);
        }
    }

    function handleOtpChange(value: string) {
        setOtp(value);
        if (value.length === 6) {
            // Clear any stale error from a previous failed attempt before we
            // fire the next verify so the red text doesn't linger while the
            // new request is in flight. handleVerify also clears it, but only
            // *after* its disabled-during-flight guard, which is a visible
            // gap on slower connections.
            setError(null);
            void handleVerify(value);
        }
    }

    async function handleResend() {
        if (resendCountdown > 0 || isResending) return;
        if (!isLoaded || !signIn || !signUp || !email) return;
        setIsResending(true);
        setError(null);
        try {
            // Re-arm the matching Clerk attempt for the active mode. Passing
            // `strategy: 'email_code'` to `signIn.create` ships a fresh code
            // in one request. For sign-up we re-create + re-prepare.
            if (mode === 'sign-up') {
                await signUp.create({ emailAddress: email });
                await signUp.prepareEmailAddressVerification({
                    strategy: 'email_code',
                });
            } else {
                await signIn.create({
                    strategy: 'email_code',
                    identifier: email,
                });
            }

            setResendCountdown(RESEND_COOLDOWN);
            setOtp('');
            // Sync the URL `?sentAt=` to the new resend time so a refresh after
            // resend recomputes `initialCountdown` from the fresh timestamp, not
            // the stale one. Use history.replaceState (not router.replace) to
            // update the param without a Next re-render that would reset state.
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('sentAt', String(Date.now()));
                window.history.replaceState(null, '', url.toString());
            } catch {
                // best-effort — URL sync only affects the refresh-after-resend edge
            }
            // Clear any still-running countdown before starting a new one —
            // otherwise the original interval is orphaned (the cleanup only
            // clears the current ref), leaking a timer that keeps decrementing
            // the countdown in parallel (runs roughly twice as fast).
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            intervalRef.current = setInterval(() => {
                setResendCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(intervalRef.current!);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err) {
            type ClerkAPIErrorLike = {
                errors?: Array<{ message?: string; longMessage?: string }>;
            };
            const apiErr = err as ClerkAPIErrorLike;
            const first = apiErr?.errors?.[0];
            setError(first?.longMessage ?? first?.message ?? 'Failed to resend the code.');
        } finally {
            setIsResending(false);
        }
    }

    if (email === null) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center gap-3">
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
                <div className="space-y-8">
                    <div className="space-y-4">
                        <h1 className="text-title1 leading-tight">
                            {t(transKeys.welcome.verify.title)}
                        </h1>
                        <p className="text-foreground-weblab text-regular">
                            {t(transKeys.welcome.verify.description, { email })}
                        </p>
                    </div>
                    <div className="space-y-4">
                        <p className="text-small text-foreground-secondary">
                            {t(transKeys.welcome.verify.enterCode)}
                        </p>
                        <InputOTP
                            maxLength={6}
                            value={otp}
                            onChange={handleOtpChange}
                            disabled={
                                isVerifying ||
                                Boolean(pendingRedirectUrl) ||
                                missingSignUpFields.includes('password')
                            }
                        >
                            <InputOTPGroup>
                                <InputOTPSlot index={0} />
                                <InputOTPSlot index={1} />
                                <InputOTPSlot index={2} />
                                <InputOTPSlot index={3} />
                                <InputOTPSlot index={4} />
                                <InputOTPSlot index={5} />
                            </InputOTPGroup>
                        </InputOTP>
                        {error && <p className="text-small text-destructive">{error}</p>}
                        {missingSignUpFields.includes('password') && (
                            <div className="space-y-3">
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    autoComplete="new-password"
                                    placeholder="Create a password"
                                    disabled={isCompletingPassword || Boolean(pendingRedirectUrl)}
                                />
                                <p className="text-mini text-foreground-secondary">
                                    Create a password to finish setting up this account.
                                </p>
                            </div>
                        )}
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() =>
                                missingSignUpFields.includes('password')
                                    ? void handlePasswordComplete()
                                    : void handleVerify(otp)
                            }
                            disabled={
                                missingSignUpFields.includes('password')
                                    ? password.length < 8 ||
                                      isCompletingPassword ||
                                      Boolean(pendingRedirectUrl)
                                    : otp.length !== 6 ||
                                      isVerifying ||
                                      Boolean(pendingRedirectUrl)
                            }
                        >
                            {isVerifying || isCompletingPassword || pendingRedirectUrl ? (
                                <>
                                    <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                    {t(transKeys.welcome.verify.verifying)}
                                </>
                            ) : (
                                t(transKeys.welcome.verify.verify)
                            )}
                        </Button>
                    </div>
                    <div className="text-small flex items-center justify-between">
                        <Link
                            href="/sign-in"
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.verify.back)}
                        </Link>
                        <button
                            type="button"
                            onClick={() => void handleResend()}
                            disabled={resendCountdown > 0 || isResending}
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200 disabled:cursor-default disabled:no-underline disabled:opacity-50"
                        >
                            {resendCountdown > 0
                                ? t(transKeys.welcome.verify.resendIn, {
                                      seconds: String(resendCountdown),
                                  })
                                : t(transKeys.welcome.verify.resend)}
                        </button>
                    </div>
                </div>
                {/* Clerk Smart CAPTCHA mount point. handleResend() in
                    'sign-up' mode calls signUp.create(), which re-triggers
                    bot protection — if the challenge fires with no
                    `clerk-captcha` element present, Clerk falls back to the
                    Invisible Turnstile widget and the resend dies with
                    `[Cloudflare Turnstile] Error: 600010`. Same fix as the
                    /sign-in form and the OAuth callback page. */}
                <div id="clerk-captcha" className="w-full" />
            </div>
        </div>
    );
}
