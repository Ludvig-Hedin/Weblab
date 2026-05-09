import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { parse } from 'tldts';

import type { CustomDomain, DrizzleDb } from '@weblab/db';
import { customDomains, customDomainVerification, userProjects } from '@weblab/db';
import { VerificationRequestStatus } from '@weblab/models';

/**
 * Confirms that this user previously completed a real DNS verification
 * (status=VERIFIED) for this domain on at least one of their projects.
 * Looking only at `projectCustomDomains.fullDomain` is not sufficient —
 * those rows can be inserted for free via `verifyOwnedDomain` itself, so
 * relying on them creates a takeover loop where any user can claim any
 * subdomain whose apex was ever verified globally. Requiring a verified
 * `customDomainVerification` row tied to a project the user belongs to
 * proves per-user DNS control of the actual full domain.
 */
export const ensureUserOwnsDomain = async (
    db: DrizzleDb,
    userId: string,
    domain: string,
): Promise<boolean> => {
    const verifications = await db.query.customDomainVerification.findMany({
        where: and(
            eq(customDomainVerification.fullDomain, domain),
            eq(customDomainVerification.status, VerificationRequestStatus.VERIFIED),
        ),
    });
    if (verifications.length === 0) return false;

    const userProjectRows = await db.query.userProjects.findMany({
        where: eq(userProjects.userId, userId),
        columns: { projectId: true },
    });
    const userProjectIds = new Set(userProjectRows.map((row) => row.projectId));

    return verifications.some((verification) => userProjectIds.has(verification.projectId));
};

export const getCustomDomain = async (
    db: DrizzleDb,
    domain: string,
): Promise<{ customDomain: CustomDomain; subdomain: string | null }> => {
    const parsedDomain = parse(domain);
    if (!parsedDomain.domain) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid domain format ${domain}`,
        });
    }

    if (!parsedDomain.domain) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Could not resolve apex domain',
        });
    }

    const apexDomain = parsedDomain.domain;
    const subdomain = parsedDomain.subdomain;

    const [customDomain] = await db
        .insert(customDomains)
        .values({
            apexDomain,
        })
        .onConflictDoUpdate({
            target: customDomains.apexDomain,
            set: {
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!customDomain) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create or update domain',
        });
    }

    return { customDomain, subdomain };
};

export const getVerification = async (db: DrizzleDb, projectId: string, customDomainId: string) => {
    const verification = await db.query.customDomainVerification.findFirst({
        where: and(
            eq(customDomainVerification.customDomainId, customDomainId),
            eq(customDomainVerification.projectId, projectId),
            eq(customDomainVerification.status, VerificationRequestStatus.PENDING),
        ),
    });
    return verification;
};
