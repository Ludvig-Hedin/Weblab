'use client';

import localforage from 'localforage';

import type { ImageMessageContext } from '@weblab/models';

export const AI_PROMPT_CREATE_DRAFT_KEY = 'ai-prompt-create-draft';
export const AI_PROMPT_CREATE_RESUME_PATH = '/projects/new?resumeCreate=1';

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface AiPromptCreateDraft {
    prompt: string;
    images: ImageMessageContext[];
    timestamp: number;
}

export function createAiPromptDraft(
    prompt: string,
    images: ImageMessageContext[],
): AiPromptCreateDraft {
    return {
        prompt,
        images,
        timestamp: Date.now(),
    };
}

export async function saveAiPromptCreateDraft(
    prompt: string,
    images: ImageMessageContext[],
): Promise<void> {
    await localforage.setItem(AI_PROMPT_CREATE_DRAFT_KEY, createAiPromptDraft(prompt, images));
}

export async function loadAiPromptCreateDraft(): Promise<AiPromptCreateDraft | null> {
    const draft = await localforage.getItem<AiPromptCreateDraft>(AI_PROMPT_CREATE_DRAFT_KEY);
    if (!draft) {
        return null;
    }

    if (typeof draft.timestamp !== 'number') {
        await removeAiPromptCreateDraft();
        return null;
    }

    if (Date.now() - draft.timestamp > DRAFT_MAX_AGE_MS) {
        await removeAiPromptCreateDraft();
        return null;
    }

    return {
        prompt: draft.prompt ?? '',
        images: Array.isArray(draft.images) ? draft.images : [],
        timestamp: draft.timestamp,
    };
}

export async function removeAiPromptCreateDraft(): Promise<void> {
    await localforage.removeItem(AI_PROMPT_CREATE_DRAFT_KEY);
}
