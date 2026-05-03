'use client';

import { observer } from 'mobx-react-lite';

import { Language, LANGUAGE_DISPLAY_NAMES } from '@weblab/constants';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { api } from '@/trpc/react';

export const LanguageTab = observer(() => {
    const apiUtils = api.useUtils();
    const { data: userSettings } = api.user.settings.get.useQuery();
    const { mutate: updateSettings } = api.user.settings.upsert.useMutation({
        onSuccess: (_data, variables) => {
            void apiUtils.user.settings.get.invalidate();
            document.cookie = `NEXT_LOCALE=${variables.locale}; path=/; max-age=31536000; SameSite=Lax`;
            toast.success('Language updated — takes effect on next page load');
        },
        onError: () => toast.error('Failed to save language preference'),
    });

    const currentLocale = userSettings?.language?.locale ?? 'en';

    const handleChange = (value: string) => {
        updateSettings({ locale: value });
    };

    return (
        <div className="flex flex-col gap-8 p-6">
            <section className="border-border/60 bg-background-secondary/30 space-y-4 rounded-lg border p-4">
                <div>
                    <h2 className="text-base font-medium">Language</h2>
                    <p className="text-muted-foreground text-sm">
                        Choose the language for the app UI.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Display language</Label>
                    <Select value={currentLocale} onValueChange={handleChange}>
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
                <p className="text-muted-foreground text-xs">
                    Language change takes effect on the next page load.
                </p>
            </section>
        </div>
    );
});
