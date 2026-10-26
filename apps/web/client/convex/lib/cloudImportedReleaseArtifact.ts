'use node';

import {
    DEPRECATED_IX_RUNTIME_SRCS, DEPRECATED_PRELOAD_SCRIPT_SRCS,
    WEBLAB_DEV_IX_RUNTIME_SRC, WEBLAB_DEV_PRELOAD_SCRIPT_SRC,
    WEBLAB_IX_RUNTIME_SRC, WEBLAB_PRELOAD_SCRIPT_SRC,
} from '@weblab/constants';
import { parse, t, traverse } from '@weblab/parser/src/packages';
import type { ImportedReleaseMetadata } from '../cloudReleasesSchema';
import { manifestHash, sha256 } from './cloudReleaseArtifact';
import { IMPORTED_PUBLICATION_INTENT, type ImportedArtifactPurpose, importedArtifactProfile, importedDerivationVersion, type ImportedPrivateDerivation, type ImportedSnapshotFile, deriveImportedPrivateFiles, importedInventoryHash, snapshotCanonicalJson, validateImportedReleaseSnapshot, validateSnapshotStage } from './cloudImportedRelease';
import { assertImportedNextPins, IMPORTED_BUN_ARCHIVE_SHA256, type ImportedNextFile } from './cloudImportedNextProfile';
import { assertImportedStudioSource, assertNoImportedStudioRuntimeReferences } from './cloudImportedStudio';

type Purpose = ImportedArtifactPurpose;
const RUNTIME_SOURCES = new Set([WEBLAB_DEV_PRELOAD_SCRIPT_SRC, WEBLAB_DEV_IX_RUNTIME_SRC,
    WEBLAB_PRELOAD_SCRIPT_SRC, WEBLAB_IX_RUNTIME_SRC, ...DEPRECATED_PRELOAD_SCRIPT_SRCS, ...DEPRECATED_IX_RUNTIME_SRCS]);
function invalid(): never { throw new Error('CLOUD_IMPORTED_ARTIFACT_INVALID'); }

/** Restoring a baseline layout must not reintroduce an older editor bridge. */
function assertNoOriginalBootstrap(text: string): void {
    try {
        const ast = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
        traverse(ast, {
            JSXOpeningElement(path) {
                for (const attribute of path.node.attributes) {
                    if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) continue;
                    const value = t.isStringLiteral(attribute.value) ? attribute.value.value
                        : t.isJSXExpressionContainer(attribute.value) && t.isStringLiteral(attribute.value.expression)
                            ? attribute.value.expression.value : null;
                    if ((attribute.name.name === 'src' && value !== null && RUNTIME_SOURCES.has(value)) ||
                        (attribute.name.name === 'id' && (value === 'weblab-preload-script' || value === 'weblab-ix-runtime'))) invalid();
                }
            },
        });
    } catch { invalid(); }
}

/** Pure inventory derivation only. Binary contents must be verified by the caller before sealing. */
export async function prepareImportedReleaseArtifact(input: {
    purpose: Purpose; publicationIntent?: typeof IMPORTED_PUBLICATION_INTENT; source: ImportedSnapshotFile[]; original: ImportedSnapshotFile[]; metadata: ImportedReleaseMetadata;
}): Promise<{ sourceHash: string; originalHash: string; hash: string; artifactJson: string; files: ImportedNextFile[] }> {
    const publicArtifact = input.purpose === 'release';
    if (!['backup', 'private-artifact', 'release'].includes(input.purpose) ||
        (publicArtifact ? input.publicationIntent !== IMPORTED_PUBLICATION_INTENT : input.publicationIntent !== undefined)) invalid();
    await validateImportedReleaseSnapshot(input);
    const policy = input.metadata.preparation.policy;
    if (policy.bunArchiveSha256 !== IMPORTED_BUN_ARCHIVE_SHA256) throw new Error('CLOUD_IMPORT_RUNTIME_PINS_CHANGED');
    assertImportedNextPins(input.source, { ...policy, bunArchiveSha256: IMPORTED_BUN_ARCHIVE_SHA256 });
    if (input.metadata.studioConfig !== undefined) {
        assertImportedStudioSource({ files: input.source, originalPaths: input.original.map(file => file.path), runtimePins: policy.pinnedFiles });
    }
    const sourceHash = manifestHash(input.source);
    const originalHash = await importedInventoryHash(input.original);
    if (input.purpose !== 'backup') {
        const layouts = input.original.filter(file => /^(?:src\/)?app\/layout\.tsx$/.test(file.path));
        if (layouts.length !== 1 || layouts[0]!.text === undefined) invalid();
        assertNoOriginalBootstrap(layouts[0]!.text);
    }
    const derived = input.purpose !== 'backup'
        ? deriveImportedPrivateFiles(input.source, input.original, input.metadata)
        : { files: [] as ImportedNextFile[], derivation: [] as ImportedPrivateDerivation[] };
    if (input.purpose !== 'backup') {
        await validateSnapshotStage(derived.files, 'deploy');
        if (input.metadata.studioConfig !== undefined) assertNoImportedStudioRuntimeReferences(derived.files);
    }
    const artifactJson = snapshotCanonicalJson({
        version: input.metadata.version, artifactProfile: importedArtifactProfile(input.metadata, input.purpose), purpose: input.purpose, publicEligible: publicArtifact,
        ...(publicArtifact ? { publicationIntent: IMPORTED_PUBLICATION_INTENT } : {}),
        derivationVersion: importedDerivationVersion(input.metadata), sourceHash, originalHash,
        deployHash: input.purpose !== 'backup' ? manifestHash(derived.files) : null,
        metadata: input.metadata, derivation: derived.derivation,
    });
    return { sourceHash, originalHash, hash: sha256(artifactJson), artifactJson, files: derived.files };
}
