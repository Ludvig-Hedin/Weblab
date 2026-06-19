import { useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { DefaultSettings } from '@weblab/constants';
import { type PageMetadata } from '@weblab/models';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { createSecureUrl } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { MetadataForm } from './metadata-form';
import { useMetadataForm } from './use-metadata-form';

// Favicon icons can be a single value or a [light, dark] media-query array.
// Pull display URLs back out for the upload thumbnails.
function extractFaviconUrls(icons: PageMetadata['icons']): { light?: string; dark?: string } {
    const icon = icons?.icon;
    if (!icon) return {};
    const toUrl = (d: unknown): string | undefined => {
        if (typeof d === 'string') return d;
        if (d instanceof URL) return d.toString();
        if (d && typeof d === 'object' && 'url' in d) {
            const u = (d as { url: unknown }).url;
            return typeof u === 'string' ? u : u instanceof URL ? u.toString() : undefined;
        }
        return undefined;
    };
    if (Array.isArray(icon)) {
        let light: string | undefined;
        let dark: string | undefined;
        for (const descriptor of icon) {
            const rawMedia =
                descriptor && typeof descriptor === 'object' && 'media' in descriptor
                    ? (descriptor as { media?: unknown }).media
                    : undefined;
            const media = typeof rawMedia === 'string' ? rawMedia : '';
            const url = toUrl(descriptor);
            if (media.includes('dark')) dark = dark ?? url;
            else light = light ?? url;
        }
        return { light, dark };
    }
    return { light: toUrl(icon) };
}

export const SiteTab = observer(() => {
    const t = useTranslations('settings.site');
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;
    const domains = useQuery(api.domains.getAll, { projectId });
    const baseUrl = domains?.published?.url ?? domains?.preview?.url;

    const homePage = useMemo(() => {
        return editorEngine.pages.getPageByPath('/');
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive when the page tree changes; `editorEngine.pages` is a stable store ref
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
    const [uploadedFaviconDark, setUploadedFaviconDark] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const faviconUrls = extractFaviconUrls(homePage?.metadata?.icons);

    const handleFaviconSelect = (file: File) => {
        setUploadedFavicon(file);
        setIsDirty(true);
    };

    const handleFaviconDarkSelect = (file: File) => {
        setUploadedFaviconDark(file);
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

            // Resolve final favicon paths — newly uploaded files take precedence
            // over whatever's already saved in metadata.
            let lightFaviconPath = faviconUrls.light;
            let darkFaviconPath = faviconUrls.dark;
            try {
                if (uploadedFavicon) {
                    const { fileName } = await editorEngine.image.upload(
                        uploadedFavicon,
                        DefaultSettings.IMAGE_FOLDER,
                    );
                    // Use the sanitized stored name — the raw file.name 404s
                    // when sanitizeFilename changed it (the file is written as
                    // public/<sanitized>).
                    lightFaviconPath = `/${fileName}`;
                }
                if (uploadedFaviconDark) {
                    const { fileName } = await editorEngine.image.upload(
                        uploadedFaviconDark,
                        DefaultSettings.IMAGE_FOLDER,
                    );
                    darkFaviconPath = `/${fileName}`;
                }
            } catch (error) {
                console.error('Failed to upload favicon:', error);
                toast.error(t('toastFaviconFailed'));
                return;
            }
            if (lightFaviconPath && darkFaviconPath) {
                // Two variants → emit a media-query array so the browser picks
                // the icon matching the visitor's color scheme.
                updatedMetadata.icons = {
                    icon: [
                        { url: lightFaviconPath, media: '(prefers-color-scheme: light)' },
                        { url: darkFaviconPath, media: '(prefers-color-scheme: dark)' },
                    ],
                };
            } else if (lightFaviconPath) {
                updatedMetadata.icons = { icon: lightFaviconPath };
            } else if (darkFaviconPath) {
                updatedMetadata.icons = { icon: darkFaviconPath };
            }
            if (uploadedImage) {
                let imagePath;
                try {
                    const { fileName } = await editorEngine.image.upload(
                        uploadedImage,
                        DefaultSettings.IMAGE_FOLDER,
                    );
                    // Sanitized stored name — raw file.name 404s when changed.
                    imagePath = `/${fileName}`;
                } catch (error) {
                    // Mirror the favicon branch above: surface the failure
                    // so the user knows the OG image won't be saved.
                    console.error('Failed to upload OG image:', error);
                    toast.error(t('toastOgImageFailed'));
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
            setUploadedFaviconDark(null);
            setIsDirty(false);
            toast.success(t('toastSaveSuccess'));
        } catch (error) {
            console.error('Failed to update metadata:', error);
            toast.error(t('toastSaveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="text-regular">
            <div className="flex flex-col gap-2 p-6">
                <h2 className="text-largePlus">{t('title')}</h2>
            </div>
            <div className="relative">
                {editorEngine.pages.isScanning ? (
                    <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-foreground-secondary flex items-center gap-3">
                            <Icons.LoadingSpinner className="h-5 w-5 animate-spin" />
                            <span className="text-small">{t('fetchingMetadata')}</span>
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
                        onFaviconDarkSelect={handleFaviconDarkSelect}
                        faviconUrl={faviconUrls.light}
                        faviconDarkUrl={faviconUrls.dark}
                        onDiscard={handleDiscard}
                        onSave={() => void handleSave()}
                        showFavicon={true}
                        currentMetadata={homePage?.metadata ?? {}}
                        isRoot={true}
                    />
                )}
            </div>
        </div>
    );
});
