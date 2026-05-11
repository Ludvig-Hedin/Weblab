'use client';

import { useEffect, useState } from 'react';
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

/**
 * Global Command Palette — `cmd+k` / `ctrl+k`.
 *
 * Mirrors the modal+Command pattern from element-palette/index.tsx. Opens via
 * an `open-command-palette` window event dispatched by the canvas hotkey
 * registration so it's reachable from any focus context (canvas, chat input,
 * code editor, etc.).
 */
export const CommandPalette = observer(() => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    const router = useRouter();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = () => setOpen((prev) => !prev);
        window.addEventListener('open-command-palette', handler);
        return () => window.removeEventListener('open-command-palette', handler);
    }, []);

    // Only fetch the project list while the palette is open. Avoids hitting
    // the list endpoint on every editor mount just to power a feature the
    // user may never trigger.
    const { data: switchableProjects } = api.project.list.useQuery(
        { limit: 25 },
        { enabled: open },
    );
    const activeProjectId = editorEngine.projectId;

    const close = () => setOpen(false);

    const run = (action: () => void) => {
        // Defer the action a tick so the dialog close transition doesn't
        // race with focus restoration into the panel/route we're navigating
        // to. Matches the pattern other shadcn-cmdk hosts use.
        close();
        setTimeout(action, 0);
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            title="Command Palette"
            description="Run a command, switch modes, or jump to a page."
        >
            <CommandInput placeholder="Type a command…" autoFocus />
            <CommandList>
                <CommandEmpty>No commands found.</CommandEmpty>

                {switchableProjects && switchableProjects.length > 1 && (
                    <CommandGroup heading="Switch project">
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

                <CommandGroup heading="Navigate">
                    <CommandItem
                        value="Go to Projects projects dashboard home"
                        onSelect={() => run(() => router.push(Routes.PROJECTS))}
                    >
                        <Icons.Cube />
                        <span>Go to Projects</span>
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
                        <span>Go to Settings</span>
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
                        <span>Open Keyboard Shortcuts</span>
                        <CommandShortcut>{Hotkey.SHOW_HOTKEYS.readableCommand}</CommandShortcut>
                    </CommandItem>
                </CommandGroup>

                <CommandGroup heading="Mode">
                    <CommandItem
                        value="Switch to Design Mode design canvas"
                        onSelect={() =>
                            run(() => editorEngine.state.setEditorMode(EditorMode.DESIGN))
                        }
                    >
                        <Icons.CursorArrow />
                        <span>Switch to Design Mode</span>
                        <CommandShortcut>{Hotkey.MODE_DESIGN.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Switch to Code Mode editor source"
                        onSelect={() =>
                            run(() => editorEngine.state.setEditorMode(EditorMode.CODE))
                        }
                    >
                        <Icons.Code />
                        <span>Switch to Code Mode</span>
                        <CommandShortcut>{Hotkey.MODE_CODE.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Switch to Preview Mode preview eye"
                        onSelect={() =>
                            run(() => editorEngine.state.setEditorMode(EditorMode.PREVIEW))
                        }
                    >
                        <Icons.EyeOpen />
                        <span>Switch to Preview Mode</span>
                        <CommandShortcut>{Hotkey.MODE_PREVIEW.readableCommand}</CommandShortcut>
                    </CommandItem>
                </CommandGroup>

                <CommandGroup heading="Actions">
                    <CommandItem
                        value="Toggle Terminal terminal console"
                        onSelect={() =>
                            run(() => window.dispatchEvent(new Event('toggle-terminal')))
                        }
                    >
                        <Icons.Terminal />
                        <span>Toggle Terminal</span>
                        <CommandShortcut>{Hotkey.TOGGLE_TERMINAL.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Insert Element add element insert palette"
                        onSelect={() => run(() => editorEngine.state.setElementPaletteOpen(true))}
                    >
                        <Icons.Plus />
                        <span>Insert Element…</span>
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
                        <span>Search Files…</span>
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
                        <span>New Chat</span>
                        <CommandShortcut>{Hotkey.NEW_AI_CHAT.readableCommand}</CommandShortcut>
                    </CommandItem>
                    <CommandItem
                        value="Restart Sandbox restart dev server"
                        onSelect={() =>
                            run(() => window.dispatchEvent(new Event('weblab:restart-sandbox')))
                        }
                    >
                        <Icons.Reload />
                        <span>Restart Sandbox</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
});
