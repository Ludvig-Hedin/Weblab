'use client';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';

/**
 * Hero download button.
 *
 * Routes to `/download` rather than triggering a direct download because we
 * want users to land on a page that surfaces all available platforms (Mac,
 * Windows, Linux, iOS) and the appropriate install instructions for each.
 */
export function DownloadButton() {
    return (
        <Button
            asChild
            variant="outline"
            className="border-foreground-secondary/30 text-foreground-primary hover:bg-foreground-secondary/10"
        >
            <a href={Routes.DOWNLOAD}>
                <Icons.Download className="h-4 w-4" />
                Download
            </a>
        </Button>
    );
}
