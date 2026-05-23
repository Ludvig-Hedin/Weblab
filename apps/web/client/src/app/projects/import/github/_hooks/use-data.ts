'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useConvex } from 'convex/react';

import type { GitHubOrganization, GitHubRepository } from '@weblab/github';

export const useGitHubData = () => {
    const convex = useConvex();
    const [organizations, setOrganizations] = useState<GitHubOrganization[]>([]);
    const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
    const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(false);
    const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);
    const [organizationsError, setOrganizationsError] = useState<string | null>(null);
    const [repositoriesError, setRepositoriesError] = useState<string | null>(null);

    const fetchOrganizations = async () => {
        setIsLoadingOrganizations(true);
        setOrganizationsError(null);

        try {
            const organizationsData = await convex.action(api.githubActions.getOrganizations, {});
            setOrganizations(organizationsData as GitHubOrganization[]);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Failed to fetch organizations';
            setOrganizationsError(errorMessage);
            console.error('Error fetching organizations:', error);
        } finally {
            setIsLoadingOrganizations(false);
        }
    };

    const fetchRepositories = async () => {
        setIsLoadingRepositories(true);
        setRepositoriesError(null);

        try {
            const repositoriesData = await convex.action(
                api.githubActions.getRepositoriesWithApp,
                {},
            );
            setRepositories(repositoriesData as GitHubRepository[]);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Failed to fetch repositories';
            setRepositoriesError(errorMessage);
            console.error('Error fetching repositories:', error);
        } finally {
            setIsLoadingRepositories(false);
        }
    };

    const clearOrganizationsError = () => {
        setOrganizationsError(null);
    };

    const clearRepositoriesError = () => {
        setRepositoriesError(null);
    };

    const clearErrors = () => {
        setOrganizationsError(null);
        setRepositoriesError(null);
    };

    return {
        organizations,
        repositories,
        isLoadingOrganizations,
        isLoadingRepositories,
        organizationsError,
        repositoriesError,
        fetchOrganizations,
        fetchRepositories,
        clearOrganizationsError,
        clearRepositoriesError,
        clearErrors,
    };
};
