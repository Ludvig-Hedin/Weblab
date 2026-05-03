import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { APP_NAME } from '@/lib/site';
import { Icons } from '@/components/icons';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
    nav: {
        title: (
            <div className="flex items-center gap-2">
                <Icons.WeblabLogo className="w-4 h-4" />
                <span>{APP_NAME} Docs</span>
            </div>
        ),
    },
    links: [
        {
            type: 'main',
            text: 'GitHub',
            url: 'https://github.com/Ludvig-Hedin/Weblab',
            external: true,
            icon: <Icons.GitHubLogo className="w-4 h-4" />
        },
        // {
        //     type: 'main',
        //     text: 'Discord',
        //     url: 'https://discord.gg/hERDfFZCsH',
        //     external: true,
        //     icon: <Icons.DiscordLogo className="w-4 h-4" />
        // }
    ]
};
