'use client';
import { APP_NAME } from '@weblab/constants';

import { type NextJsProjectValidation } from '@/app/projects/types';
import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { StepContent, StepFooter, StepHeader } from '../../steps';
import { useProjectCreation } from '../_context';

export const VerifyProject = () => {
    const { projectData, prevStep, nextStep, isFinalizing, validateNextJsProject } = useProjectCreation();
    const [validation, setValidation] = useState<NextJsProjectValidation | null>(null);

    useEffect(() => {
        validateProject();
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
            className="w-full flex flex-row items-center border p-4 rounded-lg bg-purple-900 border-purple-600 gap-2"
        >
            <div className="flex flex-row items-center justify-between w-full gap-4">
                <div className="p-3 bg-purple-500 rounded-lg">
                    <Icons.Directory className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1 break-all w-full">
                    <p className="text-regular text-purple-100">{projectData.name}</p>
                    <p className="text-purple-200 text-mini">{projectData.folderPath}</p>
                </div>
            </div>
            <Icons.CheckCircled className="w-5 h-5 text-purple-200" />
        </motion.div>
    );

    const invalidProject = () => (
        <motion.div
            key="name"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full flex flex-row items-center border p-4 rounded-lg bg-amber-900 border-amber-600 gap-2"
        >
            <div className="flex flex-col gap-2 w-full">
                <div className="flex flex-row items-center justify-between w-full gap-3">
                    <div className="p-3 bg-amber-500 rounded-md">
                        <Icons.Directory className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col gap-1 break-all w-full">
                        <p className="text-regular text-amber-100">{projectData.name}</p>
                        <p className="text-amber-200 text-mini">{projectData.folderPath}</p>
                    </div>
                    <Icons.ExclamationTriangle className="w-5 h-5 text-amber-200" />
                </div>
                <p className="text-amber-100 text-sm">This is not a NextJS Project</p>
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
        if (validation?.isValid) {
            return (
                <>
                    <CardTitle>{'Project verified'}</CardTitle>
                    <CardDescription>{`Your project is ready to import to ${APP_NAME}`}</CardDescription>
                </>
            );
        } else {
            return (
                <>
                    <CardTitle>{`This project won't work with ${APP_NAME}`}</CardTitle>
                    <CardDescription>
                        {`${APP_NAME} only works with NextJS + React + Tailwind projects`}
                    </CardDescription>
                </>
            );
        }
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
                <Button className="px-3 py-2" onClick={validation?.isValid ? nextStep : prevStep} disabled={isFinalizing}>
                    {validation?.isValid ? 'Finish setup' : 'Select a different folder'}
                </Button>
            </StepFooter>
        </>
    );
};
