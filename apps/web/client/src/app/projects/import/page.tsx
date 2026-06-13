'use client';

import { useRouter } from 'next/navigation';

import { APP_NAME } from '@weblab/constants';
import { Card, CardDescription, CardHeader, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { useGetBackground } from '@/hooks/use-get-background';
import { TopBar } from '../_components/top-bar';

const Page = () => {
    const router = useRouter();
    const handleCardClick = (type: 'local' | 'github' | 'figma') => {
        router.push(`/projects/import/${type}`);
    };
    const backgroundUrl = useGetBackground('create');

    return (
        <div
            className="flex h-screen w-screen flex-col"
            style={{
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundImage: `url(${backgroundUrl})`,
            }}
        >
            <TopBar />
            <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center gap-6 overflow-hidden p-6 select-none">
                <Card
                    className={`bg-background/80 border-foreground-tertiary/50 h-64 w-full cursor-pointer border-[0.5px] backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg`}
                    onClick={() => handleCardClick('local')}
                    tabIndex={0}
                    role="button"
                    aria-label="Import local project"
                >
                    <CardHeader className="flex h-full flex-col justify-between">
                        <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-lg select-none">
                            <Icons.Upload className="text-primary h-6 w-6" />
                        </div>
                        <div className="space-y-2">
                            <CardTitle className="text-title3">Import a Local Project</CardTitle>
                            <CardDescription className="text-sm text-balance">
                                Select a directory from your computer to start working with your
                                project in {APP_NAME}.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
                <Card
                    className={
                        'bg-background/80 border-foreground-tertiary/50 h-64 w-full cursor-pointer border-[0.5px] backdrop-blur-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg'
                    }
                    onClick={() => handleCardClick('github')}
                    tabIndex={0}
                    role="button"
                    aria-label="Connect to GitHub"
                >
                    <CardHeader className="flex h-full flex-col justify-between">
                        <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-lg select-none">
                            <Icons.GitHubLogo className="text-primary h-6 w-6" />
                        </div>
                        <div className="space-y-2">
                            <CardTitle className="text-title3">Import from GitHub</CardTitle>
                            <CardDescription className="text-sm text-balance">
                                Connect your GitHub account to access and work with your
                                repositories
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
                {/* Figma import is gated until the sandbox-provisioning port
                    lands (TODO(sandbox-port) in figma/_context). Presenting it
                    as clickable let users complete two real steps (fetch +
                    select frames) only to hit a throwing stub at finalize —
                    show it as "Coming soon" and disable entry instead. */}
                <Card
                    className="bg-background/60 border-foreground-tertiary/50 h-64 w-full cursor-not-allowed border-[0.5px] opacity-60 backdrop-blur-xl"
                    aria-disabled="true"
                    aria-label="Import from Figma (coming soon)"
                >
                    <CardHeader className="flex h-full flex-col justify-between">
                        <div className="flex items-start justify-between">
                            <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-lg select-none">
                                <Icons.Figma className="text-primary h-6 w-6" />
                            </div>
                            <span className="border-foreground-tertiary/40 text-foreground-secondary rounded-full border px-2 py-0.5 text-xs">
                                Coming soon
                            </span>
                        </div>
                        <div className="space-y-2">
                            <CardTitle className="text-title3">Import from Figma</CardTitle>
                            <CardDescription className="text-sm text-balance">
                                Paste a Figma file URL to import your designs as React component
                                stubs.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            </div>
        </div>
    );
};

export default Page;
