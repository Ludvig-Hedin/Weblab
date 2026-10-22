# Cloud Build mode implementation plan

Status: internally reviewed implementation plan under the existing authorization, 2026-10-02. Continue through bounded implementation and independent verification; no additional owner approval flow is introduced.

## Outcome and scope

Customers edit the actual site on the existing Weblab canvas. The agency decides which text, images, links, property choices, templates and insertion slots each customer can use. Customers do not receive arbitrary source or design-write permission. Publishing remains a separate grant.

The first complete slice is approved text: designer approval, assigned customer access, canvas editing, durable save, reload, recovery and restricted undo/redo. This is a delivery sequence for the full requested experience, not a replacement with a text-only product. There is no fixed-field or demo-form fallback.

## Existing seams

All application paths below are relative to `apps/web/client/`.

- `convex/cloudEditorAccess.ts` and `cloudEditorAccessSchema.ts`: server-assigned responsible/designer/content roles, separate publish grant, current project access checks. Responsible management also requires current `project.invite`; designer source edits require current `project.update`.
- `convex/lib/cloudContentContract.ts`: Node-only approval and candidate validator. Currently disconnected from production writes. Its fingerprint masks approved values but retains the rest of the source AST and binding definitions.
- `convex/cloudEditorActions.ts` and `cloudEditor.ts`: current designer-only source commits, actor-bound idempotency receipts, revision CAS and runtime synchronization.
- `src/components/store/editor/sandbox/cloud-source.ts`: durable candidate transport, operation ID, recovery journal, acknowledgements and saved-source/runtime status. `packages/file-system/src/code-fs.ts` supplies final instrumented candidate bytes before cache publication.
- `src/components/store/editor/text/index.ts` and `src/app/project/[id]/_components/canvas/overlay/elements/text.tsx`: existing on-canvas text experience and retained failed-edit recovery.
- `src/components/working-level/editor-gate.tsx`: local working preference, not cloud authorization. Browser users currently bypass that preference gate. Do not use it as the security boundary.

## Server authority and approval

Keep the existing three roles and separate publish grant. The initial responsible member and any authorized responsible member assign existing signed-up users through the current access API. Content users retain ordinary project viewing only. Designers/responsible users with current source-write authority may approve content bindings. Only responsible users manage membership, publishing grants and the agency's project-level preview allowance. Do not introduce another per-member preview grant.

Add a contracts table with exact project, branch and source path, bindings, structural fingerprint, contract generation, approver and timestamps. One active contract per branch/path. Contract approval loads the saved file on the server, calls `approveCloudContentBindings`, then persists only if source revision and authorization still match. Never accept a client-supplied fingerprint as an approval. Revocation/replacement advances generation. Cleanup deletes contracts with their enrolled branch.

Use the selected-element panel to approve text, image/link attributes or named property choices. Show unsupported selections as unavailable, with a reason. Do not auto-approve every element. Approved targets are identified by saved source OID and exact file, not DOM selector alone.

For the first slice, require text-only bindings and reject other fields at the endpoint even though the pure validator supports more. The validator currently supports direct native JSX beneath a default exported page function in `app/**/page.tsx` or `src/app/**/page.tsx`. Dynamic expressions, component instances, layout files and nested rich markup are not yet supported. Existing literal text and generated line breaks must remain compatible with the filesystem's final formatting and OIDs.

## Transport and atomic restricted commit

Reuse CloudSource candidate writes for phase one. Its existing durable commit callback receives the actual final bytes and already owns retry identity, recovery and cache acknowledgement. New Build operations use a content-only Node action; new Design operations use the existing designer-only action. Pin transport kind/version and expected contract generations in the operation and durable recovery journal at creation. Every retry, including recovery after reload or a mode switch, routes by that stored transport, never the current UI mode. Unknown recovery transport versions fail closed with a downloadable backup. Do not grant content users access to the arbitrary-source endpoint.

