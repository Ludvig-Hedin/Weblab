import { PREFIX } from "../dom";

/**
 * The image row, the image popover, and the Fill row's image thumbnail.
 *
 * Built from the same pieces as the rest of the panel: the checkerboard the
 * colour swatch uses under anything translucent, the shell and form rhythm of
 * the other settings popovers, and the segmented group for Type. Nothing here
 * is decoration; each rule is a box the image has to sit in.
 */
export const css = `
/* The checkerboard, for surfaces outside the popover host that show an image.
   Same recipe as the swatch's (see controls.css.ts). */
.${PREFIX}-img-thumb, .${PREFIX}-fill-thumb-img,
.${PREFIX}-img-preview, .${PREFIX}-img-tile {
  --${PREFIX}-checker: conic-gradient(
    from 90deg,
    var(--ap-surface-hover) 0 25%,
    var(--ap-surface-base) 0 50%
  );
}

/* Controls that toggle with the hidden attribute also set their own display,
   which would otherwise win over the browser's hidden rule. */
.${PREFIX}-img-pop [hidden],
.${PREFIX}-img-more-body[hidden] { display: none !important; }

/* ---- Media section: the image row -------------------------------------- */
.${PREFIX}-img-row {
  display: flex; align-items: center; gap: var(--ap-control-gutter);
  width: 100%; min-width: 0; height: var(--ap-control-height);
  padding: 0 var(--ap-space-xxs); margin: 0;
  border: 1px solid transparent; border-radius: var(--ap-radius-sm);
  background: var(--ap-surface-hover); color: var(--ap-text-primary);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-body);
  text-align: left; cursor: pointer;
}
.${PREFIX}-img-row:hover { border-color: var(--ap-border-default); }
.${PREFIX}-img-row:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: 1px;
}
.${PREFIX}-img-thumb {
  flex: 0 0 auto; width: 18px; height: 18px;
  border-radius: var(--ap-radius-xs);
  box-shadow: inset 0 0 0 1px var(--ap-border-default);
  background-size: cover, 6px 6px;
  background-position: center, 0 0;
  background-repeat: no-repeat, repeat;
}
.${PREFIX}-img-row-name {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${PREFIX}-img-row-name[data-empty] { color: var(--ap-text-tertiary); }

/* "More": a quiet disclosure in the sub-head's voice. */
.${PREFIX}-img-more {
  display: inline-flex; align-items: center; gap: var(--ap-space-xxs);
  align-self: flex-start;
  padding: 0; border: 0; background: transparent; cursor: pointer;
  font-family: var(--ap-font-sans); font-weight: 500;
  font-size: var(--ap-font-size-body); color: var(--ap-text-secondary);
}
.${PREFIX}-img-more:hover { color: var(--ap-text-primary); }
.${PREFIX}-img-more:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: 2px;
  border-radius: var(--ap-radius-xs);
}
.${PREFIX}-img-more .${PREFIX}-ic {
  transition: transform var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-img-more[aria-expanded="true"] .${PREFIX}-ic { transform: rotate(90deg); }
/* The rows stay items of the section's own column. */
.${PREFIX}-img-more-body { display: contents; }

/* ---- Fill row: an image layer's thumbnail ------------------------------ */
.${PREFIX}-fill-thumb { cursor: pointer; }
.${PREFIX}-fill-thumb-img {
  display: block; width: 14px; height: 14px;
  border-radius: var(--ap-radius-xs);
  box-shadow: inset 0 0 0 1px var(--ap-border-default);
  background-size: cover, 6px 6px;
  background-position: center, 0 0;
  background-repeat: no-repeat, repeat;
}
.${PREFIX}-fill-thumb:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: 1px;
  border-radius: var(--ap-radius-xs);
}

/* ---- The popover ------------------------------------------------------- */
/* Wider than the 236px settings popovers: it carries a preview and a picker,
   and at 236 the Type row's four words ran out of room. The canvas surface
   behind it, one step darker than the dock it hangs beside, so the fields and
   thumbnails read against it. */
.${PREFIX}-pop.${PREFIX}-pop-img {
  width: 280px;
  background: var(--ap-surface-canvas);
  border-color: var(--ap-border-strong);
}
.${PREFIX}-pop-img > .${PREFIX}-pop-bar {
  margin-bottom: 0;
  padding-inline: var(--ap-space-base);
  background: var(--ap-surface-canvas);
}
.${PREFIX}-pop-img .${PREFIX}-pop-form {
  gap: var(--ap-control-group-gap);
  padding: var(--ap-space-base);
}
/* Type fills its row in equal cells, so no word is ever clipped. */
.${PREFIX}-pop-img .${PREFIX}-row > .${PREFIX}-ctl-seg {
  flex: 1 1 auto; min-width: 0; flex-wrap: nowrap;
}
.${PREFIX}-pop-img .${PREFIX}-ctl-seg > .${PREFIX}-ctl-seg-btn {
  flex: 1 1 0; min-width: 0; padding-inline: var(--ap-space-xxs);
}
.${PREFIX}-img-file { display: none; }

.${PREFIX}-img-preview {
  position: relative; aspect-ratio: 16 / 10; overflow: hidden;
  border-radius: var(--ap-radius-sm);
  box-shadow: inset 0 0 0 1px var(--ap-border-default);
  background-image: var(--${PREFIX}-checker); background-size: 12px 12px;
}
.${PREFIX}-img-preview-img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; pointer-events: none;
}
.${PREFIX}-img-preview-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--ap-space-xxs);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-caption);
  color: var(--ap-text-secondary); pointer-events: none;
}
/* The whole preview is the "choose a file" button. */
.${PREFIX}-img-preview-hit {
  position: absolute; inset: 0; padding: 0; margin: 0;
  border: 0; border-radius: inherit; background: transparent; cursor: pointer;
}
.${PREFIX}-img-preview-hit:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: -1px;
}
.${PREFIX}-img-preview[data-drop] {
  box-shadow: inset 0 0 0 2px var(--ap-primary);
}
.${PREFIX}-img-preview-status {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--ap-surface-overlay);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-body);
  color: var(--ap-text-primary); pointer-events: none;
}
.${PREFIX}-img-preview[data-busy] .${PREFIX}-img-preview-hit { cursor: progress; }

/* The focal point. Shown while the pointer is over the preview (or while it is
   being dragged), only in Fill, where position decides what gets cropped. */
.${PREFIX}-img-focal {
  position: absolute; z-index: 1;
  width: 12px; height: 12px; margin: -6px 0 0 -6px;
  border: 2px solid #fff; border-radius: var(--ap-radius-full);
  box-shadow: 0 0 0 1px rgba(0,0,0,.35);
  cursor: grab; touch-action: none; opacity: 0;
  transition: opacity var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-img-preview:hover .${PREFIX}-img-focal,
.${PREFIX}-img-focal[data-drag] { opacity: 1; }
.${PREFIX}-img-focal[data-drag] { cursor: grabbing; }

.${PREFIX}-img-name {
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-body);
  color: var(--ap-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${PREFIX}-img-name[data-empty] { color: var(--ap-text-tertiary); }
.${PREFIX}-img-error {
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-caption);
  line-height: 1.45; color: var(--ap-semantic-error);
}

/* Position: nine dots, the lit one is where the image is pinned. */
.${PREFIX}-img-pos {
  display: grid; grid-template-columns: repeat(3, 20px); grid-auto-rows: 20px;
  padding: var(--ap-space-hair); border-radius: var(--ap-radius-sm);
  background: var(--ap-surface-hover);
}
.${PREFIX}-img-pos-cell {
  display: flex; align-items: center; justify-content: center;
  padding: 0; border: 0; background: transparent; cursor: pointer;
  border-radius: var(--ap-radius-xs);
}
.${PREFIX}-img-pos-cell:hover { background: var(--ap-surface-active); }
.${PREFIX}-img-pos-cell:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: -1px;
}
.${PREFIX}-img-pos-dot {
  width: 4px; height: 4px; border-radius: var(--ap-radius-full);
  background: var(--ap-text-tertiary);
}
.${PREFIX}-img-pos-cell[aria-pressed="true"] .${PREFIX}-img-pos-dot {
  width: 6px; height: 6px; background: var(--ap-primary);
}

/* Project images. */
.${PREFIX}-img-lib-head {
  margin-top: var(--ap-space-xxs);
  padding-top: var(--ap-control-group-gap);
  border-top: 1px solid var(--ap-border-default);
  font-family: var(--ap-font-sans); font-weight: 500;
  font-size: var(--ap-font-size-body); color: var(--ap-text-secondary);
}
.${PREFIX}-img-grid {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ap-space-xs);
}
.${PREFIX}-img-tile {
  position: relative; aspect-ratio: 1; min-width: 0; padding: 0; overflow: hidden;
  border: 0; border-radius: var(--ap-radius-sm); cursor: pointer;
  background-image: var(--${PREFIX}-checker); background-size: 8px 8px;
  box-shadow: inset 0 0 0 1px var(--ap-border-default);
}
.${PREFIX}-img-tile > img {
  display: block; width: 100%; height: 100%; object-fit: cover;
}
.${PREFIX}-img-tile:hover { box-shadow: inset 0 0 0 1px var(--ap-border-strong); }
.${PREFIX}-img-tile[aria-pressed="true"] {
  box-shadow: 0 0 0 2px var(--ap-primary);
}
.${PREFIX}-img-tile:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: 2px;
}
.${PREFIX}-img-tile-add {
  display: flex; align-items: center; justify-content: center;
  background: var(--ap-surface-hover); color: var(--ap-icon-primary);
}
.${PREFIX}-img-tile-add:hover { background: var(--ap-surface-active); }
.${PREFIX}-img-note {
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-caption);
  line-height: 1.45; color: var(--ap-text-tertiary);
  display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ap-space-xxs);
}
.${PREFIX}-img-note:empty { display: none; }

/* A text button: "Use a URL", "Try again". */
.${PREFIX}-img-link {
  padding: 0; border: 0; background: transparent; cursor: pointer;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-caption);
  color: var(--ap-text-secondary); text-decoration: underline;
  text-underline-offset: 2px;
}
.${PREFIX}-img-link:hover { color: var(--ap-text-primary); }
.${PREFIX}-img-link:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: 2px;
  border-radius: var(--ap-radius-xs);
}
`;
