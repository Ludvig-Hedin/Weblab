import { PREFIX } from "../dom";

/*
 * The Link section's own lines: the sentence saying what a visitor's click
 * does, and the reason a typed address was not written.
 *
 * Its own module because nothing else in the panel speaks in sentences. The
 * fields and segmented groups are the panel's ordinary controls and take their
 * styling from `controls` and `panel-grid`.
 */
export const css = `
.${PREFIX}-link-detail {
  display: flex; flex-direction: column; gap: var(--ap-control-row-gap);
}
.${PREFIX}-link-field {
  display: flex; flex-direction: column; gap: var(--ap-control-field-gap);
}
.${PREFIX}-link-hint {
  margin: 0;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
  color: var(--ap-text-tertiary);
}
.${PREFIX}-link-problem {
  margin: 0;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
  color: var(--ap-semantic-error);
}
.${PREFIX}-link-problem[hidden],
.${PREFIX}-link-field[hidden] { display: none; }
.${PREFIX}-link-field > .${PREFIX}-ctl-num[data-invalid] {
  box-shadow: inset 0 0 0 1px var(--ap-semantic-error);
}
/* What a button already does, with a small trigger for reveal actions. */
.${PREFIX}-link-action {
  display: flex; align-items: center; gap: var(--ap-control-gutter);
  min-height: var(--ap-control-height); padding: 0 var(--ap-space-xs);
  border-radius: var(--ap-radius-sm); background: var(--ap-surface-active);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-body);
  color: var(--ap-text-primary);
  --${PREFIX}-ic-tone: var(--ap-primary);
}
.${PREFIX}-link-action > .${PREFIX}-ic { flex: 0 0 auto; }
.${PREFIX}-link-action-text { flex: 0 0 auto; }
.${PREFIX}-link-action-detail {
  flex: 1 1 auto; min-width: 0; text-align: right;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ap-text-tertiary);
}
.${PREFIX}-link-action-play {
  display: grid; place-items: center; flex: 0 0 auto;
  width: var(--ap-control-height); height: var(--ap-control-height);
  margin-left: auto; padding: 0;
  border: 0; border-radius: var(--ap-radius-xs);
  background: transparent; color: var(--ap-text-primary); cursor: pointer;
}
.${PREFIX}-link-action-play:hover { background: var(--ap-surface-hover); }
.${PREFIX}-link-action-play:focus-visible { outline: 2px solid var(--ap-primary); }
`;
