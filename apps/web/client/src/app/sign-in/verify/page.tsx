'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
// See clerk-auth-form.tsx for why we import from the legacy subpath.
import { useSignIn, useSignUp } from '@clerk/nextjs/legacy';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@weblab/ui/input-otp';

import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';

const RESEND_COOLDOWN = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN * 1000;

// Must match the keys written by /sign-in/_components/clerk-auth-form.tsx.
const SIGN_IN_EMAIL_KEY = 'weblab-clerk-sign-in-email';
const SIGN_IN_MODE_KEY = 'weblab-clerk-sign-in-mode';
type ClerkOtpMode = 'sign-in' | 'sign-up';
// Cross-tab durable key written by the same form on send. We don't clear it
// on session-end; only on successful verify, when the user has clearly
// committed to this email and we don't need to keep it staged any more.
const LAST_USED_EMAIL_KEY = 'weblab-clerk-last-email';

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
    const isLoaded = isSignInLoaded && isSignUpLoaded;

    const [email, setEmail] = useState<string | null>(null);
    const [mode, setMode] = useState<ClerkOtpMode>('sign-in');

    const initialCountdown = (() => {
        if (!sentAt || Number.isNaN(sentAt)) return 0;
        const elapsed = Math.max(0, Date.now() - sentAt);
        if (elapsed >= RESEND_COOLDOWN_MS) return 0;
        return Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    })();

    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
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

    async function handleVerify(value: string) {
        if (value.length !== 6 || isVerifying) return;
        if (!isLoaded || !signIn || !signUp || !setActive || !email) return;
        setIsVerifying(true);
        setError(null);
        try {
            // Call the matching Clerk attempt method for the active mode.
            // `signIn.attemptFirstFactor` finalizes an existing user; for new
            // signups Clerk uses `signUp.attemptEmailAddressVerification`.
            const result =
                mode === 'sign-up'
                    ? await signUp.attemptEmailAddressVerification({ code: value })
                    : await signIn.attemptFirstFactor({
                          strategy: 'email_code',
                          code: value,
                      });

            if (result.status === 'complete') {
                // Clerk's types declare `createdSessionId` as `string | null`.
                // For a complete email_code flow it's always set, but the
                // guard keeps us from silently calling setActive with null if
                // Clerk ever regresses — that would log the user out of any
                // existing session without creating a new one.
                if (!result.createdSessionId) {
                    setError('Sign-in did not complete. Please try again.');
                    setOtp('');
                    return;
                }
                try {
                    sessionStorage.removeItem(SIGN_IN_EMAIL_KEY);
                    sessionStorage.removeItem(SIGN_IN_MODE_KEY);
                    // Drop the durable prefill too — the user is now signed
                    // in, so the next visit to /sign-in is presumably a
                    // *different* user on this device.
                    localStorage.removeItem(LAST_USED_EMAIL_KEY);
                } catch {
                    // best-effort cleanup
                }
                await setActive({ session: result.createdSessionId });
                const safe = sanitizeReturnUrl(returnUrl);
                // New users land on /profile-setup so they can pick a name;
                // existing users go straight to projects (or their returnUrl).
                const fallback = mode === 'sign-up' ? Routes.PROFILE_SETUP : Routes.PROJECTS;
                const finalReturnUrl = returnUrl && safe !== Routes.HOME ? safe : fallback;
                router.push(finalReturnUrl);
                return;
            }

            // Non-'complete' statuses on email_code mean a second factor was
            // required (MFA enrolled mid-flow), the identifier was abandoned,
            // or Clerk needs a step we don't support yet. Don't leave the user
            // on a dead-end "contact support" screen — bounce back to /sign-in
            // so they can restart. Log status server-side via the URL hash so
            // ops can grep for it if it ever fires in production.
            if (env.NODE_ENV !== 'production') {
                console.warn('[sign-in/verify] unexpected status', result.status, mode);
            }
            router.replace(`/sign-in?reason=${encodeURIComponent(`status:${result.status}`)}`);
            return;
        } catch (err) {
            type ClerkAPIErrorLike = {
                errors?: Array<{ message?: string; longMessage?: string }>;
            };
            const apiErr = err as ClerkAPIErrorLike;
            const first = apiErr?.errors?.[0];
            setError(first?.longMessage ?? first?.message ?? 'Verification failed.');
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
            // TODO(bug-hunt): also update the URL `?sentAt=` param so a
            // post-resend refresh computes `initialCountdown` from the new
            // resend timestamp, not the stale one. See CODE_REVIEW_BACKLOG.md
            // → "Bug Hunt 2026-05-28 — Desktop auth".
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
                <p className="text-foreground-tertiary text-sm">Checking session…</p>
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
                            disabled={isVerifying}
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
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => void handleVerify(otp)}
                            disabled={otp.length !== 6 || isVerifying}
                        >
                            {isVerifying ? (
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
