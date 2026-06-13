'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { v4 as uuidv4 } from 'uuid';

import type { ImageMessageContext } from '@weblab/models';
import { CloneOutputFramework, MessageContextType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { toast } from '@weblab/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { Textarea } from '@weblab/ui/textarea';
import { cn } from '@weblab/ui/utils';
import { compressImageInBrowser } from '@weblab/utility';

import { ProjectCreationLoader } from '@/components/project-creation-loader';
import { useCloneWebsite } from '@/hooks/use-clone-website';

interface CloneWebsiteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const URL_PATTERN = /^https?:\/\/.+\..+/i;

const FRAMEWORK_BASE_OPTIONS: Array<{
    id: CloneOutputFramework;
    title: string;
    icon: React.ReactNode;
    recommended?: boolean;
}> = [
    {
        id: CloneOutputFramework.NEXTJS,
        title: 'Next.js',
        icon: <Icons.Globe className="h-4 w-4" />,
        recommended: true,
    },
    {
        id: CloneOutputFramework.STATIC_HTML,
        title: 'Static HTML',
        icon: <Icons.Code className="h-4 w-4" />,
    },
];

function FrameworkPicker({
    value,
    onChange,
    disabled,
    recommendedLabel,
    descriptions,
}: {
    value: CloneOutputFramework;
    onChange: (id: CloneOutputFramework) => void;
    disabled?: boolean;
    recommendedLabel: string;
    descriptions: Record<CloneOutputFramework, string>;
}) {
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {FRAMEWORK_BASE_OPTIONS.map((option) => {
                const selected = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => onChange(option.id)}
                        disabled={disabled}
                        aria-pressed={selected}
                        className={cn(
                            'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
                            selected
                                ? 'border-foreground/40 bg-foreground/8'
                                : 'border-foreground/10 bg-foreground/4 hover:border-foreground/20 hover:bg-foreground/8',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <div className="border-foreground/10 bg-background flex h-8 w-8 items-center justify-center rounded-full border">
                                {option.icon}
                            </div>
                            <div className="text-foreground text-sm font-medium">
                                {option.title}
                            </div>
                            {option.recommended && (
                                <span className="border-foreground/20 text-foreground-secondary ml-auto rounded-full border px-2 py-0.5 text-tiny">
                                    {recommendedLabel}
                                </span>
                            )}
                        </div>
                        <p className="text-foreground-tertiary text-xs leading-5">
                            {descriptions[option.id]}
                        </p>
                    </button>
                );
            })}
        </div>
    );
}

