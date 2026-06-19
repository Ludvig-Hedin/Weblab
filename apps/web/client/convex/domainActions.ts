'use node';

import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action } from './_generated/server';
import {
    buildFailureReason,
    buildTxtRecord,
    createFreestyleDomainVerification,
    getARecords,
    normalizeDomainInput,
    parseDomain,
    verifyFreestyleDomain,
    verifyFreestyleDomainWithCustomDomain,
} from './lib/freestyle';

// Convex action layer for domain operations that hit the Freestyle API.
// DB writes happen via `ctx.runMutation(internal.domainActionsDb.*)`. DB-only
// mutations (preview/custom create/remove + cancel verification) live in
// `domainActionsDb.ts` so they can run in the default V8 runtime.

export const previewCreate = action({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }): Promise<{ domain: string }> => {
        return ctx.runMutation(internal.domainActionsDb._previewCreate, {
            projectId,
        });
    },
});

export const customRemove = action({
    args: {
        domain: v.string(),
        projectId: v.id('projects'),
    },
    handler: async (ctx, args): Promise<{ ok: true }> => {
        await ctx.runMutation(internal.domainActionsDb._customRemove, args);
        return { ok: true } as const;
    },
});

export const verificationRemove = action({
    args: { verificationId: v.id('customDomainVerification') },
    handler: async (ctx, { verificationId }): Promise<{ ok: true }> => {
        await ctx.runMutation(internal.domainActionsDb._verificationCancel, {
            verificationId,
        });
        return { ok: true } as const;
    },
});

export const verificationCreate = action({
    args: {
        domain: v.string(),
        projectId: v.id('projects'),
    },
    handler: async (ctx, { domain, projectId }): Promise<unknown> => {
        // Normalize once at the boundary (strip protocol/port/path, lowercase)
        // so the persisted `fullDomain` and the Freestyle request use a clean
        // hostname. Exact-match lookups (customRemove, owned-domain reuse)
        // compare against this stored value, so storing raw user input breaks
        // them when casing/format differs.
        const normalizedDomain = normalizeDomainInput(domain);

        // Parse apex + subdomain in Node (tldts handles multi-label TLDs
        // like .co.uk / .github.io / .vercel.app correctly via the Public
        // Suffix List). Pass the parsed pair down so the V8 mutation
        // doesn't need to re-derive it with a heuristic that misclassifies
        // ccTLDs.
        const { apexDomain, subdomain } = parseDomain(normalizedDomain);

        // Permission + customDomain upsert is done in the mutation. The
        // action only owns the external Freestyle call (must run in Node).
        const { customDomainId, subdomain: returnedSubdomain, existing } = await ctx.runMutation(
            internal.domainActionsDb._ensureCustomDomainForVerification,
            { domain: normalizedDomain, projectId, apexDomain, subdomain },
        );
        if (existing) return existing;

        const { freestyleVerificationId, verificationCode } =
            await createFreestyleDomainVerification(normalizedDomain);

        return ctx.runMutation(internal.domainActionsDb._verificationInsert, {
            projectId,
            customDomainId,
            domain: normalizedDomain,
            freestyleVerificationId,
            txtRecord: buildTxtRecord(verificationCode),
            aRecords: getARecords(returnedSubdomain),
        });
    },
});

export const verificationVerify = action({
    args: { verificationId: v.id('customDomainVerification') },
    handler: async (
        ctx,
        { verificationId },
    ): Promise<{ success: boolean; failureReason: string | null }> => {
        const verification = await ctx.runQuery(internal.domainActionsDb._getPendingVerification, {
            verificationId,
        });
        if (!verification) throw new Error('NOT_FOUND: verification');

        const result = await verifyFreestyleDomain(verification.freestyleVerificationId);

        // A thrown provider/network error is NOT a DNS misconfiguration.
        // Surfacing the DNS-records diagnostic for it misleads the user into
        // "fixing" correct records — tell them to retry instead.
        if (!result.ok) {
            return {
                success: false,
                failureReason: `Could not reach the domain verification service. Please try again in a moment. (${result.message})`,
            };
        }

        const domain = result.domain;
        if (!domain) {
            const failureReason = await buildFailureReason({
                fullDomain: verification.fullDomain,
                txtRecord: verification.txtRecord,
                aRecords: verification.aRecords,
            });
            return { success: false, failureReason };
        }

        await ctx.runMutation(internal.domainActionsDb._verificationMarkVerified, {
            verificationId,
            customDomainId: verification.customDomainId,
            projectId: verification.projectId,
            domain,
        });
        return { success: true, failureReason: null };
    },
});

export const verificationVerifyOwnedDomain = action({
    args: {
        fullDomain: v.string(),
        projectId: v.id('projects'),
    },
    handler: async (
        ctx,
        { fullDomain, projectId },
    ): Promise<{ success: boolean; failureReason: string | null }> => {
        const owns = await ctx.runQuery(internal.domainActionsDb._ensureUserOwnsDomain, {
            fullDomain,
            projectId,
        });
        if (!owns.ownsDomain) {
            return { success: false, failureReason: 'User does not own domain' };
        }

        // Parse apex in Node (tldts) so multi-label TLDs are handled
        // correctly; the V8 mutation just persists what we computed.
        const { apexDomain: parsedApex } = parseDomain(fullDomain);
        const { apexDomain, customDomainId } = await ctx.runMutation(
            internal.domainActionsDb._ensureCustomDomainForOwned,
            { fullDomain, projectId, apexDomain: parsedApex },
        );

        // KNOWN: Freestyle can fail when another verification request was
        // recently made for the same apex. Surface the message for support.
        const { domain, message } = await verifyFreestyleDomainWithCustomDomain(apexDomain);
        if (!domain) {
            return {
                success: false,
                failureReason:
                    message ??
                    'Failed to verify domain with Freestyle hosting provider. Please contact support.',
            };
        }

        await ctx.runMutation(internal.domainActionsDb._insertOwnedProjectDomain, {
            projectId,
            fullDomain,
            customDomainId,
        });
        return { success: true, failureReason: null };
    },
});

// Also export a shim used by parseDomain so it can be invoked from the mutation
// file's internal helpers via require — easier in Convex to inline the parsing
// in the action and pass `subdomain` through. parseDomain is sync but uses
// tldts (CommonJS), kept Node-only.
export const _parseDomain = action({
    args: { domain: v.string() },
    handler: async (_ctx, { domain }) => parseDomain(domain),
});
