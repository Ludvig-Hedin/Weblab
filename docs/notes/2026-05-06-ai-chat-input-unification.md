# AI Prompt Composer Unification - 2026-05-06

## Action

- Added `AiPromptComposer` in `apps/web/client/src/components/ai-prompt-composer/` as the shared
  input surface for project creation and editor chat.
- Refactored the create-project controller and canvas chat input to render the shared composer while
  keeping their existing feature-specific state and behavior.
- Added the composer to the homepage hero so visitors can start from a prompt before signing in.
- Archived the previous implementations as:
  - `apps/web/client/src/app/_components/hero/create.legacy.tsx`
  - `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.legacy.tsx`

## Rationale

The app had multiple AI prompt inputs that looked and behaved differently. The new shared composer
keeps the preferred create-project visual design, preserves the no-layout-shift focus behavior from
the previous shared style constants, and exposes slots/props for richer editor-only controls such as
Ask/Build mode, model selection, queued messages, context pills, usage, image attachments, paste,
drag-and-drop, stop streaming, and voice input.

## User-Facing Impact

- Homepage, new-project, empty-projects, and editor chat now use the same AI prompt composer.
- Signed-out homepage/new-project prompts are saved for up to 24 hours. After authentication, users
  return to `/projects/new?resumeCreate=1` and project creation resumes with the saved prompt.
- The editor chat keeps model selection, transcription, image attach/paste/drop, Ask/Build mode,
  queued messages, context pills, suggestions, and streaming stop behavior.