export function CloneWebsiteDialog({ open, onOpenChange }: CloneWebsiteDialogProps) {
    const t = useTranslations('projects.cloneWebsiteDialog');
    const { cloneFromUrl, cloneFromScreenshot, isCloning, phase } = useCloneWebsite();
    const [activeTab, setActiveTab] = useState<'url' | 'screenshot'>('url');
    const [url, setUrl] = useState('');
    const [urlError, setUrlError] = useState<string | null>(null);
    const [urlNotes, setUrlNotes] = useState('');
    const [screenshot, setScreenshot] = useState<ImageMessageContext | null>(null);
    const [screenshotNotes, setScreenshotNotes] = useState('');
    const [framework, setFramework] = useState<CloneOutputFramework>(CloneOutputFramework.NEXTJS);
    const [isCompressing, setIsCompressing] = useState(false);

    const reset = () => {
        setActiveTab('url');
        setUrl('');
        setUrlError(null);
        setUrlNotes('');
        setScreenshot(null);
        setScreenshotNotes('');
        setFramework(CloneOutputFramework.NEXTJS);
        setIsCompressing(false);
    };

    const handleOpenChange = (next: boolean) => {
        if (isCloning) return;
        if (!next) reset();
        onOpenChange(next);
    };

    const handleScreenshotFile = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error(t('toastInvalidImageType'));
            return;
        }
        setIsCompressing(true);
        try {
            const compressed = await compressImageInBrowser(file);
            const base64 =
                compressed ??
                (await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (typeof reader.result === 'string') resolve(reader.result);
                        else reject(new Error('Failed to read file'));
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                }));

            setScreenshot({
                type: MessageContextType.IMAGE,
                source: 'external',
                content: base64,
                displayName: file.name,
                mimeType: file.type,
                id: uuidv4(),
            });
        } catch (err) {
            console.error('Failed to read screenshot file', err);
            toast.error(t('toastImageReadFailed'), {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsCompressing(false);
        }
    };

    const submitUrl = async () => {
        const trimmed = url.trim();
        if (!URL_PATTERN.test(trimmed)) {
            setUrlError(t('urlError'));
            return;
        }
        setUrlError(null);
        try {
            await cloneFromUrl({ url: trimmed, notes: urlNotes, framework });
        } catch {
            // toast surfaced inside the hook; keep dialog open so the user
            // can adjust the URL or framework and retry without re-entering.
        }
    };

    const submitScreenshot = async () => {
        if (!screenshot) return;
        try {
            await cloneFromScreenshot({
                screenshot,
                notes: screenshotNotes,
                framework,
            });
        } catch {
            // see above
        }
    };

    const urlValid = URL_PATTERN.test(url.trim());
    const submitting = isCloning || isCompressing;

    // Step list differs per tab: the URL flow runs Firecrawl first
    // (`scraping-url` phase), the screenshot flow skips that phase entirely
    // and goes idle → forking-sandbox. Showing "Reading the source page" as
    // completed on the screenshot path was misleading — no page is read
    // when a screenshot is supplied.
    const creationSteps =
        activeTab === 'url'
            ? [
                  {
                      label: t('stepReadingSite'),
                      ready: phase !== 'idle' && phase !== 'scraping-url',
                  },
                  {
                      label: t('stepSettingUpWorkspace'),
                      ready: phase === 'creating-project' || phase === 'opening-editor',
                  },
                  { label: t('stepOpeningEditor'), ready: phase === 'opening-editor' },
              ]
            : [
                  {
                      label: t('stepSettingUpWorkspace'),
                      ready: phase === 'creating-project' || phase === 'opening-editor',
                  },
                  { label: t('stepOpeningEditor'), ready: phase === 'opening-editor' },
              ];

    const frameworkDescriptions: Record<CloneOutputFramework, string> = {
        [CloneOutputFramework.NEXTJS]: t('frameworkNextjsDescription'),
        [CloneOutputFramework.STATIC_HTML]: t('frameworkStaticDescription'),
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[640px]">
                {isCloning && (
                    <ProjectCreationLoader
                        overlay
                        heading={t('loaderHeading')}
                        caption={t('loaderCaption')}
                        steps={creationSteps}
                    />
                )}
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
                </DialogHeader>

                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'url' | 'screenshot')}
                >
                    <TabsList className="w-full">
                        <TabsTrigger value="url" className="flex-1 gap-2">
                            <Icons.Link className="h-3.5 w-3.5" />
                            {t('tabs.url')}
                        </TabsTrigger>
                        <TabsTrigger value="screenshot" className="flex-1 gap-2">
                            <Icons.Image className="h-3.5 w-3.5" />
                            {t('tabs.screenshot')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="url" className="mt-4 space-y-3">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="clone-url"
                                className="text-foreground-secondary text-xs font-medium"
                            >
                                {t('urlLabel')}
                            </label>
                            <Input
                                id="clone-url"
                                placeholder={t('urlPlaceholder')}
                                value={url}
                                onChange={(e) => {
                                    setUrl(e.target.value);
                                    if (urlError) setUrlError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && urlValid && !submitting) {
                                        e.preventDefault();
                                        void submitUrl();
                                    }
                                }}
                                disabled={submitting}
                                aria-invalid={!!urlError}
                            />
                            {urlError && <p className="text-destructive text-xs">{urlError}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label
                                htmlFor="clone-url-notes"
                                className="text-foreground-secondary text-xs font-medium"
                            >
                                {t('notesLabel')}
                            </label>
                            <Textarea
                                id="clone-url-notes"
                                placeholder={t('urlNotesPlaceholder')}
                                value={urlNotes}
                                onChange={(e) => setUrlNotes(e.target.value)}
                                disabled={submitting}
                                rows={3}
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="screenshot" className="mt-4 space-y-3">
                        <div className="space-y-1.5">
                            <span className="text-foreground-secondary text-xs font-medium">
                                {t('screenshotLabel')}
                            </span>
                            <label
                                htmlFor="clone-screenshot-input"
                                className={cn(
                                    'border-foreground/10 hover:border-foreground/20 hover:bg-foreground/4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors',
                                    submitting && 'pointer-events-none opacity-60',
                                )}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const file = e.dataTransfer.files[0];
                                    if (file) void handleScreenshotFile(file);
                                }}
                            >
                                {screenshot ? (
                                    <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={screenshot.content}
                                            alt={screenshot.displayName ?? 'screenshot preview'}
                                            className="border-foreground/10 max-h-40 rounded-md border object-contain"
                                        />
                                        <span className="text-foreground-tertiary text-xs">
                                            {t('screenshotClickToReplace', {
                                                name: screenshot.displayName ?? '',
                                            })}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Icons.Image className="text-foreground-tertiary h-6 w-6" />
                                        <span className="text-foreground text-sm">
                                            {t('screenshotDropHint')}
                                        </span>
                                        <span className="text-foreground-tertiary text-xs">
                                            {t('screenshotFormatHint')}
                                        </span>
                                    </>
                                )}
                                <input
                                    id="clone-screenshot-input"
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    disabled={submitting}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleScreenshotFile(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                        </div>
                        <div className="space-y-1.5">
                            <label
                                htmlFor="clone-screenshot-notes"
                                className="text-foreground-secondary text-xs font-medium"
                            >
                                {t('notesLabel')}
                            </label>
                            <Textarea
                                id="clone-screenshot-notes"
                                placeholder={t('screenshotNotesPlaceholder')}
                                value={screenshotNotes}
                                onChange={(e) => setScreenshotNotes(e.target.value)}
                                disabled={submitting}
                                rows={3}
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                <div className="space-y-1.5">
                    <span className="text-foreground-secondary text-xs font-medium">
                        {t('outputStackLabel')}
                    </span>
                    <FrameworkPicker
                        value={framework}
                        onChange={setFramework}
                        disabled={submitting}
                        recommendedLabel={t('recommended')}
                        descriptions={frameworkDescriptions}
                    />
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => handleOpenChange(false)}
                        disabled={submitting}
                    >
                        {t('cancel')}
                    </Button>
                    {activeTab === 'url' ? (
                        <Button onClick={() => void submitUrl()} disabled={!urlValid || submitting}>
                            {isCloning && phase === 'scraping-url' ? (
                                <>
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                    {t('readingPage')}
                                </>
                            ) : (
                                <>
                                    <Icons.MagicWand className="h-4 w-4" />
                                    {t('cloneWebsite')}
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button
                            onClick={() => void submitScreenshot()}
                            disabled={!screenshot || submitting}
                        >
                            <Icons.MagicWand className="h-4 w-4" />
                            {t('cloneFromScreenshot')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
