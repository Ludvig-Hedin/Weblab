// Post-migration stub for one remaining type import. Caller:
// apps/web/client/src/components/ui/settings-modal/domain/custom/
// use-domain-verification.tsx imports CustomDomainVerification as a type.
// Switch to Doc<'customDomainVerification'> from convex/_generated/dataModel
// when the hook is migrated to useQuery.

// Loose shape — txtRecord/aRecords typed as `any` to match Convex `v.any()`
// storage. Downstream consumers (DnsRecords component) iterate aRecords as
// an array and read .type/.name/.value fields off each.
export interface CustomDomainVerification {
    id: string;
    customDomainId: string;
    projectId: string;
    fullDomain: string;
    freestyleVerificationId: string;
    status: 'pending' | 'verified' | 'cancelled';
    txtRecord?: any;
    aRecords?: any[];
    [key: string]: unknown;
}
