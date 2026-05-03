import { useEditorEngine } from '@/components/store/editor';
import {
    getNestedPagePath,
    getParentPagePath,
    normalizePagePath,
} from '@/components/store/editor/pages/helper';
import { useStateManager } from '@/components/store/state';
import { api } from '@/trpc/react';
import { DefaultSettings } from '@weblab/constants';
import type { PageEditorIcon, PageMetadata } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Switch } from '@weblab/ui/switch';
import { toast } from '@weblab/ui/sonner';
import { createSecureUrl } from '@weblab/utility';
import { useEffect, useMemo, useState } from 'react';
import { MetadataForm } from './metadata-form';
import { useMetadataForm } from './use-metadata-form';

const PAGE_ICON_OPTIONS: Array<{
    value: PageEditorIcon;
    label: string;
    icon: React.ReactNode;
}> = [
    {
        value: 'file',
        label: 'File',
        icon: <Icons.File className="h-4 w-4" />,
    },
    {
        value: 'globe',
        label: 'Globe',
        icon: <Icons.Globe className="h-4 w-4" />,
    },
    {
        value: 'image',
        label: 'Image',
        icon: <Icons.Image className="h-4 w-4" />,
    },
    {
        value: 'button',
        label: 'Button',
        icon: <Icons.Button className="h-4 w-4" />,
    },
];

