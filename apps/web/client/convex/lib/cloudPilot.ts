import type { Infer } from 'convex/values';
import { ConvexError, v } from 'convex/values';

import type { Id } from '../_generated/dataModel';

export const CLOUD_PILOT_TAG = 'cloud-pilot-v1';
export const CLOUD_PILOT_TEMPLATE = 'studio-page-v1';
export const CLOUD_PILOT_COLLECTION = 'cloud-pilot-page';

export const pilotContentValidator = v.object({
    title: v.string(),
    description: v.string(),
    imageUrl: v.string(),
    imageAlt: v.string(),
    ctaLabel: v.string(),
    ctaHref: v.string(),
    alignment: v.union(v.literal('left'), v.literal('center')),
});

export type PilotContent = Infer<typeof pilotContentValidator>;
export type PilotSnapshot = {
    projectId: Id<'projects'>;
    name: string;
    template: typeof CLOUD_PILOT_TEMPLATE;
    content: PilotContent;
    revision: number;
    updatedAt: number;
    canEdit: boolean;
    enabled: boolean;
};
export type PilotWorkspace = {
    enabled: boolean;
    canCreate: boolean;
    existingProject: { id: Id<'projects'>; name: string } | null;
};

export function pilotError(code: string): never {
    throw new ConvexError(code);
}

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Recognition is deliberately broader than validation: broken pilots stay out of the old editor. */
export function isCloudPilotProject(project: {
    tags: string[];
    runtimeMetadata: unknown;
}): boolean {
    return (
        project.tags.includes(CLOUD_PILOT_TAG) ||
        (record(project.runtimeMetadata) && 'cloudPilot' in project.runtimeMetadata)
    );
}

export function readPilotMetadata(metadata: unknown): {
    template: typeof CLOUD_PILOT_TEMPLATE;
    itemId: string;
} {
    const pilot = record(metadata) ? metadata.cloudPilot : undefined;
    if (
        !record(pilot) ||
        pilot.template !== CLOUD_PILOT_TEMPLATE ||
        typeof pilot.itemId !== 'string' ||
        !pilot.itemId
    ) {
        return pilotError('PILOT_UNSUPPORTED');
    }
    return { template: CLOUD_PILOT_TEMPLATE, itemId: pilot.itemId };
}

/** Images load in the browser only. No server fetch or image proxy is allowed for supplied URLs. */
export function isPublicHttpsUrl(value: string): boolean {
    try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            (!url.port || url.port === '443') &&
            /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(host) &&
            !host.endsWith('.localhost') &&
            !host.endsWith('.local') &&
            !host.endsWith('.internal') &&
            !host.endsWith('.test')
        );
    } catch {
        return false;
    }
}

export function validatePilotContent(value: unknown): PilotContent {
    if (!record(value)) return pilotError('PILOT_INVALID_CONTENT');
    const limits = {
        title: 160,
        description: 2000,
        imageUrl: 2048,
        imageAlt: 200,
        ctaLabel: 60,
        ctaHref: 2048,
    } as const;
    if (Object.keys(value).some((key) => !Object.hasOwn(limits, key) && key !== 'alignment'))
        return pilotError('PILOT_INVALID_CONTENT');
    for (const [key, max] of Object.entries(limits)) {
        if (typeof value[key] !== 'string' || value[key].length > max)
            return pilotError('PILOT_INVALID_CONTENT');
    }
    if (value.alignment !== 'left' && value.alignment !== 'center')
        return pilotError('PILOT_INVALID_CONTENT');
    const content = value as PilotContent;
    if (!content.title.trim()) return pilotError('PILOT_INVALID_CONTENT');
    if (content.imageUrl && (!isPublicHttpsUrl(content.imageUrl) || !content.imageAlt.trim()))
        return pilotError('PILOT_INVALID_IMAGE');
    if (content.ctaHref && !isPublicHttpsUrl(content.ctaHref))
        return pilotError('PILOT_INVALID_LINK');
    if (!!content.ctaHref !== !!content.ctaLabel.trim()) return pilotError('PILOT_INVALID_LINK');
    return {
        title: content.title,
        description: content.description,
        imageUrl: content.imageUrl,
        imageAlt: content.imageAlt,
        ctaLabel: content.ctaLabel,
        ctaHref: content.ctaHref,
        alignment: content.alignment,
    };
}

export function initialPilotContent(name: string): PilotContent {
    return {
        title: name,
        description: '',
        imageUrl: '',
        imageAlt: '',
        ctaLabel: '',
        ctaHref: '',
        alignment: 'left',
    };
}
