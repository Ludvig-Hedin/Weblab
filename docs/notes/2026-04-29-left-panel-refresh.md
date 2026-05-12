# Left Panel Refresh

This update changes the editor's left-side design panels in three areas.

## Pages

- `Home` is now rendered as a root-level page with a home icon instead of acting like the parent of every top-level route.
- Route folders are first-class items in the Pages panel.
- Pages can be dragged into or out of folders, and folders can be renamed or moved.
- Hover a page row to open page settings directly from the gear action.
- Page settings now include:
  - SEO title and description
  - Open Graph image handling
  - editor display name
  - editor-only page icon
  - slug
  - folder
  - search indexing toggle
  - draft flag
  - published/unpublished status

## Layers

- Layer rows now keep their expand chevrons visible when children exist.
- Icons use stronger visual states for components and interactive elements.
- Layers show compact badges for:
  - HTML `id`
  - custom attributes
  - interactive behavior
- The panel includes a search field that preserves matching ancestry.
- The `+` button opens a drag-or-click insert palette for common elements.

## Branches

- The Branches panel now exposes a direct create action in the header.
- New branches can either:
  - fork the current branch
  - create a blank branch
- An optional branch name can be entered before creation.
