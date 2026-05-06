# Project Card Interactions - 2026-05-06

## Summary

Updated projects page cards so opening a project is limited to the preview, title, and timestamp. The deployed app URL is now its own external link.

## Rationale

The previous whole-card click target prevented users from reliably opening the deployed app URL from the card. The hover styling also moved the card and added a background, which made the cards feel less stable.

## User-Facing Impact

- Preview, title, and timestamp open the project editor.
- Deployed URL opens the deployed app in a new tab.
- Card hover no longer changes the card background or position.
- Card hover underlines the title and scales the preview to `1.02`.
- Preview content is clipped inside the rounded preview container to avoid visible corner bleed.
- Live app previews stay visible for deployed URLs, including CodeSandbox preview domains.

## Architectural Notes

The change is isolated to the active `ProjectCard` and `ProjectPreviewSurface` components used by the projects grid. Selection mode keeps button-based selection targets instead of project navigation.
