'use client';

import { useState } from 'react';

import { Create } from '@/app/_components/hero/create';
import { CreateManagerProvider } from '@/components/store/create';
import { useGetBackground } from '@/hooks/use-get-background';
import { api } from '@/trpc/react';
import { ExternalTemplates } from '../_components/templates/external-templates';
import { EXTERNAL_TEMPLATES } from '../_components/templates/template-data';
import { TopBar } from '../_components/top-bar';

const Page = () => {
    const { data: user } = api.user.get.useQuery();
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const backgroundUrl = useGetBackground('create');

    return (
        <CreateManagerProvider>
            <div
                className="flex h-screen w-screen flex-col"
                style={{
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundImage: `url(${backgroundUrl})`,
                }}
            >
                <TopBar />
                <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-12 overflow-y-auto px-6 py-14 select-none">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <h1 className="text-foreground text-5xl font-light tracking-tight">
                            Never start from scratch
                        </h1>
                        <p className="text-foreground-secondary text-lg">
                            Describe what you want to build, or start from a proven Next.js
                            template.
                        </p>
                    </div>
                    <Create
                        cardKey={0}
                        isCreatingProject={isCreatingProject}
                        setIsCreatingProject={setIsCreatingProject}
                        user={user ?? null}
                    />
                    <ExternalTemplates templates={EXTERNAL_TEMPLATES} />
                </div>
            </div>
        </CreateManagerProvider>
    );
};

export default Page;
