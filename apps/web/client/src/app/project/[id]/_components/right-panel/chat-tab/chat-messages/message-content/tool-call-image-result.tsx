'use client';

import type { ToolUIPart } from 'ai';
import { memo, useCallback, useState } from 'react';
import mime from 'mime-lite';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

import { TOOLS_MAP } from '@weblab/ai/client';
import { Tool, ToolContent, ToolHeader } from '@weblab/ui/ai-elements';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { CHAT_RETRY_TOOL_EVENT } from './tool-call-simple';
import { getToolNameFromPart } from './tool-name';

interface ImageToolOutput {
    id?: string;
    url?: string;
    modelId?: string;
    prompt?: string;
    mimeType?: string;
}

const ToolCallImageResultComponent = ({
    toolPart,
    className,
    loading,
}: {
    toolPart: ToolUIPart;
    className?: string;
    loading?: boolean;
}) => {
    const t = useTranslations('editor.chat.imageResult');
    const editorEngine = useEditorEngine();
    const toolName = getToolNameFromPart(toolPart);
    const ToolClass = TOOLS_MAP.get(toolName);
    const Icon = ToolClass?.icon ?? Icons.Image;
    const title = ToolClass ? safeGetLabel(ToolClass, toolPart.input, t('generatedImage')) : t('generatedImage');

    const output =
        toolPart.state === 'output-available' ? (toolPart.output as ImageToolOutput | null) : null;
    const url = output?.url ?? null;

    const [adding, setAdding] = useState(false);
    const [replacing, setReplacing] = useState(false);
    const [savedPath, setSavedPath] = useState<string | null>(null);
    const [imageLoadError, setImageLoadError] = useState(false);
    const [retrySent, setRetrySent] = useState(false);

    const handleRetry = useCallback(() => {
        if (typeof window === 'undefined' || retrySent) return;
        setRetrySent(true);
        window.dispatchEvent(
            new CustomEvent(CHAT_RETRY_TOOL_EVENT, {
                detail: {
                    toolCallId: toolPart.toolCallId,
                    toolName,
                    input: toolPart.input,
                },
            }),
        );
    }, [retrySent, toolName, toolPart.input, toolPart.toolCallId]);

    const selectedImg = pickSelectedImageElement(editorEngine);
    const generatedImageLabel = t('generatedImage');
    const altText = ((output?.prompt ?? generatedImageLabel).trim() || generatedImageLabel).slice(
        0,
        120,
    );

    const handleAdd = async () => {
        if (!output?.id) return;
        setAdding(true);
        try {
            const path = await writeCachedImageToProject(editorEngine, output.id);
            setSavedPath(path);
            toast.success(t('savedToPath', { path }));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save image');
        } finally {
            setAdding(false);
        }
    };

    const handleReplace = async () => {
        if (!output?.id || !selectedImg?.oid) return;
        setReplacing(true);
        try {
            const path = await writeCachedImageToProject(editorEngine, output.id);
            setSavedPath(path);
            toast.success(
                t('savedToPathAskAi', { path, relativePath: path.replace(/^public\//, '') }),
            );
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save image');
        } finally {
            setReplacing(false);
        }
    };

    return (
        <Tool className={className}>
            <ToolHeader
                loading={loading}
                title={title}
                type={toolPart.type}
                state={toolPart.state}
                icon={<Icon className="h-4 w-4 flex-shrink-0" />}
            />
            <ToolContent>
                {url ? (
                    <div className="flex flex-col gap-2 p-2">
                        {!imageLoadError ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={url}
                                alt={altText}
                                onError={() => setImageLoadError(true)}
                                className="border-border max-h-72 w-auto self-start rounded-md border"
                            />
                        ) : (
                            <p className="text-destructive text-xs">
                                {t('imageExpired')}
                            </p>
                        )}
                        {output?.prompt ? (
                            <p className="text-muted-foreground line-clamp-2 text-xs">
                                {output.prompt}
                            </p>
                        ) : null}
                        <div className="flex flex-row gap-2 pt-1">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleAdd}
                                disabled={adding || !output?.id || imageLoadError}
                            >
                                {adding ? t('saving') : savedPath ? t('saved') : t('addToProject')}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleReplace}
                                disabled={
                                    replacing || !output?.id || !selectedImg?.oid || imageLoadError
                                }
                                title={
                                    selectedImg?.oid
                                        ? t('replaceSrcTitle', { tagName: selectedImg.tagName })
                                        : t('selectImgHint')
                                }
                            >
                                {replacing ? t('saving') : t('replaceSelected')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-muted-foreground flex flex-col gap-2 p-2 text-xs">
                        <span>{loading ? t('generatingImage') : t('noImageReturned')}</span>
                        {toolPart.errorText ? (
                            <div className="text-destructive">{toolPart.errorText}</div>
                        ) : null}
                        {!loading && (
                            <button
                                type="button"
                                onClick={handleRetry}
                                disabled={retrySent}
                                aria-label={t('ariaRetry')}
                                className="text-foreground-secondary hover:text-foreground-primary hover:bg-background-tertiary focus-visible:ring-ring inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:opacity-60"
                            >
                                {retrySent ? (
                                    <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Icons.Reload className="h-3 w-3" />
                                )}
                                {retrySent ? t('retrying') : t('retry')}
                            </button>
                        )}
                    </div>
                )}
            </ToolContent>
        </Tool>
    );
};

export const ToolCallImageResult = memo(observer(ToolCallImageResultComponent));

function safeGetLabel(toolClass: { getLabel: (input: unknown) => string }, input: unknown, fallback: string): string {
    try {
        return toolClass.getLabel(input);
    } catch {
        return fallback;
    }
}

function pickSelectedImageElement(
    editorEngine: ReturnType<typeof useEditorEngine>,
): { oid: string; tagName: string } | null {
    const sel = editorEngine.elements.selected;
    if (!sel || sel.length === 0) return null;
    const first = sel[0];
    if (!first?.oid) return null;
    if (first.tagName?.toLowerCase() !== 'img') return null;
    return { oid: first.oid, tagName: first.tagName };
}

async function writeCachedImageToProject(
    editorEngine: ReturnType<typeof useEditorEngine>,
    cacheId: string,
): Promise<string> {
    const branch = editorEngine.branches.activeBranch;
    if (!branch) throw new Error('No active branch');
    const sandbox = editorEngine.branches.getSandboxById(branch.id);
    if (!sandbox) throw new Error('No sandbox for active branch');

    const response = await fetch(`/api/chat-images/${encodeURIComponent(cacheId)}`);
    if (!response.ok) {
        throw new Error('Generated image is no longer available (cache expired). Regenerate.');
    }
    const mimeType = response.headers.get('content-type') ?? 'image/png';
    const bytes = new Uint8Array(await response.arrayBuffer());

    const extension = mime.getExtension(mimeType) ?? 'png';
    const filename = `${uuidv4()}.${extension}`;
    const fullPath = `public/${filename}`;
    await sandbox.writeFile(fullPath, bytes);
    return fullPath;
}
