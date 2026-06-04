'use client';

import { CreateManagerProvider } from '@/components/store/create';
import { ExternalTemplates } from '../_components/templates/external-templates';
import { EXTERNAL_TEMPLATES } from '../_components/templates/template-data';
import { TopBar } from '../_components/top-bar';

const MarketplacePage = () => {
    return (
        <CreateManagerProvider>
            <div className="flex h-screen w-screen flex-col">
                <TopBar />
                <div className="flex h-full w-full justify-center overflow-x-visible overflow-y-auto">
                    <div className="mx-auto w-full max-w-6xl px-6 py-10">
                        <ExternalTemplates
                            templates={EXTERNAL_TEMPLATES}
                            title="Templates"
                            description="Start from a proven Next.js template — preview live, or open the details for source and related options."
                        />
                    </div>
                </div>
            </div>
        </CreateManagerProvider>
    );
};

export default MarketplacePage;
