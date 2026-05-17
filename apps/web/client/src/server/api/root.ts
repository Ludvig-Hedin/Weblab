import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    chatRouter,
    cmsRouter,
    commentRouter,
    domainRouter,
    editorForwardRouter,
    figmaRouter,
    frameRouter,
    githubRouter,
    hostingConnectionRouter,
    invitationRouter,
    memberRouter,
    pageAccessRouter,
    projectRouter,
    providerRouter,
    publishRouter,
    sandboxRouter,
    settingsRouter,
    skillsRouter,
    subscriptionRouter,
    usageRouter,
    userCanvasRouter,
    userRouter,
    utilsRouter,
    workspaceInvitationRouter,
    workspaceMemberRouter,
    workspaceRouter,
} from './routers';
import { branchRouter } from './routers/project/branch';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
    sandbox: sandboxRouter,
    user: userRouter,
    invitation: invitationRouter,
    project: projectRouter,
    provider: providerRouter,
    branch: branchRouter,
    settings: settingsRouter,
    chat: chatRouter,
    cms: cmsRouter,
    comment: commentRouter,
    figma: figmaRouter,
    frame: frameRouter,
    userCanvas: userCanvasRouter,
    utils: utilsRouter,
    member: memberRouter,
    domain: domainRouter,
    github: githubRouter,
    hostingConnection: hostingConnectionRouter,
    pageAccess: pageAccessRouter,
    subscription: subscriptionRouter,
    usage: usageRouter,
    publish: publishRouter,
    forward: editorForwardRouter,
    skills: skillsRouter,
    workspace: workspaceRouter,
    workspaceMember: workspaceMemberRouter,
    workspaceInvitation: workspaceInvitationRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
