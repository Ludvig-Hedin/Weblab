'use client';

import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Language, LANGUAGE_DISPLAY_NAMES } from '@weblab/constants';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

export const LanguageTab = observer(() => {
    const t = useTranslations();
    const router = useRouter();
    const userSettings = useQuery(api.users.getSettings);
    const updateSettings = useMutation(api.users.updateSettings);

    const currentLocale = userSettings?.locale ?? 'en';

    const handleChange = async (value: string) => {
        try {
            await updateSettings({ locale: value });
            document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=31536000; SameSite=Lax`;
            router.refresh();
            toast.success(t('settings.language.updated'));
        } catch {
            toast.error(t('settings.language.saveError'));
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">{t('settings.language.title')}</h2>
                    <p className="text-regular text-foreground-secondary">
                        {t('settings.language.description')}
                    </p>
                </div>
                <div className="space-y-2">
                    <Label className="text-mini">{t('settings.language.displayLabel')}</Label>
                    <Select value={currentLocale} onValueChange={(v) => void handleChange(v)}>
                        <SelectTrigger className="w-60">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.values(Language).map((lang) => (
                                <SelectItem key={lang} value={lang}>
                                    {LANGUAGE_DISPLAY_NAMES[lang]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <p className="text-mini text-foreground-secondary">
                    {t('settings.language.appliesImmediately')}
                </p>
            </section>
        </div>
    );
});
