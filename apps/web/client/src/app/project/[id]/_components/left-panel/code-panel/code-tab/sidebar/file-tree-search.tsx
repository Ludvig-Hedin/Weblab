import { forwardRef } from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

interface FileTreeSearchProps {
    searchQuery: string;
    isLoading: boolean;
    onSearchChange: (query: string) => void;
    onRefresh?: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
}

export const FileTreeSearch = forwardRef<HTMLInputElement, FileTreeSearchProps>(
    ({ searchQuery, isLoading, onSearchChange, onKeyDown }, ref) => {
        const t = useTranslations('editor.leftPanel.codePanel');
        const clearSearch = () => {
            onSearchChange('');
            if (ref && typeof ref === 'object' && ref.current) {
                ref.current.focus();
            }
        };

        return (
            <div className="flex-shrink-0 p-2">
                <label className="bg-foreground/[0.045] focus-within:bg-foreground/[0.07] focus-within:ring-foreground/15 relative flex h-8 items-center gap-2 rounded-md px-2.5 transition-colors focus-within:ring-1">
                    <Icons.MagnifyingGlass className="text-foreground-tertiary h-3.5 w-3.5 flex-none" />
                    <input
                        ref={ref}
                        className="text-small text-foreground-primary placeholder:text-foreground-tertiary min-w-0 flex-1 bg-transparent outline-none disabled:opacity-50"
                        placeholder={t('searchFiles')}
                        value={searchQuery}
                        disabled={isLoading}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        spellCheck={false}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="text-foreground-tertiary hover:text-foreground-primary -mr-1 flex h-5 w-5 flex-none items-center justify-center rounded"
                            onClick={clearSearch}
                            aria-label={t('clearSearch')}
                        >
                            <Icons.CrossS className="h-3 w-3" />
                        </button>
                    )}
                </label>
            </div>
        );
    },
);
