'use client';

import { useEffect, useRef, useState } from 'react';

import type { TocItem } from '@/lib/blog';
import { cn } from '@/lib/utils';

interface TableOfContentsProps {
    toc: TocItem[];
}

export function TableOfContents({ toc }: TableOfContentsProps) {
    const [activeId, setActiveId] = useState<string>(toc[0]?.id ?? '');
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        if (toc.length === 0) return;

        const headingIds = toc.map((item) => item.id);
        const visibleMap = new Map<string, boolean>();

        observerRef.current = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    visibleMap.set(entry.target.id, entry.isIntersecting);
                }
                const firstVisible = headingIds.find((id) => visibleMap.get(id));
                if (firstVisible) setActiveId(firstVisible);
            },
            { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
        );

        const elements = headingIds
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => el !== null);

        for (const el of elements) observerRef.current.observe(el);

        return () => observerRef.current?.disconnect();
    }, [toc]);

    if (toc.length === 0) return null;

    return (
        <nav aria-label="Table of contents">
            <p className="text-foreground-tertiary mb-4 text-xs font-medium">On this page</p>
            <ul className="flex flex-col">
                {toc.map((item) => (
                    <li key={item.id}>
                        <a
                            href={`#${item.id}`}
                            className={cn(
                                'block border-l-2 py-1 pl-3 text-sm transition-colors duration-150',
                                item.depth === 3 && 'pl-6',
                                activeId === item.id
                                    ? 'border-foreground-primary text-foreground-primary font-medium'
                                    : 'text-foreground-tertiary hover:text-foreground-secondary hover:border-foreground-primary/30 border-transparent',
                            )}
                            onClick={(e) => {
                                e.preventDefault();
                                const el = document.getElementById(item.id);
                                if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    history.pushState(null, '', `#${item.id}`);
                                    setActiveId(item.id);
                                }
                            }}
                        >
                            {item.text}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
