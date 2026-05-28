/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiUsageEvents from "../aiUsageEvents.js";
import type * as branchActions from "../branchActions.js";
import type * as branches from "../branches.js";
import type * as chatActions from "../chatActions.js";
import type * as clerkWebhooks from "../clerkWebhooks.js";
import type * as cmsActions from "../cmsActions.js";
import type * as cmsActionsInternal from "../cmsActionsInternal.js";
import type * as cmsBindings from "../cmsBindings.js";
import type * as cmsCollectionPages from "../cmsCollectionPages.js";
import type * as cmsCollections from "../cmsCollections.js";
import type * as cmsFields from "../cmsFields.js";
import type * as cmsItems from "../cmsItems.js";
import type * as cmsSources from "../cmsSources.js";
import type * as commentReplies from "../commentReplies.js";
import type * as comments from "../comments.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as deployments from "../deployments.js";
import type * as domainActions from "../domainActions.js";
import type * as domainActionsDb from "../domainActionsDb.js";
import type * as domains from "../domains.js";
import type * as figmaActions from "../figmaActions.js";
import type * as frames from "../frames.js";
import type * as githubActions from "../githubActions.js";
import type * as hostingConnectionActions from "../hostingConnectionActions.js";
import type * as hostingConnections from "../hostingConnections.js";
import type * as http from "../http.js";
import type * as internal_cascade from "../internal/cascade.js";
import type * as internal_cleanup from "../internal/cleanup.js";
import type * as layoutGuideStyles from "../layoutGuideStyles.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cmsAdapters from "../lib/cmsAdapters.js";
import type * as lib_cmsCredentials from "../lib/cmsCredentials.js";
import type * as lib_cmsRemoteRef from "../lib/cmsRemoteRef.js";
import type * as lib_cmsValueValidation from "../lib/cmsValueValidation.js";
import type * as lib_comments from "../lib/comments.js";
import type * as lib_enums from "../lib/enums.js";
import type * as lib_freestyle from "../lib/freestyle.js";
import type * as lib_hostingFactory from "../lib/hostingFactory.js";
import type * as lib_passwordHash from "../lib/passwordHash.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_personalWorkspace from "../lib/personalWorkspace.js";
import type * as lib_providerTokens from "../lib/providerTokens.js";
import type * as lib_publishHelpers from "../lib/publishHelpers.js";
import type * as lib_publishManager from "../lib/publishManager.js";
import type * as lib_sandboxErrors from "../lib/sandboxErrors.js";
import type * as lib_skillHelpers from "../lib/skillHelpers.js";
import type * as lib_skillImport from "../lib/skillImport.js";
import type * as lib_stripeWebhook from "../lib/stripeWebhook.js";
import type * as messages from "../messages.js";
import type * as pageAccess from "../pageAccess.js";
import type * as ping from "../ping.js";
import type * as presence from "../presence.js";
import type * as projectActions from "../projectActions.js";
import type * as projectCreateRequests from "../projectCreateRequests.js";
import type * as projectInvitationActions from "../projectInvitationActions.js";
import type * as projectInvitations from "../projectInvitations.js";
import type * as projectMembers from "../projectMembers.js";
import type * as projectOffline from "../projectOffline.js";
import type * as projectSettings from "../projectSettings.js";
import type * as projects from "../projects.js";
import type * as publishActions from "../publishActions.js";
import type * as publishActionsDb from "../publishActionsDb.js";
import type * as skillActions from "../skillActions.js";
import type * as skills from "../skills.js";
import type * as storage from "../storage.js";
import type * as storageActions from "../storageActions.js";
import type * as subscriptionActions from "../subscriptionActions.js";
import type * as subscriptions from "../subscriptions.js";
import type * as usage from "../usage.js";
import type * as userActions from "../userActions.js";
import type * as userActionsInternal from "../userActionsInternal.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiUsageEvents: typeof aiUsageEvents;
  branchActions: typeof branchActions;
  branches: typeof branches;
  chatActions: typeof chatActions;
  clerkWebhooks: typeof clerkWebhooks;
  cmsActions: typeof cmsActions;
  cmsActionsInternal: typeof cmsActionsInternal;
  cmsBindings: typeof cmsBindings;
  cmsCollectionPages: typeof cmsCollectionPages;
  cmsCollections: typeof cmsCollections;
  cmsFields: typeof cmsFields;
  cmsItems: typeof cmsItems;
  cmsSources: typeof cmsSources;
  commentReplies: typeof commentReplies;
  comments: typeof comments;
  conversations: typeof conversations;
  crons: typeof crons;
  deployments: typeof deployments;
  domainActions: typeof domainActions;
  domainActionsDb: typeof domainActionsDb;
  domains: typeof domains;
  figmaActions: typeof figmaActions;
  frames: typeof frames;
  githubActions: typeof githubActions;
  hostingConnectionActions: typeof hostingConnectionActions;
  hostingConnections: typeof hostingConnections;
  http: typeof http;
  "internal/cascade": typeof internal_cascade;
  "internal/cleanup": typeof internal_cleanup;
  layoutGuideStyles: typeof layoutGuideStyles;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/cmsAdapters": typeof lib_cmsAdapters;
  "lib/cmsCredentials": typeof lib_cmsCredentials;
  "lib/cmsRemoteRef": typeof lib_cmsRemoteRef;
  "lib/cmsValueValidation": typeof lib_cmsValueValidation;
  "lib/comments": typeof lib_comments;
  "lib/enums": typeof lib_enums;
  "lib/freestyle": typeof lib_freestyle;
  "lib/hostingFactory": typeof lib_hostingFactory;
  "lib/passwordHash": typeof lib_passwordHash;
  "lib/permissions": typeof lib_permissions;
  "lib/personalWorkspace": typeof lib_personalWorkspace;
  "lib/providerTokens": typeof lib_providerTokens;
  "lib/publishHelpers": typeof lib_publishHelpers;
  "lib/publishManager": typeof lib_publishManager;
  "lib/sandboxErrors": typeof lib_sandboxErrors;
  "lib/skillHelpers": typeof lib_skillHelpers;
  "lib/skillImport": typeof lib_skillImport;
  "lib/stripeWebhook": typeof lib_stripeWebhook;
  messages: typeof messages;
  pageAccess: typeof pageAccess;
  ping: typeof ping;
  presence: typeof presence;
  projectActions: typeof projectActions;
  projectCreateRequests: typeof projectCreateRequests;
  projectInvitationActions: typeof projectInvitationActions;
  projectInvitations: typeof projectInvitations;
  projectMembers: typeof projectMembers;
  projectOffline: typeof projectOffline;
  projectSettings: typeof projectSettings;
  projects: typeof projects;
  publishActions: typeof publishActions;
  publishActionsDb: typeof publishActionsDb;
  skillActions: typeof skillActions;
  skills: typeof skills;
  storage: typeof storage;
  storageActions: typeof storageActions;
  subscriptionActions: typeof subscriptionActions;
  subscriptions: typeof subscriptions;
  usage: typeof usage;
  userActions: typeof userActions;
  userActionsInternal: typeof userActionsInternal;
  users: typeof users;
  utils: typeof utils;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
