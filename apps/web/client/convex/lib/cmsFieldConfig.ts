import type { Doc } from '../_generated/dataModel';

export function configObject(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('BAD_REQUEST: Field settings must be an object.');
    return value as Record<string, unknown>;
}

/** Keep provider metadata while validating the settings the editor understands. */
export function mergeFieldConfig(type: Doc<'cmsFields'>['type'], previous: unknown, incoming: unknown): Record<string, unknown> {
    const config = { ...configObject(previous), ...configObject(incoming) };
    if (type === 'option') {
        if (!Array.isArray(config.options) || config.options.length > 100 || !config.options.every((option) => typeof option === 'string')) {
            throw new Error('BAD_REQUEST: Configure up to 100 options.');
        }
        const options = (config.options as string[]).map((option) => option.trim()).filter(Boolean);
        if (!options.length || options.some((option) => option.length > 256) || new Set(options).size !== options.length) {
            throw new Error('BAD_REQUEST: Options must be unique, nonempty values of up to 256 characters.');
        }
        config.options = options;
    }
    if (type === 'option' || type === 'reference') {
        if (config.multiple !== undefined && typeof config.multiple !== 'boolean') throw new Error('BAD_REQUEST: Multiple selections must be true or false.');
        config.multiple ??= false;
    }
    if (type === 'reference' && (typeof config.collectionId !== 'string' || !config.collectionId)) {
        throw new Error('BAD_REQUEST: Choose a reference collection.');
    }
    if (type === 'text' && config.format !== undefined && config.format !== 'text' && config.format !== 'url') {
        throw new Error('BAD_REQUEST: Text format must be text or url.');
    }
    return config;
}
