# Activity

## 2026-10-21

Built local desktop text editing and reviewed publishing for an isolated client-site integration. Added native text drafts, scoped provider publication, conflict-safe saved Undo, source release review, optional AI sign-in, startup checks and Bun packaging. Preserved the original client checkout. Validation and external release gates are recorded in `docs/features/local-client-editor.md`; private acceptance evidence stays under ignored `docs/internal/`.

Packaged testing found and fixed startup readiness, client field-path agreement, first-run content loading, clipped font values, overlapping Content rows and two publish recovery gaps. Added explicit encrypted connection replacement and native private-file upload guards. Desktop-local lint, typecheck and 2,173 tests passed before the final font-only CSS pass. No live provider mutation or public-site switch ran.

Final desktop-local gate: lint, typecheck and 2,175 tests passed. The isolated client full verify passed with 230 tests and production build. Native text Save changed the served page, Undo restored it, and a provider read confirmed no live text change. Native preview deployment reached Ready; public production target stayed unchanged. Both Mac app candidates built unsigned; no valid signing identity is installed.

Owner requested a fully independent local client copy. Replaced the acceptance app's worktree entry with a separate folder, own Git metadata, no remote and no Vercel link. Added a development-only loopback page bypass in that copy; original client source and deployed access remain unchanged.

Independent copy validation passed: lint, types, 231 tests, build and runtime checks. Native desktop and mobile preview frames show the homepage without a password. Original checkout diff and status match the pre-copy snapshot. No deployment or CMS write ran.

Prepared a draft PR for cross-computer handoff. Recorded the confirmed CMS component-selection defect and the missing direct on-page text input. Kept client-specific source changes in a separate private handoff; excluded secrets, snapshots and generated apps.

Implemented direct page text editing before component drill-in. The website can only read known fields and stage bounded proposals; native Save owns revision-checked local writes. Added header Save/Discard/history, split-heading DOM restoration, race guards and unsaved-text protection for competing Content actions, reload, quit and site failure. Packaged tests verified real heading/body typing, Save into both frames, Undo/Redo, Discard and Keep editing on quit. Final restart and validation evidence follows.

Final direct-edit gate: 2,229 desktop tests passed (including 172 native-shell tests), plus lint and 20 typecheck tasks. Rebuilt unsigned acceptance app. Heading Save persisted across a full app restart; restored header Undo returned the original in both frames. Body typing, Discard and Keep editing on quit worked. Native automation reported input conflicts; state was checked again before further actions. Original client diff/status still match the pre-copy snapshots. No remote publish, CMS write, dependency or signing change ran.

Fixed empty-field reentry and retained a temporary one-line hit area without persisting style changes. Scoped regressions cover prior style values, priority and newer external styles. Final source passes all 2,229 desktop tests, lint and types.

Final packaged empty-field acceptance passed: clear body text, Escape, double-click the retained target, type new text, Save into both frames, then Undo back to the exact original. Chromium placeholder line breaks no longer block reentry. Original hero/body text is visible in both frames and the local draft has no content overrides.

## 2026-10-22

Resumed native acceptance after the owner confirmed the app was free for testing. The acceptance process and local runner started, but native automation could not attach: macOS returned `NSOSStatusErrorDomain -600` (`procNotFound`) through the desktop control tool, including after resetting its connection. No UI input or content write ran. The local draft remains at revision 13 with zero overrides. The additional manual Reload-with-unsaved-text check remains unverified; the prior automated guard tests and packaged editing evidence are unchanged.
