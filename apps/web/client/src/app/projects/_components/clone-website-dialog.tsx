'use client';

import { useState } from 'react';
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

const FRAMEWORK_OPTIONS: Array<{
    id: CloneOutputFramework;
    title: string;
    description: string;
    icon: React.ReactNode;
    recommended?: boolean;
}> = [
    {
        id: CloneOutputFramework.NEXTJS,
        title: 'Next.js',
        description: 'React + Tailwind + shadcn/ui. Editable in the visual editor.',
        icon: <Icons.Globe className="h-4 w-4" />,
        recommended: true,
    },
    {
        id: CloneOutputFramework.STATIC_HTML,
        title: 'Static HTML',
        description: 'A single index.html with Tailwind via CDN. No build step.',
        icon: <Icons.Code className="h-4 w-4" />,
    },
];

function FrameworkPicker({
    value,
    onChange,
    disabled,
}: {
    value: CloneOutputFramework;
    onChange: (id: CloneOutputFramework) => void;
    disabled?: boolean;
}) {
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {FRAMEWORK_OPTIONS.map((option) => {
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
                                <span className="border-foreground/20 text-foreground-secondary ml-auto rounded-full border px-2 py-0.5 text-[10px]">
                                    Recommended
                                </span>
                            )}
                        </div>
                        <p className="text-foreground-tertiary text-xs leading-5">
                            {option.description}
                        </p>
                    </button>
                );
            })}
        </div>
    );
}

export function CloneWebsiteDialog({ open, onOpenChange }: CloneWebsiteDialogProps) {
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
            toast.error('Please drop an image file (PNG, JPG, GIF, or WebP).');
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
            toast.error('Could not read that image', {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsCompressing(false);
        }
    };

    const submitUrl = async () => {
        const trimmed = url.trim();
        if (!URL_PATTERN.test(trimmed)) {
            setUrlError('Enter a full URL starting with http:// or https://');
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
            await cloneFromScreenshot({ screenshot, notes: screenshotNotes, framework });
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
                      label: 'Reading the source page',
                      ready: phase !== 'idle' && phase !== 'scraping-url',
                  },
                  {
                      label: 'Setting up your workspace',
                      ready: phase === 'creating-project' || phase === 'opening-editor',
                  },
                  { label: 'Opening the editor', ready: phase === 'opening-editor' },
              ]
            : [
                  {
                      label: 'Setting up your workspace',
                      ready: phase === 'creating-project' || phase === 'opening-editor',
                  },
                  { label: 'Opening the editor', ready: phase === 'opening-editor' },
              ];

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[640px]">
                {isCloning && (
                    <ProjectCreationLoader
                        overlay
                        heading="Cloning your site"
                        caption="Setting up the sandbox and handing the source material to the AI."
                        steps={creationSteps}
                    />
                )}
                <DialogHeader>
                    <DialogTitle>Clone a website</DialogTitle>
                    <DialogDescription>
                        Recreate any site from a URL or a screenshot. The AI uses the source as a
                        visual reference and rebuilds it into an editable project.
                    </DialogDescription>
                </DialogHeader>

                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as 'url' | 'screenshot')}
                >
                    <TabsList className="w-full">
                        <TabsTrigger value="url" className="flex-1 gap-2">
                            <Icons.Link className="h-3.5 w-3.5" />
                            From URL
                        </TabsTrigger>
                        <TabsTrigger value="screenshot" className="flex-1 gap-2">
                            <Icons.Image className="h-3.5 w-3.5" />
                            From screenshot
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="url" className="mt-4 space-y-3">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="clone-url"
                                className="text-foreground-secondary text-xs font-medium"
                            >
                                Website URL
                            </label>
                            <Input
                                id="clone-url"
                                placeholder="https://example.com"
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
                                Notes (optional)
                            </label>
                            <Textarea
                                id="clone-url-notes"
                                placeholder="Tweaks for the AI: swap the color palette, simplify the hero, …"
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
                                Screenshot
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
                                            {screenshot.displayName} · click to replace
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Icons.Image className="text-foreground-tertiary h-6 w-6" />
                                        <span className="text-foreground text-sm">
                                            Drop a screenshot here or click to choose
                                        </span>
                                        <span className="text-foreground-tertiary text-xs">
                                            PNG, JPG, GIF, or WebP
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
                                Notes (optional)
                            </label>
                            <Textarea
                                id="clone-screenshot-notes"
                                placeholder="What this site is, the brand, anything you want the AI to focus on…"
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
                        Output stack
                    </span>
                    <FrameworkPicker
                        value={framework}
                        onChange={setFramework}
                        disabled={submitting}
                    />
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => handleOpenChange(false)}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    {activeTab === 'url' ? (
                        <Button onClick={() => void submitUrl()} disabled={!urlValid || submitting}>
                            {isCloning && phase === 'scraping-url' ? (
                                <>
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                    Reading the page…
                                </>
                            ) : (
                                <>
                                    <Icons.MagicWand className="h-4 w-4" />
                                    Clone website
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button
                            onClick={() => void submitScreenshot()}
                            disabled={!screenshot || submitting}
                        >
                            <Icons.MagicWand className="h-4 w-4" />
                            Clone from screenshot
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
