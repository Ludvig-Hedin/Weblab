'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { observer } from 'mobx-react-lite';

import { EditorMode } from '@weblab/models';
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

import { Hotkey } from '@/components/hotkey';
import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

export const CommandPalette = observer(() => {
    const t = useTranslations('editor.commandPalette');
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    const router = useRouter();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = () => setOpen((prev) => !prev);
        window.addEventListener('open-command-palette', handler);
        return () => window.removeEventListener('open-command-palette', handler);
    }, []);

    const { data: switchableProjects } = api.project.list.useQuery(
        { limit: 25 },
        { enabled: open },
    );
    const activeProjectId = editorEngine.projectId;

    const close = () => setOpen(false);

    const run = (action: () => void) => {
        close();
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

                {switchableProjects && switchableProjects.length > 1 && (
                    <CommandGroup heading={t('headingSwitch')}>
                        {switchableProjects
                            .filter((p) => p.id !== activeProjectId)
                            .slice(0, 12)
                            .map((p) => (
                                <CommandItem
                                    key={p.id}
                                    value={`Switch to ${p.name} project ${p.id}`}
                                    onSelect={() =>
                                        run(() => router.push(`${Routes.PROJECT}/${p.id}`))
                                    }
                                >
                                    <Icons.Cube />
                                    <span className="truncate">{p.name}</span>
                                </CommandItem>
                            ))}
                    </CommandGroup>
                )}

                <CommandGroup heading={t('headingNavigate')}>
                    <CommandItem
                        value="Go to Projects projects dashboard home"
                        onSelect={() => run(() => router.push(Routes.PROJECTS))}
                    >
                        <Icons.Cube />
                        <span>{t('goToProjects')}</span>
                    </CommandItem>
                    <CommandItem
                        value="Go to Settings settings preferences"
                        onSelect={() =>
                            run(() => {
                                stateManager.isSettingsModalOpen = true;
                            })
                        }
                    >
                        <Icons.Gear />
                        <span>{t('goToSettings')}</span>
                    </CommandItem>
                    <CommandItem
                        value="Open Keyboard Shortcuts hotkeys help"
                        onSelect={() =>
                            run(() => {
                                editorEngine.state.setHotkeysOpen(true);
                            })
                        }
                    >
                        <Icons.Keyboard />
                        <span>{t('openShortcuts')}</span>
                        <CommandShortcut>{Hotkey.SHOW_HOTKEYS.readableCommand}</CommandShortcut>
                    </CommandItem>
                </CommandGroup>

                <CommandGroup heading={t('headingMode')}>
                    <CommandItem
                        value="Switch to Design Mode design canvas"
                        onSelect={() =>
                            run(() => editorEngine.state.setEditorMode(EditorMode.DESIGN))
                        }
                    >
                        <Icons.CursorArrow />
                        <span>{t('switchToDesign')}</span>
                        <CommandShortcut>{Hotkey.MODE_DESIGN.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Switch to Code Mode editor source"
                        onSelect={() =>
                            run(() => editorEngine.state.setEditorMode(EditorMode.CODE))
                        }
                    >
                        <Icons.Code />
                        <span>{t('switchToCode')}</span>
                        <CommandShortcut>{Hotkey.MODE_CODE.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Switch to Preview Mode preview eye"
                        onSelect={() =>
                            run(() => editorEngine.state.setEditorMode(EditorMode.PREVIEW))
                        }
                    >
                        <Icons.EyeOpen />
                        <span>{t('switchToPreview')}</span>
                        <CommandShortcut>{Hotkey.MODE_PREVIEW.readableCommand}</CommandShortcut>
                    </CommandItem>
                </CommandGroup>

                <CommandGroup heading={t('headingActions')}>
                    <CommandItem
                        value="Toggle Terminal terminal console"
                        onSelect={() =>
                            run(() => window.dispatchEvent(new Event('toggle-terminal')))
                        }
                    >
                        <Icons.Terminal />
                        <span>{t('toggleTerminal')}</span>
                        <CommandShortcut>{Hotkey.TOGGLE_TERMINAL.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Insert Element add element insert palette"
                        onSelect={() => run(() => editorEngine.state.setElementPaletteOpen(true))}
                    >
                        <Icons.Plus />
                        <span>{t('insertElement')}</span>
                        <CommandShortcut>
                            {Hotkey.OPEN_ELEMENT_PALETTE.readableCommand}
                        </CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Search Files quick open file finder"
                        onSelect={() =>
                            run(() => window.dispatchEvent(new Event('open-file-finder')))
                        }
                    >
                        <Icons.MagnifyingGlass />
                        <span>{t('searchFiles')}</span>
                        <CommandShortcut>{Hotkey.OPEN_FILE_FINDER.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="New Chat new ai chat conversation"
                        onSelect={() =>
                            run(() => {
                                editorEngine.state.setEditorMode(EditorMode.DESIGN);
                                editorEngine.chat.conversation.startNewConversation();
                            })
                        }
                    >
                        <Icons.Sparkles />
                        <span>{t('newChat')}</span>
                        <CommandShortcut>{Hotkey.NEW_AI_CHAT.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Restart Sandbox restart dev server"
                        onSelect={() =>
                            run(() => window.dispatchEvent(new Event('weblab:restart-sandbox')))
                        }
                    >
                        <Icons.Reload />
                        <span>{t('restartSandbox')}</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
});
