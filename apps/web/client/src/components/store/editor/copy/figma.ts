import { makeAutoObservable } from 'mobx';
import { toast } from 'sonner';

import type { FigmaScene, FigmaSceneNode } from '@weblab/figma-clipboard';
import { buildFigmaClipboardHtml } from '@weblab/figma-clipboard';

import type { EditorEngine } from '../engine';

/**
 * Copies the selected element or frame to the OS clipboard in Figma's native
 * scene format. Pasting (Cmd/Ctrl+V) into a Figma file reconstructs the subtree
 * as editable frames / text / shapes — no plugin required.
 *
 * The DOM → scene serialization runs inside the preview iframe (the editor frame
 * cannot read it across origins); see the `getFigmaSceneData` preload bridge.
 */
export class CopyToFigmaManager {
    isCopying = false;

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get canCopySelectedElement(): boolean {
        return this.editorEngine.elements.selected.length > 0;
    }

    async copySelectedToFigma(): Promise<void> {
        const selected = this.editorEngine.elements.selected[0];
        if (!selected) {
            toast.error('Select an element to copy to Figma');
            return;
        }
        const frameData = this.editorEngine.frames.get(selected.frameId);
        if (!frameData?.view) {
            toast.error('Could not reach the selected frame');
            return;
        }
        await this.copy(() => frameData.view!.getFigmaSceneData(selected.domId));
    }

    async copyFrameToFigma(frameId: string): Promise<void> {
        const frameData = this.editorEngine.frames.get(frameId);
        if (!frameData?.view) {
            toast.error('Could not reach the frame');
            return;
        }
        await this.copy(() => frameData.view!.getFigmaSceneData(), 'Frame');
    }

    private async copy(fetchScene: () => Promise<unknown>, name?: string): Promise<void> {
        if (this.isCopying) return;
        this.isCopying = true;
        try {
            const root = (await fetchScene()) as FigmaSceneNode | null;
            if (!root) {
                toast.error('Nothing to copy to Figma');
                return;
            }
            const scene: FigmaScene = { root, name };
            const html = buildFigmaClipboardHtml(scene);
            await navigator.clipboard.write([
                new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) }),
            ]);
            toast.success('Copied to Figma', {
                description: 'Paste into Figma with ⌘V / Ctrl+V.',
            });
        } catch (error) {
            console.error('Copy to Figma failed:', error);
            toast.error('Copy to Figma failed', {
                description: error instanceof Error ? error.message : undefined,
            });
        } finally {
            this.isCopying = false;
        }
    }
}
