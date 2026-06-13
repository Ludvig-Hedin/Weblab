'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { APP_NAME } from '@weblab/constants';
import { getFrameworkAdapter } from '@weblab/framework';
import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { type NextJsProjectValidation } from '@/app/projects/types';
import { useProjectCreation } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const VerifyProject = () => {
    const t = useTranslations('projects.importLocal');
    const { projectData, prevStep, nextStep, isFinalizing, validateNextJsProject, framework } =
        useProjectCreation();
    const [validation, setValidation] = useState<NextJsProjectValidation | null>(null);
    const frameworkName = getFrameworkAdapter(framework).displayName;

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!projectData.files) return;
            const result = await validateNextJsProject(projectData.files);
            if (!cancelled) {
                setValidation(result);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
        // validateNextJsProject is stable across renders from the project-creation context.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectData]);

    const validProject = () => (
        <motion.div
            key="name"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="border-foreground-skill/40 bg-foreground-skill/15 flex w-full flex-row items-center gap-2 rounded-lg border p-4"
        >
            <div className="flex w-full flex-row items-center justify-between gap-4">
                <div className="bg-foreground-skill/30 rounded-lg p-3">
                    <Icons.Directory className="h-5 w-5" />
                </div>
                <div className="flex w-full flex-col gap-1 break-all">
                    <p className="text-regular text-foreground-skill">{projectData.name}</p>
                    <p className="text-mini text-foreground-skill/80">{projectData.folderPath}</p>
                </div>
            </div>
            <Icons.CheckCircled className="text-foreground-skill h-5 w-5" />
        </motion.div>
    );

    const invalidProject = () => (
        <motion.div
            key="name"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="border-warning bg-background-warning flex w-full flex-row items-center gap-2 rounded-lg border p-4"
        >
            <div className="flex w-full flex-col gap-2">
                <div className="flex w-full flex-row items-center justify-between gap-3">
                    <div className="bg-foreground-warning rounded-md p-3">
                        <Icons.Directory className="h-5 w-5" />
                    </div>
                    <div className="flex w-full flex-col gap-1 break-all">
                        <p className="text-regular text-foreground-primary">{projectData.name}</p>
                        <p className="text-mini text-foreground-warning">
                            {projectData.folderPath}
                        </p>
                    </div>
                    <Icons.ExclamationTriangle className="text-foreground-warning h-5 w-5" />
                </div>
                <p className="text-small text-foreground-primary">{t('projectNotMatchStack', { frameworkName })}</p>
            </div>
        </motion.div>
    );

    const renderHeader = () => {
        if (!validation) {
            return (
                <>
                    <CardTitle>{t('verifyingTitle', { appName: APP_NAME })}</CardTitle>
                    <CardDescription>
                        {t('verifyingDesc', { appName: APP_NAME })}
                    </CardDescription>
                </>
            );
        }
        if (validation.isValid) {
            return (
                <>
                    <CardTitle>{t('projectVerified')}</CardTitle>
                    <CardDescription>{t('projectReadyToImport', { appName: APP_NAME })}</CardDescription>
                </>
            );
        }
        return (
            <>
                <CardTitle>{t('projectWontWork', { appName: APP_NAME })}</CardTitle>
                <CardDescription>
                    {validation.error ??
                        t('folderDoesntMatch', { frameworkName })}
                </CardDescription>
            </>
        );
    };

    return (
        <>
            <StepHeader>{renderHeader()}</StepHeader>
            <StepContent>
                <motion.div
                    key="name"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full"
                >
                    {validation === null
                        ? null
                        : validation.isValid
                          ? validProject()
                          : invalidProject()}
                </motion.div>
            </StepContent>
            <StepFooter>
                <Button onClick={prevStep} disabled={isFinalizing} variant="outline">
                    {t('cancel')}
                </Button>
                <Button
                    className="px-3 py-2"
                    onClick={validation?.isValid ? nextStep : prevStep}
                    disabled={isFinalizing}
                >
                    {validation?.isValid ? t('finishSetup') : t('selectDifferentFolder')}
                </Button>
            </StepFooter>
        </>
    );
};
