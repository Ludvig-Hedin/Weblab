'use client';

import { useTranslations } from 'next-intl';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
} from '@weblab/ui/breadcrumb';
import { Icons } from '@weblab/ui/icons';

import type { BreadcrumbSegment } from './types';

interface BreadcrumbNavigationProps {
    breadcrumbSegments: BreadcrumbSegment[];
    onNavigate: (path: string) => void;
}

export const BreadcrumbNavigation = ({
    breadcrumbSegments,
    onNavigate,
}: BreadcrumbNavigationProps) => {
    const t = useTranslations('editor.leftPanel.assets');
    return (
        <Breadcrumb>
            <BreadcrumbList className="gap-1 sm:gap-1">
                <BreadcrumbItem>
                    <BreadcrumbLink
                        className="hover:text-foreground-primary cursor-pointer"
                        onClick={() => onNavigate('/')}
                    >
                        {t('root')}
                    </BreadcrumbLink>
                </BreadcrumbItem>
                {breadcrumbSegments.map((segment, index) => (
                    <div className="flex items-center gap-1" key={segment.path}>
                        <BreadcrumbSeparator className="m-0 p-0">
                            <Icons.ChevronRight className="m-0 h-3 w-3 p-0" />
                        </BreadcrumbSeparator>
                        <BreadcrumbItem key={segment.path}>
                            <BreadcrumbLink
                                className={
                                    index === breadcrumbSegments.length - 1
                                        ? 'text-foreground-primary font-medium'
                                        : 'hover:text-foreground-primary cursor-pointer'
                                }
                                onClick={() =>
                                    index !== breadcrumbSegments.length - 1 &&
                                    onNavigate(segment.path)
                                }
                            >
                                {segment.name}
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                    </div>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
};
