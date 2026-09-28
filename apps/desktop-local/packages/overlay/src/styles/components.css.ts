import { PREFIX } from "../dom";
import { Z } from "./const";

/*
 * Components: the purple family.
 *
 * Purple means "this is a shared component", everywhere it appears: the hover
 * and selection boxes, their name tabs, the layer row, the panel's Component
 * section and the bar shown while you are inside one. It is the one colour
 * design tools have taught everyone to read that way, and it is kept off every
 * other state so it cannot be mistaken for selection blue.
 *
 * The colour lives here as three constants rather than in the editor palette:
 * it is this feature's alone, and the palette's own test only admits variables
 * the palette emits. Moving it there later means replacing these three names.
 */
const COMPONENT = "#9747ff";
const COMPONENT_BG = "rgba(151, 71, 255, 0.12)";
const DIM = "rgba(17, 17, 17, 0.55)";

export const css = `
.${PREFIX}-hover-box.${PREFIX}-component,
.${PREFIX}-sel-box.${PREFIX}-component {
  border-color: ${COMPONENT};
}
.${PREFIX}-box-label.${PREFIX}-component { background: ${COMPONENT}; }

/* Inside a component: everything but the instance is dimmed. One box with a
   huge spread shadow, clipped to the frame by \`place()\`, so the hole follows
   the instance through pans and reflows for the price of one element. */
.${PREFIX}-cmp-dim {
  position: absolute; z-index: ${Z}; pointer-events: none;
  box-shadow: 0 0 0 100vmax ${DIM};
  outline: 1px dashed ${COMPONENT};
}

/* The bar across the top of the canvas while a component is open. */
.${PREFIX}-cmp-bar {
  position: fixed; top: 56px; left: 50%; transform: translateX(-50%);
  z-index: ${Z + 2};
  display: flex; align-items: center; gap: var(--ap-space-sm);
  max-width: min(640px, calc(100vw - 32px));
  padding: 4px 6px 4px 4px;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-body);
  color: var(--ap-text-primary);
  background: var(--ap-surface-panel);
  border: 1px solid ${COMPONENT};
  border-radius: var(--ap-radius-md);
}
.${PREFIX}-cmp-crumbs { display: flex; align-items: center; gap: 4px; min-width: 0; }
.${PREFIX}-cmp-crumb {
  border: 0; background: transparent; cursor: pointer; padding: 2px 6px;
  font: inherit; color: var(--ap-text-secondary); border-radius: var(--ap-radius-xs);
  white-space: nowrap;
}
.${PREFIX}-cmp-crumb:hover { color: var(--ap-text-primary); background: var(--ap-surface-hover); }
.${PREFIX}-cmp-crumb[aria-current="true"] { color: ${COMPONENT}; cursor: default; background: transparent; }
.${PREFIX}-cmp-sep { color: var(--ap-text-tertiary); }
.${PREFIX}-cmp-note {
  color: var(--ap-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding-left: var(--ap-space-sm); border-left: 1px solid var(--ap-border-default);
}
.${PREFIX}-cmp-back {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border: 0; padding: 0; cursor: pointer;
  color: var(--ap-icon-secondary); background: transparent; border-radius: var(--ap-radius-xs);
}
.${PREFIX}-cmp-back:hover { color: var(--ap-icon-primary); background: var(--ap-surface-hover); }

/* The panel's Component section. */
.${PREFIX}-cmp-head {
  display: flex; align-items: center; gap: var(--ap-space-sm);
  padding: var(--ap-space-sm) var(--ap-space-md) 0;
}
.${PREFIX}-cmp-name {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 600; color: ${COMPONENT};
}
.${PREFIX}-cmp-edit {
  flex: 0 0 auto; border: 1px solid var(--ap-border-default); background: transparent;
  color: var(--ap-text-primary); font: inherit; font-size: var(--ap-font-size-label);
  padding: 2px 8px; border-radius: var(--ap-radius-xs); cursor: pointer;
}
.${PREFIX}-cmp-edit:hover { border-color: ${COMPONENT}; }
.${PREFIX}-cmp-meta {
  padding: 2px var(--ap-space-md) 0; color: var(--ap-text-tertiary);
  font-size: var(--ap-font-size-label);
}
.${PREFIX}-cmp-props { display: grid; gap: 6px; padding: var(--ap-space-sm) var(--ap-space-md); }
.${PREFIX}-cmp-prop { display: grid; gap: 2px; }
.${PREFIX}-cmp-prop-label {
  display: flex; align-items: center; gap: 6px;
  color: var(--ap-text-secondary); font-size: var(--ap-font-size-label);
}
.${PREFIX}-cmp-input {
  width: 100%; box-sizing: border-box; min-height: 26px; padding: 4px 6px;
  font: inherit; font-size: var(--ap-font-size-body); color: var(--ap-text-primary);
  background: var(--ap-surface-base); border: 1px solid var(--ap-border-default);
  border-radius: var(--ap-radius-xs); resize: vertical;
}
.${PREFIX}-cmp-input:focus { outline: none; border-color: var(--ap-border-focus); }
.${PREFIX}-cmp-input[readonly] { color: var(--ap-text-tertiary); }
.${PREFIX}-cmp-tag {
  font-size: 10px; line-height: 14px; padding: 0 5px; border-radius: 7px;
  color: var(--ap-text-secondary); background: var(--ap-surface-hover);
}
.${PREFIX}-cmp-tag[data-tone="pending"] { color: ${COMPONENT}; background: ${COMPONENT_BG}; }
.${PREFIX}-cmp-hint { color: var(--ap-text-tertiary); font-size: var(--ap-font-size-label); }
.${PREFIX}-cmp-hint a { color: var(--ap-text-secondary); }
.${PREFIX}-cmp-switch { justify-self: start; }
.${PREFIX}-cmp-empty {
  padding: var(--ap-space-sm) var(--ap-space-md);
  color: var(--ap-text-tertiary); font-size: var(--ap-font-size-label);
}

/* Layer rows for an instance read in the component colour, icon and name. */
.${PREFIX}-tree-node[data-kind="instance"] .${PREFIX}-tree-kind,
.${PREFIX}-tree-node[data-kind="instance"] .${PREFIX}-tree-label {
  color: ${COMPONENT};
}
`;
