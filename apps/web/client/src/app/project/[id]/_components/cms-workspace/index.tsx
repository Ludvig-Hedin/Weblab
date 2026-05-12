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

    // Pill-style tab styling lifted from the editor right-panel tabs (Style /
    // Chat / Comments). Matches the rounded pill, soft strip background, equal
    // border radius on every corner, and 14px-tall dividers between tabs.
    const tabTriggerClass =
        'data-[state=active]:bg-background-tab-active data-[state=active]:border-border-tab-active text-mini h-8 gap-1.5 rounded-sm border border-transparent px-2.5';

    return (
        <div
            className={cn(
                'bg-background absolute inset-0 top-14 z-40 flex flex-col',
                'border-border border-t',
            )}
        >
            <div className="border-border flex h-14 items-center justify-between border-b px-4">
                <Tabs
                    value={tab}
                    onValueChange={(v) => editorEngine.state.setCmsTab(v as CmsTabValue)}
                >
                    <TabsList className="bg-background-tab-strip/70 h-9 gap-0 rounded-md p-0.5">
                        <TabsTrigger value={CmsTabValue.COLLECTIONS} className={tabTriggerClass}>
                            <Icons.ListBullet className="h-3.5 w-3.5" />
                            {t(transKeys.cms.workspace.tabs.collections)}
                        </TabsTrigger>
                        <div className="bg-border-tab-divider h-3.5 w-px self-center" />
                        <TabsTrigger value={CmsTabValue.FIELDS} className={tabTriggerClass}>
                            <Icons.Tokens className="h-3.5 w-3.5" />
                            {t(transKeys.cms.workspace.tabs.fields)}
                        </TabsTrigger>
                        <div className="bg-border-tab-divider h-3.5 w-px self-center" />
                        <TabsTrigger value={CmsTabValue.SOURCES} className={tabTriggerClass}>
                            <Icons.Layers className="h-3.5 w-3.5" />
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
