import type { ChatMessage } from '@weblab/models';

/**
 * Server-side execution context passed into ServerTool.execute().
 *
 * Constructed by the chat HTTP route per request. The trpcCaller is the
 * server-side tRPC caller (typeof api from `@/trpc/server` in the web app),
 * typed as unknown here because packages/ai cannot depend on the web app's
 * AppRouter type. Tools that need it should narrow at the use site.
 *
 * `messages` is the live in-flight message thread for the current chat
 * turn. Server tools that need to resolve uploaded images, prior tool
 * outputs, or context from the user's message use this rather than the
 * persisted DB conversation (which only updates after the stream finishes).
 */
export interface ServerToolContext {
    userId: string;
    projectId: string;
    conversationId: string;
    /**
     * Per-request authenticated tRPC caller. Opaque to packages/ai — the
     * chat route injects the typed caller; consumers cast to AppRouter caller
     * shape when needed.
     */
    trpcCaller: unknown;
    /** Live message thread for the current turn. */
    messages: ChatMessage[];
    /**
     * Reserve credits + enforce caps for one image generation. Injected by the
     * web app (Convex-backed) so packages/ai stays backend-agnostic. Throws a
     * typed limit error (IMAGE_DAILY_CAP_REACHED / IMAGE_RATE_LIMITED /
     * IMAGE_TURN_CAP_REACHED / USAGE_LIMIT_REACHED) when blocked. Returns a
     * handle used to refund on failure. Undefined in unmetered contexts.
     */
    reserveImageCredits?: () => Promise<ImageCreditHandle>;
    /** Refund a reservation when generation fails. Paired with reserveImageCredits. */
    releaseImageCredits?: (handle: ImageCreditHandle) => Promise<void>;
}

export interface ImageCreditHandle {
    usageRecordId: string | undefined;
    rateLimitId: string | undefined;
}
