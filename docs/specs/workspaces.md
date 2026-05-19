

# Weblab Workspaces — Product & Technical Specification
## 1. Goal
Add a complete Workspace system to Weblab, similar to Framer/Webflow, while preserving existing project-level invites.
The feature should let users organize projects into workspaces, invite people to either a whole workspace or a single project, control project visibility, and enforce access safely across dashboard, editor, API, AI tools, and settings.
## 2. Product Principles
Workspaces must make collaboration easier, not create permission soup.
Core principles:
- A workspace is the main team/client/company container.
- A project/site belongs to one workspace.
- A user can belong to multiple workspaces.
- A user can be invited to an entire workspace or only one project.
- Workspace access and project access are separate concepts.
- Permissions must be enforced server-side.
- UI must clearly explain what a user gets access to before sending invites.
- Billing/seat complexity must not be added in the MVP.
## 3. Mental Model
Weblab should use a hybrid model:
- **Framer-like UX**
  - Clear workspace selector.
  - Workspace members vs project members.
  - Simple dashboard switching.
- **Webflow-like access model**
  - Workspace roles are separate from project/site roles.
  - Projects can be visible to the whole workspace or restricted to selected people.
## 4. Core Entities
### User
A person with an account.
A user can:
- own workspaces
- belong to workspaces
- belong directly to projects
- receive workspace invites
- receive project invites
### Workspace
A workspace is a container for projects.
Examples:
- Personal workspace
- Agency workspace
- Client workspace
- Company workspace
Fields should include:
- `id`
- `name`
- `slug`
- `avatar_url` optional
- `created_by_user_id`
- `created_at`
- `updated_at`
### WorkspaceMember
Connects a user to a workspace.
Fields:
- `id`
- `workspace_id`
- `user_id`
- `role`
- `created_at`
- `updated_at`
Roles:
- `owner`
- `admin`
- `member`
- `viewer`
### WorkspaceInvite
An invite to join a workspace.
Fields:
- `id`
- `workspace_id`
- `email`
- `role`
- `token`
- `status`
- `invited_by_user_id`
- `expires_at`
- `accepted_at`
- `revoked_at`
- `created_at`
- `updated_at`
Statuses:
- `pending`
- `accepted`
- `revoked`
- `expired`
### Project / Site
Existing Weblab project/site.
New fields:
- `workspace_id`
- `access_mode`
Access modes:
- `workspace`
- `restricted`
### ProjectMember
Connects a user directly to one project.
Used for clients, freelancers, contractors, reviewers, or project-only collaborators.
Fields:
- `id`
- `project_id`
- `user_id`
- `role`
- `created_at`
- `updated_at`
Roles:
- `manager`
- `editor`
- `reviewer`
- `viewer`
### ProjectInvite
An invite to a single project only.
Fields:
- `id`
- `project_id`
- `email`
- `role`
- `token`
- `status`
- `invited_by_user_id`
- `expires_at`
- `accepted_at`
- `revoked_at`
- `created_at`
- `updated_at`
Statuses:
- `pending`
- `accepted`
- `revoked`
- `expired`
### AuditLog
Tracks important permission/access events.
MVP can include this if simple. Otherwise defer, but design should not block it.
Events:
- workspace created
- workspace renamed
- workspace member invited
- workspace invite accepted
- workspace invite revoked
- workspace member role changed
- workspace member removed
- project access mode changed
- project member invited
- project invite accepted
- project invite revoked
- project member role changed
- project member removed
## 5. Workspace Types
### Personal Workspace
Every user gets one default personal workspace.
Behavior:
- Created automatically for new users.
- Existing users get one during migration.
- Existing projects move into the owner’s personal workspace.
- Usually named something like “Ludvig’s Workspace” or “Personal”.
- User is `owner`.
### Team Workspace
Created manually by a user.
Behavior:
- Creator becomes `owner`.
- Can invite workspace members.
- Can contain many projects.
- Can later support billing, team plans, and organization-level features.
## 6. Project Access Modes
Every project has an access mode.
### `workspace`
The project is visible to workspace members with enough permission.
Use for:
- internal team projects
- shared agency/client workspace projects
- collaborative projects
Access:
- workspace owners/admins can manage
- workspace members can access based on role/permissions
- direct project members can access based on project role
### `restricted`
The project is hidden from normal workspace members.
Use for:
- private client projects
- sensitive projects
- projects with external contractors
- projects only selected people should see
Access:
- workspace owners/admins retain recovery access
- direct project members can access based on project role
- normal workspace members cannot see it unless explicitly added
## 7. Roles
### Workspace Roles
#### Owner
Can:
- view workspace
- update workspace
- delete/transfer workspace if supported
- manage members
- manage invites
- create projects
- view all projects in workspace
- manage project access
- recover restricted projects
- manage billing later
Cannot:
- remove/downgrade themselves if they are the last owner
#### Admin
Can:
- view workspace
- update workspace
- invite members
- manage members below owner level
- create projects
- view/manage workspace projects depending on permissions
- manage project access
Cannot:
- remove owner
- transfer ownership
- delete workspace unless explicitly allowed
- manage billing unless later enabled
#### Member
Can:
- view workspace
- create projects if allowed
- access workspace-visible projects
- collaborate based on project permissions
Cannot:
- manage workspace settings
- manage members
- invite workspace members unless explicitly allowed
- see restricted projects unless added directly
#### Viewer
Can:
- view workspace
- view workspace-visible projects if project role/access allows
Cannot:
- create projects
- edit projects
- manage workspace
- invite users
### Project Roles
#### Manager
Can:
- view project
- edit project
- manage project settings
- invite project members
- change project access mode
- publish/deploy/export if allowed
- use AI tools if allowed
#### Editor
Can:
- view project
- edit project
- use AI tools if allowed
Cannot:
- manage project access
- invite members unless explicitly allowed
- delete project
#### Reviewer
Can:
- view project
- comment/review if comments exist
- inspect project if product supports it
Cannot:
- edit project
- publish
- invite users
- manage settings
#### Viewer
Can:
- view project
Cannot:
- edit
- comment unless viewer comments are supported
- publish
- invite
- manage settings
## 8. Permission System
Do not check raw roles across random files.
Bad:
```ts
if (role === "admin") {
  // allow
}

Good:

can(user, "project.update", project)
can(user, "workspace.manage_members", workspace)

Permission strings:

workspace.view
workspace.update
workspace.delete
workspace.invite
workspace.manage_members
workspace.manage_billing
project.create
project.view
project.update
project.delete
project.invite
project.publish
project.manage_settings
project.use_ai
project.export
project.deploy
project.comment

Role-to-permission mapping must live in one central module.

9. Access Rules

Workspace Visibility

A user can see a workspace if:

* they are a workspace_member

Project-only members do not count as workspace members.

Project Visibility

A user can see a project if:

* they are workspace owner or admin for the project’s workspace
* OR project access_mode = "workspace" and they are a workspace member with relevant access
* OR they are a direct project_member
* OR they accepted a valid project invite

Project Editing

A user can edit a project if:

* they have project.update

This may come from:

* project role
* workspace role mapped to project permissions
* owner/admin recovery rules

Settings Access

Workspace settings require:

* workspace.view to open basic settings
* workspace.update to edit general settings
* workspace.manage_members to manage members
* workspace.invite to invite workspace members

Project settings require:

* project.manage_settings

AI Tool Access

AI tools that read or modify a project must use the same permission system.

Examples:

* AI reading project files requires project.view
* AI editing project files requires project.update
* AI publishing/deploying requires project.publish or project.deploy
* AI using project context requires project.use_ai

No AI tool may bypass project permissions.

10. Dashboard Behavior

Workspace Selector

The projects dashboard must include a workspace selector.

Selector shows:

* current workspace name/avatar
* list of accessible workspaces
* create workspace action
* workspace settings link if allowed

Behavior:

* selected workspace filters projects
* selected workspace should be reflected in URL or stable local state
* invalid/stale workspace should gracefully fallback
* user should never see projects from inaccessible workspaces

Recommended routes:

/dashboard?workspace=workspaceId

or:

/workspaces/[workspaceId]/projects

The implementation should choose whichever best matches the current Weblab route structure.

Project List

Dashboard shows only projects accessible inside the selected workspace.

Project card should show:

* project name
* last updated
* access mode badge:
    * Workspace-visible
    * Restricted
* current user role/access
* shared/member indicator if available

Empty States

No Workspaces

If user has no workspace due to bad/missing data:

* show recovery state
* offer to create personal workspace
* do not crash

Empty Workspace

If workspace has no projects:

* show “Create project”
* show optional “Import project”
* explain that projects created here belong to this workspace

No Access

If project-only user has no full workspace access:

* show only their accessible project(s)
* do not expose workspace settings/member list

11. Workspace Creation

User can create a workspace from:

* workspace selector
* dashboard empty state
* future onboarding

Required fields:

* workspace name

Optional:

* slug
* avatar

After creation:

* creator becomes owner
* workspace becomes active
* dashboard shows empty project state

12. Workspace Settings

Settings sections:

General
Members
Invites
Project access
Billing

General

User can:

* view name
* rename workspace if permitted
* update slug/avatar if supported

Delete workspace:

* defer if unsafe
* if implemented, must handle projects safely
* never orphan projects
* require confirmation

Members

Show:

* name/email
* role
* joined date if available
* actions

Actions:

* change role
* remove member
* transfer ownership if supported

Rules:

* only users with workspace.manage_members can edit
* last owner cannot be removed
* last owner cannot downgrade themselves
* admins cannot remove owners
* users cannot grant roles above their authority
* project-only members should not appear as workspace members unless shown in a separate “Project-only access” section

Invites

Show:

* pending workspace invites
* email
* role
* invited by
* expiry
* resend if email infra exists
* revoke

Project Access

Show projects in workspace:

* project name
* access mode
* people with direct access count
* last updated

Can link into project access settings.

Billing

MVP placeholder only.

Should say:

* billing is not implemented yet
* no seat logic
* no fake pricing
* no permission decisions based on billing yet

13. Workspace Invite Flow

Workspace invite adds someone to the whole workspace.

Invite modal must clearly say:

Invite to workspace:
Acme Studio
This person will become a workspace member.
They may access workspace-visible projects based on their role.

Fields:

* email
* role
* optional message if supported

Role options:

* Admin
* Member
* Viewer

Validation:

* valid email
* cannot invite existing workspace member
* prevent duplicate pending invite
* cannot invite with higher role than allowed
* token must be secure
* invite expires

Accept behavior:

* if logged out, user signs in/signs up first
* invite token is preserved
* if email matches account, accept
* if email does not match account, block or require confirmation according to app policy
* accepted user becomes workspace member
* invite status becomes accepted

Revoked/expired:

* cannot be accepted
* should show clear error

Email infra:

* if available, send email
* if not available, provide copy-link fallback clearly marked

14. Project-only Invite Flow

Project invite adds someone to one project only.

Invite modal must clearly say:

Invite to project only:
Landing Page Redesign
This person will only access this project.
They will not become a workspace member.
They will not see other workspace projects.

Fields:

* email
* project role

Role options:

* Manager
* Editor
* Reviewer
* Viewer

Validation:

* valid email
* cannot duplicate pending invite
* cannot invite existing project member
* workspace owners/admins retain recovery access
* token must be secure
* invite expires

Accept behavior:

* if logged out, sign in/sign up first
* if email matches account, accept
* user becomes project member
* user does not become workspace member
* user sees only that project unless they have other access

15. Project Access Settings

Every project should have an access settings page/panel.

Sections:

* Access mode
* People with access
* Pending invites

Access Mode Toggle

Options:

Everyone in workspace can access
Restricted to selected people

Changing from workspace to restricted:

* normal workspace members may lose access
* UI must warn clearly
* owners/admins retain access
* direct project members retain access

Changing from restricted to workspace:

* workspace members may gain access
* UI must warn clearly

People With Access

Show:

* workspace owners/admins with inherited access
* direct project members
* project-only users
* pending project invites

Each person should show:

* name/email
* access source:
    * workspace role
    * project role
    * pending invite
* role
* actions if permitted

16. Editor Behavior

When opening a project:

* app checks project.view
* if denied, show access denied or redirect
* project data must not load before permission passes

If user can view but not edit:

* editor opens in read-only/review mode if supported
* otherwise show clear “viewer access only” state
* API must reject edit attempts even if UI hides controls

If user loses access while inside editor:

* next API request should fail safely
* UI should show “You no longer have access”
* do not crash
* do not leak further project data

17. API/tRPC/Server Behavior

Every project/workspace endpoint must use permission helpers.

Protected actions:

* list workspaces
* get workspace
* update workspace
* delete workspace
* list members
* invite member
* update member role
* remove member
* list projects
* get project
* update project
* delete project
* publish/deploy/export
* use AI on project
* update files/code
* update project settings
* invite project member
* change project access mode

Rules:

* never trust workspaceId or projectId from client
* never leak project names from inaccessible workspaces
* never return restricted projects to unauthorized workspace members
* project-only users cannot query workspace member lists
* removed users lose access server-side

18. Migration Behavior

Existing data must migrate safely.

Rules:

* create personal workspace for every existing user
* attach every existing project to owner’s personal workspace
* preserve existing project owner access
* preserve existing project invites as project-level invites/members
* default existing projects to restricted if uncertain
* no project should become visible to a wider group because of migration
* project without workspace should be invalid after migration

Legacy compatibility:

* if some old project ownership fields remain, permission helpers may temporarily account for them
* long-term source of truth should be workspace/project membership

19. Edge Cases

Must handle:

* user belongs to zero workspaces
* user belongs to many workspaces
* user has only project-only access
* project has no workspace due to legacy data
* workspace owner leaves
* last owner tries to remove themselves
* last owner tries to downgrade themselves
* workspace deleted while projects exist
* project moved between workspaces
* invite sent to existing user
* invite sent to new email
* invite accepted after signup
* invite accepted by wrong email
* duplicate invite
* expired invite
* revoked invite
* already accepted invite
* role changed while user is active
* user removed while inside editor
* project switched from workspace-visible to restricted
* direct URL access
* direct API access
* AI tool access
* public/share links if they exist
* personal workspace vs team workspace
* project-only member tries to access workspace settings
* workspace member tries to access restricted project

20. Notifications & Feedback

MVP should show clear toast/message feedback for:

* workspace created
* workspace renamed
* member invited
* invite copied
* invite revoked
* invite accepted
* role changed
* member removed
* project access changed
* project member invited
* project invite accepted
* permission denied
* access lost

Do not silently fail.

21. UX Copy Requirements

Avoid vague labels.

Bad:

* “Invite user”
* “Access”
* “Member”

Better:

* “Invite to workspace”
* “Invite to this project only”
* “Everyone in workspace can access”
* “Restricted to selected people”
* “This person will not see other projects”
* “You are changing access for all workspace members”

The invite modal must always include an access summary.

22. Non-goals For MVP

Do not build:

* custom roles
* organizations
* workspace folders
* nested teams
* department/group permissions
* billing seats
* enterprise SSO/SCIM
* audit log UI unless easy
* granular feature-by-feature role builder
* advanced ownership transfer UX unless needed
* project moving between workspaces unless simple and safe

These can come later.

23. Acceptance Criteria

The feature is complete when:

Workspace Basics

* new users get personal workspace
* existing users are migrated safely
* users can create team workspaces
* users can switch workspaces
* dashboard filters projects by workspace
* invalid workspace selection does not crash

Workspace Settings

* authorized users can view settings
* authorized users can rename workspace
* authorized users can manage members
* unauthorized users cannot access settings by URL/API
* last owner protection works

Workspace Invites

* workspace invite creates pending invite
* invite can be accepted
* invite can be revoked
* duplicate invites are blocked
* existing members cannot be invited again
* expired/revoked invites cannot be accepted

Project Access

* every project belongs to one workspace
* project access mode works
* restricted projects are hidden from normal workspace members
* workspace owners/admins retain access
* project-only members can access invited project
* project-only members cannot see other projects/settings

Enforcement

* server-side permission checks exist
* direct URL access is blocked
* direct API access is blocked
* editor respects view/edit permissions
* AI tools respect project permissions
* removed users lose access

Quality

* no broad hardcoded role checks
* central permission helper exists
* typecheck passes
* core tests pass
* no known project leakage
* no fake billing/seat logic