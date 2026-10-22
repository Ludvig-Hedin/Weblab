import { defineTable } from 'convex/server';
import { v, type Infer } from 'convex/values';
import { contentImageBinding } from './cloudEditorContentSchema';
import { cloudChange, cloudScope } from './lib/cloudEditor';
export const cloudImageTarget = { ...cloudScope, actorId: v.id('users'), path: v.string(), oid: v.string(), expectedRevision: v.number(), generation: v.number() };
export const cloudImagePin = v.object({ attemptId: v.id('cloudEditorContentImageAttempts'), path: v.string(), oid: v.string(), generation: v.number(), assetPath: v.string() });
export const cloudImageV2Pin = v.object({ version: v.literal(2), path: v.string(), generation: v.number(),
    designRevision: v.number(), fingerprint: v.string(), binding: contentImageBinding });
export const cloudImageValue = v.object({ src: v.string(), alt: v.string() });
export const cloudImageV2Operation = {
    ...cloudScope, actorId: v.id('users'), expectedRevision: v.number(), operationId: v.string(),
    transport: v.literal('content-image'), transportVersion: v.literal(2), pin: cloudImageV2Pin,
    previous: cloudImageValue, changes: v.array(cloudChange),
    image: v.union(v.object({ kind: v.literal('values') }), v.object({ kind: v.literal('upload'), attemptId: v.id('cloudEditorContentImageAttempts') })),
};
export const cloudImageSelection = v.object({ oid: v.string(), mappingId: v.string(), itemId: v.literal('single') });
export const cloudImageInspection = v.object({ path: v.string(), hash: v.string(), bytes: v.number(), width: v.number(), height: v.number(), proof: v.string() });
export type CloudImageV2Pin = Infer<typeof cloudImageV2Pin>;
const attemptLifecycle = { operationId: v.string(), createdAt: v.number(), expiresAt: v.number(),
    status: v.union(v.literal('open'), v.literal('ready'), v.literal('committed'), v.literal('closed')),
    storageId: v.optional(v.id('_storage')), hash: v.optional(v.string()), bytes: v.optional(v.number()), assetPath: v.optional(v.string()) };
/** Ownership is not editing permission; these validators never extend an approval. */
export const importedMediaAsset = v.object({
    path: v.string(), storageId: v.id('_storage'), hash: v.string(), bytes: v.number(),
    mime: v.literal('image/webp'), width: v.number(), height: v.number(),
});
export const importedImageApproval = v.object({
    ownerPath: v.string(), bindingId: v.string(), generation: v.number(),
    designRevision: v.number(), fingerprint: v.string(),
});
export const importedMediaOrigin = v.union(
    v.object({ version: v.literal(1), kind: v.literal('upload'), actorId: v.id('users'),
        attemptId: v.id('cloudEditorContentImageAttempts'), operationId: v.string(),
        approval: importedImageApproval, sourceRevision: v.number() }),
    v.object({ version: v.literal(1), kind: v.literal('restore'), backupId: v.id('cloudReleases'),
        frozenProvenanceHash: v.string(), sourceRevision: v.number() }),
);
export const importedMediaProvenance = v.object({ version: v.literal(1), asset: importedMediaAsset, origin: importedMediaOrigin });
export type ImportedMediaAsset = Infer<typeof importedMediaAsset>;
export type ImportedImageApproval = Infer<typeof importedImageApproval>;
export type ImportedMediaProvenance = Infer<typeof importedMediaProvenance>;
export const cloudEditorContentImageTables = {
    cloudEditorImportedMedia: defineTable({ ...cloudScope, ...importedMediaProvenance.fields })
        .index('by_branchId', ['branchId']).index('by_branchId_and_path', ['branchId', 'asset.path']),
    cloudEditorImportedImageAdmissions: defineTable({
        ...cloudScope, approval: importedImageApproval, approvalIdentity: v.string(), asset: importedMediaAsset,
        actorId: v.id('users'), attemptId: v.id('cloudEditorContentImageAttempts'), operationId: v.string(), sourceRevision: v.number(),
    }).index('by_branchId', ['branchId'])
        .index('by_branchId_and_approvalIdentity', ['branchId', 'approvalIdentity']),
    cloudEditorContentImageAttempts: defineTable(v.union(
        v.object({ ...cloudImageTarget, ...attemptLifecycle }),
        v.object({ ...cloudScope, actorId: v.id('users'), path: v.string(), expectedRevision: v.number(),
            version: v.literal(2), pin: cloudImageV2Pin, ...attemptLifecycle,
            width: v.optional(v.number()), height: v.optional(v.number()) }),
    )).index('by_projectId_and_createdAt', ['projectId', 'createdAt']).index('by_expiresAt', ['expiresAt'])
        .index('by_branchId_and_operationId', ['branchId', 'operationId']),
};
