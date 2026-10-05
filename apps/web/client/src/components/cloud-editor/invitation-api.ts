import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { useLocale } from 'next-intl';
import type * as Actions from '@convex/cloudEditorInvitationActions';
import type * as Backend from '@convex/cloudEditorInvitations';
import en from '../../../messages/cloud-invitations/en.json';
import sv from '../../../messages/cloud-invitations/sv.json';

type A = ApiFromModules<{ a: typeof Actions }>['a'];
type B = ApiFromModules<{ b: typeof Backend }>['b'];
export const invitationApi = {
    create: makeFunctionReference<'action', FunctionArgs<A['create']>, FunctionReturnType<A['create']>>('cloudEditorInvitationActions:create'),
    claim: makeFunctionReference<'action', FunctionArgs<A['claim']>, FunctionReturnType<A['claim']>>('cloudEditorInvitationActions:claim'),
    list: makeFunctionReference<'query', FunctionArgs<B['list']>, FunctionReturnType<B['list']>>('cloudEditorInvitations:list'),
    revoke: makeFunctionReference<'mutation', FunctionArgs<B['revoke']>, FunctionReturnType<B['revoke']>>('cloudEditorInvitations:revoke'),
};
export const useCloudInvitationCopy = (): typeof en => useLocale().startsWith('sv') ? sv : en;
