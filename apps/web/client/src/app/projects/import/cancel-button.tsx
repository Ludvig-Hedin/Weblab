import { Routes } from '@/utils/constants';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import Link from 'next/link';

export const CancelButton = () => {
    return (
        <Button variant="outline" asChild className="rounded-lg cursor-pointer px-3 py-2 !border-gray-200 border-[0.5px]">
            <Link href={Routes.HOME}>
                <Icons.CrossL className="w-4 h-4" /> Cancel
            </Link>
        </Button>
    );
};