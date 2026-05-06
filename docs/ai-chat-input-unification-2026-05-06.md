# AI Chat Input Unification - 2026-05-06

## Action

- Shared the create-project chat input surface and textarea styling through `AI_CHAT_INPUT_*`
  constants.
- Applied the shared styling to the canvas chat panel input while preserving its Ask/Build mode
  selector, model selector, context pills, queued messages, suggestions, uploads, screenshot, paste,
  and drag-and-drop image handling.

## Rationale

The canvas chat input had a focus-state border change that removed the container border and made the
textarea feel like it changed size. Reusing the create-project input styling keeps both AI prompt
inputs visually consistent and prevents padding, border, outline, or ring changes on focus.

## User-Facing Impact

- The canvas AI chat input no longer shows the heavy black focus border.
- Focusing the textarea no longer changes border or padding.
- Create-project and canvas chat now use the same input surface and textarea style source.
