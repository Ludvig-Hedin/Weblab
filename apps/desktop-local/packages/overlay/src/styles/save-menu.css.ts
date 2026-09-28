import { PREFIX } from "../dom";

/*
 * The bar's "N changes" dropdown: one quiet row per pending edit, each with its
 * own ✕, and a footer that saves the rest or discards the lot.
 *
 * Its own module, after `pop`, because it fills a `.pop` shell and its rows are
 * not `.pop-item`s — a row here is a thing you are looking at, with one small
 * action on it, rather than a verb you pick.
 */
export const css = `
/* The bar button's chevron takes the label's colour, a step quieter. */
.${PREFIX}-bar-save > .${PREFIX}-ic { --${PREFIX}-ic-tone: currentColor; opacity: .8; margin-right: -4px; }
.${PREFIX}-save-pop { width: 272px; }
.${PREFIX}-save-menu { display: flex; flex-direction: column; }
.${PREFIX}-save-list {
  display: flex; flex-direction: column; padding: 4px;
  max-height: 320px; overflow-y: auto;
}
/* One group per element: its name as a heading you can click to go there,
   then one row per change on it. Three border edits on a frame read as one
   frame with three edits, not three frames. */
.${PREFIX}-save-group { display: flex; flex-direction: column; }
.${PREFIX}-save-group + .${PREFIX}-save-group {
  margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--ap-border-subtle);
}
.${PREFIX}-save-group-head {
  display: flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 6px 0 8px; border: 0; border-radius: var(--ap-radius-xs);
  background: transparent; cursor: pointer; text-align: left;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label); font-weight: 600;
  color: var(--ap-text-primary);
}
.${PREFIX}-save-group-head:disabled { cursor: default; }
.${PREFIX}-save-group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${PREFIX}-save-group-head > .${PREFIX}-ic { color: var(--ap-icon-muted); opacity: .6; }
.${PREFIX}-save-group-head:not(:disabled):hover { background: var(--ap-surface-hover); }
.${PREFIX}-save-group-head:hover > .${PREFIX}-ic,
.${PREFIX}-save-group-head[data-pop-active] > .${PREFIX}-ic { opacity: 1; color: var(--ap-text-primary); }
.${PREFIX}-save-row {
  display: flex; align-items: center; gap: 2px;
  height: 26px; border-radius: var(--ap-radius-xs);
}
.${PREFIX}-save-row:hover { background: var(--ap-surface-hover); }
.${PREFIX}-save-row-main {
  flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; gap: 8px;
  padding: 0 0 0 8px; border: 0; background: transparent; cursor: pointer; text-align: left;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-caption);
  white-space: nowrap;
}
.${PREFIX}-save-row-detail {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  color: var(--ap-text-secondary);
}
/* Before → after, the after in full colour: it is what saving will write. */
.${PREFIX}-save-row-values {
  flex: 0 1 auto; min-width: 0; display: flex; align-items: center; gap: 4px;
  overflow: hidden; font-variant-numeric: tabular-nums;
}
.${PREFIX}-save-from { color: var(--ap-text-tertiary); text-decoration: line-through; overflow: hidden; text-overflow: ellipsis; }
.${PREFIX}-save-arrow { color: var(--ap-text-tertiary); flex: 0 0 auto; }
.${PREFIX}-save-to { color: var(--ap-text-primary); overflow: hidden; text-overflow: ellipsis; }
.${PREFIX}-save-row-main:focus-visible,
.${PREFIX}-save-group-head:focus-visible,
.${PREFIX}-save-row-main[data-pop-active],
.${PREFIX}-save-group-head[data-pop-active] { outline: 1px solid var(--ap-border-focus); outline-offset: -1px; }
/* Dim until the row is hovered or focused, so a list of ten reads as a list
   and not as ten close buttons. Never fully hidden: a touch screen has no
   hover, and the action has to be findable there too. */
.${PREFIX}-save-row-x {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border: 0; border-radius: var(--ap-radius-xs);
  background: transparent; cursor: pointer; opacity: .35;
  transition: opacity var(--ap-motion-dur-micro) var(--ap-motion-ease),
    background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-save-row:hover .${PREFIX}-save-row-x,
.${PREFIX}-save-row-x:focus-visible,
.${PREFIX}-save-row-x[data-pop-active] { opacity: 1; }
.${PREFIX}-save-row-x:hover { background: var(--ap-surface-active); }
.${PREFIX}-save-row-x:focus-visible { outline: 1px solid var(--ap-border-focus); outline-offset: -1px; }
.${PREFIX}-save-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px; border-top: 1px solid var(--ap-border-default);
}
.${PREFIX}-save-discard,
.${PREFIX}-save-go {
  height: 28px; padding: 0 10px; border: 0; border-radius: var(--ap-radius-sm);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label); font-weight: 500;
  white-space: nowrap; cursor: pointer;
  transition: background var(--ap-motion-dur-micro) var(--ap-motion-ease),
    color var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-save-discard { background: transparent; color: var(--ap-text-secondary); }
.${PREFIX}-save-discard:hover { background: var(--ap-semantic-error-bg); color: var(--ap-semantic-error); }
.${PREFIX}-save-go {
  background: var(--ap-primary); color: var(--ap-text-primary); font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.${PREFIX}-save-go:hover { background: var(--ap-primary-hover); }
.${PREFIX}-save-discard:focus-visible,
.${PREFIX}-save-go:focus-visible,
.${PREFIX}-save-discard[data-pop-active],
.${PREFIX}-save-go[data-pop-active] { outline: 1px solid var(--ap-border-focus); outline-offset: 1px; }
`;
