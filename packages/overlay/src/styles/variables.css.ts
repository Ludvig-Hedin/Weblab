import { PREFIX } from "../dom";

/**
 * The left dock's Variables tab, and the edit / detach buttons a bound token
 * badge shows on hover in the Design panel.
 */
export const css = `
.${PREFIX}-vars {
  position: relative; display: flex; flex-direction: column;
  flex: 1; min-height: 0;
}
.${PREFIX}-vars [hidden] { display: none !important; }
.${PREFIX}-vars-head {
  display: flex; align-items: center; flex: 0 0 auto;
  padding: var(--ap-space-xs) var(--ap-space-sm) var(--ap-space-xxs);
}
.${PREFIX}-vars-head .${PREFIX}-vars-search { flex: 1; min-width: 0; margin: 0; }
.${PREFIX}-vars-status {
  flex: 0 0 auto; padding: var(--ap-space-xxs) var(--ap-space-md) var(--ap-space-xs);
  font-size: var(--ap-font-size-caption); color: var(--ap-text-secondary);
}
.${PREFIX}-vars-status[data-error] { color: var(--ap-semantic-error); }
.${PREFIX}-vars-body { flex: 1; min-height: 0; padding-bottom: var(--ap-space-md); }
.${PREFIX}-vars-label {
  padding: var(--ap-space-xs) var(--ap-space-sm) var(--ap-space-xxs);
  font-size: var(--ap-font-size-caption); font-weight: 600; color: var(--ap-text-secondary);
}

/* Collections: Figma's left list, stacked above the table here. */
.${PREFIX}-vars-cols {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--ap-space-xs) var(--ap-space-sm) var(--ap-space-sm);
  border-bottom: 1px solid var(--ap-border-default);
}
.${PREFIX}-vars-col {
  display: flex; align-items: center; gap: var(--ap-space-xs);
  height: 32px; padding: 0 var(--ap-space-sm); margin: 0;
  border: 0; border-radius: var(--ap-radius-sm); background: transparent;
  color: var(--ap-text-secondary); font-family: var(--ap-font-sans);
  font-size: var(--ap-font-size-label); text-align: left; cursor: pointer;
}
.${PREFIX}-vars-col:hover { background: var(--ap-surface-hover); color: var(--ap-text-primary); }
.${PREFIX}-vars-col[aria-current="true"] {
  background: var(--ap-selection-fill); color: var(--ap-text-primary); font-weight: 600;
}
.${PREFIX}-vars-col-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${PREFIX}-vars-count { color: var(--ap-text-secondary); font-weight: 400; font-variant-numeric: tabular-nums; }

/* The table. Name, then one value column per mode, then the add-mode "+". */
.${PREFIX}-vars-scroll-x { overflow-x: auto; }
.${PREFIX}-vars-table { min-width: 100%; width: max-content; }
.${PREFIX}-vars-grid {
  display: grid; align-items: center; column-gap: var(--ap-space-xs);
  grid-template-columns: minmax(120px, 1fr) repeat(var(--vars-values, 1), minmax(112px, 1fr)) 24px;
  padding: 0 var(--ap-space-sm) 0 var(--ap-space-md);
}
.${PREFIX}-vars-th {
  position: sticky; top: 0; z-index: 1; height: 32px;
  background: var(--ap-surface-panel);
  border-bottom: 1px solid var(--ap-border-default);
  font-size: var(--ap-font-size-caption); font-weight: 600; color: var(--ap-text-secondary);
}
.${PREFIX}-vars-th-add { display: flex; justify-content: center; }
.${PREFIX}-vars-section + .${PREFIX}-vars-section { border-top: 1px solid var(--ap-border-default); }
.${PREFIX}-vars-section { padding-bottom: var(--ap-space-xs); }
.${PREFIX}-vars-section-title {
  padding: var(--ap-space-md) var(--ap-space-md) var(--ap-space-xs);
  font-size: var(--ap-font-size-label); font-weight: 600; color: var(--ap-text-primary);
}
.${PREFIX}-vars-group {
  margin-top: var(--ap-space-xs); padding: var(--ap-space-sm) var(--ap-space-md) var(--ap-space-xxs);
  border-top: 1px solid var(--ap-border-default);
  font-size: var(--ap-font-size-caption); font-weight: 600; color: var(--ap-text-secondary);
}
.${PREFIX}-vars-row { min-height: 36px; font-size: var(--ap-font-size-label); color: var(--ap-text-primary); }
.${PREFIX}-vars-row:hover { background: var(--ap-surface-hover); }
.${PREFIX}-vars-row[data-flash] { background: var(--ap-selection-fill); }
.${PREFIX}-vars-name { display: flex; align-items: center; gap: var(--ap-space-xs); min-width: 0; }
.${PREFIX}-vars-type { display: inline-flex; flex: 0 0 auto; color: var(--ap-icon-muted); }
.${PREFIX}-vars-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* A value: a quiet button that shows a chip; hovering it says it is editable. */
.${PREFIX}-vars-value {
  display: flex; align-items: center; min-width: 0; height: 28px;
  padding: 0 var(--ap-space-xs); margin: 0; border: 1px solid transparent;
  border-radius: var(--ap-radius-sm); background: transparent; cursor: pointer;
  color: var(--ap-text-primary); font-family: var(--ap-font-sans);
  font-size: var(--ap-font-size-label); text-align: left;
}
.${PREFIX}-vars-value:hover { border-color: var(--ap-border-default); background: var(--ap-input-bg); }
.${PREFIX}-vars-value:focus-visible { outline: 2px solid var(--ap-primary); outline-offset: -2px; }
.${PREFIX}-vars-value[data-inherited] { color: var(--ap-text-secondary); opacity: .6; }
.${PREFIX}-vars-value[data-inherited]:hover { opacity: 1; }
.${PREFIX}-vars-chip { display: inline-flex; align-items: center; gap: var(--ap-space-xs); min-width: 0; max-width: 100%; }
/* A connected value reads as a pill, as in Figma. */
.${PREFIX}-vars-value[data-alias] .${PREFIX}-vars-chip {
  padding: 2px var(--ap-space-xs) 2px 3px;
  border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-sm);
  background: var(--ap-input-bg);
}
.${PREFIX}-vars-swatch {
  flex: 0 0 auto; width: 16px; height: 16px; border-radius: var(--ap-radius-xs);
  box-shadow: inset 0 0 0 1px var(--ap-border-default);
}

.${PREFIX}-vars-swatch-btn {
  padding: 0; border: 0; cursor: pointer;
  transition: box-shadow var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-vars-swatch-btn:hover { box-shadow: 0 0 0 2px var(--ap-primary); }
.${PREFIX}-vars-swatch-btn:focus-visible { outline: 2px solid var(--ap-primary); outline-offset: 1px; }

/* The value picker, in its own popover shell. */
.${PREFIX}-pop-vars { padding: 0; }

.${PREFIX}-vars-pick { display: flex; flex-direction: column; width: 260px; }
.${PREFIX}-vars-pick-top {
  display: flex; align-items: center; gap: var(--ap-space-xs);
  padding: var(--ap-space-sm); border-bottom: 1px solid var(--ap-border-default);
}
.${PREFIX}-vars-pick-list { max-height: 280px; }
.${PREFIX}-vars-well {
  flex: 0 0 auto; width: 28px; height: 28px; padding: 0; border: 0;
  border-radius: var(--ap-radius-sm); cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--ap-border-default);
}
.${PREFIX}-vars-well:hover { box-shadow: 0 0 0 2px var(--ap-primary); }
.${PREFIX}-vars-input {
  flex: 1; width: 100%; min-width: 0; height: 28px; padding: 0 var(--ap-space-sm);
  border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-sm);
  background: var(--ap-input-bg); color: var(--ap-text-primary); outline: none;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
}
.${PREFIX}-vars-input:focus { border-color: var(--ap-primary); }

.${PREFIX}-vars-new {
  padding: var(--ap-space-xs) var(--ap-space-sm) var(--ap-space-sm);
  border-bottom: 1px solid var(--ap-border-default);
}
.${PREFIX}-vars-new-fields { display: flex; flex-direction: column; gap: var(--ap-space-xs); }
.${PREFIX}-vars-empty {
  padding: var(--ap-space-md);
  font-size: var(--ap-font-size-label); color: var(--ap-text-secondary);
}
.${PREFIX}-vars-foot { flex: 0 0 auto; padding: var(--ap-space-xs) var(--ap-space-sm); border-top: 1px solid var(--ap-border-default); }
.${PREFIX}-vars-create {
  display: flex; align-items: center; gap: var(--ap-space-xs); width: 100%;
  height: 32px; padding: 0 var(--ap-space-sm); margin: 0;
  border: 0; border-radius: var(--ap-radius-sm); background: transparent;
  color: var(--ap-text-secondary); font-family: var(--ap-font-sans);
  font-size: var(--ap-font-size-label); cursor: pointer;
}
.${PREFIX}-vars-create:hover { background: var(--ap-surface-hover); color: var(--ap-text-primary); }

/* A bound badge with edit + detach beside it. In a field it sits where the
   badge alone sat, at the field's right end, and appears on hover. */
.${PREFIX}-token-acts { display: inline-flex; align-items: center; gap: 1px; }
.${PREFIX}-token-acts > .${PREFIX}-token-act { display: none; }
.${PREFIX}-token-acts:hover > .${PREFIX}-token-act,
.${PREFIX}-token-acts:focus-within > .${PREFIX}-token-act,
.${PREFIX}-token-cell:hover .${PREFIX}-token-act,
.${PREFIX}-rows-row:hover .${PREFIX}-token-act,
.${PREFIX}-sect-head:hover .${PREFIX}-token-act { display: inline-flex; }
.${PREFIX}-token-cell > .${PREFIX}-token-acts {
  position: absolute; top: 2px; right: 2px; opacity: 0;
  background: var(--ap-input-bg); border-radius: var(--ap-radius-xs);
}
.${PREFIX}-token-cell:hover > .${PREFIX}-token-acts,
.${PREFIX}-token-cell > .${PREFIX}-token-acts:focus-within { opacity: 1; }
.${PREFIX}-token-acts .${PREFIX}-row-icon { width: 20px; height: 20px; opacity: .8; }
.${PREFIX}-token-acts .${PREFIX}-row-icon:hover { opacity: 1; background: var(--ap-surface-hover); }
.${PREFIX}-sect-actions > .${PREFIX}-token-acts .${PREFIX}-row-icon { width: 18px; height: 18px; }
`;
