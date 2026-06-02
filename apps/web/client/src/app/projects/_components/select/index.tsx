'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import localforage from 'localforage';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import { STORAGE_BUCKETS, Tags } from '@weblab/constants';
import { Alert, AlertDescription, AlertTitle } from '@weblab/ui/alert';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Skeleton } from '@weblab/ui/skeleton';

import type { StaticTemplate } from '../templates/static-templates';
import type { ProjectFolder } from './project-card-utils';
import type { ProjectFilters, ProjectSort, ProjectView } from './projects-toolbar';
import type { CreateSuggestion } from '@/app/_components/hero/create';
import type { Id } from '@convex/_generated/dataModel';
import { Create } from '@/app/_components/hero/create';
import { CreateManagerProvider } from '@/components/store/create';
import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { Routes } from '@/utils/constants';
import { getFileUrlFromStorage } from '@/utils/supabase/client';
import { ProjectChooserCards } from '../project-chooser-cards';
import { Templates } from '../templates';
import { StaticTemplates } from '../templates/static-templates';
import { TemplateModal } from '../templates/template-modal';
import { CreateFolderDialog } from './create-folder-dialog';
import { FolderCard } from './folder-card';
import { HighlightText } from './highlight-text';
import { ProjectCard } from './project-card';
import {
    fromConvexProjectListCard,
    getFoldersStorageKey,
    moveProjectIdsToFolder,
    sanitizeFolders,
} from './project-card-utils';
import { ProjectRow, ProjectTableHeader } from './project-row';
import { countActiveFilters, DEFAULT_FILTERS, ProjectsToolbar } from './projects-toolbar';
import { useScreenshotBackfill } from './use-screenshot-backfill';

const VIEW_STORAGE_KEY = 'weblab_projects_view_v1';
const getViewStorageKey = (userId?: string | null) =>
    `${VIEW_STORAGE_KEY}:${userId ?? 'anonymous'}`;
const isProjectView = (value: unknown): value is ProjectView =>
    value === 'grid' || value === 'list' || value === 'table';

const STARRED_TEMPLATES_KEY = 'weblab_starred_templates';

export const PROJECT_SUGGESTIONS: CreateSuggestion[] = [
    {
        label: 'Personal Site',
        prompt: 'Create a polished personal website for Alex Morgan, a product designer and creative developer. Include a strong hero with name, role, short intro, featured work, a short about section, testimonials, and a contact section with placeholder links. Use clean editorial styling, thoughtful typography, and placeholder copy that is easy to replace.',
    },
    {
        label: 'SaaS Landing',
        prompt: 'Create a modern SaaS landing page for FlowPilot, an AI workflow tool for small teams. Include a hero with headline and CTA, product screenshot area, 3 feature sections, social proof logos, pricing cards, FAQ, and a final CTA. Use realistic placeholder copy, polished visuals, and a layout that feels launch-ready with minimal edits.',
    },
    {
        label: 'Portfolio',
        prompt: 'Create a portfolio site for Nina Patel, a freelance brand designer. Include a hero, selected projects grid with placeholder case studies, services, client logos, short bio, testimonials, and a contact CTA. Make it feel premium and visual, with believable placeholder project names and short descriptions the user can quickly swap out.',
    },
    {
        label: 'Dashboard',
        prompt: 'Create a clean analytics dashboard for PulseOps, a customer support platform. Include top KPI cards, charts for tickets and response time, a recent activity feed, team performance table, and filters in the header. Use realistic sample data, clear information hierarchy, and a polished product UI style.',
    },
    {
        label: 'E-commerce',
        prompt: 'Create a stylish e-commerce homepage for Northline Studio, a modern home office brand. Include a hero banner, featured products, category cards, a best sellers section, customer reviews, and a newsletter signup. Use realistic placeholder product names, prices, and images/copy so the page feels immediately usable.',
    },
];

const STATIC_TEMPLATE_ALIASES: Record<StaticTemplate['id'], string[]> = {
    portfolio: ['portfolio', 'portfolio website', 'personal site'],
    saas: ['saas', 'landing', 'marketing'],
    blog: ['blog', 'writing', 'content'],
    dashboard: ['dashboard', 'analytics', 'admin'],
    ecommerce: ['ecommerce', 'e commerce', 'store', 'storefront', 'shop'],
    agency: ['agency', 'studio', 'creative'],
    docs: ['docs', 'documentation', 'knowledge base'],
    app: ['web app', 'application', 'react app'],
};

