'use client';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { AssetSort } from './hooks/use-asset-browse';

const SORT_LABELS: Record<AssetSort, string> = {
    'name-asc': 'Name (A–Z)',
    'name-desc': 'Name (Z–A)',
    'modified-desc': 'Newest first',
    'modified-asc': 'Oldest first',
    'size-desc': 'Largest first',
    type: 'Type',
};

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

export const AssetSortMenu = ({ sort, setSort }: AssetSortMenuProps) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <button
                type="button"
                className="text-foreground-secondary hover:text-foreground-primary text-mini flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors"
            >
                <Icons.ListBullet className="h-3.5 w-3.5" />
                <span>{SORT_LABELS[sort]}</span>
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
                        {SORT_LABELS[option]}
                    </DropdownMenuRadioItem>
                ))}
            </DropdownMenuRadioGroup>
        </DropdownMenuContent>
    </DropdownMenu>
);
