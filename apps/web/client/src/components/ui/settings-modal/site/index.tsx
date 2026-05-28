import { useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { DefaultSettings } from '@weblab/constants';
import { type PageMetadata } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { createSecureUrl } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { MetadataForm } from './metadata-form';
import { useMetadataForm } from './use-metadata-form';

export const SiteTab = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;
    const domains = useQuery(api.domains.getAll, { projectId });
    const baseUrl = domains?.published?.url ?? domains?.preview?.url;

    const homePage = useMemo(() => {
        return editorEngine.pages.getPageByPath('/');
    }, [editorEngine.pages.tree]);

    const {
        title,
        titleObject,
        description,
        isDirty,
        uploadedImage,
        isSimpleTitle,
        handleTitleChange,
        handleTitleTemplateChange,
        handleTitleAbsoluteChange,
        handleDescriptionChange,
        handleImageSelect,
        handleDiscard,
        setIsDirty,
        getFinalTitleMetadata,
    } = useMetadataForm({
        initialMetadata: homePage?.metadata ?? {},
    });

    const [uploadedFavicon, setUploadedFavicon] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleFaviconSelect = (file: File) => {
        setUploadedFavicon(file);
        setIsDirty(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const url = createSecureUrl(baseUrl);
            const finalTitle = getFinalTitleMetadata();
            const siteTitle =
                typeof finalTitle === 'string'
                    ? finalTitle
                    : (finalTitle.absolute ?? finalTitle.default ?? '');

            const updatedMetadata: PageMetadata = {
                ...(homePage?.metadata ?? {}),
                title: finalTitle,
                description,
                openGraph: {
                    ...homePage?.metadata?.openGraph,
                    title: siteTitle,
                    description: description,
                    url,
                    siteName: siteTitle,
                    type: 'website',
                },
            };

            if (!homePage?.metadata?.metadataBase) {
                if (url) {
                    updatedMetadata.metadataBase = new URL(url);
                }
            }

            if (uploadedFavicon) {
                let faviconPath;
                try {
                    await editorEngine.image.upload(uploadedFavicon, DefaultSettings.IMAGE_FOLDER);
                    faviconPath = `/${uploadedFavicon.name}`;
                } catch (error) {
                    toast.error('Failed to upload favicon. Please try again.');
                    return;
                }
                updatedMetadata.icons = {
                    icon: faviconPath,
                };
            }
            if (uploadedImage) {
                let imagePath;
                try {
                    await editorEngine.image.upload(uploadedImage, DefaultSettings.IMAGE_FOLDER);
                    imagePath = `/${uploadedImage.name}`;
                } catch (error) {
                    // Mirror the favicon branch above: surface the failure
                    // so the user knows the OG image won't be saved.
                    console.error('Failed to upload OG image:', error);
                    toast.error('Failed to upload OG image. Please try again.');
                    return;
                }
                updatedMetadata.openGraph = {
                    ...updatedMetadata.openGraph,
                    images: [
                        {
                            url: imagePath,
                            width: 1200,
                            height: 630,
                            alt: siteTitle,
                        },
                    ],
                    type: 'website',
                };
            }

            await editorEngine.pages.updateMetadataPage('/', updatedMetadata);
            setUploadedFavicon(null);
            setIsDirty(false);
            toast.success('Site metadata has been updated successfully.', {});
        } catch (error) {
            console.error('Failed to update metadata:', error);
            toast.error('Failed to update site metadata. Please try again.', {
                description: 'Failed to update site metadata. Please try again.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="text-regular">
            <div className="flex flex-col gap-2 p-6">
                <h2 className="text-largePlus">Site Settings</h2>
            </div>
            <div className="relative">
                {editorEngine.pages.isScanning ? (
                    <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-foreground-secondary flex items-center gap-3">
                            <Icons.LoadingSpinner className="h-5 w-5 animate-spin" />
                            <span className="text-small">Fetching metadata...</span>
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
                        onFaviconSelect={handleFaviconSelect}
                        onDiscard={handleDiscard}
                        onSave={handleSave}
                        showFavicon={true}
                        currentMetadata={homePage?.metadata ?? {}}
                        isRoot={true}
                    />
                )}
            </div>
        </div>
    );
});
