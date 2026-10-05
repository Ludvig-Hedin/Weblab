import { PREFIX } from "../dom";

/**
 * The left dock's Assets tab: a header, a two-column grid of thumbnails, and
 * the drop state that covers the panel while files are dragged over it.
 */
export const css = `
.${PREFIX}-as {
  position: relative; display: flex; flex-direction: column;
  flex: 1; min-height: 0;
}
.${PREFIX}-as [hidden] { display: none !important; }
.${PREFIX}-as-head {
  display: flex; align-items: center; gap: var(--ap-space-xxs); flex: 0 0 auto;
  padding: var(--ap-space-xs) var(--ap-space-sm) var(--ap-space-xxs) var(--ap-space-md);
}
.${PREFIX}-as-title {
  flex: 1; min-width: 0;
  font-size: var(--ap-font-size-label); font-weight: 600; color: var(--ap-text-primary);
}
.${PREFIX}-as-head .${PREFIX}-as-search { flex: 1; min-width: 0; margin: 0; }
.${PREFIX}-as-status, .${PREFIX}-as-hint {
  flex: 0 0 auto; padding: 0 var(--ap-space-md) var(--ap-space-xs);
  font-size: var(--ap-font-size-caption); color: var(--ap-text-secondary);
  white-space: pre-line;
}
.${PREFIX}-as-status[data-error] { color: var(--ap-semantic-error); }
.${PREFIX}-as-body { flex: 1; min-height: 0; padding: 0 var(--ap-space-sm) var(--ap-space-md); }
.${PREFIX}-as-body > .${PREFIX}-insp-hint { padding: var(--ap-space-sm) var(--ap-space-xs); }
.${PREFIX}-as-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ap-space-xs);
}
.${PREFIX}-as-tile {
  display: flex; flex-direction: column; gap: var(--ap-space-xxs);
  min-width: 0; padding: var(--ap-space-xxs); margin: 0;
  border: 0; border-radius: var(--ap-radius-sm); background: transparent;
  color: var(--ap-text-secondary); font-family: var(--ap-font-sans);
  font-size: var(--ap-font-size-caption); text-align: left; cursor: pointer;
}
.${PREFIX}-as-tile:hover { background: var(--ap-surface-hover); color: var(--ap-text-primary); }
.${PREFIX}-as-tile:focus-visible { outline: 2px solid var(--ap-primary); outline-offset: -2px; }
.${PREFIX}-as-thumb {
  --${PREFIX}-checker: conic-gradient(
    from 90deg,
    var(--ap-surface-hover) 0 25%,
    var(--ap-surface-base) 0 50%
  );
  display: block; aspect-ratio: 1; overflow: hidden;
  border-radius: var(--ap-radius-xs);
  box-shadow: inset 0 0 0 1px var(--ap-border-default);
  background: var(--${PREFIX}-checker); background-size: 8px 8px;
}
.${PREFIX}-as-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.${PREFIX}-as-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${PREFIX}-as-empty { display: flex; flex-direction: column; align-items: flex-start; }
.${PREFIX}-as-retry {
  margin: 0 var(--ap-space-xs); padding: var(--ap-space-xxs) var(--ap-space-xs);
  border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-sm);
  background: transparent; color: var(--ap-text-primary);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label); cursor: pointer;
}
.${PREFIX}-as-retry:hover { background: var(--ap-surface-hover); }
.${PREFIX}-as-drop {
  display: none; position: absolute; inset: var(--ap-space-xs);
  align-items: center; justify-content: center; pointer-events: none;
  border: 1px dashed var(--ap-primary); border-radius: var(--ap-radius-md);
  background: var(--ap-primary-bg); color: var(--ap-text-primary);
  font-size: var(--ap-font-size-label);
}
.${PREFIX}-as[data-drop] > .${PREFIX}-as-drop { display: flex; }
`;
