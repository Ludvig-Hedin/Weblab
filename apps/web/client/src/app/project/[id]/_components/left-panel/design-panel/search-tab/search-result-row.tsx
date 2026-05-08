import { forwardRef } from 'react';

import { NodeIcon } from '@weblab/ui/node-icon';
import { cn } from '@weblab/ui/utils';

import type { SearchResult } from './use-search';
import { Highlight } from './highlight';

interface SearchResultRowProps {
    result: SearchResult;
    isActive: boolean;
    onSelect: () => void;
    onHover?: () => void;
}

const fieldDescriptor = (result: SearchResult): string | null => {
    switch (result.matchField) {
        case 'component':
            return `<${result.layer.tagName}>${result.layer.component ? ` · ${result.layer.component}` : ''}`;
        case 'textContent':
            return `<${result.layer.tagName}>`;
        case 'htmlId':
            return `#${result.matchSnippet}`;
        case 'tagName':
            return result.layer.component ? result.layer.component : null;
        default:
            return null;
    }
};

export const SearchResultRow = forwardRef<HTMLButtonElement, SearchResultRowProps>(
    ({ result, isActive, onSelect, onHover }, ref) => {
        const descriptor = fieldDescriptor(result);
        return (
            <button
                ref={ref}
                type="button"
                onClick={onSelect}
                onMouseEnter={onHover}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect();
                    }
                }}
                className={cn(
                    'text-mini flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    isActive
                        ? 'bg-background-tertiary text-foreground-primary border-border border'
                        : 'text-foreground-secondary hover:bg-background-tertiary/60 hover:text-foreground-primary border border-transparent',
                )}
            >
                <NodeIcon
                    iconClass="h-3.5 w-3.5 shrink-0 text-foreground-primary/70"
                    tagName={result.layer.tagName}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">
                        <Highlight
                            text={result.matchSnippet}
                            start={result.matchStart}
                            end={result.matchEnd}
                        />
                    </span>
                    {descriptor && (
                        <span className="text-foreground-primary/50 truncate text-[10px]">
                            {descriptor}
                        </span>
                    )}
                </div>
            </button>
        );
    },
);

SearchResultRow.displayName = 'SearchResultRow';
