'use client';

import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { CmsTabValue, EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Tabs, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { CollectionsTab } from './collections-tab';
import { CreateCollectionDialog } from './create-collection-dialog';
import { FieldsTab } from './fields-tab';
import { SourcesTab } from './sources-tab';

/**
 * CMS workspace overlay. Shown when the editor mode is CMS — covers the
 * canvas while leaving the top bar visible. Mirrors the PreviewOverlay
 * mount pattern in main.tsx.
 */
export const CmsWorkspace = observer(() => {
    const editorEngine = useEditorEngine();
    const tab = editorEngine.state.cmsTab;
    const t = useTranslations();

    return (
        <div
            className={cn(
                'bg-background absolute inset-0 top-14 z-40 flex flex-col',
                'border-border border-t',
            )}
        >
            <div className="border-border flex h-12 items-center justify-between border-b px-4">
                <Tabs
                    value={tab}
                    onValueChange={(v) => editorEngine.state.setCmsTab(v as CmsTabValue)}
                >
                    <TabsList>
                        <TabsTrigger value={CmsTabValue.COLLECTIONS}>
                            {t(transKeys.cms.workspace.tabs.collections)}
                        </TabsTrigger>
                        <TabsTrigger value={CmsTabValue.FIELDS}>
                            {t(transKeys.cms.workspace.tabs.fields)}
                        </TabsTrigger>
                        <TabsTrigger value={CmsTabValue.SOURCES}>
                            {t(transKeys.cms.workspace.tabs.sources)}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editorEngine.state.setEditorMode(EditorMode.DESIGN)}
                >
                    <Icons.CrossL className="mr-1.5 h-3.5 w-3.5" />
                    {t(transKeys.cms.workspace.closeCms)}
                </Button>
            </div>

            <div className="flex-1 overflow-hidden">
                {tab === CmsTabValue.COLLECTIONS && <CollectionsTab />}
                {tab === CmsTabValue.FIELDS && <FieldsTab />}
                {tab === CmsTabValue.SOURCES && <SourcesTab />}
            </div>

            <CreateCollectionDialog />
        </div>
    );
});
