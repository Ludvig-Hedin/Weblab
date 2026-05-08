'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

import { APP_NAME } from '@weblab/constants';
import { getFrameworkAdapter } from '@weblab/framework';
import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';

import { type NextJsProjectValidation } from '@/app/projects/types';
import { useProjectCreation } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const VerifyProject = () => {
    const { projectData, prevStep, nextStep, isFinalizing, validateNextJsProject, framework } =
        useProjectCreation();
    const [validation, setValidation] = useState<NextJsProjectValidation | null>(null);
    const frameworkName = getFrameworkAdapter(framework).displayName;

    useEffect(() => {
        void validateProject();
    }, [projectData]);

    const validateProject = async () => {
        if (!projectData.files) {
            return;
        }
        const validation = await validateNextJsProject(projectData.files);
        setValidation(validation);
    };

    const validProject = () => (
        <motion.div
            key="name"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex w-full flex-row items-center gap-2 rounded-lg border border-purple-600 bg-purple-900 p-4"
        >
            <div className="flex w-full flex-row items-center justify-between gap-4">
                <div className="rounded-lg bg-purple-500 p-3">
                    <Icons.Directory className="h-5 w-5" />
                </div>
                <div className="flex w-full flex-col gap-1 break-all">
                    <p className="text-regular text-purple-100">{projectData.name}</p>
                    <p className="text-mini text-purple-200">{projectData.folderPath}</p>
                </div>
            </div>
            <Icons.CheckCircled className="h-5 w-5 text-purple-200" />
        </motion.div>
    );

    const invalidProject = () => (
        <motion.div
            key="name"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex w-full flex-row items-center gap-2 rounded-lg border border-amber-600 bg-amber-900 p-4"
        >
            <div className="flex w-full flex-col gap-2">
                <div className="flex w-full flex-row items-center justify-between gap-3">
                    <div className="rounded-md bg-amber-500 p-3">
                        <Icons.Directory className="h-5 w-5" />
                    </div>
                    <div className="flex w-full flex-col gap-1 break-all">
                        <p className="text-regular text-amber-100">{projectData.name}</p>
                        <p className="text-mini text-amber-200">{projectData.folderPath}</p>
                    </div>
                    <Icons.ExclamationTriangle className="h-5 w-5 text-amber-200" />
                </div>
                <p className="text-sm text-amber-100">{`This folder doesn't look like a ${frameworkName} project`}</p>
            </div>
        </motion.div>
    );

    const renderHeader = () => {
        if (!validation) {
            return (
                <>
                    <CardTitle>{`Verifying compatibility with ${APP_NAME}`}</CardTitle>
                    <CardDescription>
                        {`We're checking to make sure this project can work with ${APP_NAME}`}
                    </CardDescription>
                </>
            );
        }
        if (validation.isValid) {
            return (
                <>
                    <CardTitle>{'Project verified'}</CardTitle>
                    <CardDescription>{`Your project is ready to import to ${APP_NAME}`}</CardDescription>
                </>
            );
        }
        return (
            <>
                <CardTitle>{`This project won't work with ${APP_NAME}`}</CardTitle>
                <CardDescription>
                    {validation.error ??
                        `This folder doesn't match a ${frameworkName} project layout.`}
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
                    {validation?.isValid ? validProject() : invalidProject()}
                </motion.div>
            </StepContent>
            <StepFooter>
                <Button onClick={prevStep} disabled={isFinalizing} variant="outline">
                    Cancel
                </Button>
                <Button
                    className="px-3 py-2"
                    onClick={validation?.isValid ? nextStep : prevStep}
                    disabled={isFinalizing}
                >
                    {validation?.isValid ? 'Finish setup' : 'Select a different folder'}
                </Button>
            </StepFooter>
        </>
    );
};
