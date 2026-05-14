import { forwardRef } from 'react';

import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';

interface FileTreeSearchProps {
    searchQuery: string;
    isLoading: boolean;
    onSearchChange: (query: string) => void;
    onRefresh?: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}

export const FileTreeSearch = forwardRef<HTMLInputElement, FileTreeSearchProps>(
    ({ searchQuery, isLoading, onSearchChange, onKeyDown }, ref) => {
        const clearSearch = () => {
            onSearchChange('');
            if (ref && typeof ref === 'object' && ref.current) {
                ref.current.focus();
            }
        };

        return (
            <div className="relative flex h-10 flex-shrink-0 flex-row items-center justify-between">
                <Input
                    ref={ref}
                    className="text-small m-2 h-8 pr-8"
                    placeholder="Search files"
                    value={searchQuery}
                    disabled={isLoading}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={onKeyDown}
                />
                {searchQuery && (
                    <button
                        className="hover:bg-background-bar-active group absolute top-[1px] right-[1px] bottom-[1px] flex aspect-square items-center justify-center rounded-r-[calc(theme(borderRadius.md)-1px)] transition-opacity active:bg-transparent"
                        onClick={clearSearch}
                        aria-label="Clear search"
                    >
                        <Icons.CrossS className="text-foreground-primary/50 group-hover:text-foreground-primary h-3 w-3" />
                    </button>
                )}
            </div>
        );
    },
);
