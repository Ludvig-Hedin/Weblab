import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const textBinding = v.object({ oid: v.string(), fields: v.array(v.literal('text')) });
export const contentField = v.union(v.literal('text'), v.literal('src'), v.literal('alt'), v.literal('href'), v.literal('className'));
export const contentBinding = v.object({
    oid: v.string(), fields: v.array(contentField),
    allowImageUploads: v.optional(v.boolean()),
    allowedValues: v.optional(v.object({ src: v.optional(v.array(v.string())), href: v.optional(v.array(v.string())) })),
    choices: v.optional(v.record(v.string(), v.string())),
    choiceLabels: v.optional(v.record(v.string(), v.string())),
});
export const expectedContract = v.object({ path: v.string(), generation: v.number() });
export const contentCandidate = v.object({ path: v.string(), content: v.string() });
export const contentTransport = { transport: v.literal('content'), transportVersion: v.literal(1) };

export const textTarget = v.union(
    v.object({ kind: v.literal('component-literal'), exportName: v.string(), oid: v.string() }),
    v.object({ kind: v.literal('data-leaf'), exportName: v.string(), itemId: v.string(), property: v.string() }),
);
const renderSource = v.object({ path: v.string(), exportName: v.string(), oid: v.string() });
export const textRenderMapping = v.object({
    version: v.literal(1), kind: v.literal('keyed-prop-map'), mappingId: v.string(),
    callsite: renderSource, renderer: renderSource,
});
export const contentTextBinding = v.object({ bindingId: v.string(), target: textTarget, renderMapping: v.optional(textRenderMapping) });
export const expectedTextContract = v.object({ path: v.string(), generation: v.number(), version: v.literal(2), designRevision: v.number() });
export const textTransport = { transport: v.literal('content'), transportVersion: v.literal(2) };

export const contentImageAssetReference = v.object({ path: v.string(), hash: v.string(), bytes: v.number() });
export const contentImageTarget = v.object({
    kind: v.literal('object-image'), exportName: v.string(), srcProperty: v.literal('imageSrc'), altProperty: v.literal('imageAlt'),
});
export const contentImageRenderMapping = v.object({
    version: v.literal(1), kind: v.literal('object-prop-image'), mappingId: v.string(),
    callsite: renderSource, renderer: renderSource,
});
export const contentImageBinding = v.object({
    bindingId: v.string(), target: contentImageTarget, fields: v.array(v.union(v.literal('src'), v.literal('alt'))),
    allowImageUploads: v.boolean(), originalAsset: contentImageAssetReference,
    aspectRatio: v.object({ width: v.number(), height: v.number() }),
    allowedAssets: v.array(contentImageAssetReference), renderMapping: contentImageRenderMapping,
});

/** Revoked rows remain as generation tombstones until enrollment cleanup. */
export const cloudEditorContentTables = {
    cloudEditorContentContracts: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), path: v.string(),
        version: v.union(v.literal(1), v.literal(2)), generation: v.number(), active: v.boolean(),
        bindings: v.array(contentBinding), textBindings: v.optional(v.array(contentTextBinding)),
        imageBindings: v.optional(v.array(contentImageBinding)),
        designRevision: v.optional(v.number()), fingerprint: v.string(),
        approvedByUserId: v.id('users'), approvedRevision: v.number(), updatedAt: v.number(),
    }).index('by_branchId_and_path', ['branchId', 'path']),
};
