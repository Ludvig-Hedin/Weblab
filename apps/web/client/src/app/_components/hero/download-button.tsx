'use client';

import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';
import { AnimatedButton } from '../landing-page/animated';

/**
 * Hero download button.
 *
 * Routes to `/download` rather than triggering a direct download because we
 * want users to land on a page that surfaces all available platforms (Mac,
 * Windows, Linux, iOS) and the appropriate install instructions for each.
 *
 * Shared across every marketing hero variant, so the stagger + directional
 * sweep applied here propagates to all of them.
 */
export function DownloadButton() {
    return (
        <AnimatedButton
            href={Routes.DOWNLOAD}
            variant="outline"
            size="lg"
            leadingIcon={<Icons.Download className="h-4 w-4" />}
            className="border-foreground-secondary/30 text-foreground-primary"
        >
            Download
        </AnimatedButton>
    );
}
