'use client';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { motion } from 'motion/react';
import { StepContent, StepFooter, StepHeader } from '../../steps';
import { useFigmaImport } from '../_context';

export const FigmaCredentials = () => {
    const {
        prevStep,
        personalAccessToken,
        setPersonalAccessToken,
        fileUrl,
        setFileUrl,
        isFetching,
        fetchError,
        fetchFile,
    } = useFigmaImport();

    const canFetch = personalAccessToken.trim().length > 0 && fileUrl.trim().length > 0;

    return (
        <>
            <StepHeader>
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-background-tertiary rounded-lg">
                        <Icons.Figma className="w-6 h-6" />
                    </div>
                </div>
                <CardTitle className="text-xl font-normal">Connect to Figma</CardTitle>
                <CardDescription className="font-normal">
                    Enter your Personal Access Token and file URL.
                </CardDescription>
            </StepHeader>
            <StepContent>
                <motion.div
                    key="credentials"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full"
                >
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="figma-pat">Personal Access Token</Label>
                            <Input
                                id="figma-pat"
                                type="password"
                                placeholder="figd_..."
                                value={personalAccessToken}
                                onChange={(e) => setPersonalAccessToken(e.target.value)}
                                disabled={isFetching}
                            />
                            <p className="text-xs text-foreground-secondary">
                                Generate at figma.com → Settings → Personal access tokens
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="figma-url">Figma File URL</Label>
                            <Input
                                id="figma-url"
                                type="url"
                                placeholder="https://www.figma.com/file/..."
                                value={fileUrl}
                                onChange={(e) => setFileUrl(e.target.value)}
                                disabled={isFetching}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && canFetch) void fetchFile();
                                }}
                            />
                        </div>
                        {fetchError && (
                            <div className="p-3 bg-red-900/50 border border-red-800 rounded-md">
                                <p className="text-red-200 text-sm">{fetchError}</p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </StepContent>
            <StepFooter>
                <Button onClick={prevStep} variant="outline" disabled={isFetching}>
                    Cancel
                </Button>
                <Button onClick={() => void fetchFile()} disabled={!canFetch || isFetching}>
                    {isFetching ? (
                        <>
                            <Icons.Shadow className="w-4 h-4 mr-2 animate-spin" />
                            Fetching...
                        </>
                    ) : (
                        'Fetch File'
                    )}
                </Button>
            </StepFooter>
        </>
    );
};
