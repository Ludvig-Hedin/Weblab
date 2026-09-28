import { PREFIX } from "../dom";
import { ROOT, Z } from "./const";

/** Bottom bar, mode toggle, the two floating docks, splitters, pills, headers. */
export const css = `
/* Bottom bar — tools, Edit/View mode, plus whatever controls the stage owns (on
   the canvas: add a frame, fit, zoom). A soft floating tray, after Framer's:
   generous radius, a barely-there border and one gentle shadow, so it reads as
   lifted off the canvas rather than drawn onto it. */
.${PREFIX}-bar {
  position: fixed; bottom: 16px; transform: translateX(-50%);
  left: calc(50% + (var(--${PREFIX}-inset-l, 0px) - var(--${PREFIX}-inset-r, 0px)) / 2);
  pointer-events: auto; display: inline-flex; align-items: center; gap: 4px;
  padding: 6px; border-radius: var(--ap-radius-lg);
  background: var(--ap-surface-panel); border: 1px solid var(--ap-border-subtle);
  box-shadow: var(--ap-shadow-sm);
}
/* Faint and short — a pause between groups, not a wall. Full-height hairlines
   between every group were most of what made the bar read as cluttered. */
.${PREFIX}-bar-sep { width: 1px; height: 16px; align-self: center; background: var(--ap-border-subtle); margin: 0 4px; }
/* Stretched to the bar's content box on purpose. The add-frame menu is placed
   against the toolbar's rect, and a row centred in a taller bar sits a few
   pixels inside the card — so the menu's gap would be measured from the buttons
   and land on the card's top edge. Spanning the box makes the two the same. */
.${PREFIX}-bar-tools { display: inline-flex; align-items: stretch; align-self: stretch; }
.${PREFIX}-bar-tools .${PREFIX}-fbar { align-self: stretch; }
/* The stage's *second* slot — the selected frame's verbs, beside the Hand. See
   \`Stage.mountFrameTools\`.

   \`display: contents\` rather than a plain wrapper. The bar is a flex row with a
   gap, so a wrapper whose only child is hidden is still a zero-width flex item
   earning itself a gap — a stray hairline of space that appears and disappears
   with the selection. \`contents\` makes the group the bar's own flex item, and
   \`.hidden\`'s \`display: none !important\` still outranks it when the mode hides
   the host. */
.${PREFIX}-bar-frame-tools { display: contents; }
/* Same bargain for the Apply/Discard pair: the outer host is mode-hidden by
   syncBar, the inner group is pending-hidden by syncApplyGroup — one element
   per owner, so neither clobbers the \`hidden\` the other wrote. */
.${PREFIX}-bar-apply-host,
.${PREFIX}-bar-apply-group { display: contents; }
/* And once more for the job chip: the host is mode-hidden by \`syncBar\`, the
   chip inside is state-hidden by \`syncJobChip\`. */
.${PREFIX}-bar-job-host { display: contents; }
/* Inline has no stage controls, and a separator with nothing after it is just a
   stub of hairline hanging off the mode toggle. Scoped to \`bar-sep-tools\` — the
   one that divides the mode toggle from the stage slot — rather than to every
   separator in the bar, which is what it used to say and which collapsed the
   tool, inspect and mode groups into one undivided row inline. */
.${PREFIX}-bar-bare .${PREFIX}-bar-sep-tools,
.${PREFIX}-bar-bare .${PREFIX}-bar-tools { display: none; }

/* "Working" — view mode's one word about a running job.

   Borrows \`.dot\` and its pulse from the transcript rather than restating them,
   so the thing in the bar and the status inside the assistant bubble are
   visibly one state rather than two things that happen to agree. Sized against
   \`.tool\` so it sits in the row without changing the bar's height. */
.${PREFIX}-bar-job {
  display: inline-flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 9px; margin-left: 2px;
  border: none; border-radius: var(--ap-radius-xs);
  background: var(--ap-surface-active); color: var(--ap-text-secondary);
  font-size: var(--ap-font-size-label); cursor: pointer;
  transition: background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-bar-job:hover { background: var(--ap-surface-selected); color: var(--ap-text-primary); }

/* Save — the one primary button in the bar. Edits are previews until the
   agent writes them into the code, so this says what it does and how many. */
.${PREFIX}-bar-save {
  display: inline-flex; align-items: center; gap: 6px;
  height: var(--ap-control-icon-box); padding: 0 12px; margin-left: 2px;
  border: none; border-radius: var(--ap-radius-sm); cursor: pointer;
  background: var(--ap-primary); color: var(--ap-text-primary);
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-body); font-weight: 600;
  font-variant-numeric: tabular-nums; white-space: nowrap;
  transition: background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-bar-save:hover:not(:disabled) { background: var(--ap-primary-hover); }
.${PREFIX}-bar-save:focus-visible { outline: 2px solid var(--ap-primary-hover); outline-offset: 2px; }
.${PREFIX}-bar-save > .${PREFIX}-dot { display: none; background: var(--ap-text-primary); }
.${PREFIX}-bar-save-busy { cursor: default; background: var(--ap-primary-active); }
.${PREFIX}-bar-save-busy > .${PREFIX}-dot { display: inline-block; }

/* Edit/View mode segmented toggle — no box of its own; the selected half is a
   soft fill, the other is plain text. */
.${PREFIX}-seg-group {
  display: inline-flex; align-items: center; gap: 2px; padding: 0;
  background: transparent; border: 0;
}
.${PREFIX}-seg {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer;
  height: var(--ap-control-icon-box); padding: 0 10px; border: none; background: transparent;
  border-radius: var(--ap-radius-sm); font-size: var(--ap-font-size-label); font-weight: 500;
  color: var(--ap-text-primary); opacity: .65;
  transition: opacity var(--ap-motion-dur-micro) var(--ap-motion-ease), background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-seg:hover { opacity: 1; background: var(--ap-surface-hover); }
.${PREFIX}-seg-on, .${PREFIX}-seg-on:hover { background: var(--ap-surface-active); opacity: 1; }

/* Docked panels — Figma's arrangement: flush to the window edge, full height,
   one hairline on the side facing the canvas and nothing else. Only a panel
   torn off into a floating card (\`.dock-float\`) gets a radius and a shadow. */
.${PREFIX}-dock {
  position: fixed; top: 0; bottom: 0;
  pointer-events: auto; z-index: ${Z};
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--ap-surface-panel);
}
/* Widths are set as custom properties on the root by app.ts and persisted to
   localStorage; the literals here are the same defaults, for the first paint. */
.${PREFIX}-dock-left {
  left: 0; width: var(--${PREFIX}-left-w, 320px);
  border-right: 1px solid var(--ap-border-default);
}
.${PREFIX}-dock-right {
  right: 0; width: var(--${PREFIX}-right-w, 300px);
  border-left: 1px solid var(--ap-border-default);
}

/* A docked panel with a pinned height.

   \`.dock\` anchors \`top\` *and* \`bottom\`, so a docked column fills its edge and
   re-fits a resized window with no JS at all — which is why the default is to
   have no height here, and why \`resetSize\` *removes* the pin rather than
   replacing it with a number. A literal for "the window, less two insets" would
   be stale the moment the window changed and would need re-deriving on every
   resize; \`bottom\` answers the same question for free and keeps answering it.

   \`bottom\` and \`height\` cannot both win, so the pinned case drops the anchor
   rather than fighting it. Two classes, so this beats the single-class edge
   anchors above without \`!important\`, the same bargain \`.dock-float\` makes. */
.${PREFIX}-dock-h { bottom: auto; }
.${PREFIX}-dock-left.${PREFIX}-dock-h { height: var(--${PREFIX}-left-h); }
.${PREFIX}-dock-right.${PREFIX}-dock-h { height: var(--${PREFIX}-right-h); }

/* A swappable dock body — the chat and the frame list share the left dock, one
   per mode (see \`AirshipApp.syncDocks\`).

   \`display: contents\` and not a box of its own, which is load-bearing twice
   over. The dock is a flex column whose transcript takes the remaining height;
   a real wrapper would take that height instead and leave the composer
   floating in the middle. And the past-chats drawer is \`inset: 0\` against the
   dock, so a wrapper with a box would become its containing block and shrink it
   to whatever the chat happened to measure. \`.hidden\`'s
   \`display: none !important\` still outranks this, which is the whole point —
   same bargain \`.bar-frame-tools\` makes in the bar. */
.${PREFIX}-dock-body { display: contents; }

/* The minimap's slot. Nothing but a mode gate: the card inside is
   \`position: fixed\` and places itself, so this element has no geometry to
   contribute and only exists so the app can hide the stage's content without
   writing to a class the stage also writes to. */
.${PREFIX}-minimap-host { display: contents; }

/* Torn off its edge and floating.
   Position and height come from three more custom properties written by
   \`applyPlacement\`, and the collapsed pill reads the same three — which is what
   preserves the docked arrangement's one invariant (see \`.pill\` below):
   collapsing a floating panel leaves the pill exactly where its header was.
   Vars rather than inline styles for that sharing, and because a floating panel
   still takes its *width* from \`--left-w\`/\`--right-w\`, so the splitter goes on
   working in both states with nothing to reconcile.
   \`right\`/\`bottom\` are cleared because \`.dock\` and \`.dock-right\` set them and a
   box with all four is over-constrained. Two classes, so these beat the
   single-class edge anchors above without needing \`!important\`. */
.${PREFIX}-dock.${PREFIX}-dock-float {
  right: auto; bottom: auto;
  border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-md);
  box-shadow: var(--ap-elevation-floating);
}
.${PREFIX}-dock-left.${PREFIX}-dock-float {
  top: var(--${PREFIX}-left-y, 20px);
  left: var(--${PREFIX}-left-x, 20px);
  height: var(--${PREFIX}-left-h, 60vh);
}
.${PREFIX}-dock-right.${PREFIX}-dock-float {
  top: var(--${PREFIX}-right-y, 20px);
  left: var(--${PREFIX}-right-x, 20px);
  height: var(--${PREFIX}-right-h, 60vh);
}
/* Lifted while it travels, so it reads as being carried rather than redrawn. */
.${PREFIX}-dock-moving { box-shadow: var(--ap-elevation-modal); opacity: .92; }

/* Where a dragged panel will dock if it is dropped now. Painted over the panel
   being carried, so it reads as "this is where it goes" rather than hiding
   underneath it. Position and size are written by \`showDockGhost\`. */
.${PREFIX}-dock-ghost {
  position: fixed; z-index: ${Z}; pointer-events: none;
  background: color-mix(in srgb, var(--ap-primary) 10%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ap-primary) 70%, transparent);
  opacity: 0;
  transition: opacity 120ms var(--ap-motion-ease);
}
.${PREFIX}-dock-ghost-pill { border-radius: var(--ap-radius-md); }
.${PREFIX}-dock-ghost-on { opacity: 1; }

/* Dock resize splitter — a slim invisible grab strip on the dock's inner edge
   that only shows itself on hover or while dragging. */
.${PREFIX}-splitter {
  position: absolute; top: 0; bottom: 0; width: 7px; z-index: 2;
  cursor: col-resize; pointer-events: auto; background: transparent;
  transition: background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-splitter::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
  width: 2px; transform: translateX(-50%);
  background: var(--ap-primary); opacity: 0;
  transition: opacity var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-splitter:hover::after { opacity: .7; }
.${PREFIX}-splitter-left { right: -1px; }
.${PREFIX}-splitter-right { left: -1px; }

/* The same strip, turned. \`top\` and \`width\` are *reset*, not merely unset:
   \`.splitter\` sets both, so a rule that only added \`height\` would leave a
   7px-wide full-height column lying across the panel's left edge, eating clicks
   on everything under it. Same for the hairline's \`top\`/\`bottom\`/\`width\`. */
.${PREFIX}-splitter-bottom {
  top: auto; bottom: -1px; left: 0; right: 0;
  width: auto; height: 7px; cursor: row-resize;
}
.${PREFIX}-splitter-bottom::after {
  top: 50%; bottom: auto; left: 0; right: 0;
  width: auto; height: 2px; transform: translateY(-50%);
}

/* Collapsed panel — the dock's header row, left floating in the corner the dock
   itself would occupy. Same surface recipe as \`.dock\` and, crucially, the same
   \`top\`/\`left\`/\`right\`: expanding grows a panel downwards from here rather than
   moving anything, which is what makes the two read as one control. */
.${PREFIX}-pill {
  position: fixed; top: var(--ap-space-xs);
  pointer-events: auto; z-index: ${Z};
  display: inline-flex; align-items: center; gap: 6px;
  /* Same 4px card padding as the bottom bar, plus a little on the label side —
     the wordmark is bare text, so it has no button box to give it inset. */
  padding: 4px 4px 4px 8px;
  background: var(--ap-surface-panel);
  border: 1px solid var(--ap-border-default);
  border-radius: var(--ap-radius-md);
  box-shadow: var(--ap-elevation-card);
}
.${PREFIX}-pill-left { left: var(--ap-space-xs); }
.${PREFIX}-pill-right { right: var(--ap-space-xs); }
/* …and the same when the panel it stands for is floating: the pill goes where
   the header was, not back to the corner. \`height\` is deliberately absent — a
   pill is content-sized, and the panel's floating height is not its height.

   Each side anchors on the edge it lives against, which is *not* the edge its
   panel is positioned from. A pill is much narrower than its panel, so the two
   differ: anchoring the right pill on \`--right-x\` like the dock does would hold
   its left edge and pull the right one inwards, and the panel would read as
   collapsing leftwards — the thing that made this look like the agent panel.
   \`applyPlacement\` publishes both edges so each side can take the one it needs;
   the docked rules above already get this for free from \`left\`/\`right\`. */
.${PREFIX}-pill-left.${PREFIX}-pill-float {
  top: var(--${PREFIX}-left-y, 20px); left: var(--${PREFIX}-left-x, 20px);
}
.${PREFIX}-pill-right.${PREFIX}-pill-float {
  top: var(--${PREFIX}-right-y, 20px); right: var(--${PREFIX}-right-r, 20px);
}
/* Both are grab handles. \`.iconbtn\` and \`.seg\` declare \`cursor: pointer\` on
   their own elements and win there, so the header's buttons keep their own
   affordance; the brand and the empty space inherit the grab. */
.${PREFIX}-pill { cursor: grab; user-select: none; }
html[data-${PREFIX}-drag] .${PREFIX}-pill,
html[data-${PREFIX}-drag] .${PREFIX}-head { cursor: inherit; }

/* Header. Vertical padding is tighter than the body's — the row is a 24px
   button tall, and \`space-md\` on top of that reads as a banner. Horizontal
   stays \`space-lg\` so the brand lines up with the transcript below it. */
.${PREFIX}-head {
  display: flex; align-items: center; justify-content: space-between;
  height: 40px; padding: 0 var(--ap-space-xs) 0 var(--ap-space-base);
  border-bottom: 1px solid var(--ap-border-default); flex: 0 0 auto;
  cursor: grab; user-select: none;
}
.${PREFIX}-brand { display: inline-flex; align-items: center; gap: 6px; }
/* One wordmark size for the pill and the dock header. They share a position, so
   expanding a panel must not resize the brand — it should only drop the body in
   underneath. 12px/500 is the bottom bar's label size (\`.seg\`); the extra weight
   is what keeps it reading as a mark rather than a button. */
.${PREFIX}-brand-name { font-weight: 600; font-size: var(--ap-font-size-body); }
.${PREFIX}-head-actions { display: inline-flex; gap: 2px; }
/* Same ghost-button recipe as \`.fbar-btn\` on the bottom bar: no fill, no border,
   the card around it carries the surface. */
.${PREFIX}-iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--ap-control-icon-box); height: var(--ap-control-icon-box); padding: 0; cursor: pointer;
  color: var(--ap-text-primary); background: transparent; border: 0;
  border-radius: var(--ap-radius-sm); transition: background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-iconbtn:hover { background: var(--ap-surface-hover); }

/* Tools. Icon-only, one control tall, grouped by what they are for — what a
   click does, then how you read the page, then the mode. */
.${PREFIX}-tool-group { display: inline-flex; align-items: center; gap: 2px; }
.${PREFIX}-tool {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--ap-control-icon-box); height: var(--ap-control-icon-box);
  padding: 0; border: 0; cursor: pointer;
  background: transparent; border-radius: var(--ap-radius-sm);
  transition: background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-tool:hover { background: var(--ap-surface-hover); }
/* The armed tool is a soft fill with a bright glyph, not an accent block — the
   blue stays for selection on the canvas, where it means something. */
.${PREFIX}-tool-on, .${PREFIX}-tool-on:hover { background: var(--ap-surface-active); }
${ROOT} .${PREFIX}-tool-on .${PREFIX}-ic { --${PREFIX}-ic-tone: var(--ap-text-primary); }
.${PREFIX}-tool:disabled { cursor: default; }
.${PREFIX}-tool:disabled:hover { background: transparent; }
/* Redo is Undo mirrored. The imported set publishes \`rotate-ccw\` and no clockwise
   twin, and the mark is symmetric about its vertical axis, so the flip is exact
   rather than approximate — cheaper and more honest than hand-authoring a
   near-copy into \`icons.ts\`'s \`LEGACY\` block. */
.${PREFIX}-bar-redo .${PREFIX}-ic { transform: scaleX(-1); }
/* The left dock's Pages | Layers row sits under the dock head. The shared
   \`.insp-tabs\` recipe lifts itself above everything with \`order: -1\`, which is
   right inside the inspector and would put this row above the head. */
.${PREFIX}-dock-left .${PREFIX}-left-tabs { order: 0; }
`;
