import { makeAutoObservable } from 'mobx';

import { type ChatType } from '@weblab/models';

import type { EditorEngine } from '../engine';
import type { SendMessage } from '@/app/project/[id]/_hooks/use-chat';
import { ChatContext } from './context';
import { ConversationManager } from './conversation';

export const FOCUS_CHAT_INPUT_EVENT = 'focus-chat-input';
export const OPEN_CHAT_PANEL_EVENT = 'weblab:open-chat-panel';
export const OPEN_STYLE_PANEL_EVENT = 'weblab:open-style-panel';
export const STARTUP_RECOVERY_EVENT = 'weblab:startup-recovery-requested';

type StartupRecoveryRequest = {
    id: number;
    branchId: string;
    model: string;
    prompt: string;
};

export class ChatManager {
    conversation: ConversationManager;
    context: ChatContext;

    // Content sent from useChat hook
    _sendMessageAction: SendMessage | null = null;
    isStreaming = false;
    queuedMessageCount = 0;
    pendingFixErrorsRequest = false;
    pendingStartupRecovery: StartupRecoveryRequest | null = null;
    private startupRecoveryId = 0;

    constructor(private editorEngine: EditorEngine) {
        this.context = new ChatContext(this.editorEngine);
        this.conversation = new ConversationManager(this.editorEngine);
        makeAutoObservable(this);
    }

    init() {
        this.context.init();
    }

    focusChatInput() {
        window.dispatchEvent(new Event(FOCUS_CHAT_INPUT_EVENT));
    }

    /**
     * Reveal + switch the right panel to the Chat tab. The right panel listens
     * for this event (it owns the tab state) and unhides/uncollapses itself.
     */
    openChatPanel() {
        window.dispatchEvent(new Event(OPEN_CHAT_PANEL_EVENT));
    }

    /**
     * True once `useChat` has wired up the send action. The chat hook only
     * mounts while the Chat tab is active, so callers outside the panel must
     * check this (or open the panel first) before calling `sendMessage`.
     */
    get isChatActionReady(): boolean {
        return this._sendMessageAction !== null;
    }

    getCurrentConversationId() {
        return this.conversation.current?.id;
    }

    /**
     * Start a fresh chat thread. "New chat" means a clean slate, so we drop any
     * draft context attached to the input before creating the conversation —
     * this also gives the click a visible effect when `startNewConversation`
     * dedupes (it no-ops when the current thread is already empty + untitled).
     * Shared by the header New-chat button and the `/clear` slash command.
     */
    async startNewChat(): Promise<void> {
        this.context.context = [];
        await this.conversation.startNewConversation();
    }

    setIsStreaming(isStreaming: boolean) {
        this.isStreaming = isStreaming;
    }

    setQueuedMessageCount(count: number) {
        this.queuedMessageCount = count;
    }

    setChatActions(sendMessage: SendMessage) {
        this._sendMessageAction = sendMessage;
    }

    async sendMessage(content: string, type: ChatType): Promise<void> {
        if (!this._sendMessageAction) {
            throw new Error('Chat actions not initialized');
        }

        await this._sendMessageAction(content, type);
    }

    requestFixErrors() {
        this.pendingFixErrorsRequest = true;
    }

    requestStartupRecovery(branchId: string, model: string, prompt: string) {
        this.pendingStartupRecovery = {
            id: ++this.startupRecoveryId,
            branchId,
            model,
            prompt,
        };
        this.openChatPanel();
        window.dispatchEvent(new Event(STARTUP_RECOVERY_EVENT));
    }

    consumeStartupRecovery(id: number): boolean {
        if (this.pendingStartupRecovery?.id !== id) return false;
        this.pendingStartupRecovery = null;
        return true;
    }

    consumeFixErrorsRequest(): boolean {
        if (!this.pendingFixErrorsRequest) return false;
        this.pendingFixErrorsRequest = false;
        return true;
    }

    clear() {
        this.context.clear();
        this.conversation.clear();
        this.pendingFixErrorsRequest = false;
        this.pendingStartupRecovery = null;
        this.queuedMessageCount = 0;
    }
}
