import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import type * as Entry from '@convex/cloudEditorEntry';

type Backend = ApiFromModules<{ entry: typeof Entry }>['entry'];
export const cloudEditorEntryApi = {
    entry: makeFunctionReference<'query', FunctionArgs<Backend['entry']>, FunctionReturnType<Backend['entry']>>('cloudEditorEntry:entry'),
    upsertCanvasView: makeFunctionReference<'mutation', FunctionArgs<Backend['upsertCanvasView']>, FunctionReturnType<Backend['upsertCanvasView']>>('cloudEditorEntry:upsertCanvasView'),
};
