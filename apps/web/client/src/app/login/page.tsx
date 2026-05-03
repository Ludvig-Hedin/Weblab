'use client';

import { env } from '@/env';
import { useGetBackground } from '@/hooks/use-get-background';
import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { SignInMethod } from '@weblab/models/auth';
import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { sendEmailOtp } from './actions';
import { DevLoginButton, LoginButton } from '../_components/login-button';

export default function LoginPage() {
    const t = useTranslations();
    const backgroundUrl = useGetBackground('login');
    const returnUrl = useSearchParams().get(LocalForageKeys.RETURN_URL);
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [isEmailLoading, setIsEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);

    async function handleSendCode(e: React.FormEvent) {
        e.preventDefault();
        if (!email) return;
        setIsEmailLoading(true);
        setEmailError(null);
        try {
            const result = await sendEmailOtp(email);
            if (result.error) {
                setEmailError(result.error);
                return;
            }
            const params = new URLSearchParams({ email });
            if (returnUrl) params.set(LocalForageKeys.RETURN_URL, returnUrl);
            router.push(`${Routes.LOGIN_VERIFY}?${params.toString()}`);
        } catch {
            setEmailError('An unexpected error occurred. Please try again.');
        } finally {
            setIsEmailLoading(false);
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
                            {t(transKeys.welcome.title)}
                        </h1>
                        <p className="text-foreground-weblab text-regular">
                            {t(transKeys.welcome.description)}
                        </p>
                    </div>
                    <div className="space-y-2 md:space-y-0 md:space-x-2 flex flex-col md:flex-row">
                        <LoginButton
                            returnUrl={returnUrl}
                            method={SignInMethod.GITHUB}
                            icon={<Icons.GitHubLogo className="w-4 h-4 mr-2" />}
                            translationKey="github"
                            providerName="GitHub"
                        />
                        <LoginButton
                            returnUrl={returnUrl}
                            method={SignInMethod.GOOGLE}
                            icon={<Icons.GoogleLogo viewBox="0 0 24 24" className="w-4 h-4 mr-2" />}
                            translationKey="google"
                            providerName="Google"
                        />
                    </div>
                    {env.NEXT_PUBLIC_SHOW_DEV_LOGIN && <DevLoginButton returnUrl={returnUrl} />}
                    <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-small text-foreground-tertiary">or</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <form onSubmit={handleSendCode} className="space-y-2">
                        <Input
                            type="email"
                            placeholder={t(transKeys.welcome.login.emailPlaceholder)}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isEmailLoading}
                            required
                        />
                        {emailError && (
                            <p className="text-small text-red-500">{emailError}</p>
                        )}
                        <Button
                            type="submit"
                            variant="outline"
                            className="w-full"
                            disabled={isEmailLoading || !email}
                        >
                            {isEmailLoading ? (
                                <>
                                    <Icons.LoadingSpinner className="w-4 h-4 mr-2 animate-spin" />
                                    {t(transKeys.welcome.login.sending)}
                                </>
                            ) : (
                                t(transKeys.welcome.login.email)
                            )}
                        </Button>
                    </form>
                    <p className="text-small text-foreground-weblab">
                        {t(transKeys.welcome.terms.agreement)}{' '}
                        <Link
                            href="https://weblab.build/privacy-policy"
                            target="_blank"
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.terms.privacy)}
                        </Link>
                        {' '}
                        {t(transKeys.welcome.terms.and)}{' '}
                        <Link
                            href="https://weblab.build/terms-of-service"
                            target="_blank"
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.terms.tos)}
                        </Link>
                    </p>
                </div>
                <div className="flex flex-row space-x-1 text-small text-foreground-tertiary">
                    <p>{t(transKeys.welcome.version, { version: '1.0.0' })}</p>
                </div>
            </div>
            <div className="hidden w-full md:block m-6">
                <Image
                    className="w-full h-full object-cover rounded-xl"
                    src={backgroundUrl}
                    alt="Weblab dunes dark"
                    width={1000}
                    height={1000}
                />
            </div>
        </div>
    );
}
