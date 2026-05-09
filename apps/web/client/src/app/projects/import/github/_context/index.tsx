'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { GitHubOrganization, GitHubRepository } from '@weblab/github';

import { Routes } from '@/utils/constants';
import {
    useGitHubAppInstallation,
    useGitHubData,
    useRepositoryImport,
    useRepositoryValidation,
} from '../_hooks';

interface ImportGithubProjectProviderProps {
    children: React.ReactNode;
    totalSteps: number;
}

interface ImportGithubContextType {
    // Step management
    currentStep: number;
    setCurrentStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;

    // Repository data
    repoUrl: string;
    setRepoUrl: (repoUrl: string) => void;
    branch: string;
    setBranch: (branch: string) => void;
    selectedRepo: GitHubRepository | null;
    setSelectedRepo: (repo: GitHubRepository | null) => void;
    selectedOrg: GitHubOrganization | null;
    setSelectedOrg: (org: GitHubOrganization | null) => void;

    // Hook instances (exposed directly)
    installation: ReturnType<typeof useGitHubAppInstallation>;
    githubData: ReturnType<typeof useGitHubData>;
    repositoryImport: ReturnType<typeof useRepositoryImport>;
    repositoryValidation: ReturnType<typeof useRepositoryValidation>;

    // Utility functions
    validateRepository: (
        owner: string,
        repo: string,
    ) => Promise<{ branch: string; isPrivateRepo: boolean } | null>;
    clearErrors: () => void;
    retry: () => Promise<void>;
    cancel: () => void;
}

export const ImportGithubProjectProvider: React.FC<ImportGithubProjectProviderProps> = ({
    children,
    totalSteps = 1,
}) => {
    const router = useRouter();

    // Step management
    const [currentStep, setCurrentStep] = useState(0);

    // Repository data
    const [repoUrl, setRepoUrl] = useState('');
    const [branch, setBranch] = useState('');
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
    const [selectedOrg, setSelectedOrg] = useState<GitHubOrganization | null>(null);

    // Hook instances
    const installation = useGitHubAppInstallation();
    const githubData = useGitHubData();
    const repositoryImport = useRepositoryImport();
    const repositoryValidation = useRepositoryValidation();

    /**
     * AbortController for the in-flight repository import. cancel() aborts it
     * before clearing local state so we don't leak the in-flight mutation
     * (issue #9).
     */
    const abortController = useRef<AbortController | null>(null);

    useEffect(() => {
        installation.refetch();
    }, []);

    useEffect(() => {
        if (installation.hasInstallation) {
            githubData.fetchOrganizations();
            githubData.fetchRepositories();
        }
    }, [installation.hasInstallation]);

    const nextStep = async () => {
        if (currentStep === 0 && !installation.hasInstallation) {
            installation.redirectToInstallation();
            return;
        }

        if (currentStep === 1) {
            setCurrentStep(2);
            if (selectedRepo) {
                abortController.current = new AbortController();
                repositoryImport.clearError();
                await repositoryImport.importRepository(
                    selectedRepo,
                    abortController.current.signal,
                );
            }
        } else if (currentStep < totalSteps - 1) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const prevStep = () => {
        if (currentStep === 0) {
            router.push(Routes.IMPORT_PROJECT);
            return;
        }
        setCurrentStep((prev) => prev - 1);
    };

    const validateRepository = async (owner: string, repo: string) => {
        const result = await repositoryValidation.validateRepository(owner, repo);
        if (result) {
            setBranch(result.branch);
        }
        return result;
    };

    const clearErrors = () => {
        installation.clearError();
        githubData.clearErrors();
        repositoryImport.clearError();
        repositoryValidation.clearError();
    };

    const clearData = () => {
        setSelectedRepo(null);
        setSelectedOrg(null);
        setRepoUrl('');
        setBranch('');
    };

    const retry = async () => {
        if (!selectedRepo) {
            setCurrentStep(1);
            return;
        }

        setCurrentStep(2);
        abortController.current = new AbortController();
        repositoryImport.clearError();
        await repositoryImport.importRepository(selectedRepo, abortController.current.signal);
    };

    /**
     * Cancel an in-flight GitHub import. Aborts the active mutation chain,
     * clears local state, and routes home. The sandbox/project IDs aren't
     * exposed at this layer (`use-repo-import` owns the mutation), so when an
     * import was in flight we surface a toast hinting at server cleanup.
     */
    const cancel = () => {
        const wasImporting = repositoryImport.isImporting;
        abortController.current?.abort();
        abortController.current = null;

        if (wasImporting) {
            // TODO: If sandbox forking succeeds but project creation fails, the forked
            // sandbox is leaked. A server-side cleanup job (or idempotent creation) is
            // needed to handle this. Until then, creation errors may leave orphaned sandboxes.
            toast.message('GitHub import cancelled', {
                description: 'If a sandbox was created, it may take a moment to clean up.',
            });
        }

        clearData();
        clearErrors();
        router.push(Routes.HOME);
    };

    const contextValue: ImportGithubContextType = {
        // Step management
        currentStep,
        setCurrentStep,
        nextStep,
        prevStep,

        // Repository data
        repoUrl,
        setRepoUrl,
        branch,
        setBranch,
        selectedRepo,
        setSelectedRepo,
        selectedOrg,
        setSelectedOrg,

        // Hook instances (exposed directly)
        installation,
        githubData,
        repositoryImport,
        repositoryValidation,

        // Utility functions
        validateRepository,
        clearErrors,
        retry,
        cancel,
    };

    return (
        <ImportGithubProjectContext.Provider value={contextValue}>
            {children}
        </ImportGithubProjectContext.Provider>
    );
};

const ImportGithubProjectContext = createContext<ImportGithubContextType | null>(null);

export const useImportGithubProject = () => {
    const context = useContext(ImportGithubProjectContext);
    if (!context) {
        throw new Error('useImportGithubProject must be used within ImportGithubProjectProvider');
    }
    return context;
};
