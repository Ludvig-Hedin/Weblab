'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { SignInMethod } from '@weblab/models/auth';
import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';

import { env } from '@/env';
import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { DevLoginButton, LoginButton } from '../_components/login-button';
import pkg from '../../../package.json';
import { sendEmailOtp } from './actions';

const AUTH_PROVIDERS = new Set(
    (env.NEXT_PUBLIC_AUTH_PROVIDERS ?? '')
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
);

export default function LoginPage() {
    const t = useTranslations();
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
            // Stamp the time the OTP was sent so the verify page can compute
            // an accurate resend cooldown rather than restarting it on mount.
            params.set('sentAt', String(Date.now()));
            router.push(`${Routes.LOGIN_VERIFY}?${params.toString()}`);
        } catch {
            setEmailError('An unexpected error occurred. Please try again.');
        } finally {
            setIsEmailLoading(false);
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
                        <h1 className="text-title1 leading-tight">{t(transKeys.welcome.title)}</h1>
                        <p className="text-foreground-weblab text-regular">
                            {t(transKeys.welcome.description)}
                        </p>
                    </div>
                    <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
                        {AUTH_PROVIDERS.has('github') && (
                            <LoginButton
                                returnUrl={returnUrl}
                                method={SignInMethod.GITHUB}
                                icon={<Icons.GitHubLogo className="mr-2 h-4 w-4" />}
                                translationKey="github"
                                providerName="GitHub"
                            />
                        )}
                        {AUTH_PROVIDERS.has('google') && (
                            <LoginButton
                                returnUrl={returnUrl}
                                method={SignInMethod.GOOGLE}
                                icon={
                                    <Icons.GoogleLogo
                                        viewBox="0 0 24 24"
                                        className="mr-2 h-4 w-4"
                                    />
                                }
                                translationKey="google"
                                providerName="Google"
                            />
                        )}
                    </div>
                    {env.NEXT_PUBLIC_SHOW_DEV_LOGIN && <DevLoginButton returnUrl={returnUrl} />}
                    <div className="flex items-center gap-3">
                        <div className="bg-border h-px flex-1" />
                        <span className="text-small text-foreground-tertiary">or</span>
                        <div className="bg-border h-px flex-1" />
                    </div>
                    <form
                        onSubmit={(event) => {
                            void handleSendCode(event);
                        }}
                        className="space-y-2"
                    >
                        <Input
                            type="email"
                            placeholder={t(transKeys.welcome.login.emailPlaceholder)}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isEmailLoading}
                            required
                        />
                        {emailError && <p className="text-small text-red-500">{emailError}</p>}
                        <Button
                            type="submit"
                            variant="outline"
                            className="w-full"
                            disabled={isEmailLoading || !email}
                        >
                            {isEmailLoading ? (
                                <>
                                    <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
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
                        </Link>{' '}
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
                <div className="text-small text-foreground-tertiary flex flex-row space-x-1">
                    <p>{t(transKeys.welcome.version, { version: pkg.version })}</p>
                </div>
            </div>
            <div className="m-6 hidden w-full overflow-hidden rounded-xl md:block">
                <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-8">
                    {/* Subtle radial glow behind the screenshot */}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_60%,rgba(100,149,237,0.08),transparent)]" />
                    <div className="relative w-full max-w-2xl">
                        {/* Browser chrome bar */}
                        <div className="flex items-center gap-1.5 rounded-t-lg bg-zinc-800/80 px-4 py-2.5 backdrop-blur-sm">
                            <span className="h-3 w-3 rounded-full bg-red-500/70" />
                            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                            <span className="h-3 w-3 rounded-full bg-green-500/70" />
                            <div className="ml-3 flex-1 rounded bg-zinc-700/60 px-3 py-1 text-xs text-zinc-400">
                                weblab.build
                            </div>
                        </div>
                        {/* Screenshot */}
                        <div className="overflow-hidden rounded-b-lg shadow-2xl ring-1 ring-white/10">
                            <Image
                                className="w-full object-cover object-top"
                                src="/assets/site-version-4.png"
                                alt="Weblab app"
                                width={1200}
                                height={800}
                                priority
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