export const PageTab = ({ metadata, path }: { metadata?: PageMetadata; path: string }) => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    const { data: domains } = api.domain.getAll.useQuery({ projectId: editorEngine.projectId });
    const baseUrl = domains?.published?.url ?? domains?.preview?.url;
    const page = editorEngine.pages.getPageByPath(path);
    const isRoot = page?.isRoot ?? path === '/';

    const {
        title,
        titleObject,
        description,
        isDirty: metadataDirty,
        uploadedImage,
        isSimpleTitle,
        handleTitleChange,
        handleTitleTemplateChange,
        handleTitleAbsoluteChange,
        handleDescriptionChange,
        handleImageSelect,
        handleDiscard: handleMetadataDiscard,
        setIsDirty: setMetadataDirty,
        getFinalTitleMetadata,
    } = useMetadataForm({
        initialMetadata: metadata,
    });

    const initialDisplayName = page?.settings?.displayName ?? '';
    const initialEditorIcon = page?.settings?.editorIcon ?? 'file';
    const initialSlug = isRoot ? '' : normalizePagePath(path).split('/').filter(Boolean).pop() ?? '';
    const initialFolder = isRoot ? '/' : getParentPagePath(path);
    const initialIndexed = metadata?.robots?.index !== false;
    const initialDraft = page?.settings?.draft ?? false;
    const initialPublished = page?.settings?.published ?? true;

    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [editorIcon, setEditorIcon] = useState<PageEditorIcon>(initialEditorIcon);
    const [slug, setSlug] = useState(initialSlug);
    const [folderPath, setFolderPath] = useState(initialFolder);
    const [isIndexed, setIsIndexed] = useState(initialIndexed);
    const [isDraft, setIsDraft] = useState(initialDraft);
    const [isPublished, setIsPublished] = useState(initialPublished);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setDisplayName(initialDisplayName);
        setEditorIcon(initialEditorIcon);
        setSlug(initialSlug);
        setFolderPath(initialFolder);
        setIsIndexed(initialIndexed);
        setIsDraft(initialDraft);
        setIsPublished(initialPublished);
    }, [
        initialDisplayName,
        initialDraft,
        initialEditorIcon,
        initialFolder,
        initialIndexed,
        initialPublished,
        initialSlug,
    ]);

    const availableFolders = useMemo(() => {
        return [
            { value: '/', label: 'Root (/)' },
            ...editorEngine.pages.flatFolders
                .filter((folder) => folder.path !== path && !folder.path.startsWith(`${path}/`))
                .map((folder) => ({
                    value: folder.path,
                    label: folder.path,
                })),
        ];
    }, [editorEngine.pages.flatFolders, path]);

    const detailsDirty =
        displayName.trim() !== initialDisplayName.trim() ||
        editorIcon !== initialEditorIcon ||
        slug !== initialSlug ||
        folderPath !== initialFolder ||
        isIndexed !== initialIndexed ||
        isDraft !== initialDraft ||
        isPublished !== initialPublished;

    const nextPath = isRoot ? '/' : getNestedPagePath(folderPath, slug);
    const isDirty = metadataDirty || detailsDirty;

    const handleDiscard = () => {
        handleMetadataDiscard();
        setDisplayName(initialDisplayName);
        setEditorIcon(initialEditorIcon);
        setSlug(initialSlug);
        setFolderPath(initialFolder);
        setIsIndexed(initialIndexed);
        setIsDraft(initialDraft);
        setIsPublished(initialPublished);
    };

    const handleSave = async () => {
        if (!page) {
            return;
        }

        setIsSaving(true);
        try {
            const url = createSecureUrl(baseUrl);
            const finalTitle = getFinalTitleMetadata();
            const siteTitle =
                typeof finalTitle === 'string'
                    ? finalTitle
                    : finalTitle.absolute ?? finalTitle.default ?? '';

            const updatedMetadata: PageMetadata = {
                ...metadata,
                title: finalTitle,
                description,
                robots: {
                    ...metadata?.robots,
                    index: isIndexed,
                },
                openGraph: {
                    ...metadata?.openGraph,
                    title: siteTitle,
                    description,
                    url,
                    siteName: siteTitle,
                    type: 'website',
                },
            };

            if (!metadata?.metadataBase && url) {
                updatedMetadata.metadataBase = new URL(url);
            }

            if (uploadedImage) {
                try {
                    await editorEngine.image.upload(uploadedImage, DefaultSettings.IMAGE_FOLDER);
                    updatedMetadata.openGraph = {
                        ...updatedMetadata.openGraph,
                        images: [
                            {
                                url: `/${uploadedImage.name}`,
                                width: 1200,
                                height: 630,
                                alt: siteTitle,
                            },
                        ],
                        type: 'website',
                    };
                } catch (error) {
                    console.error('Failed to upload Open Graph image:', error);
                    toast.error('Failed to upload social preview image.');
                    return;
                }
            }

            const savedPath = await editorEngine.pages.savePageConfiguration(path, {
                nextPath,
                metadata: updatedMetadata,
                settings: {
                    displayName: displayName.trim() || undefined,
                    editorIcon: !isRoot && editorIcon !== 'file' ? editorIcon : undefined,
                    draft: isDraft || undefined,
                    published: isPublished ? undefined : false,
                },
            });

            stateManager.settingsTab = savedPath;
            setMetadataDirty(false);
            toast.success('Page settings updated successfully.');
        } catch (error) {
            console.error('Failed to update page settings:', error);
            toast.error('Failed to update page settings.', {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const detailsSection = (
        <div className="flex flex-col gap-4 text-foreground-weblab">
            <h2 className="text-title3">Editor Details</h2>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Name</p>
                    <p className="text-small">Shown inside the editor and settings lists.</p>
                </div>
                <Input
                    value={displayName}
                    placeholder={page?.defaultName ?? 'Page name'}
                    onChange={(event) => setDisplayName(event.target.value)}
                    disabled={editorEngine.pages.isScanning}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Editor Icon</p>
                    <p className="text-small">Visual only. This does not change the site favicon.</p>
                </div>
                <Select
                    value={editorIcon}
                    onValueChange={(value) => setEditorIcon(value as PageEditorIcon)}
                    disabled={editorEngine.pages.isScanning || isRoot}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an icon" />
                    </SelectTrigger>
                    <SelectContent>
                        {PAGE_ICON_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                <span className="flex items-center gap-2">
                                    {option.icon}
                                    {option.label}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Slug</p>
                    <p className="text-small">Controls the last route segment for this page.</p>
                </div>
                <Input
                    value={slug}
                    placeholder="page-slug"
                    onChange={(event) => setSlug(event.target.value.toLowerCase())}
                    disabled={editorEngine.pages.isScanning || isRoot}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Folder</p>
                    <p className="text-small">Moves the page into a route folder prefix.</p>
                </div>
                <Select
                    value={folderPath}
                    onValueChange={setFolderPath}
                    disabled={editorEngine.pages.isScanning || isRoot}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select folder" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableFolders.map((folder) => (
                            <SelectItem key={folder.value} value={folder.value}>
                                {folder.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Preview Path</p>
                    <p className="text-small">The route that will be saved when you apply changes.</p>
                </div>
                <div className="flex h-10 items-center rounded-md border border-border bg-background-secondary/40 px-3 text-miniPlus">
                    {nextPath}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Search Engine Indexing</p>
                    <p className="text-small">Controls `metadata.robots.index` for this page.</p>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border bg-background-secondary/40 px-3 py-2">
                    <span className="text-miniPlus">{isIndexed ? 'Indexable' : 'Noindex'}</span>
                    <Switch checked={isIndexed} onCheckedChange={(checked) => setIsIndexed(Boolean(checked))} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Draft</p>
                    <p className="text-small">Editor-only status for work that is not ready.</p>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border bg-background-secondary/40 px-3 py-2">
                    <span className="text-miniPlus">{isDraft ? 'Draft' : 'Ready'}</span>
                    <Switch checked={isDraft} onCheckedChange={(checked) => setIsDraft(Boolean(checked))} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col max-w-52">
                    <p className="text-regular font-medium">Published</p>
                    <p className="text-small">Editor-only published state shown in the page settings.</p>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border bg-background-secondary/40 px-3 py-2">
                    <span className="text-miniPlus">{isPublished ? 'Published' : 'Unpublished'}</span>
                    <Switch
                        checked={isPublished}
                        onCheckedChange={(checked) => setIsPublished(Boolean(checked))}
                    />
                </div>
            </div>
            {isRoot && (
                <div className="rounded-md border border-border bg-background-secondary/40 px-3 py-2 text-small text-foreground-secondary">
                    Home is locked to `/` and always uses the Home icon in the editor.
                </div>
            )}
        </div>
    );

    return (
        <div className="text-sm">
            <div className="flex flex-col gap-2 p-6">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg">Page Settings</h2>
                    {!isPublished && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
                            Unpublished
                        </Button>
                    )}
                    {isDraft && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
                            Draft
                        </Button>
                    )}
                </div>
            </div>
            <div className="relative">
                {editorEngine.pages.isScanning ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                        <div className="flex items-center gap-3 text-foreground-secondary">
                            <Icons.LoadingSpinner className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Fetching metadata...</span>
                        </div>
                    </div>
                ) : (
                    <MetadataForm
                        title={title}
                        titleObject={titleObject}
                        description={description}
                        isDirty={isDirty}
                        projectUrl={baseUrl}
                        isSimpleTitle={isSimpleTitle}
                        disabled={editorEngine.pages.isScanning}
                        isSaving={isSaving}
                        onTitleChange={handleTitleChange}
                        onTitleTemplateChange={handleTitleTemplateChange}
                        onTitleAbsoluteChange={handleTitleAbsoluteChange}
                        onDescriptionChange={handleDescriptionChange}
                        onImageSelect={handleImageSelect}
                        onDiscard={handleDiscard}
                        onSave={handleSave}
                        currentMetadata={metadata}
                        isRoot={isRoot}
                        leadingContent={detailsSection}
                    />
                )}
            </div>
        </div>
    );
};
