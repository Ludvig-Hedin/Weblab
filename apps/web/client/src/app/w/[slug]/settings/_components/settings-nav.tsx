'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@weblab/ui/utils';

interface SettingsNavProps {
    slug: string;
    canUpdate: boolean;
    canManageMembers: boolean;
    canInvite: boolean;
}

export function SettingsNav({ slug, canUpdate, canManageMembers, canInvite }: SettingsNavProps) {
    const pathname = usePathname();
    const base = `/w/${slug}/settings`;

    const items: { label: string; href: string; visible: boolean }[] = [
        { label: 'General', href: `${base}/general`, visible: true },
        { label: 'Members', href: `${base}/members`, visible: canManageMembers },
        { label: 'Invitations', href: `${base}/invitations`, visible: canInvite },
        // TODO: move to a workspace-scoped /w/[slug]/settings/billing route once
        // workspace-level subscriptions land. For now this points at the global
        // pricing page so users can reach billing from settings.
        { label: 'Billing', href: '/pricing', visible: true },
    ];

    return (
        <nav className="flex w-44 shrink-0 flex-col gap-0.5">
            {items
                .filter((i) => i.visible)
                .map((item) => {
                    const active = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                                'rounded-md px-3 py-1.5 text-sm transition-colors',
                                active
                                    ? 'bg-background-secondary text-foreground'
                                    : 'text-foreground-secondary hover:text-foreground hover:bg-background-secondary/60',
                            )}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            {!canUpdate && (
                <p className="text-foreground-tertiary mt-4 px-3 text-xs">View-only access</p>
            )}
        </nav>
    );
}
