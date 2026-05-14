'use client';

import { useEffect, useMemo, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@weblab/ui/sheet';
import { cn } from '@weblab/ui/utils';

interface NavGroup {
    id: string;
    label: string;
}

interface SubSection {
    id: string;
    label: string;
}

interface TocEntry extends NavGroup {
    children: SubSection[];
}

const SIDEBAR_COLLAPSED_KEY = 'weblab-ds-sidebar-collapsed';

export function DesignSidebar({
    groups,
    activeId,
    onJump,
}: {
    groups: NavGroup[];
    activeId: string;
    onJump: (id: string) => void;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        try {
            const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
            if (raw === '1') setCollapsed(true);
        } catch {
            // noop
        }
    }, []);

    const toggle = () => {
        setCollapsed((v) => {
            const next = !v;
            try {
                localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
            } catch {
                // noop
            }
            return next;
        });
    };

    if (!mounted) {
        return <div className="hidden w-56 shrink-0 lg:block" aria-hidden />;
    }

    return (
        <>
            {/* Desktop */}
            <aside
                className={cn(
                    'border-border bg-background sticky top-0 hidden h-screen shrink-0 border-r transition-[width] duration-200 lg:block',
                    collapsed ? 'w-12' : 'w-56',
                )}
            >
                <SidebarBody
                    groups={groups}
                    activeId={activeId}
                    onJump={onJump}
                    collapsed={collapsed}
                    toggle={toggle}
                />
            </aside>

            {/* Mobile */}
            <Sheet>
                <SheetTrigger asChild>
                    <button
                        type="button"
                        className="bg-background border-border text-foreground fixed top-3 left-3 z-40 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shadow-md lg:hidden"
                        aria-label="Open navigation"
                    >
                        <Icons.ListBullet className="h-3.5 w-3.5" />
                        TOC
                    </button>
                </SheetTrigger>
                <SheetContent
                    side="left"
                    className="bg-background border-border w-72 p-0 sm:max-w-xs"
                >
                    <SheetTitle className="sr-only">Design system navigation</SheetTitle>
                    <SidebarBody groups={groups} activeId={activeId} onJump={onJump} />
                </SheetContent>
            </Sheet>
        </>
    );
}