The restricted request contains project/branch, actor, transport kind/version, expected source revision, stable operation ID, text-file candidates and expected contract generations. Phase one rejects binaries, directories, deletions, unapproved paths and empty batches. The server loads authoritative contracts and original source, then validates every candidate with `validateCloudContentCandidate`. A candidate file is permissible only when the validator proves that all changes are approved text changes. This also permits undo/redo through the same checked transport.

Validate OID uniqueness across the final candidate batch and all unchanged source files in the scoped project's branch, including generated `br` IDs. Per-file uniqueness is insufficient. Bind every approval and OID lookup to its exact project, branch and path: an ID collision in another project must never resolve to that project's source or authority. Carry this collision check through the same source-revision CAS so an intervening write cannot invalidate it.

Order of operations:

1. Recheck enrollment, enabled gate, actor and current content access. Compute a deterministic operation fingerprint over transport kind/version, scope, actor, expected revision, ordered candidate path/content hashes and expected contract generations. Reject duplicate paths before fingerprinting. The client cannot select its fingerprint.
2. Look up a receipt before comparing the current source revision. Return only a matching actor/fingerprint receipt; another actor or payload using that ID fails. A revoked actor is denied even for a retry.
3. Read saved source and active contracts for the expected revision. Validate candidates in the Node action; preserve the returned operation list for audit/debugging without logging text or secrets.
4. A dedicated internal mutation rechecks current role/project access, enrollment, enabled gate, actor, source revision and all contract IDs/generations/fingerprints. A contract revoked during validation must fail. It accepts validated bytes only from the internal action path, never a public mutation.
5. Atomically update all files and manifest totals, advance revision once, record the actor-bound receipt and schedule runtime synchronization. Reuse a narrowly extracted storage/receipt helper from the existing commit implementation; retain distinct designer/content authorization entry points. Include transport kind in receipt fingerprints so operation IDs cannot cross protocols.
6. Only the confirmed receipt acknowledges the durable filesystem commit. Unknown outcomes retain the original operation, transport/version, contract generations and recovery bytes. Retry uses exactly that operation and endpoint, never a fresh operation ID or the current UI mode. Conflicts preserve the draft and require explicit reconciliation/reload.

An action query followed by a mutation is not a transaction. The final mutation's revision and contract checks are mandatory. Source changes or contract replacement between validation and commit must reject the entire batch. Do not compare only the structural fingerprint: explicit revocation requires a generation check even when the source shape is unchanged.

Explicit semantic operation actions can be added for later template/slot insertion. They must construct source server-side from approved artifacts and use the same CAS/receipt discipline. Do not introduce a second text-save path through `commitOverride` in phase one; that would bypass the existing candidate recovery/cache contract. Images can continue using candidate validation once asset ownership and upload authorization are integrated.

## Same canvas and honest state

Subscribe to cloud access and approved bindings before admitting edits. Build is a restricted capability layer over the existing canvas, not a separate renderer. Content members enter Build; designers can use Build to check the customer's experience. A preference or URL parameter never increases server authority.

Gate text admission before frame RPCs and again after asynchronous setup. Check the actual target returned when rich-text editing widens a selection. Only an approved target may start. Preserve active drafts if permission or contract changes, but stop new edits and let the server reject stale writes truthfully.

Hide and block Design-only code, free styling, drag, delete, insertion, AI and context-menu/keyboard actions. Hiding controls is not the write boundary; restricted commits remain mandatory. Keep selection, navigation, viewport preview, save status and recovery. Approved property choices later appear in the existing inspector.

Startup must be read-only for content members: interaction initialization currently seeds CSS and `.weblab/interactions.json` after history initialization. Reuse saved files without those writes in Build mode. Preview startup must not perform customer source preparation. Preserve source-history baselines and the existing strict disposal checks.

## Preview, publishing and later capabilities

