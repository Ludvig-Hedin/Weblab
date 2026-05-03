'use client';

import { useEffect, useMemo, useState } from 'react';
import localforage from 'localforage';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import { STORAGE_BUCKETS, Tags } from '@weblab/constants';
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

import type { StaticTemplate } from '../templates/static-templates';
import type { ProjectFolder, ProjectListItem } from './project-card-utils';
import { Create, type CreateSuggestion } from '@/app/_components/hero/create';
import { CreateManagerProvider } from '@/components/store/create';
import { useCreateBlankProject } from '@/hooks/use-create-blank-project';
import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { api } from '@/trpc/react';
import { getFileUrlFromStorage } from '@/utils/supabase/client';
import { Templates } from '../templates';
import { StaticTemplates } from '../templates/static-templates';
import { TemplateModal } from '../templates/template-modal';
import { CreateFolderDialog } from './create-folder-dialog';
import { FolderCard } from './folder-card';
import { HighlightText } from './highlight-text';
import { ProjectCard } from './project-card';
import {
    getFoldersStorageKey,
    moveProjectIdsToFolder,
    sanitizeFolders,
} from './project-card-utils';

const STARRED_TEMPLATES_KEY = 'onlook_starred_templates';

export const PROJECT_SUGGESTIONS: CreateSuggestion[] = [
    {
        label: 'Personal Site',
        prompt:
            'Create a polished personal website for Alex Morgan, a product designer and creative developer. Include a strong hero with name, role, short intro, featured work, a short about section, testimonials, and a contact section with placeholder links. Use clean editorial styling, thoughtful typography, and placeholder copy that is easy to replace.',
    },
    {
        label: 'SaaS Landing',
        prompt:
            'Create a modern SaaS landing page for FlowPilot, an AI workflow tool for small teams. Include a hero with headline and CTA, product screenshot area, 3 feature sections, social proof logos, pricing cards, FAQ, and a final CTA. Use realistic placeholder copy, polished visuals, and a layout that feels launch-ready with minimal edits.',
    },
    {
        label: 'Portfolio',
        prompt:
            'Create a portfolio site for Nina Patel, a freelance brand designer. Include a hero, selected projects grid with placeholder case studies, services, client logos, short bio, testimonials, and a contact CTA. Make it feel premium and visual, with believable placeholder project names and short descriptions the user can quickly swap out.',
    },
    {
        label: 'Dashboard',
        prompt:
            'Create a clean analytics dashboard for PulseOps, a customer support platform. Include top KPI cards, charts for tickets and response time, a recent activity feed, team performance table, and filters in the header. Use realistic sample data, clear information hierarchy, and a polished product UI style.',
    },
    {
        label: 'E-commerce',
        prompt:
            'Create a stylish e-commerce homepage for Northline Studio, a modern home office brand. Include a hero banner, featured products, category cards, a best sellers section, customer reviews, and a newsletter signup. Use realistic placeholder product names, prices, and images/copy so the page feels immediately usable.',
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

export const SelectProject = ({
    externalSearchQuery,
    onClearSearch,
}: {
    externalSearchQuery?: string;
    onClearSearch?: () => void;
} = {}) => {
    const utils = api.useUtils();
    const { data: user } = api.user.get.useQuery();
    const { data: fetchedProjects, isLoading, refetch } = api.project.list.useQuery();
    const { mutateAsync: removeTag } = api.project.removeTag.useMutation();
    const { mutateAsync: deleteProject } = api.project.delete.useMutation();
    const { handleStartBlankProject, isCreatingProject } = useCreateBlankProject();
    const { handleImportLocalProject, isImporting } = useImportLocalProject();
    const [isAiCreating, setIsAiCreating] = useState(false);

    const [internalQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const searchQuery = externalSearchQuery ?? internalQuery;

    const [filesSortBy, setFilesSortBy] = useState<'Alphabetical' | 'Date created' | 'Last viewed'>(
        'Last viewed',
    );
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

    const foldersStorageKey = useMemo(() => getFoldersStorageKey(user?.id), [user?.id]);
    const listedProjects = useMemo(
        () => (fetchedProjects ?? []) as ProjectListItem[],
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
            toast.error('Failed to save folder changes', {
                description: 'Your changes were undone. Please try again.',
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

        toast.info(`${template.name} template is not available yet.`);
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
            await removeTag({ projectId: selectedTemplate.id, tag: Tags.TEMPLATE });
            toast.success('Removed from templates');
            setIsTemplateModalOpen(false);
            setSelectedTemplate(null);
            await Promise.all([utils.project.list.invalidate()]);
            await refetch();
        } catch {
            toast.error('Failed to update template tag');
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

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 100);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const sortOptions = [
        { value: 'Last viewed', label: 'Last viewed' },
        { value: 'Date created', label: 'Date created' },
        { value: 'Alphabetical', label: 'A–Z' },
    ] as const;

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

    const visibleProjects = useMemo(() => {
        if (!debouncedSearchQuery) {
            return sortedProjects;
        }

        const query = debouncedSearchQuery.toLowerCase();
        return sortedProjects.filter((project) =>
            [
                project.name,
                project.metadata?.description ?? '',
                project.metadata.tags.join(', '),
            ].some((value) => value.toLowerCase().includes(query)),
        );
    }, [sortedProjects, debouncedSearchQuery]);

    useEffect(() => {
        const validProjectIds = new Set(projects.map((project) => project.id));
        const sanitizedFolders = sanitizeFolders(folders, validProjectIds);

        if (JSON.stringify(sanitizedFolders) !== JSON.stringify(folders)) {
            setFolders(sanitizedFolders);
            void localforage.setItem(foldersStorageKey, sanitizedFolders);
        }
    }, [folders, foldersStorageKey, projects]);

    const folderAssignments = useMemo(() => {
        const assignments = new Map<string, string>();

        folders.forEach((folder) => {
            folder.projectIds.forEach((projectId) => {
                assignments.set(projectId, folder.id);
            });
        });

        return assignments;
    }, [folders]);

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
        () => visibleProjects.filter((project) => !folderAssignments.has(project.id)),
        [visibleProjects, folderAssignments],
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
        toast.success('Folder created');
    };

    const handleSelectionChange = (projectId: string, checked: boolean) => {
        setSelectedProjectIds((previous) => {
            const next = new Set(previous);
            if (checked) {
                next.add(projectId);
            } else {
                next.delete(projectId);
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
        toast.success(folderId ? 'Projects moved to folder' : 'Projects removed from folder');
    };

    const handleDeleteSelected = async () => {
        const ids = Array.from(selectedProjectIds);
        if (ids.length === 0) {
            return;
        }

        setIsDeletingSelected(true);

        try {
            const results = await Promise.allSettled(ids.map((id) => deleteProject({ id })));
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
                await utils.project.list.invalidate();
                await refetch();
            }

            resetSelection();
            setShowDeleteSelectedDialog(false);

            const failedNames = failures
                .map((failure) => failure.name)
                .slice(0, 3)
                .join(', ');
            const overflowSuffix = failures.length > 3 ? `, and ${failures.length - 3} more` : '';

            if (failures.length > 0 && deletedIds.length > 0) {
                toast.warning(
                    `Deleted ${deletedIds.length} project${deletedIds.length === 1 ? '' : 's'}, failed to delete ${failures.length}`,
                    { description: `Failed: ${failedNames}${overflowSuffix}` },
                );
            } else if (failures.length > 0) {
                toast.error('Failed to delete selected projects', {
                    description: `Failed: ${failedNames}${overflowSuffix}`,
                });
            } else {
                toast.success(
                    `Deleted ${deletedIds.length} project${deletedIds.length === 1 ? '' : 's'}`,
                );
            }
        } catch (error) {
            console.error('Failed to delete selected projects:', error);
            toast.error('Failed to delete selected projects', {
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsDeletingSelected(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen w-screen flex-col items-center justify-center">
                <div className="flex flex-row items-center gap-2">
                    <Icons.LoadingSpinner className="text-foreground-primary h-6 w-6 animate-spin" />
                    <div className="text-foreground-secondary text-lg">Loading projects...</div>
                </div>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <CreateManagerProvider>
                <div className="mx-auto flex h-full w-full max-w-6xl flex-col items-center gap-12 px-6 py-16">
                    <div className="flex w-full flex-col items-center gap-6 text-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="text-foreground text-3xl font-normal tracking-tight">
                                You have no projects
                            </div>
                            <div className="text-foreground-tertiary text-md">
                                Start by describing what you want to build
                            </div>
                        </div>
                        <Create
                            cardKey={0}
                            isCreatingProject={isAiCreating}
                            setIsCreatingProject={setIsAiCreating}
                            user={user ?? null}
                            suggestions={PROJECT_SUGGESTIONS}
                        />
                        <div className="flex w-[600px] max-w-full items-center gap-3">
                            <div className="h-px flex-1 bg-foreground/10" />
                            <span className="text-foreground-tertiary text-xs uppercase tracking-[0.2em]">
                                or
                            </span>
                            <div className="h-px flex-1 bg-foreground/10" />
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button
                                onClick={() => void handleStartBlankProject()}
                                disabled={isCreatingProject || isImporting || isAiCreating}
                                variant="outline"
                                className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                            >
                                {isCreatingProject ? (
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Icons.Plus className="h-4 w-4" />
                                )}
                                Create blank project
                            </Button>
                            <Button
                                onClick={() => void handleImportLocalProject()}
                                disabled={isCreatingProject || isImporting || isAiCreating}
                                variant="outline"
                                className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                            >
                                {isImporting ? (
                                    <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Icons.Directory className="h-4 w-4" />
                                )}
                                Open local folder
                            </Button>
                        </div>
                    </div>

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
                                isCreating={isCreatingProject}
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
                <div className="mb-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h2 className="text-foreground text-3xl font-normal tracking-tight">
                                Projects
                            </h2>
                            <p className="text-foreground-tertiary mt-1 text-sm">
                                Live previews, tidy folders, and quick bulk actions.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                                onClick={() => setShowCreateFolderDialog(true)}
                            >
                                <Icons.MoveToFolder className="h-4 w-4" />
                                Create folder
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                className={`border ${selectionMode ? 'text-foreground border-foreground/14 bg-foreground/10' : 'text-foreground-tertiary hover:text-foreground border-transparent hover:border-foreground/10 hover:bg-foreground/6'}`}
                                onClick={() => {
                                    if (selectionMode) {
                                        resetSelection();
                                    } else {
                                        setSelectionMode(true);
                                    }
                                }}
                            >
                                <Icons.ListCheck className="h-4 w-4" />
                                {selectionMode ? 'Done selecting' : 'Select'}
                            </Button>

                            <div className="flex items-center gap-1 rounded-full border border-foreground/8 bg-foreground/4 p-1">
                                {sortOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setFilesSortBy(option.value)}
                                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                                            filesSortBy === option.value
                                                ? 'text-foreground bg-foreground/12'
                                                : 'text-foreground-tertiary hover:text-foreground'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {selectionMode && (
                        <div className="flex flex-col gap-3 rounded-[22px] border border-foreground/8 bg-foreground/4 p-4 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
                            <div className="text-foreground-secondary flex items-center gap-2 text-sm">
                                <span className="text-foreground rounded-full border border-foreground/8 bg-foreground/8 px-2.5 py-1 text-xs">
                                    {selectedCount}
                                </span>
                                {selectedCount === 1 ? 'project selected' : 'projects selected'}
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
                                            Move to folder
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="min-w-56">
                                        <DropdownMenuLabel>Folder destination</DropdownMenuLabel>
                                        <DropdownMenuItem
                                            onSelect={() => void handleMoveSelected(null)}
                                        >
                                            Remove from folder
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
                                                No folders yet
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
                                    Delete selected
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {folderViewModels.length > 0 && (
                    <div className="mb-10">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-foreground-tertiary text-sm font-medium tracking-[0.18em] uppercase">
                                Folders
                            </h3>
                            <span className="text-foreground-tertiary text-xs">
                                {folderViewModels.length} saved
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
                            <div className="mt-6 rounded-[28px] border border-foreground/8 bg-foreground/3 p-5 backdrop-blur-xl">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h4 className="text-foreground text-base font-medium">
                                            {openFolder.folder.name}
                                        </h4>
                                        <p className="text-foreground-tertiary mt-1 text-sm">
                                            {openFolder.previewProjects.length} saved site
                                            {openFolder.previewProjects.length === 1 ? '' : 's'}
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
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </motion.div>
                                ) : (
                                    <div className="text-foreground-tertiary flex flex-col items-start gap-3 rounded-[22px] border border-dashed border-foreground/10 bg-foreground/5 p-6 text-sm">
                                        <span>
                                            No projects in this folder match your search yet.
                                        </span>
                                        {debouncedSearchQuery && onClearSearch && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                                                onClick={() => onClearSearch()}
                                            >
                                                Clear search
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div>
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-foreground-tertiary text-sm font-medium tracking-[0.18em] uppercase">
                            {folderViewModels.length > 0 ? 'Unfiled projects' : 'Projects'}
                        </h3>
                        <span className="text-foreground-tertiary flex items-center gap-2 text-xs">
                            {searchQuery !== debouncedSearchQuery && (
                                <span className="text-foreground-tertiary/80 flex items-center gap-1">
                                    <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                                    Searching…
                                </span>
                            )}
                            {looseProjects.length} visible
                        </span>
                    </div>

                    {looseProjects.length === 0 ? (
                        <div className="flex w-full items-center justify-center rounded-[26px] border border-dashed border-foreground/8 bg-foreground/3 py-16">
                            <div className="flex flex-col items-center gap-3 text-center">
                                <div className="text-foreground-secondary text-base">
                                    No loose projects found
                                </div>
                                <div className="text-foreground-tertiary text-sm">
                                    {debouncedSearchQuery
                                        ? 'Try adjusting your search terms'
                                        : 'Move projects here or create a new one'}
                                </div>
                                {debouncedSearchQuery && onClearSearch && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-foreground/10 bg-foreground/4 hover:bg-foreground/8"
                                        onClick={() => onClearSearch()}
                                    >
                                        Clear search
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
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
                        isCreating={isCreatingProject}
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
                        <AlertDialogTitle>Delete selected projects?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove {selectedCount} project
                            {selectedCount === 1 ? '' : 's'} from your workspace.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setShowDeleteSelectedDialog(false)}
                            disabled={isDeletingSelected}
                        >
                            Cancel
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
                            Delete
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {selectedTemplate && shouldShowTemplate && (
                <TemplateModal
                    isOpen={isTemplateModalOpen}
                    onClose={handleCloseTemplateModal}
                    title={selectedTemplate.name}
                    description={
                        selectedTemplate.metadata?.description ?? 'No description available'
                    }
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
                    user={user}
                />
            )}
        </div>
    );
};
