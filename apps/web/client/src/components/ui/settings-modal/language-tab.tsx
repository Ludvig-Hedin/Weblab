'use client';

import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { Language, LANGUAGE_DISPLAY_NAMES } from '@weblab/constants';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

export const LanguageTab = observer(() => {
    const router = useRouter();
    const userSettings = useQuery(api.users.getSettings);
    const updateSettings = useMutation(api.users.updateSettings);

    const currentLocale = userSettings?.locale ?? 'en';

    const handleChange = async (value: string) => {
        try {
            await updateSettings({ locale: value });
            document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=31536000; SameSite=Lax`;
            router.refresh();
            toast.success('Language updated');
        } catch {
            toast.error('Failed to save language preference');
        }
    };

    return (
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-4 py-6">
                <div>
                    <h2 className="text-largePlus">Language</h2>
                    <p className="text-regular text-foreground-tertiary">
                        Choose the language for the app UI.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-mini">Display language</Label>
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
                <p className="text-mini text-foreground-tertiary">
                    Language change applies immediately.
                </p>
            </section>
        </div>
    );
});
