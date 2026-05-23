import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';

import type { SearchFilter, SearchResult, SearchScope } from './use-search';
import { useEditorEngine } from '@/components/store/editor';
import { SearchResultRow } from './search-result-row';
import { useSearch } from './use-search';

const FILTER_OPTIONS: { value: SearchFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'frames', label: 'Frames' },
    { value: 'text', label: 'Text' },
    { value: 'images', label: 'Images' },
    { value: 'components', label: 'Components' },
];

interface ResultListProps {
    results: SearchResult[];
    activeIndex: number;
    onSelect: (id: string) => void;
}

const ResultList = ({ results, activeIndex, onSelect }: ResultListProps) => {
    const activeRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const groups: {
        frameId: string;
        frameName: string;
        items: SearchResult[];
    }[] = [];
    for (const r of results) {
        const last = groups[groups.length - 1];
        if (last && last.frameId === r.frameId) {
            last.items.push(r);
        } else {
            groups.push({ frameId: r.frameId, frameName: r.frameName, items: [r] });
        }
    }

    return (
        <div className="flex flex-col gap-2 pb-2">
            {groups.map((group) => (
                <div key={group.frameId} className="flex flex-col gap-0.5">
                    <div className="text-foreground-primary/40 px-2 pt-1 pb-0.5 text-[10px] font-medium">
                        {group.frameName}
                    </div>
                    {group.items.map((result) => {
                        const isActive = results[activeIndex]?.id === result.id;
                        return (
                            <SearchResultRow
                                key={result.id}
                                ref={isActive ? activeRef : undefined}
                                result={result}
                                isActive={isActive}
                                onSelect={() => onSelect(result.id)}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export const SearchTab = observer(() => {
    const editorEngine = useEditorEngine();
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<SearchFilter>('all');
    const [scope, setScope] = useState<SearchScope>('page');
    const [filtersOpen, setFiltersOpen] = useState(false);

    const { results, totalCount, truncated, activeIndex, next, prev, jumpTo } = useSearch(
        query,
        filter,
        scope,
    );

    // cmd+f focus event from canvas/hotkeys
    useEffect(() => {
        const onFocus = () => {
            inputRef.current?.focus();
            inputRef.current?.select();
        };
        window.addEventListener('weblab:search:focus', onFocus);
        return () => window.removeEventListener('weblab:search:focus', onFocus);
    }, []);

    // Auto-focus when tab becomes active
    useEffect(() => {
        if (editorEngine.state.leftPanelTab === LeftPanelTabValue.SEARCH) {
            // Defer to next tick so the input is mounted
            const handle = setTimeout(() => inputRef.current?.focus(), 0);
            return () => clearTimeout(handle);
        }
    }, [editorEngine.state.leftPanelTab]);

    const handleEscape = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Escape') return;
        if (query) {
            setQuery('');
            e.stopPropagation();
        } else {
            editorEngine.state.setLeftPanelLocked(false);
            editorEngine.state.setLeftPanelTab(null);
        }
    };

    const scopeLabel = scope === 'page' ? 'This page' : 'Selected frame';
    const countLabel = truncated
        ? `Showing 500 of ${totalCount}`
        : `${totalCount} result${totalCount === 1 ? '' : 's'}`;

    return (
        <div className="text-active text-mini flex h-full w-full flex-col p-3">
            {/* Header: input + filter button */}
            <div className="mb-2 flex items-center gap-2">
                <div className="relative flex-1">
                    <Icons.MagnifyingGlass className="text-foreground-primary/50 pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                        ref={inputRef}
                        className="text-mini h-8 pr-8 pl-7"
                        placeholder="Find in design"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleEscape}
                    />
                    {query && (
                        <button
                            type="button"
                            aria-label="Clear search"
                            className="group absolute top-[1px] right-[1px] bottom-[1px] flex aspect-square items-center justify-center rounded-r-[calc(theme(borderRadius.md)-1px)]"
                            onClick={() => {
                                setQuery('');
                                inputRef.current?.focus();
                            }}
                        >
                            <Icons.CrossS className="text-foreground-primary/50 group-hover:text-foreground-primary h-3 w-3" />
                        </button>
                    )}
                </div>
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Filters"
                            className={
                                filter !== 'all'
                                    ? 'text-foreground h-8 w-8'
                                    : 'text-foreground-primary/70 hover:text-foreground h-8 w-8'
                            }
                        >
                            <Icons.MixerHorizontal className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="bottom" className="w-44 p-2">
                        <div className="text-foreground-primary/60 mb-1 px-1 text-[10px]">
                            Filter
                        </div>
                        <ToggleGroup
                            type="single"
                            value={filter}
                            onValueChange={(v) => {
                                if (v) setFilter(v as SearchFilter);
                            }}
                            className="flex flex-col items-stretch gap-0.5"
                        >
                            {FILTER_OPTIONS.map((opt) => (
                                <ToggleGroupItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-mini justify-start"
                                >
                                    {opt.label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Header: count + scope dropdown + nav arrows */}
            {query && (
                <div className="text-foreground-primary/60 mb-2 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1">
                        <span>{countLabel}</span>
                        <span>·</span>
                        <DropdownMenu>
                            <DropdownMenuTrigger className="hover:text-foreground inline-flex items-center gap-0.5">
                                {scopeLabel}
                                <Icons.ChevronDown className="h-3 w-3" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="text-mini">
                                <DropdownMenuItem onClick={() => setScope('page')}>
                                    This page
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setScope('frame')}>
                                    Selected frame
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="flex gap-0.5">
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Previous result"
                            className="h-6 w-6"
                            disabled={!results.length}
                            onClick={prev}
                        >
                            <Icons.ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Next result"
                            className="h-6 w-6"
                            disabled={!results.length}
                            onClick={next}
                        >
                            <Icons.ChevronDown className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Results / empty state */}
            <div className="flex-1 overflow-auto">
                {!query ? (
                    <div className="text-foreground-primary/50 flex h-full w-full items-center justify-center text-center">
                        Search elements, text, components, and images across all frames
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-foreground-primary/50 flex h-full w-full items-center justify-center">
                        No matches
                    </div>
                ) : (
                    <ResultList results={results} activeIndex={activeIndex} onSelect={jumpTo} />
                )}
            </div>
        </div>
    );
});
