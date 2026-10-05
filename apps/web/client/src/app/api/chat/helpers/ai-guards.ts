import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { AI_GUARD_LOG_TAGS, AI_UNAVAILABLE_MESSAGE } from '@convex/lib/aiGuardConfig';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

import { isProOnlyModel } from '@weblab/models';

import { env } from '@/env';
import {
    AI_PAUSED_MESSAGE,
    aiGuardErrorResponse,
    guardStatusFor,
    isAiDisabledFlag,
    isGateNotDeployedError,
} from './ai-guard-response';

// Runaway / spike safeguards for the Next.js AI routes. Every LLM route calls
// `aiDisabledResponse()` first (instant env kill switch, no network) and
// `enforceAiGuards()` before its model call (Convex: kill switch, fleet daily
// budget, per-user spend caps, request rate limit, continuation cap).

const getConvexToken = async (): Promise<string | undefined> => {
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    return token ?? undefined;
};

/** 503 when the `AI_DISABLED` env kill switch is on; otherwise null. */
export function aiDisabledResponse(): Response | null {
    if (!isAiDisabledFlag(env.AI_DISABLED)) return null;
    console.warn(`${AI_GUARD_LOG_TAGS.killSwitch} AI route refused (AI_DISABLED env)`);
    return aiGuardErrorResponse(503, AI_PAUSED_MESSAGE, { reason: 'disabled' });
}

export type AiGuardOutcome =
    | {
          ok: true;
          isPro: boolean;
          /**
           * Undo this request's rate-limit / continuation record when the
           * route refuses it afterwards (402 credits, credit-check outage).
           * Best-effort, never throws.
           */
          release: () => Promise<void>;
      }
    | { ok: false; response: Response };

const noopRelease = async (): Promise<void> => undefined;

function proModelRequiredResponse(): Response {
    return new Response(
        JSON.stringify({ error: 'This model is available on Pro.', code: 'pro_model_required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
}

export async function enforceAiGuards(opts: {
    bucket: 'llm' | 'tabComplete' | 'none';
    /** `scope` = conversation id (keys the server continuation counter). */
    turn?: { key: string; scope: string; isContinuation: boolean };
    /** Requested model; Pro-only models get 403 for non-Pro users. */
    model?: string;
    token?: string;
}): Promise<AiGuardOutcome> {
    const disabled = aiDisabledResponse();
    if (disabled) return { ok: false, response: disabled };

    const token = opts.token ?? (await getConvexToken());
    try {
        const result = await fetchMutation(
            api.aiGuards.checkAndRecord,
            { bucket: opts.bucket, turn: opts.turn, model: opts.model },
            { token },
        );
        if (result.allowed) {
            const { recordedAt, continuationCounted } = result;
            const bucket = opts.bucket;
            const release =
                recordedAt !== undefined && bucket !== 'none'
                    ? async () => {
                          try {
                              await fetchMutation(
                                  api.aiGuards.release,
                                  {
                                      bucket,
                                      recordedAt,
                                      turnScope: opts.turn?.scope,
                                      continuationCounted,
                                  },
                                  { token },
                              );
                          } catch (err) {
                              console.warn('[ai-guards] failed to release request record', err);
                          }
                      }
                    : noopRelease;
            return { ok: true, isPro: result.isPro, release };
        }
        if (result.reason === 'pro_model_required') {
            return { ok: false, response: proModelRequiredResponse() };
        }
        return {
            ok: false,
            response: aiGuardErrorResponse(guardStatusFor(result.reason), result.message, {
                reason: result.reason,
                retryAfterSeconds: result.retryAfterSeconds,
            }),
        };
    } catch (err) {
        if (isGateNotDeployedError(err)) {
            console.error(
                '[ai-guards] aiGuards.checkAndRecord is not deployed to Convex yet — allowing request. Run `bunx convex deploy`.',
            );
            // Keep the Pro-only rule even before the gate deploys.
            if (opts.model && isProOnlyModel(opts.model)) {
                const tier = await fetchQuery(api.usage.tier, {}, { token }).catch(() => 'free');
                if (tier !== 'pro' && tier !== 'pro-heavy') {
                    return { ok: false, response: proModelRequiredResponse() };
                }
                return { ok: true, isPro: true, release: noopRelease };
            }
            return { ok: true, isPro: false, release: noopRelease };
        }
        // Fail closed: if we can't check the limits, don't call the model.
        console.error('[ai-guards] guard check failed; refusing AI request', err);
        return {
            ok: false,
            response: aiGuardErrorResponse(503, AI_UNAVAILABLE_MESSAGE, {
                reason: 'guard_unavailable',
            }),
        };
    }
}

/**
 * Count a non-chat route's real cost toward the per-user spend caps and the
 * fleet daily budget. Best-effort: a failure is logged, never thrown (the
 * response already happened). Chat records spend via `aiUsageEvents.insert`.
 */
export async function recordAiSpend(costUsd: number, token?: string): Promise<void> {
    if (!(costUsd > 0)) return;
    try {
        const t = token ?? (await getConvexToken());
        await fetchMutation(
            api.aiGuards.recordSpend,
            { costUsd, serverSecret: env.AI_GUARD_SECRET },
            { token: t },
        );
    } catch (err) {
        if (!isGateNotDeployedError(err)) {
            console.error('[ai-guards] failed to record AI spend', err);
        }
    }
}