function normalizeTemplateText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function resolveStaticTemplateProject(
    template: StaticTemplate,
    templateProjects: Project[],
): Project | null {
    const searchTerms = [template.name, ...(STATIC_TEMPLATE_ALIASES[template.id] ?? [])]
        .map(normalizeTemplateText)
        .filter(Boolean);

    let bestMatch: Project | null = null;
    let bestScore = 0;

    for (const project of templateProjects) {
        const normalizedName = normalizeTemplateText(project.name);
        const normalizedDescription = normalizeTemplateText(project.metadata.description ?? '');
        const haystack = `${normalizedName} ${normalizedDescription}`.trim();

        for (const term of searchTerms) {
            let score = 0;
            if (normalizedName === term) {
                score = 100;
            } else if (normalizedName.includes(term)) {
                score = 80;
            } else if (haystack.includes(term)) {
                score = 60;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = project;
            }
        }
    }

    return bestScore > 0 ? bestMatch : null;
}

function getStaticTemplateMatches(templateProjects: Project[]): Map<StaticTemplate['id'], Project> {
    const templateNames: Record<StaticTemplate['id'], string> = {
        portfolio: 'Portfolio',
        saas: 'SaaS',
        blog: 'Blog',
        dashboard: 'Dashboard',
        ecommerce: 'E-commerce',
        agency: 'Agency',
        docs: 'Docs',
        app: 'Web App',
    };
    const matches = new Map<StaticTemplate['id'], Project>();

    const entries = Object.entries(templateNames) as Array<[StaticTemplate['id'], string]>;
    for (const [templateId, templateName] of entries) {
        if (!templateName) {
            continue;
        }
        const match = resolveStaticTemplateProject(
            {
                id: templateId,
                name: templateName,
                description: '',
                bg: '',
                accent: '',
            },
            templateProjects,
        );
        if (match) {
            matches.set(templateId, match);
        }
    }

    return matches;
}

/**
 * Surfaces "you tried to import a local folder before signing in" intent so
 * the user can resume that flow with a fresh click — which is the user gesture
 * the File System Access API needs in order to call `showDirectoryPicker()`.
 *
 * The banner is only rendered when a pending intent exists, and disappears as
 * soon as the user either picks a folder, dismisses, or clears the flag from
 * the hook (e.g. after a successful import).
 */
