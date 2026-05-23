import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { toast } from 'sonner';

import type { CustomDomainVerification } from '@weblab/db/src/schema/domain/custom/verification';
import type { DomainInfo } from '@weblab/models';
import { VerificationRequestStatus } from '@weblab/models';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';

export enum VerificationState {
    INPUTTING_DOMAIN = 'inputting_domain',
    CREATING_VERIFICATION = 'creating_verification',
    VERIFICATION_CREATED = 'verification_created',

    VERIFYING = 'verifying',
    VERIFIED = 'verified',
}

interface DomainVerificationContextType {
    domainInput: string;
    setDomainInput: (input: string) => void;
    customDomain: DomainInfo | null;
    verification: CustomDomainVerification | null;
    verificationState: VerificationState;
    error: string | null;
    ownedDomains: string[];
    reuseDomain: (domain: string) => Promise<void>;
    createVerificationRequest: () => Promise<void>;
    removeVerificationRequest: () => Promise<void>;
    verifyVerificationRequest: () => Promise<void>;
    removeVerifiedDomain: (domain: string) => Promise<void>;
}

const DomainVerificationContext = createContext<DomainVerificationContextType | undefined>(
    undefined,
);

const adaptVerification = (
    raw: { _id: string; fullDomain: string; status: string } | null | undefined,
): CustomDomainVerification | null => {
    if (!raw) return null;
    return { ...(raw as unknown as CustomDomainVerification), id: raw._id };
};

export const DomainVerificationProvider = ({ children }: { children: ReactNode }) => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId as Id<'projects'>;

    const [verificationState, setVerificationState] = useState(VerificationState.INPUTTING_DOMAIN);
    const [error, setError] = useState<string | null>(null);

    const customDomainRaw = useQuery(api.domains.customGet, { projectId });
    const verificationRaw = useQuery(api.domains.verificationGetActive, {
        projectId,
    });
    const ownedDomains = useQuery(api.domains.customGetOwnedDomains) ?? [];

    const createDomainVerification = useAction(api.domainActions.verificationCreate);
    const removeDomainVerification = useAction(api.domainActions.verificationRemove);
    const verifyDomain = useAction(api.domainActions.verificationVerify);
    const verifyOwnedDomain = useAction(api.domainActions.verificationVerifyOwnedDomain);
    const removeProjectCustomDomain = useAction(api.domainActions.customRemove);

    const verification = adaptVerification(
        verificationRaw as Parameters<typeof adaptVerification>[0],
    );
    const customDomain = (customDomainRaw ?? null) as DomainInfo | null;

    const [domainInput, setDomainInput] = useState(verification?.fullDomain ?? '');

    useEffect(() => {
        if (verificationRaw === undefined) {
            return;
        }
        if (verificationRaw === null) {
            setVerificationState(VerificationState.INPUTTING_DOMAIN);
            return;
        }
        if (verificationRaw.status === VerificationRequestStatus.PENDING) {
            setVerificationState(VerificationState.VERIFICATION_CREATED);
        } else if (verificationRaw.status === VerificationRequestStatus.VERIFIED) {
            setVerificationState(VerificationState.VERIFIED);
        }
    }, [verificationRaw]);

    const createVerificationRequest = async () => {
        try {
            setVerificationState(VerificationState.CREATING_VERIFICATION);
            setError(null);
            const verificationRequest = await createDomainVerification({
                domain: domainInput,
                projectId,
            });
            if (!verificationRequest) {
                setError('Failed to create domain verification');
                setVerificationState(VerificationState.INPUTTING_DOMAIN);
                return;
            }
            setError(null);
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Failed to create domain verification',
            );
        }
    };

    const removeVerificationRequest = async () => {
        try {
            if (!verificationRaw) {
                setError('No verification request to remove');
                return;
            }
            await removeDomainVerification({
                verificationId: verificationRaw._id as Id<'customDomainVerification'>,
            });
            setVerificationState(VerificationState.INPUTTING_DOMAIN);
            setError(null);
        } catch (error) {
            setError(
                error instanceof Error ? error.message : 'Failed to remove verification request',
            );
        }
    };

    const verifyVerificationRequest = async () => {
        try {
            if (!verificationRaw) {
                setError('No verification request to verify');
                return;
            }
            const { success, failureReason } = await verifyDomain({
                verificationId: verificationRaw._id as Id<'customDomainVerification'>,
            });
            if (!success || failureReason) {
                setError(failureReason ?? 'Failed to verify domain');
                return;
            }
            setVerificationState(VerificationState.VERIFIED);
            toast.success('Domain verified');
            setError(null);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to verify domain');
        }
    };

    const reuseDomain = async (domain: string) => {
        try {
            setError(null);
            const { success, failureReason } = await verifyOwnedDomain({
                fullDomain: domain,
                projectId,
            });
            if (!success || failureReason) {
                setError(failureReason ?? 'Failed to reuse domain');
                return;
            }
            setVerificationState(VerificationState.VERIFIED);
            setError(null);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to reuse domain');
        }
    };

    const removeVerifiedDomain = async (domain: string) => {
        try {
            const res = await removeProjectCustomDomain({
                domain,
                projectId,
            });
            if (!res) {
                setError('Failed to remove verified domain');
                return;
            }
            setVerificationState(VerificationState.INPUTTING_DOMAIN);
            setError(null);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to remove verified domain');
        }
    };

    return (
        <DomainVerificationContext.Provider
            value={{
                domainInput,
                setDomainInput,
                createVerificationRequest,
                removeVerificationRequest,
                verifyVerificationRequest,
                customDomain,
                verification,
                verificationState,
                error,
                ownedDomains,
                reuseDomain,
                removeVerifiedDomain,
            }}
        >
            {children}
        </DomainVerificationContext.Provider>
    );
};

export const useDomainVerification = () => {
    const context = useContext(DomainVerificationContext);
    if (context === undefined) {
        throw new Error('useDomainVerification must be used within a DomainVerificationProvider');
    }
    return context;
};
