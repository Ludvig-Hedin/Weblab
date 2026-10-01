import copy from './copy.json';

export const HOME_DOCUMENT_ID = 'pilot-home';

export function isNonblankText(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function isCanonicalSlug(value: unknown): value is string {
    return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isPublishedDate(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value.slice(0, 10)
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Shared by the website reader and Studio so publishing cannot silently lose formatting.
export function validateBody(value: unknown): true | string {
    if (!Array.isArray(value) || value.length === 0) return copy.requiredBody;
    let hasText = false;
    for (const block of value) {
        if (
            !isRecord(block) ||
            block._type !== 'block' ||
            !isNonblankText(block._key) ||
            (block.style !== 'normal' && block.style !== 'h2') ||
            block.listItem !== undefined ||
            block.level !== undefined ||
            (block.markDefs !== undefined &&
                (!Array.isArray(block.markDefs) || block.markDefs.length !== 0)) ||
            !Array.isArray(block.children) ||
            block.children.length === 0
        ) {
            return copy.unsupportedBody;
        }
        for (const child of block.children) {
            if (
                !isRecord(child) ||
                child._type !== 'span' ||
                !isNonblankText(child._key) ||
                typeof child.text !== 'string' ||
                !Array.isArray(child.marks) ||
                child.marks.some((mark: unknown) => mark !== 'strong' && mark !== 'em')
            ) {
                return copy.unsupportedBody;
            }
            hasText ||= isNonblankText(child.text);
        }
    }
    return hasText ? true : copy.requiredBody;
}

export function validateImage(value: unknown): true | string {
    if (value === undefined || value === null) return true;
    if (!isRecord(value)) return copy.requiredAlt;
    return value.asset === undefined || isNonblankText(value.alt) ? true : copy.requiredAlt;
}
