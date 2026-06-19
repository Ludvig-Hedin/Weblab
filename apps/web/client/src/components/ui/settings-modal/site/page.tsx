import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import type { PageEditorIcon, PageMetadata } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';
import { Switch } from '@weblab/ui/switch';
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';
import { createSecureUrl } from '@weblab/utility';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import {
    getNestedPagePath,
    getParentPagePath,
    normalizePagePath,
} from '@/components/store/editor/pages/helper';
import { MetadataForm } from './metadata-form';
import { useMetadataForm } from './use-metadata-form';

export const PageTab = ({
    metadata,
    path,
    onPathChange,
}: {
    metadata?: PageMetadata;
    path: string;
    /** Called after a save when the page path changes (slug/folder rename) so
     *  the host surface (the page settings drawer) can re-point to the new path. */
    onPathChange?: (path: string) => void;
}) => {
    const t = useTranslations('settings.page');
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    const PAGE_ICON_OPTIONS: Array<{ value: PageEditorIcon; label: string; icon: React.ReactNode }> = [
        { value: 'file', label: t('iconFile'), icon: <Icons.File className="h-4 w-4" /> },
        { value: 'globe', label: t('iconGlobe'), icon: <Icons.Globe className="h-4 w-4" /> },
        { value: 'image', label: t('iconImage'), icon: <Icons.Image className="h-4 w-4" /> },
        { value: 'button', label: t('iconButton'), icon: <Icons.Button className="h-4 w-4" /> },
    ];
    const domains = useQuery(api.domains.getAll, { projectId });
    const baseUrl = domains?.published?.url ?? domains?.preview?.url;
    const page = editorEngine.pages.getPageByPath(path);
    const isRoot = page?.isRoot ?? path === '/';

    const accessData = useQuery(
        api.pageAccess.get,
        projectId && path ? { projectId, pagePath: path } : 'skip',
    );
    const upsertAccess = useMutation(api.pageAccess.upsert);
    const fetchedAccessType: 'public' | 'password' = accessData?.accessType ?? 'public';
    const fetchedHasPassword = accessData?.hasPassword ?? false;
    const isAccessLoading = accessData === undefined;

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
    const initialSlug = isRoot
        ? ''
        : (normalizePagePath(path).split('/').filter(Boolean).pop() ?? '');
    const initialFolder = isRoot ? '/' : getParentPagePath(path);
    const initialIndexed = metadata?.robots?.index !== false;
    const initialCanonical = metadata?.alternates?.canonical ?? '';
    const initialSchemaMarkup = page?.schemaMarkup ?? '';
    const initialDraft = page?.settings?.draft ?? false;
    const initialPublished = page?.settings?.published ?? true;

    // Open Graph overrides. We auto-detect whether the stored OG title /
    // description diverge from the SEO equivalents — if they match (or aren't
    // set), default to "Same as SEO" so users see the simplest mental model.
    const existingSeoTitleString =
        typeof metadata?.title === 'string'
            ? metadata.title
            : (metadata?.title?.absolute ?? metadata?.title?.default ?? '');
    const existingSeoDescription = metadata?.description ?? '';
    const existingOgTitleString =
        typeof metadata?.openGraph?.title === 'string' ? metadata.openGraph.title : '';
    const existingOgDescription =
        typeof metadata?.openGraph?.description === 'string' ? metadata.openGraph.description : '';
    const initialOgTitleSameAsSeo =
        !existingOgTitleString || existingOgTitleString === existingSeoTitleString;
    const initialOgTitle = initialOgTitleSameAsSeo ? '' : existingOgTitleString;
    const initialOgDescriptionSameAsSeo =
        !existingOgDescription || existingOgDescription === existingSeoDescription;
    const initialOgDescription = initialOgDescriptionSameAsSeo ? '' : existingOgDescription;

    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [editorIcon, setEditorIcon] = useState<PageEditorIcon>(initialEditorIcon);
    const [slug, setSlug] = useState(initialSlug);
    const [folderPath, setFolderPath] = useState(initialFolder);
    const [isIndexed, setIsIndexed] = useState(initialIndexed);
    const [canonical, setCanonical] = useState(initialCanonical);
    const [canonicalError, setCanonicalError] = useState<string | null>(null);
    const [schemaMarkup, setSchemaMarkup] = useState(initialSchemaMarkup);
    const [schemaError, setSchemaError] = useState<string | null>(null);
    const [isDraft, setIsDraft] = useState(initialDraft);
    const [isPublished, setIsPublished] = useState(initialPublished);
    const [accessType, setAccessType] = useState<'public' | 'password'>(fetchedAccessType);
    const [password, setPassword] = useState('');
    const [ogTitleSameAsSeo, setOgTitleSameAsSeo] = useState(initialOgTitleSameAsSeo);
    const [ogTitle, setOgTitle] = useState(initialOgTitle);
    const [ogDescriptionSameAsSeo, setOgDescriptionSameAsSeo] = useState(
        initialOgDescriptionSameAsSeo,
    );
    const [ogDescription, setOgDescription] = useState(initialOgDescription);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setDisplayName(initialDisplayName);
        setEditorIcon(initialEditorIcon);
        setSlug(initialSlug);
        setFolderPath(initialFolder);
        setIsIndexed(initialIndexed);
        setCanonical(initialCanonical);
        setSchemaMarkup(initialSchemaMarkup);
        setSchemaError(null);
        setIsDraft(initialDraft);
        setIsPublished(initialPublished);
        setOgTitleSameAsSeo(initialOgTitleSameAsSeo);
        setOgTitle(initialOgTitle);
        setOgDescriptionSameAsSeo(initialOgDescriptionSameAsSeo);
        setOgDescription(initialOgDescription);
    }, [
        initialCanonical,
        initialDisplayName,
        initialDraft,
        initialEditorIcon,
        initialFolder,
        initialIndexed,
        initialOgDescription,
        initialOgDescriptionSameAsSeo,
        initialOgTitle,
        initialOgTitleSameAsSeo,
        initialPublished,
        initialSchemaMarkup,
        initialSlug,
    ]);

    // Sync access-control state when the server-side value loads or changes.
    useEffect(() => {
        setAccessType(fetchedAccessType);
        setPassword('');
    }, [fetchedAccessType, fetchedHasPassword]);

    const availableFolders = useMemo(() => {
        return [
            { value: '/', label: t('folderRoot') },
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
        canonical.trim() !== initialCanonical.trim() ||
        schemaMarkup.trim() !== initialSchemaMarkup.trim() ||
        isDraft !== initialDraft ||
        isPublished !== initialPublished ||
        ogTitleSameAsSeo !== initialOgTitleSameAsSeo ||
        ogDescriptionSameAsSeo !== initialOgDescriptionSameAsSeo ||
        (!ogTitleSameAsSeo && ogTitle !== initialOgTitle) ||
        (!ogDescriptionSameAsSeo && ogDescription !== initialOgDescription);

    const accessDirty =
        accessType !== fetchedAccessType || (accessType === 'password' && password.length > 0);

    const nextPath = isRoot ? '/' : getNestedPagePath(folderPath, slug);
    const isDirty = metadataDirty || detailsDirty || accessDirty;

    const handleDiscard = () => {
        handleMetadataDiscard();
        setDisplayName(initialDisplayName);
        setEditorIcon(initialEditorIcon);
        setSlug(initialSlug);
        setFolderPath(initialFolder);
        setIsIndexed(initialIndexed);
        setCanonical(initialCanonical);
        setCanonicalError(null);
        setSchemaMarkup(initialSchemaMarkup);
        setSchemaError(null);
        setIsDraft(initialDraft);
        setIsPublished(initialPublished);
        setAccessType(fetchedAccessType);
        setPassword('');
        setOgTitleSameAsSeo(initialOgTitleSameAsSeo);
        setOgTitle(initialOgTitle);
        setOgDescriptionSameAsSeo(initialOgDescriptionSameAsSeo);
        setOgDescription(initialOgDescription);
    };

    const validateCanonical = (value: string): string | null => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        try {
            // Canonical URLs must be absolute. `new URL` throws on malformed
            // and on relative paths when no base is supplied.

            new URL(trimmed);
            return null;
        } catch {
            return t('canonicalError');
        }
    };

    const handleCanonicalBlur = () => {
        setCanonicalError(validateCanonical(canonical));
    };

    const validateSchemaMarkup = (value: string): string | null => {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        try {
            JSON.parse(trimmed);
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : 'Invalid JSON';
        }
    };

    const handleSchemaMarkupBlur = () => {
        setSchemaError(validateSchemaMarkup(schemaMarkup));
    };

    const handleFormatSchemaMarkup = () => {
        const trimmed = schemaMarkup.trim();
        if (!trimmed) return;
        try {
            const formatted = JSON.stringify(JSON.parse(trimmed), null, 2);
            setSchemaMarkup(formatted);
            setSchemaError(null);
        } catch (error) {
            setSchemaError(error instanceof Error ? error.message : t('invalidJson'));
            toast.error(t('toastFormatFailed'));
        }
    };

    const handleSave = async () => {
        if (!page) {
            return;
        }

        const canonicalValidationError = validateCanonical(canonical);
        if (canonicalValidationError) {
            setCanonicalError(canonicalValidationError);
            toast.error(t('toastCanonicalInvalid'), {
                description: canonicalValidationError,
            });
            return;
        }
        setCanonicalError(null);

        const schemaValidationError = validateSchemaMarkup(schemaMarkup);
        if (schemaValidationError) {
            setSchemaError(schemaValidationError);
            toast.error(t('toastSchemaInvalid'), {
                description: schemaValidationError,
            });
            return;
        }
        setSchemaError(null);

        if (
            accessDirty &&
            accessType === 'password' &&
            !fetchedHasPassword &&
            password.trim().length < 4
        ) {
            toast.error(t('toastPasswordTooShort'));
            return;
        }

        setIsSaving(true);
        try {
            const url = createSecureUrl(baseUrl);
            const finalTitle = getFinalTitleMetadata();
            const siteTitle =
                typeof finalTitle === 'string'
                    ? finalTitle
                    : (finalTitle.absolute ?? finalTitle.default ?? '');

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
                    title: ogTitleSameAsSeo ? siteTitle : ogTitle.trim() || siteTitle,
                    description: ogDescriptionSameAsSeo
                        ? description
                        : ogDescription.trim() || description,
                    url,
                    siteName: siteTitle,
                    type: 'website',
                },
            };

            // Canonical URL → Next.js metadata.alternates.canonical. Clearing the
            // field removes the canonical key; if alternates becomes empty, drop
            // it entirely so we don't emit an empty alternates: {} into the file.
            const trimmedCanonical = canonical.trim();
            if (trimmedCanonical) {
                updatedMetadata.alternates = {
                    ...metadata?.alternates,
                    canonical: trimmedCanonical,
                };
            } else if (metadata?.alternates) {
                const { canonical: _drop, ...restAlternates } = metadata.alternates;
                updatedMetadata.alternates =
                    Object.keys(restAlternates).length > 0 ? restAlternates : undefined;
            }

            if (!metadata?.metadataBase && url) {
                try {
                    updatedMetadata.metadataBase = new URL(url);
                } catch {
                    // url is not a valid absolute URL — skip metadataBase
                }
            }

            if (uploadedImage) {
                try {
                    const { fileName } = await editorEngine.image.upload(
                        uploadedImage,
                        DefaultSettings.IMAGE_FOLDER,
                    );
                    updatedMetadata.openGraph = {
                        ...updatedMetadata.openGraph,
                        images: [
                            {
                                // Sanitized stored name — raw file.name 404s
                                // when sanitizeFilename changed it.
                                url: `/${fileName}`,
                                width: 1200,
                                height: 630,
                                alt: siteTitle,
                            },
                        ],
                        type: 'website',
                    };
                } catch (error) {
                    console.error('Failed to upload Open Graph image:', error);
                    toast.error(t('toastOgImageFailed'));
                    return;
                }
            }

            // Only touch page files when SEO/OG/General/schema-markup changed —
            // saving an access-only change shouldn't rewrite the page's `page.tsx`.
            const shouldWritePageFile = metadataDirty || detailsDirty;
            let savedPath = path;
            if (shouldWritePageFile) {
                savedPath = await editorEngine.pages.savePageConfiguration(path, {
                    nextPath,
                    metadata: updatedMetadata,
                    schemaMarkup: schemaMarkup.trim(),
                    settings: {
                        displayName: displayName.trim() || undefined,
                        editorIcon: !isRoot && editorIcon !== 'file' ? editorIcon : undefined,
                        draft: isDraft || undefined,
                        published: isPublished ? undefined : false,
                    },
                });
                onPathChange?.(savedPath);
                setMetadataDirty(false);
            }

            // Access control is recorded server-side; the generated middleware
            // ships with the next publish, not immediately.
            if (accessDirty) {
                await upsertAccess({
                    projectId,
                    pagePath: savedPath,
                    accessType,
                    password: password.length > 0 ? password : undefined,
                });
                setPassword('');
            }

            toast.success(t('toastSaveSuccess'));
        } catch (error) {
            console.error('Failed to update page settings:', error);
            toast.error(t('toastSaveFailed'), {
                description: error instanceof Error ? error.message : t('toastSaveFailedDesc'),
            });
        } finally {
            setIsSaving(false);
        }
    };

    const detailsSection = (
        <div className="text-foreground-weblab flex flex-col gap-4">
            <h2 className="text-title3">{t('editorDetailsTitle')}</h2>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('nameLabel')}</p>
                    <p className="text-small">{t('nameDesc')}</p>
                </div>
                <Input
                    value={displayName}
                    placeholder={page?.defaultName ?? t('namePlaceholder')}
                    onChange={(event) => setDisplayName(event.target.value)}
                    disabled={editorEngine.pages.isScanning}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('editorIconLabel')}</p>
                    <p className="text-small">{t('editorIconDesc')}</p>
                </div>
                <Select
                    value={editorIcon}
                    onValueChange={(value) => setEditorIcon(value as PageEditorIcon)}
                    disabled={editorEngine.pages.isScanning || isRoot}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('editorIconPlaceholder')} />
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
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('slugLabel')}</p>
                    <p className="text-small">{t('slugDesc')}</p>
                </div>
                <Input
                    value={slug}
                    placeholder={t('slugPlaceholder')}
                    onChange={(event) => setSlug(event.target.value.toLowerCase())}
                    disabled={editorEngine.pages.isScanning || isRoot}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('folderLabel')}</p>
                    <p className="text-small">{t('folderDesc')}</p>
                </div>
                <Select
                    value={folderPath}
                    onValueChange={setFolderPath}
                    disabled={editorEngine.pages.isScanning || isRoot}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('folderPlaceholder')} />
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
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('previewPathLabel')}</p>
                    <p className="text-small">{t('previewPathDesc')}</p>
                </div>
                <div className="border-border bg-background-secondary/40 text-miniPlus flex h-10 items-center rounded-md border px-3">
                    {nextPath}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('canonicalUrlLabel')}</p>
                    <p className="text-small">{t('canonicalUrlDesc')}</p>
                </div>
                <div className="flex flex-col gap-1">
                    <Input
                        value={canonical}
                        placeholder={t('canonicalUrlPlaceholder')}
                        inputMode="url"
                        onChange={(event) => {
                            setCanonical(event.target.value);
                            if (canonicalError) setCanonicalError(null);
                        }}
                        onBlur={handleCanonicalBlur}
                        disabled={editorEngine.pages.isScanning}
                        className={cn(canonicalError && 'border-red')}
                        aria-invalid={Boolean(canonicalError)}
                    />
                    {canonicalError && <p className="text-mini text-red">{canonicalError}</p>}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('sitemapLabel')}</p>
                    <p className="text-small">{t('sitemapDesc')}</p>
                </div>
                <div className="border-border bg-background-secondary/40 flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-miniPlus">{isIndexed ? t('indexable') : t('noindex')}</span>
                    <Switch
                        checked={isIndexed}
                        onCheckedChange={(checked) => setIsIndexed(Boolean(checked))}
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('draftLabel')}</p>
                    <p className="text-small">{t('draftDesc')}</p>
                </div>
                <div className="border-border bg-background-secondary/40 flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-miniPlus">{isDraft ? t('draftOn') : t('draftOff')}</span>
                    <Switch
                        checked={isDraft}
                        onCheckedChange={(checked) => setIsDraft(Boolean(checked))}
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="flex max-w-52 flex-col">
                    <p className="text-regular font-medium">{t('publishedLabel')}</p>
                    <p className="text-small">{t('publishedDesc')}</p>
                </div>
                <div className="border-border bg-background-secondary/40 flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-miniPlus">
                        {isPublished ? t('publishedOn') : t('publishedOff')}
                    </span>
                    <Switch
                        checked={isPublished}
                        onCheckedChange={(checked) => setIsPublished(Boolean(checked))}
                    />
                </div>
            </div>
            {isRoot && (
                <div className="border-border bg-background-secondary/40 text-small text-foreground-secondary rounded-md border px-3 py-2">
                    {t('homeRootNote')}
                </div>
            )}
        </div>
    );

    const accessSection = (
        <div className="text-foreground-weblab flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 className="text-title3">{t('accessControlTitle')}</h2>
                <p className="text-small text-foreground-secondary">
                    {t('accessControlDesc')}
                </p>
            </div>
            <div
                role="tablist"
                aria-label="Access type"
                className="border-border bg-background-secondary/40 inline-flex rounded-md border p-1"
            >
                {[
                    { value: 'public' as const, label: t('accessPublic') },
                    { value: 'password' as const, label: t('accessPassword') },
                ].map((option) => {
                    const selected = accessType === option.value;
                    return (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            key={option.value}
                            onClick={() => setAccessType(option.value)}
                            className={cn(
                                'text-miniPlus flex-1 rounded px-3 py-1.5 transition-colors',
                                selected
                                    ? 'bg-background text-foreground-primary shadow-sm'
                                    : 'text-foreground-secondary hover:text-foreground-primary',
                            )}
                            disabled={editorEngine.pages.isScanning || isAccessLoading || isSaving}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
            {accessType === 'public' ? (
                <p className="text-mini text-foreground-tertiary">
                    {t('accessPublicDesc')}
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex max-w-52 flex-col">
                            <p className="text-regular font-medium">{t('passwordLabel')}</p>
                            <p className="text-small">
                                {fetchedHasPassword
                                    ? t('passwordKeepBlank')
                                    : t('passwordSetInitial')}
                            </p>
                        </div>
                        <Input
                            type="password"
                            value={password}
                            placeholder={fetchedHasPassword ? '••••••••' : t('passwordPlaceholder')}
                            autoComplete="new-password"
                            spellCheck={false}
                            maxLength={256}
                            onChange={(event) => setPassword(event.target.value)}
                            disabled={editorEngine.pages.isScanning || isAccessLoading || isSaving}
                        />
                    </div>
                    <p className="text-mini text-foreground-tertiary">
                        {t('passwordEffective')}
                    </p>
                </div>
            )}
        </div>
    );

    const schemaSection = (
        <div className="text-foreground-weblab flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h2 className="text-title3">{t('schemaMarkupTitle')}</h2>
                    <p className="text-small text-foreground-secondary">
                        {t('schemaMarkupDesc')}{' '}
                        <a
                            href="https://schema.org/docs/gs.html"
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground-brand underline-offset-2 hover:underline"
                        >
                            {t('schemaMarkupLearnMore')}
                        </a>
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    onClick={handleFormatSchemaMarkup}
                    disabled={editorEngine.pages.isScanning || isSaving || !schemaMarkup.trim()}
                >
                    {t('formatJson')}
                </Button>
            </div>
            <Textarea
                value={schemaMarkup}
                placeholder='{ "@context": "https://schema.org", "@type": "WebPage", "name": "About" }'
                onChange={(event) => {
                    setSchemaMarkup(event.target.value);
                    if (schemaError) {
                        setSchemaError(null);
                    }
                }}
                onBlur={handleSchemaMarkupBlur}
                disabled={editorEngine.pages.isScanning}
                spellCheck={false}
                className={cn(
                    'text-miniPlus bg-background-secondary/75 text-foreground-primary border-background-secondary/75 min-h-48 font-mono break-words backdrop-blur-lg transition-all duration-150 ease-in-out',
                    schemaError && 'border-red',
                )}
                style={{
                    resize: 'vertical',
                    overflowY: 'auto',
                    overflowX: 'auto',
                    overscrollBehavior: 'contain',
                    lineHeight: '1.5',
                }}
            />
            {schemaError ? (
                <p className="text-mini text-red">{schemaError}</p>
            ) : (
                <p className="text-mini text-foreground-tertiary">
                    {t('schemaMarkupHint')}
                </p>
            )}
        </div>
    );

    return (
        <div className="text-regular">
            {(!isPublished || isDraft) && (
                <div className="flex items-center gap-2 px-6 pt-4">
                    {!isPublished && (
                        <Button variant="outline" size="compact" disabled>
                            {t('unpublishedBadge')}
                        </Button>
                    )}
                    {isDraft && (
                        <Button variant="outline" size="compact" disabled>
                            {t('draftBadge')}
                        </Button>
                    )}
                </div>
            )}
            <div className="relative">
                {editorEngine.pages.isScanning ? (
                    <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-foreground-secondary flex items-center gap-3">
                            <Icons.LoadingSpinner className="h-5 w-5 animate-spin" />
                            <span className="text-regular">{t('fetchingMetadata')}</span>
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
                        ogTitle={ogTitle}
                        ogTitleSameAsSeo={ogTitleSameAsSeo}
                        onOgTitleChange={setOgTitle}
                        onOgTitleSameAsSeoChange={setOgTitleSameAsSeo}
                        ogDescription={ogDescription}
                        ogDescriptionSameAsSeo={ogDescriptionSameAsSeo}
                        onOgDescriptionChange={setOgDescription}
                        onOgDescriptionSameAsSeoChange={setOgDescriptionSameAsSeo}
                        leadingContent={detailsSection}
                        trailingContent={
                            <div className="flex flex-col gap-6">
                                {schemaSection}
                                <div className="border-border/50 border-t" aria-hidden />
                                {accessSection}
                            </div>
                        }
                    />
                )}
            </div>
        </div>
    );
};
