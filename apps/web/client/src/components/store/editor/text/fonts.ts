import type { EditTextFontFace } from '@weblab/models';

const registered = new Map<string, Promise<void>>();

/**
 * Add the frame's web fonts (shipped by the preload as data: URLs) to the
 * editor document, so the inline text editor renders in the site's real
 * typeface instead of a fallback. Idempotent per face; failures only log.
 */
export async function registerEditingFontFaces(faces: EditTextFontFace[]): Promise<void> {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
        return;
    }
    await Promise.all(
        faces.map((face) => {
            let pending = registered.get(face.key);
            if (!pending) {
                pending = (async () => {
                    try {
                        const descriptors: FontFaceDescriptors = {};
                        if (face.descriptors.weight) descriptors.weight = face.descriptors.weight;
                        if (face.descriptors.style) descriptors.style = face.descriptors.style;
                        if (face.descriptors.stretch) descriptors.stretch = face.descriptors.stretch;
                        if (face.descriptors.unicodeRange) {
                            descriptors.unicodeRange = face.descriptors.unicodeRange;
                        }
                        const fontFace = new FontFace(face.family, `url("${face.source}")`, descriptors);
                        document.fonts.add(fontFace);
                        await fontFace.load();
                    } catch (error) {
                        console.warn('Could not load font for text editing:', face.family, error);
                    }
                })();
                registered.set(face.key, pending);
            }
            return pending;
        }),
    );
}
