import type { FigmaFileResponse, FigmaTopLevelFrame } from './types';
import { figmaColorToHex } from './utils';

const FIGMA_API_BASE = 'https://api.figma.com/v1';

export async function fetchFigmaFile(
    fileKey: string,
    personalAccessToken: string,
): Promise<FigmaFileResponse> {
    const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, {
        headers: { 'X-Figma-Token': personalAccessToken },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Figma API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<FigmaFileResponse>;
}

export function extractTopLevelFrames(file: FigmaFileResponse): FigmaTopLevelFrame[] {
    const firstPage = file.document.children[0];
    if (!firstPage) return [];
    return firstPage.children
        .filter((node) => node.type === 'FRAME' && node.absoluteBoundingBox)
        .map((node) => {
            const bb = node.absoluteBoundingBox!;
            let bgColor = '#ffffff';
            const solidFill = node.fills?.find((f) => f.type === 'SOLID' && f.color);
            if (solidFill?.color) {
                bgColor = figmaColorToHex(solidFill.color);
            } else if (node.backgroundColor) {
                bgColor = figmaColorToHex(node.backgroundColor);
            }
            return {
                id: node.id,
                name: node.name,
                width: Math.round(bb.width),
                height: Math.round(bb.height),
                backgroundColor: bgColor,
            };
        });
}
