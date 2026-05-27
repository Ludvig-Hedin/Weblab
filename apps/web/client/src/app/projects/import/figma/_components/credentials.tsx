'use client';

import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { CardDescription, CardTitle } from '@weblab/ui/card';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import { useFigmaImport } from '../_context';
import { StepContent, StepFooter, StepHeader } from '../../steps';

export const FigmaCredentials = () => {
    const {
        prevStep,
        fileUrl,
        setFileUrl,
        personalAccessToken,
        setPersonalAccessToken,
        isFetching,
        fetchError,
        fetchFile,
    } = useFigmaImport();

    const canFetch = fileUrl.trim().length > 0 && personalAccessToken.trim().length > 0;

    return (
        <>
            <StepHeader>
                <div className="flex items-center gap-3">
                    <div className="bg-background-tertiary rounded-lg p-3">
                        <Icons.Figma className="h-6 w-6" />
                    </div>
                </div>
                <CardTitle className="text-xl font-normal">Import from Figma</CardTitle>
                <CardDescription className="font-normal">
                    Paste a Figma file URL to import your designs as React components.
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
                            <Label htmlFor="figma-url">Figma File URL</Label>
                            <Input
                                id="figma-url"
                                type="url"
                                placeholder="https://www.figma.com/design/..."
                                value={fileUrl}
                                onChange={(e) => setFileUrl(e.target.value)}
                                disabled={isFetching}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && canFetch) void fetchFile();
                                }}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="figma-token">Personal access token</Label>
                            <Input
                                id="figma-token"
                                type="password"
                                placeholder="figd_..."
                                value={personalAccessToken}
                                onChange={(e) => setPersonalAccessToken(e.target.value)}
                                disabled={isFetching}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && canFetch) void fetchFile();
                                }}
                            />
                        </div>
                        {fetchError && (
                            <div className="border-destructive bg-destructive/50 rounded-md border p-3">
                                <p className="text-small text-foreground">{fetchError}</p>
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
                            <Icons.Shadow className="mr-2 h-4 w-4 animate-spin" />
                            Fetching...
                        </>
                    ) : (
                        'Fetch Frames'
                    )}
                </Button>
            </StepFooter>
        </>
    );
};
