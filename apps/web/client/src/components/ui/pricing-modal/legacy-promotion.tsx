'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons/index';

export const LegacyPromotion = () => {
    const t = useTranslations('pricing.legacyPromo');
    const legacySubscriptions = useQuery(api.subscriptions.getLegacySubscriptions, {});
    const code = legacySubscriptions?.stripePromotionCode;
    const [isCopied, setIsCopied] = useState(false);

    // Real revenue path: clipboard delivers the 1-month-free Pro promo code
    // to the user's paste buffer. If `navigator.clipboard.writeText` rejects
    // (permission denied, non-secure context, browser without the API) the
    // toast must reflect failure — a false "Copied" leaves the user
    // believing the code is on their clipboard while nothing actually was.
    // Fall back to a programmatic textarea+execCommand copy so the user
    // still gets the code on browsers that block the async API.
    const fallbackCopy = (value: string): boolean => {
        if (typeof document === 'undefined') return false;
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        document.body.removeChild(textarea);
        return ok;
    };

    const handleCopy = async () => {
        if (!code) return;
        let copied = false;
        try {
            await navigator.clipboard.writeText(code);
            copied = true;
        } catch (err) {
            console.warn('[legacy-promotion] clipboard write failed; falling back', err);
            copied = fallbackCopy(code);
        }
        if (copied) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 3000);
            toast.success(t('toastCopied'));
        } else {
            toast.error(t('toastCopyFailed'), {
                description: t('toastCopyFailedDesc'),
            });
        }
    };

    return (
        <AnimatePresence>
            {code && (
                <motion.div
                    className="rounded-md border border-blue-500 bg-blue-950 p-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <p className="text-left font-semibold text-blue-100">
                        {t('title')}
                    </p>

                    {/* Coupon Code Section */}
                    <p className="mb-3 text-left text-sm text-blue-200">
                        {t('subtitle')}
                    </p>

                    <div className="flex items-center justify-between rounded bg-blue-900 px-3 py-2">
                        <code className="mr-2 flex-1 truncate font-mono text-xs text-blue-100">
                            {code}
                        </code>
                        <Button
                            size="sm"
                            className="rounded-md bg-blue-500 text-white transition-all duration-300 hover:bg-blue-600"
                            onClick={() => void handleCopy()}
                        >
                            {isCopied ? (
                                <Icons.Check className="h-4 w-4" />
                            ) : (
                                <Icons.Copy className="h-4 w-4" />
                            )}
                            {isCopied ? t('copied') : t('copy')}
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
