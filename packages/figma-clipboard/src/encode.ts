import type { FigmaMeta, FigmaScene } from './types';
import { encodeFigmaClipboardHtml } from './figma-schema';
import { sceneToFigmaMessage } from './map';

export interface BuildFigmaClipboardOptions {
    /** Deterministic paste id (tests). Defaults to a random int. */
    pasteID?: number;
}

/**
 * Turn a serialized DOM scene into the `text/html` string Figma reads from the
 * clipboard. Writing this string to the clipboard (as `text/html`) lets the user
 * `Cmd/Ctrl+V` it into Figma as editable layers.
 */
export function buildFigmaClipboardHtml(
    scene: FigmaScene,
    opts: BuildFigmaClipboardOptions = {},
): string {
    const message = sceneToFigmaMessage(scene, opts);
    const meta: FigmaMeta = {
        fileKey: '',
        pasteID: message.pasteID,
        dataType: 'scene',
    };
    return encodeFigmaClipboardHtml(message, meta);
}
