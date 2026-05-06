'use client';

import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { ImageMessageContext, MessageContext } from '@weblab/models';
import { type ProjectCreateRequest } from '@weblab/db';
import {
    ChatType,
    CreateRequestContextType,
    MessageContextType,
    ProjectCreateRequestStatus,
} from '@weblab/models';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { api } from '@/trpc/react';
import { useTabActive } from '../_hooks/use-tab-active';

interface ProjectReadyState {
    canvas: boolean;
    conversations: boolean;
    sandbox: boolean;
}

export const useStartProject = () => {
    const editorEngine = useEditorEngine();
    const sandbox = editorEngine.activeSandbox;
    const [error, setError] = useState<string | null>(null);
    const processedRequestIdRef = useRef<string | null>(null);
    const { tabState } = useTabActive();
    const apiUtils = api.useUtils();
    const { data: user, error: userError } = api.user.get.useQuery();
    // CR-050: poll the canvas + frames row so collaborator mutations show up
    // without a full reload. The userCanvas row is per-user (scale/position),
    // so re-applying it on every poll would clobber the local pan/zoom — we
    // gate that with `initialCanvasAppliedRef` below. Frames are shared and
    // re-apply safely thanks to the new idempotent `applyFrames`.
    const { data: canvasWithFrames, error: canvasError } = api.userCanvas.getWithFrames.useQuery(
        { projectId: editorEngine.projectId },
        {
            refetchInterval: 30_000,
            refetchOnWindowFocus: true,
            // Keep stale data on the screen during the refetch — avoids a flash
            // of the loading state when polling.
            refetchIntervalInBackground: false,
        },
    );
    const initialCanvasAppliedRef = useRef(false);
    const { data: conversations, error: conversationsError } =
        api.chat.conversation.getAll.useQuery({ projectId: editorEngine.projectId });
    const { data: creationRequest, error: creationRequestError } =
        api.project.createRequest.getPendingRequest.useQuery({ projectId: editorEngine.projectId });
    const { mutateAsync: updateCreateRequest } = api.project.createRequest.updateStatus.useMutation(
        {
            onSettled: async () => {
                await apiUtils.project.createRequest.getPendingRequest.invalidate({
                    projectId: editorEngine.projectId,
                });
            },
        },
    );
    const [projectReadyState, setProjectReadyState] = useState<ProjectReadyState>({
        canvas: false,
        conversations: false,
        sandbox: false,
    });

    const updateProjectReadyState = (state: Partial<ProjectReadyState>) => {
        setProjectReadyState((prev) => ({ ...prev, ...state }));
    };

    useEffect(() => {
        if (sandbox.session.provider) {
            updateProjectReadyState({ sandbox: true });
            return;
        }

        if (sandbox.session.connectionError) {
            updateProjectReadyState({ sandbox: false });
            setError(sandbox.session.connectionError);
        }
    }, [sandbox.session.provider, sandbox.session.connectionError]);

    useEffect(() => {
        if (tabState === 'reactivated' && editorEngine.projectId && user?.id) {
            void sandbox.session.reconnect(editorEngine.projectId, user.id);
        }
    }, [tabState, sandbox.session, editorEngine.projectId, user?.id]);

    useEffect(() => {
        if (!canvasWithFrames) return;
        // Apply per-user canvas (scale/position) only on first load. Re-applying
        // on every poll would clobber the user's local pan/zoom that hasn't yet
        // been saved (canvas store debounces saves by 5s).
        if (!initialCanvasAppliedRef.current) {
            editorEngine.canvas.applyCanvas(canvasWithFrames.userCanvas);
            initialCanvasAppliedRef.current = true;
        }
        // Re-apply frames on every refetch. `applyFrames` is now idempotent —
        // preserves attached views and selection; prunes server-deleted frames
        // that don't have a live view binding.
        editorEngine.frames.applyFrames(canvasWithFrames.frames);
        updateProjectReadyState({ canvas: true });
    }, [canvasWithFrames]);

    useEffect(() => {
        const applyConversations = async () => {
            if (conversations) {
                await editorEngine.chat.conversation.applyConversations(conversations);
                updateProjectReadyState({ conversations: true });
            }
        };
        void applyConversations();
    }, [editorEngine.chat.conversation, conversations]);

    useEffect(() => {
        const isProjectReady = Object.values(projectReadyState).every((value) => value);
        if (
            creationRequest &&
            processedRequestIdRef.current !== creationRequest.id &&
            isProjectReady &&
            editorEngine.chat._sendMessageAction
        ) {
            processedRequestIdRef.current = creationRequest.id;
            void resumeCreate(creationRequest);
        }
    }, [creationRequest, projectReadyState, editorEngine.chat._sendMessageAction]);

    const resumeCreate = async (creationData: ProjectCreateRequest) => {
        try {
            if (editorEngine.projectId !== creationData.projectId) {
                throw new Error('Project ID mismatch');
            }

            const createContext: MessageContext[] =
                await editorEngine.chat.context.getCreateContext();
            const imageContexts: ImageMessageContext[] = creationData.context
                .filter((context) => context.type === CreateRequestContextType.IMAGE)
                .map((context) => ({
                    type: MessageContextType.IMAGE,
                    source: 'external',
                    content: context.content,
                    mimeType: context.mimeType,
                    displayName: 'user image',
                    id: uuidv4(),
                }));

            const context: MessageContext[] = [...createContext, ...imageContexts];
            editorEngine.chat.context.addContexts(context);

            const prompt = creationData.context
                .filter((context) => context.type === CreateRequestContextType.PROMPT)
                .map((context) => context.content)
                .join('\n');

            const [conversation] = await editorEngine.chat.conversation.getConversations(
                editorEngine.projectId,
            );

            if (!conversation) {
                throw new Error('No conversation found');
            }

            await editorEngine.chat.conversation.selectConversation(conversation.id);
            await editorEngine.chat.sendMessage(prompt, ChatType.CREATE);

            try {
                await updateCreateRequest({
                    projectId: editorEngine.projectId,
                    status: ProjectCreateRequestStatus.COMPLETED,
                });
            } catch (error) {
                console.error('Failed to update create request', error);
                toast.error('Failed to complete create request', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        } catch (error) {
            processedRequestIdRef.current = null; // Allow retry on failure
            console.error('Failed to resume create request', error);
            toast.error('Failed to resume create request', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    useEffect(() => {
        setError(
            userError?.message ??
                canvasError?.message ??
                conversationsError?.message ??
                creationRequestError?.message ??
                sandbox.session.connectionError ??
                null,
        );
    }, [
        userError,
        canvasError,
        conversationsError,
        creationRequestError,
        sandbox.session.connectionError,
    ]);

    return {
        isProjectReady: Object.values(projectReadyState).every((value) => value),
        error,
        readyState: projectReadyState,
    };
};
