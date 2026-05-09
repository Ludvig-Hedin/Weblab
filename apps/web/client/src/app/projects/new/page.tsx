'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { Create } from '@/app/_components/hero/create';
import { CreateManagerProvider } from '@/components/store/create';
import { useGetBackground } from '@/hooks/use-get-background';
import { api } from '@/trpc/react';
import { ProjectChooserCards } from '../_components/project-chooser-cards';
import { PROJECT_SUGGESTIONS } from '../_components/select';
import { ExternalTemplates } from '../_components/templates/external-templates';
import { EXTERNAL_TEMPLATES } from '../_components/templates/template-data';
import { TopBar } from '../_components/top-bar';

const Page = () => {
    const { data: user } = api.user.get.useQuery();
    const [isCreatingFromPrompt, setIsCreatingFromPrompt] = useState(false);
    const [shouldResumeCreate, setShouldResumeCreate] = useState(false);
    const backgroundUrl = useGetBackground('create');

    useEffect(() => {
        setShouldResumeCreate(
            new URLSearchParams(window.location.search).get('resumeCreate') === '1',
        );
    }, []);

    return (
        <CreateManagerProvider>
            <div className="bg-background flex h-screen w-screen flex-col">
                <TopBar />
                <div className="relative flex-1 overflow-y-auto">
                    <motion.div
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.45 }}
                        transition={{ duration: 1.4, ease: 'easeOut' }}
                        className="pointer-events-none absolute inset-x-0 top-0 h-[min(640px,80vh)]"
                        style={{
                            backgroundImage: `url(${backgroundUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center top',
                            backgroundRepeat: 'no-repeat',
                            WebkitMaskImage:
                                'linear-gradient(to bottom, black 30%, transparent 100%)',
                            maskImage: 'linear-gradient(to bottom, black 30%, transparent 100%)',
                        }}
                    />
                    <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-12 px-6 py-12 select-none">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <h1 className="text-foreground text-[42px] leading-[1.05] font-light tracking-[-0.02em]">
                                Start a new project
                            </h1>
                            <p className="text-foreground-secondary max-w-md text-sm leading-relaxed">
                                Describe what you want to build, or pick a different starting point.
                                You can rename and tweak everything once the editor opens.
                            </p>
                        </div>

                        {/* Primary path: AI prompt. The widest, most prominent surface
                            because this is the fastest path from intent to running site. */}
                        <div className="w-full">
                            <Create
                                cardKey={0}
                                isCreatingProject={isCreatingFromPrompt}
                                setIsCreatingProject={setIsCreatingFromPrompt}
                                user={user ?? null}
                                autoSubmitRestoredDraft={shouldResumeCreate}
                                suggestions={PROJECT_SUGGESTIONS}
                            />
                        </div>

                        <ProjectChooserCards aiBusy={isCreatingFromPrompt} />

                        <ExternalTemplates templates={EXTERNAL_TEMPLATES} />
                    </div>
                </div>
            </div>
        </CreateManagerProvider>
    );
};

export default Page;
