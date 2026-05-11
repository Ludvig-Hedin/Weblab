'use client';

import { Alert, AlertDescription, AlertTitle } from '@weblab/ui/alert';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Progress } from '@weblab/ui/progress';
import { ProgressWithInterval } from '@weblab/ui/progress-with-interval';
import { Skeleton } from '@weblab/ui/skeleton';
import { toast } from '@weblab/ui/sonner';

import { Section } from '../section';

export function FeedbackDemo() {
    return (
        <div id="feedback">
            <Section
                title="Alert"
                tag="feedback"
                inspectId="alert"
                filePath="packages/ui/src/components/alert.tsx"
            >
                <div className="w-full max-w-xl space-y-3">
                    <Alert>
                        <Icons.InfoCircled className="h-4 w-4" />
                        <AlertTitle>Info</AlertTitle>
                        <AlertDescription>This is an informational message.</AlertDescription>
                    </Alert>
                    <Alert variant="destructive">
                        <Icons.ExclamationTriangle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>Something went wrong. Please try again.</AlertDescription>
                    </Alert>
                </div>
            </Section>

            <Section
                title="Toast"
                tag="feedback"
                inspectId="toast"
                filePath="packages/ui/src/components/sonner.tsx"
            >
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => toast('Default toast')}>
                        Default
                    </Button>
                    <Button variant="outline" onClick={() => toast.success('Saved successfully')}>
                        Success
                    </Button>
                    <Button variant="outline" onClick={() => toast.error('Something went wrong')}>
                        Error
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() =>
                            toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
                                loading: 'Saving…',
                                success: 'Saved',
                                error: 'Failed',
                            })
                        }
                    >
                        Promise
                    </Button>
                </div>
            </Section>

            <Section
                title="Progress"
                tag="progress"
                inspectId="progress"
                filePath="packages/ui/src/components/progress.tsx"
            >
                <div className="w-full max-w-md space-y-4">
                    <Progress value={20} />
                    <Progress value={50} />
                    <Progress value={75} />
                    <Progress value={100} />
                    <div className="space-y-2">
                        <p className="text-foreground-tertiary text-xs">
                            With interval auto-advance
                        </p>
                        <ProgressWithInterval isLoading intervalMs={120} />
                    </div>
                </div>
            </Section>

            <Section
                title="Skeleton"
                tag="skeleton"
                inspectId="skeleton"
                filePath="packages/ui/src/components/skeleton.tsx"
            >
                <div className="flex flex-wrap gap-8">
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-4 w-40" />
                    </div>
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-32 w-48 rounded-xl" />
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                </div>
            </Section>
        </div>
    );
}
