import { customAlphabet } from 'nanoid';

export const VALID_DATA_ATTR_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-._:';

// Lazy generator. A top-level `const generateCustomId = customAlphabet(...)`
// looked equivalent but tripped a TDZ ("Cannot access 'generateCustomId'
// before initialization") under `bun test --coverage`: the coverage transform
// reorders module initialization, and parser test fixtures call into this
// helper from inside a `traverse` callback that fires before this module's
// const has bound. Wrapping the closure in a function declaration sidesteps
// the issue without changing runtime semantics — nanoid still resolves
// `VALID_DATA_ATTR_CHARS` only on first call, and the alphabet is closed
// over after that.
let cachedGenerator: ReturnType<typeof customAlphabet> | null = null;
function generateCustomId(): string {
    if (!cachedGenerator) {
        cachedGenerator = customAlphabet(VALID_DATA_ATTR_CHARS, 7);
    }
    return cachedGenerator();
}

export function createDomId(): string {
    return `odid-${generateCustomId()}`;
}

export function createOid(): string {
    return `${generateCustomId()}`;
}

/**
 * Shortens a UUID; maintains uniqueness probabilistically (collisions are possible).
 */
export function shortenUuid(uuid: string, maxLength: number): string {
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
        const char = uuid.charCodeAt(i);
        hash = (hash << 5) - hash + char;
    }

    // Convert to base36 (alphanumeric) for compact representation
    const base36 = Math.abs(hash).toString(36);

    // Pad with leading zeros if needed
    const padded = base36.padStart(maxLength, '0');

    // Truncate if longer than maxLength
    return padded.slice(-maxLength);
}