- Preview viewing requires current project access and the appropriate cloud role. Reuse an existing ready lease first. The responsible agency configures a project-level preview allowance, checked server-side along with the current member role. Preserve the three roles plus separate publish grant; no additional per-member preview grant is needed. Ordinary project viewing alone does not authorize spending.
- Starts and restarts require explicit user actions within the project allowance and the existing server runtime reservation, workspace capacity and lease limits. Save synchronization may update an already-running valid lease, but must never provision or restart an expired/missing VM. Source saves remain durable while preview is unavailable. Never auto-restart expired VMs or bypass a busy/limited workspace. Customer roles cannot trigger dependency preparation or arbitrary runtime commands. Show the agency's preview allowance and limit state plainly; do not imply unlimited preview service.
- Current private-preview bearer access remains valid until token expiry even after source/API access is revoked. This is a known limitation, not immediate revocation. Before customer release, the gateway must enforce current authorization and enrollment/token generation so removing a member, revoking the relevant role or deleting the enrollment revokes preview access without waiting for bearer expiry. Verify old URLs and active requests cannot bypass that check; token possession alone is insufficient.
- Keep `canPublish` independent of content/design/preview rights. Wire it into the actual publishing endpoint and its current source revision/checks before exposing an enabled Publish button. A UI grant alone is not publishing integration.
- Next, enable approved images and links: scoped upload ownership, validated asset references, alt text and safe URL rules. Do not allow arbitrary image URLs or reuse designer upload authorization for customers.
- Then enable approved properties as named, complete values, using the existing class-choice contract. Customers choose agency-approved variants rather than arbitrary CSS.
- Then add versioned approved templates/blocks and explicit insertion slots with allowed block IDs, order/count constraints and generated identity rules. Validate semantic insert/move/remove operations server-side. The current text contract deliberately rejects structural changes and must not be weakened to accommodate blocks.
- Finally extend bindings deliberately for component instances and CMS-backed content. Keep the same canvas and existing CMS architecture; do not pretend a rendered expression has a one-to-one source text binding.

## Bounded implementation ownership

1. **Backend contracts/transport builder:** new `convex/cloudEditorContentSchema.ts`, `cloudEditorContent.ts`, `cloudEditorContentActions.ts` and focused `convex/lib/cloudEditorContent*.test.ts`; extend `cloudContentContract.ts` only for a demonstrated compatibility failure. Own restricted authorization, approval, CAS and receipts. Primary owns shared schema, cleanup and extraction from `cloudEditor.ts`/`cloudEditorActions.ts` after review.
2. **Editor transport/admission builder:** cloud-specific hunks in `src/lib/cloud-editor/api.ts`, `sandbox/cloud-source.ts`, `sandbox/index.ts`, `text/index.ts` and `interactions/index.ts`. Integrate subscribed access/contracts, restricted candidate sends, startup read-only behavior and draft retention. Preserve native branches and history safeguards. Primary coordinates shared action/gesture admissions.
3. **Approval/member/canvas UI builder:** new `src/components/cloud-editor/content-approval.tsx`, `members.tsx` and capability hook; cloud-specific integration hunks in the existing selected-element panel, Main and mode controls; `messages/cloud-editor/en.json` and `sv.json`. Reuse current components and canvas. Show the responsible agency's project-level preview allowance separately from member roles/publishing. No alternative form editor.
4. **Primary integration:** schema/cleanup, project-level preview allowance, runtime synchronization policy and gateway revocation, shared editor action/hotkey guards, documentation and release workflow. Separate later bounded slices cover images/properties, approved blocks/slots and publishing.

Use an independent reviewer for authorization/schema and integration. One verification owner runs focused checks and browser acceptance. Required first-slice evidence: designer approves a real canvas heading; a separately assigned content user edits it; save, reload and undo/redo work; direct forged source/style/path changes fail; permission and contract revocation during an in-flight save fail; stale revisions and duplicate/retried operation IDs remain safe; recovery preserves its transport and contract generations across mode switches; cross-file/generated-break OID collisions fail and cross-project lookups remain isolated; failed saves retain recoverable text; first open performs no unauthorized source writes; preview starts require an explicit action within the agency allowance; saving after expiry never creates a VM. Current-access gateway revocation is a customer-release requirement. Report unsupported targets and later phases plainly.
