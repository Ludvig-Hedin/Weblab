'use node';

import { createHash, randomBytes } from 'node:crypto';
import { createClerkClient } from '@clerk/backend';
import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { action } from './_generated/server';
import type * as Backend from './cloudEditorInvitations';
import { cloudEditorRole } from './cloudEditorAccessSchema';
import { cloudError, cloudScope } from './lib/cloudEditor';

type Api = ApiFromModules<{ invitations: typeof Backend }>['invitations'];
const createRef = makeFunctionReference<'mutation', FunctionArgs<Api['_create']>, FunctionReturnType<Api['_create']>>('cloudEditorInvitations:_create');
const claimRef = makeFunctionReference<'mutation', FunctionArgs<Api['_claim']>, FunctionReturnType<Api['_claim']>>('cloudEditorInvitations:_claim');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export const create = action({
    args: { ...cloudScope, email: v.string(), role: cloudEditorRole, publish: v.boolean() },
    handler: async (ctx, args): Promise<{ invitationId: FunctionReturnType<Api['_create']>; token: string }> => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return cloudError('UNAUTHORIZED');
        const token = randomBytes(32).toString('hex');
        const invitationId = await ctx.runMutation(createRef, { ...args, subject: identity.subject, tokenHash: hash(token) });
        return { invitationId, token };
    },
});

export const claim = action({
    args: { invitationId: v.id('cloudEditorInvitations'), token: v.string() },
    handler: async (ctx, args): Promise<FunctionReturnType<Api['_claim']>> => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return cloudError('UNAUTHORIZED');
        if (!/^[a-f0-9]{64}$/.test(args.token)) return cloudError('CLOUD_INVITATION_UNAVAILABLE');
        const secretKey = process.env.CLERK_SECRET_KEY;
        if (!secretKey) return cloudError('CLOUD_INVITATION_AUTH_UNAVAILABLE');
        // Use current verified addresses, never a user-editable profile email or caller argument.
        const user = await createClerkClient({ secretKey }).users.getUser(identity.subject);
        if (user.id !== identity.subject || user.banned || user.locked) return cloudError('CLOUD_INVITATION_UNAVAILABLE');
        const verifiedEmails = user.emailAddresses.filter(address => address.verification?.status === 'verified').map(address => address.emailAddress);
        return ctx.runMutation(claimRef, { invitationId: args.invitationId, tokenHash: hash(args.token),
            subject: identity.subject, verifiedEmails, verifiedAt: Date.now() });
    },
});
