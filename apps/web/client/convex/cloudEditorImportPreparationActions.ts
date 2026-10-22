'use node';

import { createHash } from 'node:crypto';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { action } from './_generated/server';
import type * as Preparation from './cloudEditorImportPreparation';
import { cloudScope } from './lib/cloudEditor';
import { loadCloudRuntimeAssets } from './lib/cloudRuntimeAssets';
import { prepareImportedNextConfig, prepareImportedNextDeclarations } from './lib/cloudImportedNextConfig';
import { validateImportedNextProfile } from './lib/cloudImportedNextProfile';
import { planNextProjectPreparation } from '@weblab/parser/src/project-preparation';

type API = ApiFromModules<{ preparation: typeof Preparation }>['preparation'];
const inputRef = makeFunctionReference<'query', FunctionArgs<API['_input']>, FunctionReturnType<API['_input']>>('cloudEditorImportPreparation:_input');
const commitRef = makeFunctionReference<'mutation', FunctionArgs<API['_commit']>, FunctionReturnType<API['_commit']>>('cloudEditorImportPreparation:_commit');
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Prepare the saved copy. This never creates a runtime or changes its allowance. */
export const prepare = action({
    args: { ...cloudScope, expectedRevision: v.number(), operationKey: v.string() },
    handler: async (ctx, args) => {
        const input = await ctx.runQuery(inputRef, args);
        if ('receipt' in input && input.receipt) return input.receipt;
        if (!input.files || !input.actorId || !input.inputManifestHash) throw new Error('CLOUD_IMPORT_PREPARATION_REQUIRED');
        const textFiles = input.files.flatMap(file => file.text === undefined ? [] : [{ path: file.path, text: file.text }]);
        const layouts = textFiles.filter(file => /^(?:src\/)?app\/layout\.[jt]sx?$/.test(file.path));
        const configs = textFiles.filter(file => /^(?:next\.config\.[cm]?[jt]s)$/.test(file.path));
        if (layouts.length !== 1 || configs.length !== 1) throw new Error('CLOUD_IMPORT_CONFIG_UNSUPPORTED');
        const bundles = await loadCloudRuntimeAssets(process.env.WEBLAB_EDITOR_ORIGIN);
        const plan = await planNextProjectPreparation({ files: textFiles, layoutPath: layouts[0]!.path,
            assets: bundles.map(file => ({ path: file.path, text: file.content })) });
        const config = configs[0]!;
        const configText = await prepareImportedNextConfig(config.text);
        if (configText !== config.text) plan.files.push({ path: config.path, original: config.text, updated: configText, addedOids: [], bootstrapChanges: true });
        const declarations = textFiles.find(file => file.path === 'next-env.d.ts');
        if (!declarations) throw new Error('CLOUD_IMPORT_DECLARATIONS_UNSUPPORTED');
        const declarationText = prepareImportedNextDeclarations(declarations.text);
        if (declarationText !== declarations.text) plan.files.push({ path: declarations.path, original: declarations.text,
            updated: declarationText, addedOids: [], bootstrapChanges: false });
        const originals = new Map(input.files.map(file => [file.path, file]));
        const changes = plan.files.map(file => ({ path: file.path, originalHash: originals.get(file.path)?.hash ?? null,
            text: file.updated, hash: hash(file.updated), bytes: Buffer.byteLength(file.updated, 'utf8') }));
        const prepared = new Map(input.files.map(file => [file.path, { path: file.path, kind: file.kind, text: file.text,
            storageId: file.storageId, hash: file.hash, bytes: file.bytes }]));
        for (const change of changes) prepared.set(change.path, { path: change.path, kind: 'file', text: change.text,
            storageId: undefined, hash: change.hash, bytes: change.bytes });
        const policy = validateImportedNextProfile([...prepared.values()]);
        const instrumentation = plan.files.map(file => ({ path: file.path, beforeHash: originals.get(file.path)?.hash ?? null,
            afterHash: hash(file.updated), addedOids: file.addedOids, bootstrapChanges: file.bootstrapChanges }));
        return ctx.runMutation(commitRef, { ...args, actorId: input.actorId, inputManifestHash: input.inputManifestHash,
            changes, policy, instrumentation });
    },
});