function PendingLocalImportBanner({
    onChooseFolder,
    onDismiss,
    isImporting,
}: {
    onChooseFolder: () => void;
    onDismiss: () => void;
    isImporting: boolean;
}) {
    const t = useTranslations('selectProject');
    return (
        <Alert className="border-foreground/10 bg-foreground/4 mb-6 backdrop-blur-xl">
            <Icons.Directory className="h-4 w-4" />
            <AlertTitle>{t('pendingImportTitle')}</AlertTitle>
            <AlertDescription>
                <span>{t('pendingImportBody')}</span>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                        onClick={onChooseFolder}
                        disabled={isImporting}
                    >
                        {isImporting ? (
                            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                        ) : (
                            <Icons.Directory className="h-4 w-4" />
                        )}
                        {t('chooseFolder')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-foreground-tertiary hover:text-foreground"
                        onClick={onDismiss}
                        disabled={isImporting}
                    >
                        {t('notNow')}
                    </Button>
                </div>
            </AlertDescription>
        </Alert>
    );
}

export const SelectProject = ({ workspaceId }: { workspaceId?: string } = {}) => {
    const t = useTranslations('selectProject') as (
        key: string,
        values?: Record<string, string | number>,
    ) => string;
    const user = useQuery(api.users.me, {});
    const fetchedProjects = useQuery(
        api.projects.list,
        workspaceId ? { workspaceId: workspaceId as Id<'workspaces'> } : {},
    );
    // Treat a still-loading user query as loading too. Otherwise, if
    // `projects.list` resolves to `[]` (its unauthenticated fallback) before
    // `users.me` resolves to `null`, the empty "create your first project"
    // state flashes for a frame before the session-expired prompt below.
    const isLoading = fetchedProjects === undefined || user === undefined;
    // Convex queries refetch reactively; expose a no-op refetch so callers
    // that still trigger refresh() after writes don't crash.
    const refetch = async () => undefined;
    const removeTag = useMutation(api.projects.removeTag);
    const deleteProject = useMutation(api.projects.remove);
    const {
        handleImportLocalProject,
        isImporting: isImportingLocal,
        hasPendingLocalImport,
        clearPendingLocalImport,
    } = useImportLocalProject();

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    // Drives the full-screen ProjectCreationLoader inside <Create> while
    // the sandbox forks (5–30s). Without real state the overlay never
    // mounts and first-time users think the page hung.
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    const [filesSortBy, setFilesSortBy] = useState<ProjectSort>('Last viewed');
    const [filters, setFilters] = useState<ProjectFilters>(DEFAULT_FILTERS);
    const [view, setView] = useState<ProjectView>('grid');
    const [selectedTemplate, setSelectedTemplate] = useState<Project | null>(null);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [starredTemplates, setStarredTemplates] = useState<Set<string>>(new Set());
    const [folders, setFolders] = useState<ProjectFolder[]>([]);
    const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
    const [openFolderId, setOpenFolderId] = useState<string | null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
    const [showDeleteSelectedDialog, setShowDeleteSelectedDialog] = useState(false);
    const [isDeletingSelected, setIsDeletingSelected] = useState(false);

    const foldersStorageKey = useMemo(() => getFoldersStorageKey(user?._id), [user?._id]);
    const listedProjects = useMemo(
        () => (fetchedProjects ?? []).map((p) => fromConvexProjectListCard(p as never)),
        [fetchedProjects],
    );
    const projects = useMemo(
        () => listedProjects.filter((project) => !project.metadata.tags.includes(Tags.TEMPLATE)),
        [listedProjects],
    );
    const templateProjects = useMemo(
        () => listedProjects.filter((project) => project.metadata.tags.includes(Tags.TEMPLATE)),
        [listedProjects],
    );
    const staticTemplateMatches = useMemo(
        () => getStaticTemplateMatches(templateProjects),
        [templateProjects],
    );
    const availableStaticTemplateIds = useMemo(
        () => new Set(staticTemplateMatches.keys()),
        [staticTemplateMatches],
    );
    const shouldShowTemplate = templateProjects.length > 0;

    const persistFolders = async (nextFolders: ProjectFolder[]) => {
        const previousFolders = folders;
        setFolders(nextFolders);

        try {
            await localforage.setItem(foldersStorageKey, nextFolders);
        } catch (error) {
            console.error('Failed to save folders:', error);
            // Roll the optimistic state back so the UI matches what's actually
            // persisted; otherwise a refresh will surprise the user.
            setFolders(previousFolders);
            toast.error(t('saveFoldersFailed'), {
                description: t('saveFoldersFailedBody'),
            });
        }
    };

    const saveStarredTemplates = async (templateIds: Set<string>) => {
        try {
            await localforage.setItem(STARRED_TEMPLATES_KEY, Array.from(templateIds));
        } catch (error) {
            console.error('Failed to save starred templates:', error);
        }
    };

    const handleTemplateClick = (project: Project) => {
        setSelectedTemplate(project);
        setIsTemplateModalOpen(true);
    };

    const handleStaticTemplateClick = (template: StaticTemplate) => {
        const matchedProject = staticTemplateMatches.get(template.id);

        if (matchedProject) {
            handleTemplateClick(matchedProject);
            return;
        }

        toast.info(t('templateNotAvailable', { name: template.name }));
    };

    const handleCloseTemplateModal = () => {
        setIsTemplateModalOpen(false);
        setSelectedTemplate(null);
    };

    const handleToggleStar = (templateId: string) => {
        setStarredTemplates((prev) => {
            const nextStarred = new Set(prev);
            if (nextStarred.has(templateId)) {
                nextStarred.delete(templateId);
            } else {
                nextStarred.add(templateId);
            }
            void saveStarredTemplates(nextStarred);
            return nextStarred;
        });
    };

    const handleUnmarkTemplate = async () => {
        if (!selectedTemplate?.id) return;
        try {
            await removeTag({
                projectId: selectedTemplate.id as Id<'projects'>,
                tag: Tags.TEMPLATE,
            });
            toast.success(t('removedFromTemplates'));
            setIsTemplateModalOpen(false);
            setSelectedTemplate(null);
            await refetch();
        } catch {
            toast.error(t('failedTemplateTag'));
        }
    };

    useEffect(() => {
        void (async () => {
            try {
                const saved = await localforage.getItem<string[]>(STARRED_TEMPLATES_KEY);
                if (saved && Array.isArray(saved)) {
                    setStarredTemplates(new Set(saved));
                }
            } catch (error) {
                console.error('Failed to load starred templates:', error);
            }
        })();
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const saved = await localforage.getItem<ProjectFolder[]>(foldersStorageKey);
                setFolders(Array.isArray(saved) ? saved : []);
            } catch (error) {
                console.error('Failed to load folders:', error);
            }
        })();
    }, [foldersStorageKey]);

    // Load + persist layout view across sessions, scoped per-user so two
    // accounts on the same machine don't fight over the same key.
    const viewStorageKey = useMemo(() => getViewStorageKey(user?._id), [user?._id]);
    useEffect(() => {
        void (async () => {
            try {
                const saved = await localforage.getItem<string>(viewStorageKey);
                if (isProjectView(saved)) {
                    setView(saved);
                }
            } catch (error) {
                console.error('Failed to load view preference:', error);
            }
        })();
    }, [viewStorageKey]);

    const handleViewChange = (next: ProjectView) => {
        setView(next);
        void localforage.setItem(viewStorageKey, next).catch(() => undefined);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 100);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const sortedProjects = useMemo(() => {
        return [...projects].sort((a, b) => {
            switch (filesSortBy) {
                case 'Alphabetical':
                    return a.name.localeCompare(b.name);
                case 'Date created':
                    return (
                        new Date(b.metadata.createdAt).getTime() -
                        new Date(a.metadata.createdAt).getTime()
                    );
                case 'Last viewed':
                default:
                    return (
                        new Date(b.metadata.updatedAt).getTime() -
                        new Date(a.metadata.updatedAt).getTime()
                    );
            }
        });
    }, [projects, filesSortBy]);

    const availableTechStacks = useMemo(() => {
        const stacks = new Set<string>();
        for (const project of projects) {
            const framework = project.metadata?.runtime?.framework;
            if (framework) {
                stacks.add(framework);
            }
        }
        return Array.from(stacks).sort();
    }, [projects]);

    const dateBoundary = (range: ProjectFilters['dateRange']): number | null => {
        const now = Date.now();
        switch (range) {
            case 'today':
                return now - 24 * 60 * 60 * 1000;
            case 'week':
                return now - 7 * 24 * 60 * 60 * 1000;
            case 'month':
                return now - 30 * 24 * 60 * 60 * 1000;
            default:
                return null;
        }
    };

    const folderAssignmentLookup = useMemo(() => {
        const assignments = new Map<string, string>();
        folders.forEach((folder) => {
            folder.projectIds.forEach((projectId) => {
                assignments.set(projectId, folder.id);
            });
        });
        return assignments;
    }, [folders]);

    const filteredProjects = useMemo(() => {
        const cutoff = dateBoundary(filters.dateRange);
        return sortedProjects.filter((project) => {
            if (filters.status !== 'all') {
                const item = project;
                const siteUrl = item.publishedUrl ?? item.previewUrl ?? item.siteUrl ?? null;
                const hasSite = Boolean(siteUrl);
                if (filters.status === 'published' && !hasSite) return false;
                if (filters.status === 'unpublished' && hasSite) return false;
            }
            if (filters.folderId !== 'all') {
                const folderId = folderAssignmentLookup.get(project.id) ?? null;
                if (filters.folderId === 'none' && folderId !== null) return false;
                if (filters.folderId !== 'none' && folderId !== filters.folderId) {
                    return false;
                }
            }
            if (cutoff !== null) {
                const updated = new Date(project.metadata.updatedAt).getTime();
                if (!Number.isFinite(updated) || updated < cutoff) {
                    return false;
                }
            }
            if (filters.techStacks.length > 0) {
                const fw = project.metadata?.runtime?.framework ?? null;
                if (!fw || !filters.techStacks.includes(fw)) {
                    return false;
                }
            }
            return true;
        });
    }, [sortedProjects, filters, folderAssignmentLookup]);

    const visibleProjects = useMemo(() => {
        if (!debouncedSearchQuery) {
            return filteredProjects;
        }

        const query = debouncedSearchQuery.toLowerCase();
        return filteredProjects.filter((project) =>
            [
                project.name,
                project.metadata?.description ?? '',
                project.metadata.tags.join(', '),
            ].some((value) => value.toLowerCase().includes(query)),
        );
    }, [filteredProjects, debouncedSearchQuery]);

    const backfill = useScreenshotBackfill(projects);
    const activeFilterCount = countActiveFilters(filters);

    useEffect(() => {
        const validProjectIds = new Set(projects.map((project) => project.id));
        const sanitizedFolders = sanitizeFolders(folders, validProjectIds);

        if (JSON.stringify(sanitizedFolders) !== JSON.stringify(folders)) {
            setFolders(sanitizedFolders);
            void localforage.setItem(foldersStorageKey, sanitizedFolders);
        }
    }, [folders, foldersStorageKey, projects]);

    const folderViewModels = useMemo(() => {
        const query = debouncedSearchQuery.trim().toLowerCase();

        return [...folders]
            .sort(
                (left, right) =>
                    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
            )
            .map((folder) => {
                const folderProjectSet = new Set(folder.projectIds);
                const allAssignedProjects = sortedProjects.filter((project) =>
                    folderProjectSet.has(project.id),
                );
                const visibleAssignedProjects = visibleProjects.filter((project) =>
                    folderProjectSet.has(project.id),
                );
                const nameMatches = query.length > 0 && folder.name.toLowerCase().includes(query);

                if (query.length > 0 && visibleAssignedProjects.length === 0 && !nameMatches) {
                    return null;
                }

                return {
                    folder,
                    previewProjects: allAssignedProjects,
                    visibleProjects: visibleAssignedProjects,
                };
            })
            .filter((value): value is NonNullable<typeof value> => value !== null);
    }, [folders, sortedProjects, visibleProjects, debouncedSearchQuery]);

    const looseProjects = useMemo(
        () => visibleProjects.filter((project) => !folderAssignmentLookup.has(project.id)),
        [visibleProjects, folderAssignmentLookup],
    );

    useEffect(() => {
        if (openFolderId && !folderViewModels.some(({ folder }) => folder.id === openFolderId)) {
            setOpenFolderId(null);
        }
    }, [openFolderId, folderViewModels]);

    const openFolder = folderViewModels.find(({ folder }) => folder.id === openFolderId) ?? null;
    const selectedCount = selectedProjectIds.size;

    const handleCreateFolder = async (name: string) => {
        const nextFolder: ProjectFolder = {
            id: crypto.randomUUID(),
            name,
            projectIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const nextFolders = [...folders, nextFolder];
        await persistFolders(nextFolders);
        setOpenFolderId(nextFolder.id);
        toast.success(t('folderCreated'));
    };

    const handleSelectionChange = (projectId: string, checked: boolean) => {
        setSelectedProjectIds((previous) => {
            const next = new Set(previous);
            if (checked) {
                next.add(projectId);
            } else {
                next.delete(projectId);
            }
            // Auto-enter selection mode when the first card checkbox is clicked,
            // and auto-exit when the last item is unchecked.
            if (next.size > 0 && !selectionMode) {
                setSelectionMode(true);
            } else if (next.size === 0) {
                setSelectionMode(false);
            }
            return next;
        });
    };

    const resetSelection = () => {
        setSelectedProjectIds(new Set());
        setSelectionMode(false);
    };

    const handleMoveSelected = async (folderId: string | null) => {
        const ids = Array.from(selectedProjectIds);
        if (ids.length === 0) {
            return;
        }

        const nextFolders = moveProjectIdsToFolder(folders, ids, folderId);
        await persistFolders(nextFolders);
        if (folderId) {
            setOpenFolderId(folderId);
        }
        resetSelection();
        toast.success(folderId ? t('projectsMovedToFolder') : t('projectsRemovedFromFolder'));
    };

    const handleDeleteSelected = async () => {
        const ids = Array.from(selectedProjectIds);
        if (ids.length === 0) {
            return;
        }

        setIsDeletingSelected(true);

        try {
            const results = await Promise.allSettled(
                ids.map((id) => deleteProject({ projectId: id as Id<'projects'> })),
            );
            const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
            const deletedIds: string[] = [];
            const failures: { name: string; reason: string }[] = [];

            results.forEach((result, index) => {
                const id = ids[index];
                if (!id) return;
                if (result.status === 'fulfilled') {
                    deletedIds.push(id);
                    return;
                }
                const reason =
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason ?? 'Unknown error');
                failures.push({ name: projectNameById.get(id) ?? id, reason });
            });

            if (deletedIds.length > 0) {
                const nextFolders = moveProjectIdsToFolder(folders, deletedIds, null);
                await persistFolders(nextFolders);
                await refetch();
            }

            resetSelection();
            setShowDeleteSelectedDialog(false);

            const failedNames = failures
                .map((failure) => failure.name)
                .slice(0, 3)
                .join(', ');
            const overflowSuffix =
                failures.length > 3 ? t('failedOverflow', { count: failures.length - 3 }) : '';

            if (failures.length > 0 && deletedIds.length > 0) {
                toast.warning(
                    t('deletedPartial', {
                        deleted: deletedIds.length,
                        failed: failures.length,
                    }),
                    {
                        description: t('failedListPrefix', {
                            names: `${failedNames}${overflowSuffix}`,
                        }),
                    },
                );
            } else if (failures.length > 0) {
                toast.error(t('deletedFailed'), {
                    description: t('failedListPrefix', {
                        names: `${failedNames}${overflowSuffix}`,
                    }),
                });
            } else {
                toast.success(t('deletedCount', { count: deletedIds.length }));
            }
        } catch (error) {
            console.error('Failed to delete selected projects:', error);
            toast.error(t('deletedFailed'), {
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsDeletingSelected(false);
        }
    };

    if (isLoading) {
        // Render skeleton tiles in the grid container so the search bar / nav
        // already on screen don't disappear during the initial fetch. The
        // viewport-filling spinner caused a jarring layout swap for returning
        // users who otherwise saw their projects appear in place.
        return (
            <div className="mx-auto w-full max-w-6xl px-6 py-8">
                <div className="mb-6 flex flex-col gap-4">
                    <div className="h-9 w-32">
                        <Skeleton className="h-full w-full rounded-md" />
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-3 p-1.5">
                            <Skeleton className="aspect-[4/2.75] w-full rounded-xl" />
                            <div className="flex items-start justify-between gap-3 px-1">
                                <div className="flex flex-col gap-2">
                                    <Skeleton className="h-4 w-32 rounded-sm" />
                                    <Skeleton className="h-3 w-24 rounded-sm" />
                                </div>
                                <Skeleton className="h-3 w-12 rounded-sm" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // `api.users.me` resolves to `null` (not `undefined`) once Convex has
    // confirmed there is no authenticated user. On this auth-gated page that
    // means the session expired client-side. `api.projects.list` returns `[]`
    // for an unauthenticated user, so without this branch the user would land
    // on the empty "Start your first project" state with all their real
    // projects hidden — which reads as data loss. Show a clear re-auth prompt
    // instead. (`user === undefined` is still loading; don't trip on that.)
    if (user === null) {
        return (
            <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="border-foreground/10 bg-foreground/4 flex h-12 w-12 items-center justify-center rounded-full border">
                        <Icons.LockClosed className="text-foreground-tertiary h-5 w-5" />
                    </div>
                    <div className="text-foreground text-2xl font-normal tracking-tight">
                        {t('sessionExpiredTitle')}
                    </div>
                    <div className="text-foreground-tertiary max-w-sm text-sm leading-relaxed">
                        {t('sessionExpiredBody')}
                    </div>
                </div>
                <Button variant="default" size="default" asChild>
                    <Link href={Routes.LOGIN}>{t('sessionExpiredSignIn')}</Link>
                </Button>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <CreateManagerProvider>
                <div className="mx-auto flex h-full w-full max-w-6xl flex-col items-center gap-12 px-6 py-16">
                    {hasPendingLocalImport && (
                        <div className="w-full">
                            <PendingLocalImportBanner
                                onChooseFolder={() => void handleImportLocalProject()}
                                onDismiss={() => void clearPendingLocalImport()}
                                isImporting={isImportingLocal}
                            />
                        </div>
                    )}

                    <div className="flex w-full flex-col items-center gap-3 text-center">
                        <div className="text-foreground text-3xl font-normal tracking-tight">
                            {t('startFirstHeading')}
                        </div>
                        <div className="text-foreground-tertiary max-w-md text-sm leading-relaxed">
                            {t('startFirstBody')}
                        </div>
                    </div>

                    <div className="w-full">
                        <Create
                            cardKey={0}
                            isCreatingProject={isCreatingProject}
                            setIsCreatingProject={setIsCreatingProject}
                            user={user ?? null}
                            suggestions={PROJECT_SUGGESTIONS}
                        />
                    </div>

                    <ProjectChooserCards />

                    {shouldShowTemplate && (
                        <div className="w-full">
                            <Templates
                                templateProjects={templateProjects}
                                searchQuery={debouncedSearchQuery}
                                onTemplateClick={handleTemplateClick}
                                onToggleStar={handleToggleStar}
                                starredTemplates={starredTemplates}
                            />
                        </div>
                    )}

                    {availableStaticTemplateIds.size > 0 && (
                        <div className="w-full">
                            <StaticTemplates
                                onUseTemplate={handleStaticTemplateClick}
                                isCreating={false}
                                availableTemplateIds={availableStaticTemplateIds}
                            />
                        </div>
                    )}
                </div>
            </CreateManagerProvider>
        );
    }

    return (
        <div
            className="relative flex h-full w-full flex-col overflow-x-visible px-6 py-8"
            style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
            }}
        >
            <div className="mx-auto w-full max-w-6xl">
                {hasPendingLocalImport && (
                    <PendingLocalImportBanner
                        onChooseFolder={() => void handleImportLocalProject()}
                        onDismiss={() => void clearPendingLocalImport()}
                        isImporting={isImportingLocal}
                    />
                )}

                <div className="mb-6 flex flex-col gap-3">
                    <ProjectsToolbar
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        sort={filesSortBy}
                        onSortChange={setFilesSortBy}
                        filters={filters}
                        onFiltersChange={setFilters}
                        view={view}
                        onViewChange={handleViewChange}
                        folders={folders}
                        availableTechStacks={availableTechStacks}
                        onCreateFolder={() => setShowCreateFolderDialog(true)}
                    />

                    {backfill.total > 0 && backfill.completed < backfill.total && (
                        <div className="text-foreground-tertiary text-xs">
                            {t('backfillProgress', {
                                done: backfill.completed,
                                total: backfill.total,
                            })}
                        </div>
                    )}

                    {selectionMode && (
                        <div className="border-foreground/8 bg-foreground/4 flex flex-col gap-3 rounded-[22px] border p-4 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
                            <div className="text-foreground-secondary flex items-center gap-2 text-sm">
                                <span className="text-foreground border-foreground/8 bg-foreground/8 rounded-full border px-2.5 py-1 text-xs">
                                    {selectedCount}
                                </span>
                                {t('projectSelected', { count: selectedCount })}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                                            disabled={selectedCount === 0}
                                        >
                                            <Icons.MoveToFolder className="h-4 w-4" />
                                            {t('moveToFolder')}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="min-w-56">
                                        <DropdownMenuLabel>
                                            {t('folderDestination')}
                                        </DropdownMenuLabel>
                                        <DropdownMenuItem
                                            onSelect={() => void handleMoveSelected(null)}
                                        >
                                            {t('removeFromFolder')}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {folders.length > 0 ? (
                                            folders.map((folder) => (
                                                <DropdownMenuItem
                                                    key={folder.id}
                                                    onSelect={() =>
                                                        void handleMoveSelected(folder.id)
                                                    }
                                                >
                                                    {folder.name}
                                                </DropdownMenuItem>
                                            ))
                                        ) : (
                                            <DropdownMenuItem disabled>
                                                {t('noFoldersYet')}
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={selectedCount === 0}
                                    onClick={() => setShowDeleteSelectedDialog(true)}
                                >
                                    <Icons.Trash className="h-4 w-4" />
                                    {t('deleteSelected')}
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-foreground-tertiary hover:text-foreground"
                                    onClick={resetSelection}
                                >
                                    <Icons.Check className="h-4 w-4" />
                                    {t('doneSelecting')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {folderViewModels.length > 0 && (
                    <div className="mb-10">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-foreground-tertiary text-sm font-medium">
                                {t('folders')}
                            </h3>
                            <span className="text-foreground-tertiary text-xs">
                                {t('foldersSaved', { count: folderViewModels.length })}
                            </span>
                        </div>

                        <motion.div
                            layout
                            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            <AnimatePresence mode="popLayout">
                                {folderViewModels.map(({ folder, previewProjects }) => (
                                    <FolderCard
                                        key={folder.id}
                                        folder={folder}
                                        projects={previewProjects}
                                        isOpen={openFolderId === folder.id}
                                        onToggle={() =>
                                            setOpenFolderId((current) =>
                                                current === folder.id ? null : folder.id,
                                            )
                                        }
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.div>

                        {openFolder && (
                            <div className="border-foreground/8 bg-foreground/3 mt-6 rounded-3xl border p-5 backdrop-blur-xl">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h4 className="text-foreground text-base font-medium">
                                            {openFolder.folder.name}
                                        </h4>
                                        <p className="text-foreground-tertiary mt-1 text-sm">
                                            {t('savedSite', {
                                                count: openFolder.previewProjects.length,
                                            })}
                                        </p>
                                    </div>
                                </div>

                                {openFolder.visibleProjects.length > 0 ? (
                                    <motion.div
                                        layout
                                        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                                    >
                                        <AnimatePresence mode="popLayout">
                                            {openFolder.visibleProjects.map((project) => (
                                                <ProjectCard
                                                    key={project.id}
                                                    project={project}
                                                    refetch={() => void refetch()}
                                                    searchQuery={debouncedSearchQuery}
                                                    HighlightText={HighlightText}
                                                    selectionMode={selectionMode}
                                                    selected={selectedProjectIds.has(project.id)}
                                                    onSelectionChange={(checked) =>
                                                        handleSelectionChange(project.id, checked)
                                                    }
                                                    onStartMultiSelect={() =>
                                                        setSelectionMode(true)
                                                    }
                                                    isBackfilling={backfill.inFlight.has(
                                                        project.id,
                                                    )}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </motion.div>
                                ) : (
                                    <div className="text-foreground-tertiary border-foreground/10 bg-foreground/5 flex flex-col items-start gap-3 rounded-[22px] border border-dashed p-6 text-sm">
                                        <span>{t('noProjectsMatchSearch')}</span>
                                        {debouncedSearchQuery && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                                                onClick={() => setSearchQuery('')}
                                            >
                                                {t('clearSearch')}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div>
                    {/* <div className="mb-4 flex items-center justify-between">
                    //     <span className="text-foreground-tertiary flex items-center gap-2 text-xs">
                    //         {searchQuery !== debouncedSearchQuery && (
                    //             <span className="text-foreground-tertiary/80 flex items-center gap-1">
                    //                 <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                    //                 Searching…
                    //             </span>
                    //         )}
                    //         {looseProjects.length} visible
                    //     </span>
                    // </div> */}

                    {looseProjects.length === 0 ? (
                        <div className="border-foreground/8 bg-foreground/3 flex w-full items-center justify-center rounded-[26px] border border-dashed py-16">
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="text-foreground-secondary text-base">
                                    {activeFilterCount > 0 || debouncedSearchQuery
                                        ? t('noResultsTitle')
                                        : t('noLooseProjects')}
                                </div>
                                <div className="text-foreground-tertiary text-sm">
                                    {activeFilterCount > 0 || debouncedSearchQuery
                                        ? t('noResultsBody')
                                        : t('moveProjectsHere')}
                                </div>
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    {debouncedSearchQuery && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                                            onClick={() => setSearchQuery('')}
                                        >
                                            {t('clearSearch')}
                                        </Button>
                                    )}
                                    {activeFilterCount > 0 && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                                            onClick={() => setFilters(DEFAULT_FILTERS)}
                                        >
                                            {t('filterReset')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : view === 'grid' ? (
                        <motion.div
                            layout
                            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            <AnimatePresence mode="popLayout">
                                {looseProjects.map((project) => (
                                    <ProjectCard
                                        key={project.id}
                                        project={project}
                                        refetch={() => void refetch()}
                                        searchQuery={debouncedSearchQuery}
                                        HighlightText={HighlightText}
                                        selectionMode={selectionMode}
                                        selected={selectedProjectIds.has(project.id)}
                                        onSelectionChange={(checked) =>
                                            handleSelectionChange(project.id, checked)
                                        }
                                        onStartMultiSelect={() => setSelectionMode(true)}
                                        isBackfilling={backfill.inFlight.has(project.id)}
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    ) : view === 'list' ? (
                        <motion.div layout className="flex flex-col gap-1">
                            <AnimatePresence mode="popLayout">
                                {looseProjects.map((project) => (
                                    <ProjectRow
                                        key={project.id}
                                        project={project}
                                        variant="list"
                                        refetch={() => void refetch()}
                                        searchQuery={debouncedSearchQuery}
                                        HighlightText={HighlightText}
                                        selectionMode={selectionMode}
                                        selected={selectedProjectIds.has(project.id)}
                                        onSelectionChange={(checked) =>
                                            handleSelectionChange(project.id, checked)
                                        }
                                        isBackfilling={backfill.inFlight.has(project.id)}
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    ) : (
                        <motion.div layout className="flex flex-col gap-1">
                            <ProjectTableHeader />
                            <AnimatePresence mode="popLayout">
                                {looseProjects.map((project) => (
                                    <ProjectRow
                                        key={project.id}
                                        project={project}
                                        variant="table"
                                        refetch={() => void refetch()}
                                        searchQuery={debouncedSearchQuery}
                                        HighlightText={HighlightText}
                                        selectionMode={selectionMode}
                                        selected={selectedProjectIds.has(project.id)}
                                        onSelectionChange={(checked) =>
                                            handleSelectionChange(project.id, checked)
                                        }
                                        isBackfilling={backfill.inFlight.has(project.id)}
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>

                {shouldShowTemplate && (
                    <div className="mt-16">
                        <Templates
                            templateProjects={templateProjects}
                            searchQuery={debouncedSearchQuery}
                            onTemplateClick={handleTemplateClick}
                            onToggleStar={handleToggleStar}
                            starredTemplates={starredTemplates}
                        />
                    </div>
                )}

                {availableStaticTemplateIds.size > 0 && (
                    <StaticTemplates
                        onUseTemplate={handleStaticTemplateClick}
                        isCreating={false}
                        availableTemplateIds={availableStaticTemplateIds}
                    />
                )}
            </div>

            <CreateFolderDialog
                open={showCreateFolderDialog}
                onOpenChange={setShowCreateFolderDialog}
                onCreateFolder={handleCreateFolder}
                existingNames={folders.map((folder) => folder.name)}
            />

            <AlertDialog open={showDeleteSelectedDialog} onOpenChange={setShowDeleteSelectedDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('deleteDialogBody', { count: selectedCount })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setShowDeleteSelectedDialog(false)}
                            disabled={isDeletingSelected}
                        >
                            {t('cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void handleDeleteSelected()}
                            disabled={isDeletingSelected}
                        >
                            {isDeletingSelected ? (
                                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.Trash className="h-4 w-4" />
                            )}
                            {t('delete')}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {selectedTemplate && shouldShowTemplate && (
                <TemplateModal
                    isOpen={isTemplateModalOpen}
                    onClose={handleCloseTemplateModal}
                    title={selectedTemplate.name}
                    description={selectedTemplate.metadata?.description ?? t('noDescription')}
                    image={
                        selectedTemplate.metadata?.previewImg?.url ??
                        (selectedTemplate.metadata?.previewImg?.storagePath?.bucket &&
                        selectedTemplate.metadata.previewImg.storagePath.path
                            ? getFileUrlFromStorage(
                                  selectedTemplate.metadata.previewImg.storagePath.bucket,
                                  selectedTemplate.metadata.previewImg.storagePath.path,
                              )
                            : selectedTemplate.metadata?.previewImg?.storagePath?.path
                              ? getFileUrlFromStorage(
                                    STORAGE_BUCKETS.PREVIEW_IMAGES,
                                    selectedTemplate.metadata.previewImg.storagePath.path,
                                )
                              : null)
                    }
                    isNew={false}
                    isStarred={selectedTemplate ? starredTemplates.has(selectedTemplate.id) : false}
                    onToggleStar={() => selectedTemplate && handleToggleStar(selectedTemplate.id)}
                    templateProject={selectedTemplate}
                    onUnmarkTemplate={() => void handleUnmarkTemplate()}
                    user={user ?? null}
                />
            )}
        </div>
    );
};