function SidebarBody({
    groups,
    activeId,
    onJump,
    collapsed = false,
    toggle,
}: {
    groups: NavGroup[];
    activeId: string;
    onJump: (id: string) => void;
    collapsed?: boolean;
    toggle?: () => void;
}) {
    const [query, setQuery] = useState('');
    const [toc, setToc] = useState<TocEntry[]>([]);

    // Build hierarchical TOC from DOM. Each group anchor is a top-level entry; every
    // `<section[id]>` nested under that group becomes a child.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const build = () => {
            const next: TocEntry[] = groups.map((g) => {
                const groupEl = document.getElementById(g.id);
                const children: SubSection[] = [];
                if (groupEl) {
                    // Walk forward until we hit the next group's id element.
                    let cursor: HTMLElement | null = groupEl.nextElementSibling as HTMLElement | null;
                    const nextGroupIdx = groups.findIndex((x) => x.id === g.id) + 1;
                    const stopId = groups[nextGroupIdx]?.id;
                    while (cursor && cursor.id !== stopId) {
                        cursor.querySelectorAll<HTMLElement>('section[id]').forEach((sec) => {
                            const heading = sec.querySelector('h2');
                            if (heading && sec.id !== g.id) {
                                const label = heading.textContent?.trim();
                                if (label && !children.some((c) => c.id === sec.id)) {
                                    children.push({ id: sec.id, label });
                                }
                            }
                        });
                        cursor = cursor.nextElementSibling as HTMLElement | null;
                    }
                }
                return { ...g, children };
            });
            setToc(next);
        };
        build();
        const obs = new MutationObserver(build);
        obs.observe(document.body, { childList: true, subtree: true });
        return () => obs.disconnect();
    }, [groups]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return toc;
        return toc
            .map((g) => {
                const groupMatch = g.label.toLowerCase().includes(q);
                const children = g.children.filter((c) => c.label.toLowerCase().includes(q));
                if (groupMatch || children.length > 0) {
                    return { ...g, children: groupMatch ? g.children : children };
                }
                return null;
            })
            .filter((g): g is TocEntry => g !== null);
    }, [toc, query]);

    if (collapsed) {
        return (
            <div className="flex h-full flex-col items-center gap-2 py-3">
                <button
                    type="button"
                    onClick={toggle}
                    className="text-foreground-tertiary hover:bg-foreground/5 hover:text-foreground rounded p-1.5"
                    aria-label="Expand sidebar"
                >
                    <Icons.ChevronRight className="h-3.5 w-3.5" />
                </button>
                {groups.map((g) => (
                    <button
                        key={g.id}
                        type="button"
                        onClick={() => onJump(g.id)}
                        title={g.label}
                        className={cn(
                            'flex h-7 w-7 items-center justify-center rounded text-[10px] font-mono transition-colors',
                            activeId === g.id
                                ? 'bg-foreground/10 text-foreground'
                                : 'text-foreground-tertiary hover:bg-foreground/5 hover:text-foreground',
                        )}
                    >
                        {g.label.slice(0, 2).toLowerCase()}
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <div className="border-border flex shrink-0 items-center justify-between border-b px-3 py-2.5">
                <p className="text-foreground-tertiary text-mini font-medium">
                    Design system
                </p>
                {toggle && (
                    <button
                        type="button"
                        onClick={toggle}
                        className="text-foreground-tertiary hover:bg-foreground/5 hover:text-foreground rounded p-1"
                        aria-label="Collapse sidebar"
                    >
                        <Icons.ChevronRight className="h-3.5 w-3.5 rotate-180" />
                    </button>
                )}
            </div>

            <div className="border-border shrink-0 border-b p-2">
                <div className="relative">
                    <Icons.MagnifyingGlass className="text-foreground-tertiary absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2" />
                    <Input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search"
                        className="h-7 pl-7 text-xs"
                    />
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-1.5 py-2">
                {filtered.length === 0 && (
                    <p className="text-foreground-tertiary px-2 py-3 text-xs">No matches.</p>
                )}
                {filtered.map((g) => (
                    <TocGroup key={g.id} group={g} activeId={activeId} onJump={onJump} />
                ))}
            </nav>

            <div className="border-border text-foreground-tertiary shrink-0 border-t px-3 py-2 text-[10px]">
                {toc.reduce((n, g) => n + g.children.length, 0)} sections · {toc.length} groups
            </div>
        </div>
    );
}

function TocGroup({
    group,
    activeId,
    onJump,
}: {
    group: TocEntry;
    activeId: string;
    onJump: (id: string) => void;
}) {
    const childActive = group.children.some((c) => c.id === activeId);
    const isOpen = childActive || activeId === group.id;

    return (
        <div className="mb-1">
            <button
                type="button"
                onClick={() => onJump(group.id)}
                className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors',
                    activeId === group.id || childActive
                        ? 'bg-foreground/8 text-foreground'
                        : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground',
                )}
            >
                <span className="truncate">{group.label}</span>
                {group.children.length > 0 && (
                    <span className="text-foreground-tertiary font-mono text-[10px]">
                        {group.children.length}
                    </span>
                )}
            </button>
            {isOpen && group.children.length > 0 && (
                <ul className="border-border mt-0.5 ml-3 space-y-0.5 border-l pl-2">
                    {group.children.map((c) => (
                        <li key={c.id}>
                            <button
                                type="button"
                                onClick={() => onJump(c.id)}
                                className={cn(
                                    'block w-full truncate rounded px-2 py-1 text-left text-[11px] transition-colors',
                                    activeId === c.id
                                        ? 'text-foreground bg-foreground/5'
                                        : 'text-foreground-tertiary hover:text-foreground hover:bg-foreground/5',
                                )}
                            >
                                {c.label}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
