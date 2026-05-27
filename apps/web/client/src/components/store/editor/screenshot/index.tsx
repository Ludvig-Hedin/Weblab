import type { ConvexHttpClient } from 'convex/browser';
import { api as convexApi } from '@convex/_generated/api';
import { isAfter, subMinutes } from 'date-fns';
import { debounce } from 'lodash';
import { makeAutoObservable } from 'mobx';

import type { EditorEngine } from '../engine';
import type { Id } from '@convex/_generated/dataModel';
import { getConvexHttpClient } from '@/components/store/lib/convex-http-client';

export class ScreenshotManager {
    _lastScreenshotTime: Date | null = null;
    isCapturing = false;
    private convex: ConvexHttpClient = getConvexHttpClient();

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get lastScreenshotAt() {
        return this._lastScreenshotTime;
    }

    set lastScreenshotAt(time: Date | null) {
        this._lastScreenshotTime = time;
    }

    // 10 second debounce
    captureScreenshot = debounce(this.debouncedCaptureScreenshot, 10000);

    private async debouncedCaptureScreenshot() {
        if (this.isCapturing) {
            return;
        }
        this.isCapturing = true;
        try {
            // If the screenshot was captured less than 30 minutes ago, skip capturing
            if (this.lastScreenshotAt) {
                const thirtyMinutesAgo = subMinutes(new Date(), 30);
                if (isAfter(this.lastScreenshotAt, thirtyMinutesAgo)) {
                    return;
                }
            }
            const projectId = this.editorEngine.projectId as Id<'projects'>;
            const result = (await this.convex.action(convexApi.projectActions.captureScreenshot, {
                projectId,
            })) as { success?: boolean } | null;
            if (!result?.success) {
                throw new Error('Failed to capture screenshot');
            }
            this.lastScreenshotAt = new Date();
        } catch (error) {
            console.error('Error capturing screenshot', error);
        } finally {
            this.isCapturing = false;
        }
    }

    clear() {
        this.lastScreenshotAt = null;
    }
}
