import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import type * as Imports from '@convex/cloudEditorImports';

type API = ApiFromModules<{ imports: typeof Imports }>['imports'];
export const cloudImportApi = {
    access: makeFunctionReference<'query', FunctionArgs<API['access']>, FunctionReturnType<API['access']>>('cloudEditorImports:access'),
    begin: makeFunctionReference<'mutation', FunctionArgs<API['begin']>, FunctionReturnType<API['begin']>>('cloudEditorImports:begin'),
    findAttempt: makeFunctionReference<'query', FunctionArgs<API['findAttempt']>, FunctionReturnType<API['findAttempt']>>('cloudEditorImports:findAttempt'),
    status: makeFunctionReference<'query', FunctionArgs<API['status']>, FunctionReturnType<API['status']>>('cloudEditorImports:status'),
    finalize: makeFunctionReference<'mutation', FunctionArgs<API['finalize']>, FunctionReturnType<API['finalize']>>('cloudEditorImports:finalize'),
    cancel: makeFunctionReference<'mutation', FunctionArgs<API['cancel']>, FunctionReturnType<API['cancel']>>('cloudEditorImports:cancel'),
};
export type ImportAccess = FunctionReturnType<typeof cloudImportApi.access>;
export type ImportStatus = FunctionReturnType<typeof cloudImportApi.status>;
