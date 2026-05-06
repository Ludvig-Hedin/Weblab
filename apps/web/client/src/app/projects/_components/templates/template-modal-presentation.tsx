'use client';

import { AnimatePresence, motion } from 'motion/react';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

interface TemplateModalPresentationProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description: string;
    image: string | null;
    isNew?: boolean;
    isStarred?: boolean;
    onToggleStar?: () => void;
    templateProject: Project;
    isCreatingProject?: boolean;
    onUseTemplate?: () => void;
    onPreviewTemplate?: () => void;
    onEditTemplate?: () => void;
    onUnmarkTemplate?: () => void;
}

/**
 * TemplateModalPresentation - Pure presentational version of TemplateModal.
 * Receives all data and callbacks as props instead of using hooks/context.
 */
export function TemplateModalPresentation({
    isOpen,
    onClose,
    title,
    description,
    image,
    isNew = false,
    isStarred = false,
    onToggleStar,
    isCreatingProject = false,
    onUseTemplate,
    onPreviewTemplate,
    onEditTemplate,
    onUnmarkTemplate,
}: TemplateModalPresentationProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="bg-background border-border relative flex max-h-[80vh] w-full max-w-4xl rounded-2xl border shadow-2xl"
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Button
                            onClick={onClose}
                            variant="ghost"
                            size="sm"
                            className="bg-background/20 hover:bg-secondary absolute top-4 right-4 z-10 rounded-full p-2 transition-colors"
                        >
                            <Icons.CrossS className="h-4 w-4" />
                        </Button>

                        <div className="bg-secondary relative w-1/2 overflow-hidden rounded-l-2xl">
                            {image ? (
                                <img
                                    src={image}
                                    alt={`${title} template preview`}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="h-full w-full bg-gradient-to-t from-gray-800/40 via-gray-500/40 to-gray-400/40" />
                            )}

                            {isNew && (
                                <div className="absolute top-4 left-4 rounded-full bg-blue-600 px-2 py-1 text-xs font-medium text-white">
                                    New
                                </div>
                            )}
                        </div>

                        <div className="flex min-h-80 w-1/2 flex-col overflow-visible p-8">
                            <h2 className="text-foreground mb-4 text-2xl font-semibold">{title}</h2>

                            <p className="text-foreground-secondary mb-8 flex-1 text-base leading-relaxed">
                                {description}
                            </p>

                            <div className="flex items-center gap-3 overflow-visible">
                                <Button
                                    className="flex-1"
                                    size="lg"
                                    onClick={onUseTemplate}
                                    disabled={isCreatingProject}
                                >
                                    {isCreatingProject ? (
                                        <div className="flex items-center gap-2">
                                            <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                            Creating...
                                        </div>
                                    ) : (
                                        'Use Template'
                                    )}
                                </Button>

                                {onToggleStar && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="lg"
                                                onClick={onToggleStar}
                                                aria-label={
                                                    isStarred
                                                        ? 'Remove from favorites'
                                                        : 'Add to favorites'
                                                }
                                            >
                                                {isStarred ? (
                                                    <Icons.BookmarkFilled className="h-5 w-5 text-white" />
                                                ) : (
                                                    <Icons.Bookmark className="text-foreground-tertiary h-5 w-5" />
                                                )}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Mark as favorite</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="lg"
                                            aria-label="Template options"
                                        >
                                            <Icons.DotsHorizontal className="h-5 w-5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        {onPreviewTemplate && (
                                            <DropdownMenuItem onClick={onPreviewTemplate}>
                                                <Icons.EyeOpen className="mr-3 h-4 w-4" />
                                                Preview
                                            </DropdownMenuItem>
                                        )}
                                        {onEditTemplate && (
                                            <DropdownMenuItem onClick={onEditTemplate}>
                                                <Icons.Edit className="mr-3 h-4 w-4" />
                                                Edit
                                            </DropdownMenuItem>
                                        )}
                                        {onUnmarkTemplate && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={onUnmarkTemplate}
                                                    className="text-foreground-secondary focus:text-foreground"
                                                >
                                                    <Icons.CrossL className="mr-3 h-4 w-4" />
                                                    Remove Template
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
