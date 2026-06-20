'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';

import { useStateManager } from '@/components/store/state';
import { SettingsTabValue } from '@/components/ui/settings-modal/helpers';
import { isDesktopLocalAvailable } from '@/hooks/use-open-local-project';
import { Routes } from '@/utils/constants';

export function ProjectsCommandPalette() {
    const t = useTranslations('projectsCommandPalette');
    const router = useRouter();
    const stateManager = useStateManager();
    const [open, setOpen] = useState(false);

    const projects = useQuery(api.projects.list, open ? {} : 'skip');
    // Local projects only open in the desktop app; in the browser they boot a
    // runtime that throws. Hide them from the quick-jump rather than offering a
    // dead navigation (cards keep them but block the open). `isDesktop` is read
    // after mount so SSR/first render don't touch `window`.
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => setIsDesktop(isDesktopLocalAvailable()), []);
    const jumpProjects = (projects ?? []).filter((p) => isDesktop || p.storageMode !== 'local');

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    const run = (action: () => void) => {
        setOpen(false);
        setTimeout(action, 0);
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            title={t('title')}
            description={t('description')}
        >
            <CommandInput placeholder={t('placeholder')} autoFocus />
            <CommandList>
                <CommandEmpty>{t('noResults')}</CommandEmpty>

                {jumpProjects.length > 0 && (
                    <CommandGroup heading={t('headingJump')}>
                        {jumpProjects.slice(0, 25).map((project) => (
                            <CommandItem
                                key={project._id}
                                value={`Open ${project.name} project ${project._id}`}
                                onSelect={() =>
                                    run(() => router.push(`${Routes.PROJECT}/${project._id}`))
                                }
                            >
                                <Icons.Cube />
                                <span className="truncate">{project.name}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                <CommandGroup heading={t('headingActions')}>
                    <CommandItem
                        value="New project create"
                        onSelect={() => run(() => router.push(Routes.NEW_PROJECT))}
                    >
                        <Icons.Plus />
                        <span>{t('newProject')}</span>
                    </CommandItem>
                    <CommandItem
                        value="Marketplace templates"
                        onSelect={() => run(() => router.push(Routes.MARKETPLACE))}
                    >
                        <Icons.Globe />
                        <span>{t('marketplace')}</span>
                    </CommandItem>
                    <CommandItem
                        value="Open settings preferences account"
                        onSelect={() =>
                            run(() => {
                                stateManager.setSettingsTab(SettingsTabValue.ACCOUNT);
                                stateManager.setIsSettingsModalOpen(true);
                            })
                        }
                    >
                        <Icons.Gear />
                        <span>{t('openSettings')}</span>
                    </CommandItem>
                </CommandGroup>

                <CommandGroup heading={t('headingShortcuts')}>
                    <CommandItem
                        value="Focus search filter projects"
                        onSelect={() =>
                            run(() => {
                                const input = document.querySelector<HTMLInputElement>(
                                    'input[placeholder="Search projects"]',
                                );
                                input?.focus();
                                input?.select();
                            })
                        }
                    >
                        <Icons.MagnifyingGlass />
                        <span>{t('searchProjects')}</span>
                        <CommandShortcut>/</CommandShortcut>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
