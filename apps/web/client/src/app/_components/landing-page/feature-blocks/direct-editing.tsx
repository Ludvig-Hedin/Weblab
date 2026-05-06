import React from 'react';

import { Icons } from '@weblab/ui/icons';

import { DirectEditingInteractive } from '../../shared/mockups/direct-editing-interactive';

export function DirectEditingBlock() {
    return (
        <div className="flex flex-col gap-6">
            <DirectEditingInteractive />
            <div className="flex w-full flex-row items-start gap-8">
                <div className="flex w-1/2 flex-col items-start">
                    <div className="mb-2">
                        <Icons.DirectManipulation className="text-foreground-primary h-6 w-6" />
                    </div>
                    <span className="text-foreground-primary text-largePlus font-light">
                        Canvas Manipulation
                    </span>
                </div>
                <p className="text-foreground-secondary text-regular w-1/2 text-balance">
                    Drag, resize, and arrange elements directly on the canvas. See changes in real
                    code instantly.
                </p>
            </div>
        </div>
    );
}
