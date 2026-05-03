'use client';

import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@weblab/ui/input-otp';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { sendEmailOtp, verifyEmailOtp } from '../actions';

const RESEND_COOLDOWN = 60;

export default function VerifyPage() {
    const t = useTranslations();
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get('email') ?? '';
    const returnUrl = searchParams.get(LocalForageKeys.RETURN_URL);

    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendCountdown, setResendCountdown] = useState(RESEND_COOLDOWN);
    const [isResending, setIsResending] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!email) {
            router.replace(Routes.LOGIN);
        }
    }, [email, router]);

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            setResendCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current!);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(intervalRef.current!);
    }, []);

    function isSafeReturnUrl(url: string): boolean {
        // Only allow same-origin relative paths starting with a single '/'.
        return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
    }

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
        if (returnUrl && isSafeReturnUrl(returnUrl)) {
            router.push(returnUrl);
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
            <div className="flex flex-col justify-between w-full h-full max-w-xl p-16 space-y-8 overflow-auto">
                <div className="flex items-center space-x-2">
                    <Link href={Routes.HOME} className="hover:opacity-80 transition-opacity">
                        <BrandLogo className="h-5" />
                    </Link>
                </div>
                <div className="space-y-8">
                    <div className="space-y-4">
                        <h1 className="text-title1 leading-tight">
                            {t(transKeys.welcome.verify.title)}
                        </h1>
                        <p className="text-foreground-onlook text-regular">
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
                                    <Icons.LoadingSpinner className="w-4 h-4 mr-2 animate-spin" />
                                    {t(transKeys.welcome.verify.verifying)}
                                </>
                            ) : (
                                t(transKeys.welcome.verify.verify)
                            )}
                        </Button>
                    </div>
                    <div className="flex items-center justify-between text-small">
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
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200 disabled:opacity-50 disabled:no-underline disabled:cursor-default"
                        >
                            {resendCountdown > 0
                                ? t(transKeys.welcome.verify.resendIn, { seconds: String(resendCountdown) })
                                : t(transKeys.welcome.verify.resend)}
                        </button>
                    </div>
                </div>
                <div />
            </div>
        </div>
    );
}
