'use client';

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';

interface FileFinderItem {
    path: string;
    label: string;
}

// Hard cap on rendered items. cmdk filters children client-side, and beyond a
// few thousand `CommandItem` nodes the open animation gets choppy. The cap
// only kicks in for unusually large repos and the input search filters
// narrow results well below it for normal usage.
const MAX_RENDERED = 500;
const FILE_LIST_TTL_MS = 5_000;

/**
 * `cmd+p` quick-open file finder.
 *
 * Opens via the `open-file-finder` window event (fired by the canvas
 * hotkey registration and by the global Command Palette). Lists every
 * file in the active branch's workspace (`branchData.codeEditor.listAll`)
 * and on Enter/click switches the editor to CODE mode and sets a
 * `codeNavigationOverride` pointing at the chosen path — the existing
 * code-tab plumbing then opens it in a tab.
 *
 * Range is line/col 1 (the editor handles this as "open without
 * scrolling") so we don't need parser metadata for the pick.
 */
export const FileFinder = observer(() => {
    const editorEngine = useEditorEngine();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<FileFinderItem[]>([]);
    const [loading, setLoading] = useState(false);
    // Cache the listing for a few seconds so re-opening the finder during
    // a session doesn't refetch every keystroke. Mirrors the chat-input
    // pre-warm pattern — same TTL.
    const cacheRef = useRef<{ items: FileFinderItem[]; timestamp: number } | null>(null);

    useEffect(() => {
        const handler = () => setOpen((prev) => !prev);
        window.addEventListener('open-file-finder', handler);
        return () => window.removeEventListener('open-file-finder', handler);
    }, []);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        const now = Date.now();
        const cached = cacheRef.current;
        if (cached && now - cached.timestamp < FILE_LIST_TTL_MS) {
            setItems(cached.items);
            return;
        }

        const load = async () => {
            try {
                setLoading(true);
                const branchData = editorEngine.branches.activeBranchData;
                const all = await branchData.codeEditor.listAll();
                if (cancelled) return;
                const fileItems: FileFinderItem[] = all
                    .filter(({ type }) => type === 'file')
                    .map(({ path }) => ({
                        path,
                        label: path.split('/').pop() ?? path,
                    }));
                cacheRef.current = { items: fileItems, timestamp: Date.now() };
                setItems(fileItems);
            } catch (err) {
                console.error('[FileFinder] Failed to list files:', err);
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [open, editorEngine]);

    const handleOpenChange = (next: boolean) => {
        if (!next) setQuery('');
        setOpen(next);
    };

    const openFile = (path: string) => {
        // Switch to CODE mode and ask the existing code-tab navigation
        // pipeline to open the file. `IdeManager.openFile` sets a
        // line/col-1 navigation target — a no-op range that opens the
        // tab without scrolling to a specific symbol.
        editorEngine.ide.openFile(path);
        setOpen(false);
    };

    // cmdk filters CommandItem children client-side on the `value` prop.
    // We must slice AFTER applying a local search filter so files beyond
    // the first 500 are still reachable via the query. Without this, any
    // file at alphabetical position > MAX_RENDERED would be silently hidden.
    const [query, setQuery] = useState('');
    const filtered = query
        ? items.filter((item) => {
              const q = query.toLowerCase();
              return item.label.toLowerCase().includes(q) || item.path.toLowerCase().includes(q);
          })
        : items;
    const visible = filtered.slice(0, MAX_RENDERED);

    return (
        <CommandDialog
            open={open}
            onOpenChange={handleOpenChange}
            title="Quick Open File"
            description="Search for a file in the project to open in the code editor."
        >
            <CommandInput placeholder="Search files…" autoFocus onValueChange={setQuery} />
            <CommandList>
                <CommandEmpty>{loading ? 'Loading files…' : 'No files found.'}</CommandEmpty>
                <CommandGroup heading="Files">
                    {visible.map((item) => (
                        <CommandItem
                            key={item.path}
                            value={`${item.label} ${item.path}`}
                            onSelect={() => openFile(item.path)}
                        >
                            <Icons.File />
                            <div className="flex min-w-0 flex-col">
                                <span className="truncate">{item.label}</span>
                                <span className="text-foreground-tertiary text-mini truncate">
                                    {item.path}
                                </span>
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
});
