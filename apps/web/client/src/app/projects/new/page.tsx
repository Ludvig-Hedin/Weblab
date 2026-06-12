'use client';

import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import { Create } from '@/app/_components/hero/create';
import { CreateManagerProvider } from '@/components/store/create';
import { ProjectChooserCards } from '../_components/project-chooser-cards';
import { PROJECT_SUGGESTIONS } from '../_components/select';
import { TopBar } from '../_components/top-bar';

const Page = () => {
    const user = useQuery(api.users.me, {});
    const [isCreatingFromPrompt, setIsCreatingFromPrompt] = useState(false);
    const [shouldResumeCreate, setShouldResumeCreate] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const shouldResume = params.get('resumeCreate') === '1';
        setShouldResumeCreate(shouldResume);
        // Strip the param so a browser back/refresh after this mount cannot
        // re-fire auto-submit and create a duplicate project. Only mutate
        // history when the param was actually present so we never push a
        // pointless replaceState entry.
        if (shouldResume) {
            params.delete('resumeCreate');
            const search = params.toString();
            const newUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
            window.history.replaceState(null, '', newUrl);
        }
    }, []);

    return (
        <CreateManagerProvider>
            <div className="bg-background flex h-screen w-screen flex-col">
                <TopBar />
                <div className="relative flex-1 overflow-y-auto">
                    <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-6 py-10 select-none">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <h1 className="text-foreground text-3xl font-medium tracking-tight">
                                Start a new project
                            </h1>
                            <p className="text-foreground-secondary max-w-md text-sm leading-relaxed">
                                Describe what you want to build, or pick a starting point below.
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
                                // `user` is `undefined` while the query loads and
                                // coerces to `null` (logged-out) above. Hold the
                                // restored-draft auto-submit until it resolves so a
                                // signed-in user isn't bounced to the auth modal
                                // mid-load.
                                autoSubmitRestoredDraft={shouldResumeCreate && user !== undefined}
                                suggestions={PROJECT_SUGGESTIONS}
                            />
                        </div>

                        <ProjectChooserCards aiBusy={isCreatingFromPrompt} />
                    </div>
                </div>
            </div>
        </CreateManagerProvider>
    );
};

export default Page;
