'use node';

import { promises as dns } from 'node:dns';
import type {
    FreestyleDeployWebSuccessResponseV2,
    HandleVerifyDomainError,
    HandleVerifyDomainResponse,
} from 'freestyle-sandboxes';
import { FreestyleSandboxes } from 'freestyle-sandboxes';
import { parse } from 'tldts';

import type { DeploymentRequest, DeploymentResponse, HostingProviderAdapter } from '@weblab/models';
import { FREESTYLE_CUSTOM_HOSTNAME, FREESTYLE_IP_ADDRESS } from '@weblab/constants';

// Convex port of:
//   apps/web/client/src/server/api/routers/domain/freestyle.ts
//   apps/web/client/src/server/api/routers/domain/verify/helpers/{freestyle,records}.ts
//
// Uses node:dns and the freestyle-sandboxes SDK, so it must be imported only
// from `"use node"` action files.

export const initializeFreestyleSdk = () => {
    if (!process.env.FREESTYLE_API_KEY) {
        throw new Error(
            'FREESTYLE_API_KEY is not configured. Set it on the Convex deployment via ' +
                '`bunx convex env set FREESTYLE_API_KEY <key>` to use domain publishing.',
        );
    }
    return new FreestyleSandboxes({
        apiKey: process.env.FREESTYLE_API_KEY,
    });
};

export interface AVerificationRecord {
    type: 'A';
    name: string;
    value: string;
    verified: boolean;
}

export interface TxtVerificationRecord {
    type: 'TXT';
    name: string;
    value: string;
    verified: boolean;
}

export const getARecords = (subdomain: string | null): AVerificationRecord[] => {
    if (!subdomain) {
        return [
            { type: 'A', name: '@', value: FREESTYLE_IP_ADDRESS, verified: false },
            { type: 'A', name: 'www', value: FREESTYLE_IP_ADDRESS, verified: false },
        ];
    }
    return [
        {
            type: 'A',
            name: subdomain,
            value: FREESTYLE_IP_ADDRESS,
            verified: false,
        },
    ];
};

export const parseDomain = (domain: string): { apexDomain: string; subdomain: string | null } => {
    const parsed = parse(domain);
    if (!parsed.domain) {
        throw new Error(`BAD_REQUEST: Invalid domain format ${domain}`);
    }
    return {
        apexDomain: parsed.domain,
        subdomain: parsed.subdomain ?? null,
    };
};

/**
 * Normalize user-entered domain text to a bare, lowercased hostname so the
 * value we persist as `fullDomain` (and send to Freestyle) is consistent.
 * `tldts.parse` extracts a normalized hostname from messy input — it strips
 * protocol, port, path, and query and lowercases:
 *   "HTTPS://WWW.Example.com:3000/path" -> "www.example.com".
 * Without this, a user who pastes a URL or types mixed case has the raw string
 * stored verbatim, which breaks the exact-match `customRemove` / owned-domain
 * lookups that compare against `fullDomain`. Apex parsing already normalizes
 * via tldts, so this only fixes the stored full-hostname; dedup is unchanged.
 * Falls back to trim+lowercase when tldts can't derive a hostname so genuinely
 * invalid input still flows to `parseDomain`, which throws BAD_REQUEST.
 */
export const normalizeDomainInput = (domain: string): string => {
    const trimmed = domain.trim();
    const parsed = parse(trimmed);
    return parsed.hostname ?? trimmed.toLowerCase();
};

export const buildTxtRecord = (verificationCode: string): TxtVerificationRecord => ({
    type: 'TXT',
    name: FREESTYLE_CUSTOM_HOSTNAME,
    value: verificationCode,
    verified: false,
});

export interface FreestyleVerificationRequest {
    freestyleVerificationId: string;
    verificationCode: string;
}

export const createFreestyleDomainVerification = async (
    domain: string,
): Promise<FreestyleVerificationRequest> => {
    const sdk = initializeFreestyleSdk();
    const { id, verificationCode } = await sdk.createDomainVerificationRequest(domain);
    return { freestyleVerificationId: id, verificationCode };
};

export type FreestyleVerifyResult =
    | { ok: true; domain: string | null }
    | { ok: false; message: string };

