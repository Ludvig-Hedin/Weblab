import { PREFIX } from "../dom";
import { ROOT } from "./const";

/*
 * The Design panel's grid, after Figma's properties panel.
 *
 * One module so the whole shape is readable in one place, and loaded after
 * `controls` so it is the last word on the rules it restates.
 *
 * The shape is three columns on every row: two equal field lanes and a 24px
 * action lane on the right. A row with nothing to put in the action lane still
 * leaves it empty, which is what makes the panel read as one grid rather than
 * a stack of rows that each chose their own width. `.sect-body` reserves the
 * action lane in its right padding; a row that owns an action pulls itself
 * back into it with `--act-pull`.
 */
const P = PREFIX;

export const css = `
${ROOT} {
  --${P}-field-r: 5px;
  --${P}-act-w: 24px;
  --${P}-lane-gap: 8px;
  --${P}-act-pull: calc(-1 * (var(--${P}-act-w) + var(--${P}-lane-gap)));
}

/* ---- Sections ------------------------------------------------------------ */
.${P}-sect-head {
  min-height: 40px; padding: 0 var(--ap-space-xs) 0 var(--ap-space-base);
  font-size: var(--ap-font-size-body); font-weight: 600;
}
.${P}-sect-body {
  gap: var(--ap-space-xs);
  padding: 0 calc(var(--ap-space-xs) + var(--${P}-act-w) + var(--${P}-lane-gap))
    var(--ap-space-base) var(--ap-space-base);
}
/* A nested section already sits inside a body that reserved the lane. */
.${P}-sect-body > .${P}-sect > .${P}-sect-body { padding-right: 0; }
.${P}-sect-body > .${P}-sect > .${P}-sect-head { padding-right: 0; }

/* Groups are one pitch apart, not a pitch and a half. */
.${P}-group:not(:first-child) { margin-top: var(--ap-space-xxs); }

/* ---- Labels sit above their controls, always ----------------------------- */
.${P}-sect-body .${P}-row { gap: var(--ap-space-xxs) var(--${P}-lane-gap); }
.${P}-sect-body .${P}-row-label,
.${P}-flabel {
  flex: 0 0 100%;
  font-size: var(--ap-font-size-label); line-height: 16px;
  color: var(--ap-text-secondary);
}

/* ---- Lanes --------------------------------------------------------------- */
.${P}-lane {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ap-space-xs) var(--${P}-lane-gap); align-items: start;
}
.${P}-lane[data-act] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(--${P}-act-w);
  margin-right: var(--${P}-act-pull);
}
.${P}-lane > .${P}-span2 { grid-column: 1 / 3; }
.${P}-lane > .${P}-lane-act { grid-column: 3; }
.${P}-fgroup { display: flex; flex-direction: column; gap: var(--ap-space-xxs); min-width: 0; }

/* The padding pair and its per-side switch: the switch is in the action lane. */
.${P}-pad-row {
  gap: var(--${P}-lane-gap); margin-right: var(--${P}-act-pull);
}
.${P}-row > .${P}-pad-row { flex: 1 1 0; }

/* ---- Fields -------------------------------------------------------------- */
.${P}-ctl-num,
.${P}-select,
.${P}-ctl-seg,
.${P}-pad,
.${P}-css-filter,
.${P}-token-search { border-radius: var(--${P}-field-r); }
.${P}-ctl-num:hover,
.${P}-select:hover { border-color: var(--ap-border-strong); background: var(--ap-input-bg); }

/* The mode word inside W and H: "Hug", "Fill", "Fixed". */
.${P}-size-mode {
  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 2px;
  height: 100%; padding: 0 var(--ap-space-xxs) 0 var(--ap-space-xxs);
  border: 0; background: transparent; cursor: pointer;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
  color: var(--ap-text-primary); border-radius: 0 var(--${P}-field-r) var(--${P}-field-r) 0;
}
.${P}-size-mode { --${P}-ic-tone: var(--ap-icon-muted); }
.${P}-size-mode:hover,
.${P}-size-mode[aria-expanded="true"] { background: var(--ap-surface-hover); }
.${P}-size-mode:focus-visible { outline: 1px solid var(--ap-border-focus); outline-offset: -1px; }

/* ---- Segmented: a filled track, the pick drawn as a raised tile ---------- */
.${P}-ctl-seg {
  gap: 0; padding: 0; background: var(--ap-input-bg); flex-wrap: nowrap;
}
.${P}-ctl-seg-btn {
  flex: 1 1 0; min-width: 0; height: var(--ap-control-height);
  padding: 0 var(--ap-space-xxs); opacity: 1;
  color: var(--ap-text-secondary);
  border: 1px solid transparent; border-radius: var(--${P}-field-r);
}
.${P}-ctl-seg-btn { --${P}-ic-tone: var(--ap-icon-muted); }
.${P}-ctl-seg-btn:hover { opacity: 1; background: transparent; color: var(--ap-text-primary); }
${ROOT} .${P}-ctl-seg-btn:hover .${P}-ic { --${P}-ic-tone: var(--ap-icon-primary); }
.${P}-ctl-seg-btn:disabled { cursor: default; opacity: .35; }
.${P}-ctl-seg-on,
.${P}-ctl-seg-on:hover {
  background: var(--ap-surface-panel); border-color: var(--ap-border-strong);
  color: var(--ap-text-primary);
}
${ROOT} .${P}-ctl-seg-on .${P}-ic { --${P}-ic-tone: var(--ap-icon-primary); }

/* ---- Icon buttons in the action lane ------------------------------------- */
.${P}-pad-mode,
.${P}-lane-act,
.${P}-row-icon {
  width: var(--${P}-act-w); height: var(--ap-control-height);
  border-radius: var(--${P}-field-r); opacity: 1;
}
.${P}-lane-act {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: 0; cursor: pointer; background: transparent;
}
.${P}-lane-act { --${P}-ic-tone: var(--ap-icon-muted); }
.${P}-lane-act:hover,
.${P}-pad-mode:hover,
.${P}-row-icon:hover { background: var(--ap-surface-hover); }
${ROOT} .${P}-lane-act:hover .${P}-ic { --${P}-ic-tone: var(--ap-icon-primary); }
.${P}-lane-act[aria-pressed="true"],
.${P}-pad-mode-on { background: var(--ap-primary-bg); }
${ROOT} .${P}-lane-act[aria-pressed="true"] .${P}-ic { --${P}-ic-tone: var(--ap-primary); }
.${P}-lane-act:focus-visible { outline: 1px solid var(--ap-border-focus); outline-offset: -1px; }

/* ---- Alignment pad: dots, the pick drawn as bars ------------------------- */
.${P}-al-pad { min-width: 0; }
.${P}-al-pad .${P}-pad-wrap { padding: 0; }
.${P}-pad {
  width: 100%; height: calc(var(--ap-control-height) * 3 + var(--ap-space-xs) * 2);
  gap: 0; background: var(--ap-input-bg);
}
.${P}-pad-cell { position: relative; }
.${P}-pad-cell::before {
  content: ""; position: absolute; left: 50%; top: 50%;
  width: 2px; height: 2px; margin: -1px 0 0 -1px; border-radius: 1px;
  background: var(--ap-icon-muted);
}
.${P}-pad-cell:hover,
.${P}-pad-on { background: transparent; }
.${P}-pad-ink { opacity: 0; }
.${P}-pad-cell:hover .${P}-pad-ink,
.${P}-pad-on .${P}-pad-ink { opacity: 1; }
.${P}-pad-cell:hover::before,
.${P}-pad-on::before { opacity: 0; }
.${P}-pad[data-spread="true"] .${P}-pad-cell { opacity: 1; }

/* ---- Design-token badge: inside the field, at its right end -------------- */
.${P}-token-cell { position: relative; }
.${P}-token-cell > .${P}-token-badge {
  position: absolute; top: 2px; right: 2px;
  width: 20px; height: 20px; opacity: 0; background: var(--ap-input-bg);
}
/* Hover only, even when a variable is connected: the field's blue value
   already says so, and a badge on every bound field is clutter. */
.${P}-token-cell:hover > .${P}-token-badge,
.${P}-token-cell > .${P}-token-badge:focus-visible { opacity: 1; }
.${P}-token-cell > .${P}-token-badge:hover { background: var(--ap-surface-hover); }

/* ---- Checkbox row: "Clip content" ---------------------------------------- */
.${P}-check {
  display: inline-flex; align-items: center; gap: var(--ap-space-xs);
  align-self: flex-start; height: var(--ap-control-height); padding: 0;
  border: 0; background: transparent; cursor: pointer;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
  color: var(--ap-text-primary);
}
.${P}-check-box {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; flex: 0 0 auto;
  border: 1px solid var(--ap-border-strong); border-radius: 3px;
  color: var(--ap-text-primary);
}
.${P}-check[aria-checked="true"] .${P}-check-box {
  background: var(--ap-primary); border-color: var(--ap-primary);
}
.${P}-check:focus-visible { outline: 1px solid var(--ap-border-focus); outline-offset: 2px; }

/* ---- Alignment: two filled groups of three, like Figma ------------------- */
.${P}-lane.${P}-align-row {
  display: grid; padding: 0; border-bottom: 0;
}
.${P}-align-grp {
  display: flex; gap: 0; min-width: 0;
  background: var(--ap-input-bg); border-radius: var(--${P}-field-r);
}
.${P}-align-btn {
  flex: 1 1 0; width: auto; min-width: 0; height: var(--ap-control-height);
  border-radius: var(--${P}-field-r);
}
.${P}-align-btn:hover:not(:disabled) { background: var(--ap-surface-hover); }

/* An action beside a labelled field sits level with the field, not the label. */
.${P}-after-label { margin-top: calc(16px + var(--ap-space-xxs)); }

/* ---- Section header actions line up with the action lane ----------------- */
.${P}-sect-head .${P}-sect-act,
.${P}-sect-actions > .${P}-token-badge {
  width: var(--${P}-act-w); height: var(--${P}-act-w); border-radius: var(--${P}-field-r);
}
.${P}-sect-act:hover { background: var(--ap-surface-hover); }
.${P}-sect-actions { gap: 0; }
/* The chevron always shows, open or folded, so the header actions beside it
   never move with the fold. It lines up with the action lane. */
.${P}-sect-head .${P}-sect-chev {
  width: var(--${P}-act-w); height: var(--${P}-act-w); justify-content: center;
}
/* The parent-scope mark is a hover hint, not permanent decoration. */
.${P}-align-btn[data-scope="parent"]::after { opacity: 0; }
.${P}-align-btn[data-scope="parent"]:hover::after { opacity: 1; }

/* ---- Paint rows: one field, swatch inside, like Figma's fill row --------- */
.${P}-sect-body .${P}-rows-row:has(> .${P}-row-icon) {
  gap: 0; margin-right: var(--${P}-act-pull);
}
.${P}-rows-row > .${P}-paint-row { margin-right: var(--${P}-lane-gap); }
.${P}-rows-row > .${P}-row-icon {
  width: var(--${P}-act-w); height: var(--ap-control-height);
}
.${P}-effect-head { margin-right: var(--${P}-act-pull); gap: 0; }
.${P}-effect-head > .${P}-row-icon:not(.${P}-effect-kind) {
  width: var(--${P}-act-w); height: var(--ap-control-height);
}
.${P}-paint-row {
  gap: 0; height: var(--ap-control-height);
  background: var(--ap-input-bg); border-radius: var(--${P}-field-r);
}
.${P}-paint-row > .${P}-ctl-swatch {
  width: 14px; height: 14px; margin: 0 var(--ap-space-xxs) 0 5px;
  border-radius: 3px; background-size: 4px 4px;
}
.${P}-paint-row > .${P}-ctl-num { background: transparent; border-radius: 0; }
.${P}-paint-row > .${P}-paint-pct {
  border-left: 1px solid var(--ap-surface-panel);
  border-radius: 0 var(--${P}-field-r) var(--${P}-field-r) 0;
}
.${P}-paint-row > .${P}-ctl-num:focus-within { border-color: var(--ap-primary); border-radius: var(--${P}-field-r); }
.${P}-paint-row:hover { box-shadow: inset 0 0 0 1px var(--ap-border-strong); }
.${P}-paint-row > .${P}-ctl-num:hover { border-color: transparent; }

/* Stroke's weight row: the pad switch and the advanced switch share the lane. */
.${P}-sect-body .${P}-row:has(> .${P}-pad-row + .${P}-pad-mode) {
  margin-right: var(--${P}-act-pull);
}
.${P}-row > .${P}-pad-row:has(+ .${P}-pad-mode) { margin-right: 0; }
.${P}-row:has(> .${P}-pad-row + .${P}-pad-mode) { column-gap: 0; }

/* ---- One rhythm: 8px between rows, 12px before anything with a label ----- */
.${P}-sect-body > :is(.${P}-fgroup, .${P}-lane):has(.${P}-flabel):not(:first-child),
.${P}-sect-body > .${P}-row:has(> .${P}-row-label):not(:first-child) {
  margin-top: var(--ap-space-xxs);
}
.${P}-lane > .${P}-row,
.${P}-fgroup > .${P}-row { margin: 0; }
.${P}-row > .${P}-ctl-num,
.${P}-row > .${P}-paint-row { flex: 1 1 0; min-width: 0; }
.${P}-ctl-num > .${P}-ctl-glyph:empty { width: var(--ap-space-xxs); }

/* An empty paint list (no fills yet) is a header and nothing else. */
.${P}-sect-body:not(:has(> :not(.${P}-rows:empty))) { display: none; }

/* A read-only paint note ("none", a paint server) reads at field size. */
.${P}-grad-na {
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
  line-height: var(--ap-control-height);
}

/* The variable button inside a field that owns its own trailing part (W and
   H put it before the mode word). */
.${P}-ctl-num > .${P}-token-badge {
  flex: 0 0 auto; width: 20px; height: 20px; display: none;
}
.${P}-ctl-num:hover > .${P}-token-badge,
.${P}-ctl-num:focus-within > .${P}-token-badge { display: inline-flex; }
.${P}-row > .${P}-token-cell { flex: 1 1 0; min-width: 0; }
.${P}-token-cell > .${P}-select-wrap .${P}-select { padding-right: 26px; }
.${P}-token-cell:has(> .${P}-select-wrap) > .${P}-token-badge { right: 20px; }

/* A header action that is set (a blend mode other than Normal) is lit. */
${ROOT} .${P}-sect-act[data-on] .${P}-ic { --${P}-ic-tone: var(--ap-primary); }

/* Independent corners span the lane, as the padding sides do. */
.${P}-lane > .${P}-fgroup:has(> .${P}-pad-row[data-mode="sides"]) { grid-column: 1 / -1; }

/* ---- Right dock: Style | Agent | code, then zoom and fit ----------------- */
.${P}-insp[data-tab="agent"] > .${P}-insp-body { display: none; }
.${P}-insp:not([data-tab="agent"]) > .${P}-insp-agent { display: none; }
.${P}-insp-agent {
  position: relative;
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.${P}-agent-head {
  display: flex; align-items: center; justify-content: space-between;
  flex: 0 0 auto; padding: var(--ap-space-xs) var(--ap-space-xs) 0 var(--ap-space-sm);
}
.${P}-insp-tab-extras { display: inline-flex; align-items: center; flex: 0 0 auto; }
.${P}-insp-tab-extras:empty { display: none; }
.${P}-insp-tab-extras .${P}-fbar { gap: 0; }
.${P}-insp-tab-extras .${P}-fbar-zoom {
  order: -1; height: 24px; padding: 0 var(--ap-space-xxs);
  font-size: var(--ap-font-size-label); color: var(--ap-text-secondary);
  border-radius: var(--${P}-field-r);
}
.${P}-insp-tab-extras .${P}-fbar-btn {
  width: 24px; height: 24px; border-radius: var(--${P}-field-r);
}
.${P}-insp-tab-extras .${P}-fbar-zoom:hover,
.${P}-insp-tab-extras .${P}-fbar-btn:hover {
  background: var(--ap-surface-hover); color: var(--ap-text-primary);
}

/* ---- Left dock: layers, with a search field on top ----------------------- */
.${P}-layers { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.${P}-layers-search-wrap {
  display: flex; align-items: center; gap: var(--ap-space-xxs); flex: 0 0 auto;
  height: var(--ap-control-height); margin: var(--ap-space-xs) var(--ap-space-sm);
  padding: 0 var(--ap-space-xs); border-radius: var(--${P}-field-r);
  background: var(--ap-input-bg); border: 1px solid transparent;
  color: var(--ap-icon-muted);
}
.${P}-layers-search-wrap:focus-within { border-color: var(--ap-primary); }
.${P}-layers-search {
  flex: 1 1 auto; min-width: 0; height: 100%; padding: 0; border: 0;
  background: transparent; outline: none; color: var(--ap-text-primary);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
}
.${P}-layers-search::placeholder { color: var(--ap-text-placeholder); }
.${P}-layers-search::-webkit-search-cancel-button { display: none; }
.${P}-layers-tree { flex: 1 1 auto; min-height: 0; padding: 0 var(--ap-space-xxs); }

/* A button that opens a menu says so with a small chevron after its glyph,
   the way Figma marks its dropdown buttons. Drawn in CSS so a button whose
   label is rewritten as text (the zoom readout) keeps it. */
.${P}-has-caret {
  display: inline-flex; align-items: center; gap: 2px;
  width: auto; padding-right: var(--ap-space-xxs);
}
.${P}-has-caret::after {
  content: ""; flex: 0 0 auto; width: 4px; height: 4px; margin: -2px 2px 0 1px;
  border-right: 1.25px solid currentColor; border-bottom: 1.25px solid currentColor;
  transform: rotate(45deg); opacity: .6;
}
.${P}-tool.${P}-has-caret { padding-left: var(--ap-space-xxs); }

/* ---- Scrollbars take no room ---------------------------------------------
   A scrollbar that appears and disappears as sections fold changed the
   panel's width and made every row jump. The panels still scroll by wheel
   and trackpad; they just draw no bar. */
.${P}-insp-body,
.${P}-layers-tree { scrollbar-width: none; }
.${P}-insp-body::-webkit-scrollbar,
.${P}-layers-tree::-webkit-scrollbar { display: none; width: 0; height: 0; }

/* ---- Popovers stand off the panels --------------------------------------- */
.${P}-pop {
  background: #2A2A2A;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35);
}

/* The redo glyph is its own arrow now; the old mirrored one is not needed. */
.${P}-bar-redo .${P}-ic { transform: none; }

/* ---- Model picker: favorites, T3 Code style ------------------------------ */
.${P}-model-star {
  flex: 0 0 auto; display: inline-grid; place-items: center;
  width: 22px; height: 22px; padding: 0; border: 0; border-radius: var(--${P}-field-r);
  background: transparent; color: var(--ap-text-tertiary); cursor: pointer;
}
.${P}-model-star:hover { color: var(--ap-text-primary); background: var(--ap-surface-active); }
.${P}-model-star[aria-pressed="true"] { color: #F5C84C; }
.${P}-model-rail-btn[data-agent="favorites"] { color: var(--ap-text-primary); }
.${P}-model-empty {
  padding: var(--ap-space-sm); font-size: var(--ap-font-size-label);
  color: var(--ap-text-tertiary);
}
.${P}-model-row-on .${P}-model-row-label { color: var(--ap-primary); }

/* ---- Composer: attach and model on the left, preview and send on the right */
.${P}-field { grid-template-columns: auto auto 1fr auto auto; }
.${P}-field > .${P}-attach-btn { grid-column: 1; }
.${P}-field > .${P}-model-btn { grid-column: 2; }
.${P}-field > .${P}-field-btn:not(.${P}-attach-btn) { grid-column: 4; margin-left: 0; }
.${P}-field > .${P}-action.${P}-send { grid-column: 5; }
.${P}-field[data-drop] {
  border-color: var(--ap-primary); background: var(--ap-primary-bg);
}
.${P}-model-btn {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 160px;
  height: 28px; padding: 0 6px; border: 0; border-radius: var(--${P}-field-r);
  background: transparent; cursor: pointer;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
  color: var(--ap-text-secondary);
}
.${P}-model-btn:hover,
.${P}-model-btn[aria-expanded="true"] {
  background: var(--ap-surface-active); color: var(--ap-text-primary);
}
.${P}-model-btn-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The Scope row lines up with the field lanes below it. */
.${P}-scope-row {
  padding-right: calc(var(--ap-space-xs) + var(--${P}-act-w) + var(--${P}-lane-gap));
}
`;
