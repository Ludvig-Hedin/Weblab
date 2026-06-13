'use client';

import { useTranslations } from 'next-intl';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { AssetSort } from './hooks/use-asset-browse';

const SORT_ORDER: AssetSort[] = [
    'name-asc',
    'name-desc',
    'modified-desc',
    'modified-asc',
    'size-desc',
    'type',
];

interface AssetSortMenuProps {
    sort: AssetSort;
    setSort: (sort: AssetSort) => void;
}

export const AssetSortMenu = ({ sort, setSort }: AssetSortMenuProps) => {
    const t = useTranslations('editor.leftPanel.assets');

    const sortLabel: Record<AssetSort, string> = {
        'name-asc': t('sortNameAsc'),
        'name-desc': t('sortNameDesc'),
        'modified-desc': t('sortModifiedDesc'),
        'modified-asc': t('sortModifiedAsc'),
        'size-desc': t('sortSizeDesc'),
        type: t('sortType'),
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="text-foreground-secondary hover:text-foreground-primary text-mini flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors"
                >
                    <Icons.ListBullet className="h-3.5 w-3.5" />
                    <span>{sortLabel[sort]}</span>
                    <Icons.ChevronDown className="h-3 w-3 opacity-60" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(value) => setSort(value as AssetSort)}
                >
                    {SORT_ORDER.map((option) => (
                        <DropdownMenuRadioItem key={option} value={option}>
                            {sortLabel[option]}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
