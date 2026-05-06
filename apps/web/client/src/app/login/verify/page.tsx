'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@weblab/ui/input-otp';

import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';
import { sendEmailOtp, verifyEmailOtp } from '../actions';

const RESEND_COOLDOWN = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN * 1000;

export default function VerifyPage() {
    const t = useTranslations();
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get('email') ?? '';
    const returnUrl = searchParams.get(LocalForageKeys.RETURN_URL);
    const sentAtParam = searchParams.get('sentAt');
    const sentAt = sentAtParam ? Number(sentAtParam) : null;

    // Compute initial cooldown from `sentAt` query param. If absent or stale,
    // default to ready-to-resend (0). Avoids showing a misleading 60-second
    // timer when the user navigates directly to /login/verify.
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

    useEffect(() => {
        if (!email) {
            router.replace(Routes.LOGIN);
        }
    }, [email, router]);

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
        // initialCountdown derived from URL params, intentionally only run on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleVerify(value: string) {
        if (value.length !== 6 || isVerifying) return;
        setIsVerifying(true);
        setError(null);
        const result = await verifyEmailOtp(email, value);
        setIsVerifying(false);
        if (result.error) {
            setError(result.error);
            setOtp('');
            return;
        }
        // Use shared sanitizeReturnUrl so behavior matches OAuth callback path.
        const safe = sanitizeReturnUrl(returnUrl);
        if (returnUrl && safe !== Routes.HOME) {
            router.push(safe);
        } else {
            router.push(result.redirectTo ?? Routes.AUTH_REDIRECT);
        }
    }

    function handleOtpChange(value: string) {
        setOtp(value);
        if (value.length === 6) {
            handleVerify(value);
        }
    }

    async function handleResend() {
        if (resendCountdown > 0 || isResending) return;
        setIsResending(true);
        setError(null);
        try {
            const result = await sendEmailOtp(email);
            if (result?.error) {
                setError(result.error);
                return;
            }
            setResendCountdown(RESEND_COOLDOWN);
            setOtp('');
            intervalRef.current = setInterval(() => {
                setResendCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(intervalRef.current!);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch {
            setError('Failed to resend the code. Please try again.');
        } finally {
            setIsResending(false);
        }
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
                        {error && <p className="text-small text-red-500">{error}</p>}
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleVerify(otp)}
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
                            href={Routes.LOGIN}
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.verify.back)}
                        </Link>
                        <button
                            type="button"
                            onClick={handleResend}
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
                <div />
            </div>
        </div>
    );
}