export const verifyFreestyleDomain = async (
    verificationId: string,
): Promise<FreestyleVerifyResult> => {
    try {
        const sdk = initializeFreestyleSdk();
        const res: HandleVerifyDomainResponse =
            await sdk.verifyDomainVerificationRequest(verificationId);
        // A clean negative (`domain == null`, DNS not propagated yet) is
        // distinct from a thrown provider/network error. The caller must not
        // report the latter as a DNS misconfiguration.
        return { ok: true, domain: res.domain ?? null };
    } catch (error) {
        console.error('[freestyle] verifyDomain failed', error);
        return { ok: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
};

export const verifyFreestyleDomainWithCustomDomain = async (
    apexDomain: string,
): Promise<{ domain: string | null; message: string | null }> => {
    try {
        const sdk = initializeFreestyleSdk();
        const res = (await sdk.verifyDomain(apexDomain)) as HandleVerifyDomainResponse &
            HandleVerifyDomainError & {
                domain: string | null;
                message: string | null;
            };
        return { domain: res.domain ?? null, message: res.message ?? null };
    } catch (error) {
        console.error('[freestyle] verifyDomain (apex) failed', error);
        return {
            domain: null,
            message: error instanceof Error ? error.message : 'Unknown error',
        };
    }
};

export async function isTxtRecordPresent(
    fullDomain: string,
    name: string,
    expectedValue: string,
): Promise<{ isPresent: boolean; foundRecords: string[] }> {
    try {
        const parsed = parse(fullDomain);
        if (!parsed.domain) {
            return { isPresent: false, foundRecords: [] };
        }
        const domain = parsed.domain;
        const records = await dns.resolveTxt(`${name}.${domain}`);
        const foundRecords = records.map((entry) => entry.join(''));
        return { isPresent: foundRecords.includes(expectedValue), foundRecords };
    } catch {
        return { isPresent: false, foundRecords: [] };
    }
}

export async function isARecordPresent(
    name: string,
    expectedIp: string,
): Promise<{ isPresent: boolean; foundRecords: string[] }> {
    try {
        const records = await dns.resolve4(name);
        return { isPresent: records.includes(expectedIp), foundRecords: records };
    } catch {
        return { isPresent: false, foundRecords: [] };
    }
}

export class FreestyleAdapter implements HostingProviderAdapter {
    async deploy(request: DeploymentRequest): Promise<DeploymentResponse> {
        const sdk = initializeFreestyleSdk();
        const res = await sdk.deployWeb({ files: request.files, kind: 'files' }, request.config);
        const freestyleResponse = res as {
            message?: string;
            error?: { message: string };
            data?: FreestyleDeployWebSuccessResponseV2;
        };
        if (freestyleResponse.error) {
            throw new Error(
                freestyleResponse.error.message || freestyleResponse.message || 'Unknown error',
            );
        }
        return {
            deploymentId: freestyleResponse.data?.deploymentId ?? '',
            success: true,
        };
    }
}

export const buildFailureReason = async (verification: {
    fullDomain: string;
    txtRecord: TxtVerificationRecord;
    aRecords: AVerificationRecord[];
}): Promise<string> => {
    const errors: string[] = [];
    const txtRecord = verification.txtRecord;
    const txtResp = await isTxtRecordPresent(
        verification.fullDomain,
        txtRecord.name,
        txtRecord.value,
    );
    if (!txtResp.isPresent) {
        let err = `TXT Record Missing:\n`;
        err += `    Expected:\n`;
        err += `        host: ${txtRecord.name}\n`;
        err += `        value: "${txtRecord.value}"\n`;
        if (txtResp.foundRecords.length > 0) {
            err += `    Found:\n`;
            err += `        value: ${txtResp.foundRecords.map((r) => `"${r}"`).join(', ')}`;
        } else {
            err += `    Found: No TXT records`;
        }
        errors.push(err);
    }
    const apex = parse(verification.fullDomain).domain ?? verification.fullDomain;
    for (const aRecord of verification.aRecords) {
        // Resolve the record's actual FQDN, not the bare apex. A `www` (or any
        // sub-host) A record must be looked up at `www.<apex>` — checking the
        // apex's A records for every record falsely reported the www record as
        // missing (or present). `@` maps to the apex; a subdomain record's
        // host already equals fullDomain via this same rule.
        const recordHost = !aRecord.name || aRecord.name === '@' ? apex : `${aRecord.name}.${apex}`;
        const aResp = await isARecordPresent(recordHost, aRecord.value);
        if (!aResp.isPresent) {
            let err = `A Record Missing:\n`;
            err += `    Expected:\n`;
            err += `        host: ${aRecord.name}\n`;
            err += `        value: ${aRecord.value}\n`;
            if (aResp.foundRecords.length > 0) {
                err += `    Found:\n`;
                err += `        value: ${aResp.foundRecords.join(', ')}`;
            } else {
                err += `    Found: No A records`;
            }
            errors.push(err);
        }
    }
    errors.push('DNS records may take up to 24 hours to update');
    return errors.join('\n\n');
};
