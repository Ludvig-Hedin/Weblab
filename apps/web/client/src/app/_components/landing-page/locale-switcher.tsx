'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Language, LANGUAGE_DISPLAY_NAMES } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

export function LocaleSwitcher() {
    const router = useRouter();
    const currentLocale = useLocale();
    const t = useTranslations('landing.footer.languageSwitcher');

    const handleSelect = (locale: Language) => {
        if (locale === currentLocale) return;
        document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`;
        router.refresh();
    };

    const currentName =
        LANGUAGE_DISPLAY_NAMES[currentLocale as Language] ??
        LANGUAGE_DISPLAY_NAMES[Language.English];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('label')}
                    className="text-foreground-tertiary hover:text-foreground-primary h-auto gap-1.5 px-2 py-1 text-small font-normal"
                >
                    <Icons.Globe className="h-3.5 w-3.5" />
                    <span>{currentName}</span>
                    <Icons.ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
                {Object.values(Language).map((lang) => {
                    const isActive = lang === currentLocale;
                    return (
                        <DropdownMenuItem
                            key={lang}
                            onSelect={() => handleSelect(lang)}
                            className="flex items-center justify-between gap-4"
                        >
                            <span>{LANGUAGE_DISPLAY_NAMES[lang]}</span>
                            {isActive ? (
                                <Icons.Check className="h-3.5 w-3.5 opacity-80" />
                            ) : null}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
