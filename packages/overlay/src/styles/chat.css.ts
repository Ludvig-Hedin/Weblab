import { PREFIX } from "../dom";
import { ROOT } from "./const";

/** Left dock: transcript, bubbles, composer, chips, actions, todos, diffs. */
export const css = `
/* The overflow and the scrollbar come from \`.scroll-y\` in base.css, the same
   way the chip rails take theirs from \`.scroll-x\`. */
.${PREFIX}-transcript {
  flex: 1 1 auto; display: flex; flex-direction: column;
  gap: var(--ap-space-md); padding: var(--ap-space-md) var(--ap-space-base);
}
/* The transcript's empty state is a \`.empty-md\` block (empty.css). This class
   carries no styling of its own any more — it is the handle \`pushBubble\` uses
   to find and drop the block when the first bubble lands. */
/* One type size for every sentence in the chat — the question, the steps, the
   answer — after t3code. Hierarchy comes from tone, not from size: prose is
   bright, the work log is muted, the meta is dimmer still. */
.${PREFIX}-msg { font-family: var(--ap-font-sans); font-size: var(--ap-font-size-title); line-height: 1.55; }
.${PREFIX}-msg-user {
  align-self: flex-end; max-width: 85%; padding: 8px 12px; word-break: break-word;
  background: var(--ap-surface-selected); color: var(--ap-text-primary);
  border-radius: var(--ap-radius-lg);
}
.${PREFIX}-msg-assistant {
  align-self: stretch; padding: 0; word-break: break-word;
  background: transparent; border: 1px solid transparent;
  border-radius: var(--ap-radius-md);
  color: var(--ap-text-primary);
}
/* A failed turn. The bubble's body *is* the error string (\`fillAssistant\` puts
   \`bundle.error\` or "Edit failed." there), so the words already carry the news;
   a tinted box around a sentence that says "Edit failed" is the same message a
   second time, in the loudest register the panel has. A stronger border is
   enough to mark it as the odd bubble in the column. */
.${PREFIX}-msg-assistant.${PREFIX}-msg-err { border-color: var(--ap-border-strong); padding: 10px 12px; }
.${PREFIX}-msg-body > *:first-child { margin-top: 0; }
.${PREFIX}-msg-body > *:last-child { margin-bottom: 0; }
.${PREFIX}-msg-body p { margin: 8px 0; }
.${PREFIX}-msg-body h4, .${PREFIX}-msg-body h5, .${PREFIX}-msg-body h6 { margin: 8px 0 4px; font-size: var(--ap-font-size-heading); font-weight: 600; }
.${PREFIX}-msg-body ul, .${PREFIX}-msg-body ol { margin: 6px 0; padding-left: 18px; }
.${PREFIX}-msg-body li { margin: 2px 0; }
/* Underlined rather than tinted. A link still has to announce itself, but the
   affordance can be a rule instead of a hue — see the panel's colour note at
   \`.tl-glyph\` below. */
.${PREFIX}-msg-body a { color: var(--ap-text-primary); text-decoration: underline; text-underline-offset: 2px; }
.${PREFIX}-msg-stream { white-space: pre-wrap; }
.${PREFIX}-md-code {
  font-family: var(--ap-font-mono); font-size: var(--ap-font-size-label); padding: 0 4px;
  background: var(--ap-surface-panel); border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-xs);
}
.${PREFIX}-md-pre {
  margin: 6px 0; padding: 8px 10px; overflow-x: auto;
  background: var(--ap-surface-panel); border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-md);
}
.${PREFIX}-md-pre code { font-family: var(--ap-font-mono); font-size: var(--ap-font-size-label); white-space: pre; }

/* Composer (pinned below the transcript).

   One field, not a stack. The chips, the textarea and Send share a single
   bordered box that starts one line tall — the previous arrangement spent
   ~145px at rest on padding, a 64px textarea floor and a Send pill on its own
   row, which is a lot of permanent furniture for a panel whose real content is
   the transcript above it.

   The gutter that clears Send and the preview toggle belongs to \`.input\`, not
   here. It lived on this rule as \`padding-right: 65px\`, and because \`.field\` is
   a flex *column* that reserved 65px on every row — including the chip rails
   above, where the two buttons are not: they are \`position: absolute\` and
   *bottom*-anchored, so they only ever overlap the textarea. At the default
   340px dock that left the rails ~223px of a possible ~322px and a permanent
   dead gutter, which read as a mystery gap next to a lone chip.

   Moving it costs nothing: an absolutely-positioned child resolves \`right\` and
   \`bottom\` against this element's *padding box*, whose edges do not move when
   padding changes. Both buttons keep their exact coordinates. */
.${PREFIX}-composer { flex: 0 0 auto; padding: var(--ap-space-xs) var(--ap-space-sm) var(--ap-space-sm); }
/* The composer card, after Claude's and Framer's: text on top, a row of
   controls underneath, one soft rounded box around both. A grid rather than
   absolutely-placed buttons, so the text never runs under Send. */
.${PREFIX}-field {
  position: relative; display: grid; grid-template-columns: auto 1fr auto;
  align-items: center; gap: 8px 4px;
  padding: 12px 8px 8px 12px;
  /* One step up from the panel, no drawn edge at rest: the fill alone marks the
     card, the way Framer's composer does. The border stays, transparent, so the
     focus state can fade one in without the card shifting a pixel. */
  background: var(--ap-surface-hover); border: 1px solid transparent;
  border-radius: var(--ap-radius-md);
  transition: border-color var(--ap-motion-dur-micro) var(--ap-motion-ease), background var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-field > .${PREFIX}-sel-chips,
.${PREFIX}-field > .${PREFIX}-chips,
.${PREFIX}-field > .${PREFIX}-input { grid-column: 1 / -1; }
.${PREFIX}-field:focus-within { border-color: var(--ap-border-strong); }
.${PREFIX}-field > button { cursor: pointer; }
/* Chip rows scroll sideways rather than wrapping: each pending change is now
   its own chip, and wrapping a dozen of them would push the field to half the
   dock. Hidden when empty so they cost nothing at rest.

   The overflow, the scrollbar and the edge fade come from \`.scroll-x\` in
   base.css — see the note there about why hiding the scrollbar broke the mouse
   and left it working on a trackpad. */
.${PREFIX}-sel-chips {
  display: flex; flex-wrap: nowrap; gap: var(--ap-space-xs);
}
.${PREFIX}-sel-chips:empty { display: none; }
/* In a nowrap row a chip would otherwise shrink to fit rather than scroll. */
.${PREFIX}-sel-chips > * { flex: 0 0 auto; }
.${PREFIX}-sel-chip {
  display: inline-flex; align-items: center; gap: 6px; font-size: var(--ap-font-size-label); font-family: var(--ap-font-sans);
  color: var(--ap-text-primary); background: var(--ap-surface-active);
  border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-sm); padding: 3px 6px 3px 8px;
}
/* Pending-change chips — one per inspector delta, riding into Send.

   Deliberately quiet. These used to be a single accent-filled pill, which put
   a second saturated element inches from the filled Send button; with a dozen
   of them that reads as an alarm rather than a list. Demoting them to a hover
   surface leaves the selection chip as the one emphasised thing in the strip,
   which is the hierarchy the row wants — now a step of the surface ladder
   rather than a hue, since the strip has no colour left to spend. */
.${PREFIX}-tweak-chip {
  color: var(--ap-text-secondary); background: var(--ap-surface-hover);
  border-color: var(--ap-border-subtle);
  font-family: var(--ap-font-sans);
  /* Was \`caption\` (10px). At that size, with the three fields run together into
     one string, the strip read as fine print you were meant to skip rather than
     as the list of what Send is about to do. \`label\` is the editor's own
     control size and it fits now that the rail has its full width back. */
  font-size: var(--ap-font-size-label); max-width: 240px;
}
.${PREFIX}-tweak-chip:hover { color: var(--ap-text-primary); border-color: var(--ap-border-default); }
/* Inset, like \`.tl-head\`'s. The rail is \`overflow-y: hidden\` — a one-row strip
   has nothing to scroll vertically and should never grow a second scrollbar —
   so a ring drawn *outside* the chip is clipped top and bottom, and the focus
   state of a keyboard-only affordance reads as a rendering fault. */
.${PREFIX}-tweak-chip:focus-visible,
.${PREFIX}-sel-chip:focus-visible {
  outline: 2px solid var(--ap-border-focus); outline-offset: -2px;
}

/* The three fields of a chip.

   They were one space-joined string in 10px mono, so "RootDocument flex 0 0"
   gave the reader no way to tell the element from the property from the value.
   The strip has no colour left to spend — the selection chip is the one
   emphasised thing in the row — so the boundary is carried by the tone ramp
   instead, and a single \`·\` separates the two fields that can both be present.

   Only the subject shrinks: it is the field with a long tail (component display
   names run long), and \`min-width: 0\` is what lets it ellipsise inside a flex
   row rather than pushing the value off the end. */
.${PREFIX}-chip-subject {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ap-text-primary);
}
.${PREFIX}-chip-detail { white-space: nowrap; color: var(--ap-text-secondary); }
.${PREFIX}-chip-value {
  white-space: nowrap; color: var(--ap-text-tertiary);
}
.${PREFIX}-chip-detail + .${PREFIX}-chip-value::before {
  content: "·"; margin-right: 4px; opacity: .55;
}
/* The bulk escape hatch, at the end of the strip. Ghost — it is the most
   destructive thing in the row and should not look like the cheapest. */
.${PREFIX}-chip-all {
  cursor: pointer; color: var(--ap-text-tertiary);
  background: transparent; border-style: dashed;
  font-size: var(--ap-font-size-caption);
}
.${PREFIX}-chip-all:hover { color: var(--ap-text-primary); border-color: var(--ap-border-strong); }

/* Past-chats drawer (overlays the whole left dock). */
/* A column for the same reason \`.insp-body\` is one: it covers the whole dock,
   so its empty state has a dock's worth of space to centre in, and \`margin:
   auto\` needs a flex container to have anything to distribute. The head stays
   pinned at the top either way — it is content-sized. */
/* Overflow from \`.scroll-y\`, as above. */
.${PREFIX}-drawer {
  position: absolute; inset: 0; z-index: 2;
  padding: var(--ap-space-md) var(--ap-space-base); background: var(--ap-surface-panel);
  display: flex; flex-direction: column;
}
.${PREFIX}-drawer-head {
  flex: 0 0 auto; display: flex; align-items: center;
  justify-content: space-between; margin-bottom: var(--ap-space-sm);
}

/* Prompt preview — the instruction as the agent will actually receive it.

   A pane in flow, not a \`.drawer\`. The drawer is \`inset: 0\` over the whole
   dock, which is right for Past chats and wrong here: the point of this surface
   is watching the string change as you type, and a full-dock overlay covers the
   field you type into. So it takes the transcript's slot (hidden while this is
   up) and leaves the head and composer where they are. Borrows the drawer's
   head, eyebrow and close button so it still reads as the same kind of surface. */
/* Overflow from \`.scroll-y\`, as above. */
.${PREFIX}-pane {
  flex: 1 1 auto; min-height: 0;
  padding: var(--ap-space-md) var(--ap-space-base); background: var(--ap-surface-panel);
  display: flex; flex-direction: column;
}
/* A column, so the empty state has the pane's height to centre in — same
   reasoning as \`.drawer\`. */
.${PREFIX}-prompt-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.${PREFIX}-prompt-text {
  margin: 0; flex: 1 1 auto;
  font-family: var(--ap-font-mono); font-size: var(--ap-font-size-body);
  line-height: 1.5; color: var(--ap-text-secondary);
  /* pre-wrap, not pre: a source-context fence runs past 100 columns and a 340px
     dock would scroll sideways for every line of it. */
  white-space: pre-wrap; word-break: break-word;
  -webkit-user-select: text; user-select: text;
}
/* The character count. Genuinely useful here — it is the one place the user can
   see what a dozen chips actually cost in context. */
.${PREFIX}-prompt-count {
  align-self: center; font-family: var(--ap-font-mono);
  font-size: var(--ap-font-size-caption); color: var(--ap-text-tertiary);
  margin-right: var(--ap-space-xs); white-space: nowrap;
}
/* Past-chats list rows. Hover rides the hover surface (one step lighter than
   the panel, not the pressed/active step) and the radius matches the buttons. */
.${PREFIX}-thread-item { display: flex; align-items: flex-start; gap: var(--ap-space-xs); cursor: pointer; padding: 8px; border-radius: var(--ap-radius-sm); }
.${PREFIX}-thread-item:hover { background: var(--ap-surface-hover); }
.${PREFIX}-thread-item .${PREFIX}-ic { margin-top: 2px; opacity: .6; }
.${PREFIX}-thread-main { min-width: 0; flex: 1 1 auto; }
.${PREFIX}-thread-title { font-size: var(--ap-font-size-title); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${PREFIX}-thread-meta { font-family: var(--ap-font-sans); font-size: var(--ap-font-size-caption); opacity: .5; margin-top: 2px; }

.${PREFIX}-eyebrow {
  font-family: var(--ap-font-sans); font-weight: 600;
  font-size: var(--ap-font-size-body); color: var(--ap-text-secondary);
  margin-bottom: var(--ap-space-xs);
}
.${PREFIX}-meta {
  margin-top: 4px; font-family: var(--ap-font-sans); font-size: var(--ap-font-size-body);
  font-variant-numeric: tabular-nums; color: var(--ap-text-tertiary); word-break: break-word;
}

/* Chat input. The box, border and background now belong to \`.field\`; this is
   just the text surface inside it. \`resize: none\` because the height is
   driven by content (see \`autoGrow\`) — a manual resize handle would fight it
   on the next keystroke. No min-height: one row is the resting state.

   The 65px right padding is the gutter for Send and the preview toggle, and it
   is on this rule rather than on \`.field\` because this is the only row those
   two buttons overlap. \`box-sizing: border-box\` (base.css) means it comes out
   of the 100%, not on top of it. */
.${PREFIX}-input {
  width: 100%; resize: none; display: block; font-family: var(--ap-font-sans);
  font-size: var(--ap-font-size-title); line-height: 1.45; color: var(--ap-text-primary);
  background: transparent; border: 0; padding: 0 4px 0 0; min-height: 44px;
}
.${PREFIX}-input::placeholder { color: var(--ap-text-placeholder); }
.${PREFIX}-input:focus { outline: none; }

/* Send. Sits inside the field's right gutter rather than on a row of its own.
   Icon-only — the label lives in \`data-tip\`, which also picks up its ⌘⏎
   binding because tooltips resolve shortcuts by tooltip text.

   The box comes from \`.action\`/\`.action-icon\` below: 28px. This rule used to
   restate 24 and lose on source order, so the numbers here described a button
   that never existed. */
/* Round and bright, the one filled thing in the card. */
.${PREFIX}-field > .${PREFIX}-action.${PREFIX}-send {
  grid-column: 3; width: 28px; height: 28px; border: 0; border-radius: var(--ap-radius-pill);
  background: var(--ap-text-primary); --${PREFIX}-ic-tone: var(--ap-text-inverse);
}
.${PREFIX}-field > .${PREFIX}-action.${PREFIX}-send:not(:disabled):hover { background: var(--ap-gray-200); border: 0; }
.${PREFIX}-field > .${PREFIX}-action.${PREFIX}-send:not(:disabled):active { background: var(--ap-gray-300); }
/* Nothing to send yet: no text and no pending changes or attachments. Muted
   rather than disabled, so it stays clickable and focusable exactly as before;
   it lights up the moment there is something to send. Pure CSS off the
   textarea's own placeholder state, so no script has to keep a class in sync. */
.${PREFIX}-field:has(> .${PREFIX}-input:placeholder-shown):has(> .${PREFIX}-chips:empty):not(:has(.${PREFIX}-tweak-chip)) > .${PREFIX}-action.${PREFIX}-send {
  background: var(--ap-surface-selected); --${PREFIX}-ic-tone: var(--ap-text-tertiary);
}
.${PREFIX}-field:has(> .${PREFIX}-input:placeholder-shown):has(> .${PREFIX}-chips:empty):not(:has(.${PREFIX}-tweak-chip)) > .${PREFIX}-action.${PREFIX}-send:not(:disabled):hover {
  background: var(--ap-gray-600);
}
.${PREFIX}-field > .${PREFIX}-action.${PREFIX}-send:focus-visible,
.${PREFIX}-field > .${PREFIX}-field-btn:focus-visible {
  outline: 2px solid var(--ap-primary-border); outline-offset: 1px;
}

/* The prompt-preview toggle, in the field's gutter beside Send — the control
   that answers "what will Send send?" belongs next to Send.

   Send is 28px, so this clears 28 + a 4px gap, and its \`bottom\` is 7px rather
   than 5 so that a 24px ghost sits centred against a 28px primary. Smaller on
   purpose — it is the secondary control of the pair. Overrides \`.iconbtn\`'s
   taller control height without \`!important\`, since this file loads after
   docks.css.

   The tone goes on --ic-tone, not \`color\`: the glyph is a child span with its
   own rule in base.css, so a \`color\` here never reached it and "secondary
   control is dimmer" was a hierarchy that only existed in this file. */
.${PREFIX}-field-btn {
  grid-column: 1; margin-left: -4px;
  width: 28px; height: 28px; padding: 0; border-radius: var(--ap-radius-pill);
  --${PREFIX}-ic-tone: var(--ap-text-tertiary);
}
/* The card is already \`surface-hover\`, so the ghost's own hover fill would
   vanish into it. One step further up the ladder instead. */
.${PREFIX}-field-btn:hover { background: var(--ap-surface-active); --${PREFIX}-ic-tone: var(--ap-text-primary); }
/* A toggle that stays down while its surface is open. */
.${PREFIX}-iconbtn-on { background: var(--ap-surface-selected); color: var(--ap-text-primary); }
.${PREFIX}-field-btn.${PREFIX}-iconbtn-on { --${PREFIX}-ic-tone: var(--ap-text-primary); }

/* Chips. Same rail treatment as \`.sel-chips\` — \`.scroll-x\` owns the overflow. */
.${PREFIX}-chips {
  display: flex; flex-wrap: nowrap; gap: var(--ap-space-xs);
}
.${PREFIX}-chips:empty { display: none; }
.${PREFIX}-chips > * { flex: 0 0 auto; }
.${PREFIX}-chip {
  display: inline-flex; align-items: center; gap: 6px; font-size: var(--ap-font-size-label);
  background: var(--ap-surface-active); border: 1px solid var(--ap-border-default);
  border-radius: var(--ap-radius-sm); padding: 4px 6px 4px 8px;
}
/* Two elements wear this: the attachment rail's ✕ is a real \`<button>\`, so that
   removing a pasted image is reachable from the keyboard, while the change
   rail's is a span the roving strip drives with ⌫. The reset is what lets one
   rule serve both — without it the button arrives with the UA's grey chrome,
   its own border and its own font. Inert on the span. */
.${PREFIX}-chip-x {
  cursor: pointer; display: inline-flex; opacity: .6;
  padding: 0; border: 0; background: none; color: inherit; font: inherit;
}
.${PREFIX}-chip-x:hover { opacity: 1; }
.${PREFIX}-chip-x:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: 1px; opacity: 1;
}

/* Action buttons — compact, at editor density. Self-sized and right-aligned in the
   composer (not a full-width marketing pill): the editor's controls are 28px
   tall with a 6px radius, so the primary Send reads as one of them, not as a
   CTA dropped in from the marketing site. State tokens drive hover/pressed so
   there's no opacity hack. */
.${PREFIX}-actions { display: flex; justify-content: flex-end; gap: var(--ap-space-xs); margin-top: var(--ap-space-sm); }
.${PREFIX}-action {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: var(--ap-control-icon-box); padding: 0 12px; cursor: pointer;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label); font-weight: 500;
  background: var(--ap-surface-hover); color: var(--ap-text-primary);
  border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-sm);
  transition: background var(--ap-motion-dur-micro) var(--ap-motion-ease), border-color var(--ap-motion-dur-micro) var(--ap-motion-ease), opacity var(--ap-motion-dur-micro) var(--ap-motion-ease);
}
.${PREFIX}-action:not(:disabled):hover { background: var(--ap-surface-active); border-color: var(--ap-border-strong); }
.${PREFIX}-action:not(:disabled):active { background: var(--ap-surface-selected); }
/* The primary action — one step up the surface ladder from its siblings, plus a
   stronger border. It used to be an accent fill, which made Send the loudest
   thing in a panel whose content is the transcript above it; the ladder still
   ranks it above the secondary actions without spending the panel's only hue on
   a button that sits in the same place every time.

   --ic-tone alongside \`color\`: the label is this element's own text and takes
   \`color\`, the glyph is a child span that base.css paints, and both have to be
   the bright tone against the fill. */
.${PREFIX}-action.${PREFIX}-primary {
  background: var(--ap-surface-selected); color: var(--ap-text-primary); border-color: var(--ap-border-strong);
  --${PREFIX}-ic-tone: var(--ap-text-primary);
}
.${PREFIX}-action.${PREFIX}-primary:not(:disabled):hover { background: var(--ap-gray-700); border-color: var(--ap-border-strong); }
.${PREFIX}-action.${PREFIX}-primary:not(:disabled):active { background: var(--ap-gray-600); }
.${PREFIX}-action:disabled { opacity: .45; cursor: default; }
/* Square, so the per-turn actions read as one cluster of glyphs rather than
   three pills competing with the message above them. Their labels live in the
   tooltip. */
.${PREFIX}-action-icon { width: var(--ap-control-icon-box); padding: 0; }
.${PREFIX}-action:focus-visible {
  outline: 1px solid var(--ap-border-focus); outline-offset: 1px;
}

/* Streaming step indicator (inside the assistant bubble). The dot pulses; that
   is what says "running". Tinting it as well says it twice, and a saturated dot
   blinking through a long turn is the most attention-drawing thing the panel
   could do for its least surprising message. */
.${PREFIX}-step { display: flex; align-items: center; gap: var(--ap-space-xs); font-size: var(--ap-font-size-title); color: var(--ap-text-tertiary); }
/* "Working for 12s". No dot: the label shimmers, and the timer ticking is
   already the proof of life. */
.${PREFIX}-turn-status {
  display: flex; align-items: center; min-height: 24px; padding: 0 4px; margin-bottom: 2px;
  font-size: var(--ap-font-size-title); font-variant-numeric: tabular-nums; color: var(--ap-text-tertiary);
}
.${PREFIX}-turn-status-label,
.${PREFIX}-tl-row[data-phase="pending"] > .${PREFIX}-tl-head .${PREFIX}-tl-name,
.${PREFIX}-tl-think.${PREFIX}-tl-live .${PREFIX}-tl-think-label {
  color: transparent;
  background: linear-gradient(90deg, transparent, var(--ap-text-primary), transparent) -72px 0 / 72px 100% no-repeat,
    linear-gradient(var(--ap-text-tertiary), var(--ap-text-tertiary));
  -webkit-background-clip: text; background-clip: text;
  animation: ${PREFIX}-shine 2.2s linear infinite;
}
@keyframes ${PREFIX}-shine { to { background-position: calc(100% + 72px) 0, 0 0; } }
@media (prefers-reduced-motion: reduce) {
  .${PREFIX}-turn-status-label,
  .${PREFIX}-tl-row[data-phase="pending"] > .${PREFIX}-tl-head .${PREFIX}-tl-name,
  .${PREFIX}-tl-think.${PREFIX}-tl-live .${PREFIX}-tl-think-label {
    animation: none; background: none; color: var(--ap-text-tertiary);
  }
}

/* "Worked for 12s ›" — the finished turn's steps, folded above the answer. */
.${PREFIX}-turn-fold {
  display: inline-flex; align-items: center; gap: 2px; min-height: 24px;
  margin: 0 0 var(--ap-space-xxs); padding: 0 4px; cursor: pointer;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-title);
  font-variant-numeric: tabular-nums; color: var(--ap-text-tertiary);
  background: transparent; border: 0; border-radius: var(--ap-radius-xs);
  -webkit-appearance: none; appearance: none;
}
.${PREFIX}-turn-fold:hover { color: var(--ap-text-secondary); }
.${PREFIX}-turn-fold:focus-visible { outline: 1px solid var(--ap-border-focus); outline-offset: 1px; }
.${PREFIX}-turn-fold[hidden], .${PREFIX}-turn-log[hidden] { display: none; }
.${PREFIX}-turn-log { margin-bottom: var(--ap-space-xs); }
.${PREFIX}-dot { width: 7px; height: 7px; border-radius: var(--ap-radius-full); background: var(--ap-text-tertiary); animation: ${PREFIX}-pulse 1s infinite; }
@keyframes ${PREFIX}-pulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }

/* ---- Agent activity timeline ------------------------------------------- *
 * Claude Code's terminal grammar rendered in editor tokens: a status dot
 * leading the tool name, an elbow rail carrying the one-line result, and the
 * full output behind a disclosure. The rail glyphs are drawn SVGs, not text —
 * U+23FA/U+23BF aren't in the latin font subsets we self-host.
 *
 * The overlay has no shadow root, so every rule below states its box, type and
 * background outright rather than inheriting from the host page.
 */
.${PREFIX}-tl { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; }
.${PREFIX}-tl:empty { display: none; }

.${PREFIX}-tl-row { display: block; margin: 0; padding: 0; border: 0; background: none; }

/* Header row. A <button> when expandable, a <div> when not — both must present
   as the same dense, left-aligned line. */
/* One quiet sans line per step, the same size as the prose around it and a
   tone below it. Mono is kept for the one place it helps: raw tool output. */
.${PREFIX}-tl-head {
  display: flex; align-items: center; gap: 6px; min-height: 24px;
  width: 100%; margin: 0; padding: 2px 4px; cursor: pointer; text-align: left;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-title);
  line-height: 1.5; color: var(--ap-text-secondary);
  background: transparent; border: 0; border-radius: var(--ap-radius-xs);
  -webkit-appearance: none; appearance: none;
}
.${PREFIX}-tl-head:hover { background: var(--ap-surface-hover); }
.${PREFIX}-tl-head:focus-visible { outline: 1px solid var(--ap-border-focus); outline-offset: -1px; }
/* Nothing to expand — drop the affordance but keep the alignment. */
.${PREFIX}-tl-flat > .${PREFIX}-tl-head { cursor: default; }
.${PREFIX}-tl-flat > .${PREFIX}-tl-head:hover { background: transparent; }

/* Leading glyph. Shape carries which tool (\`TOOL_GLYPH\` in tool-row.ts) and
   nothing else — every glyph in the timeline rests at one quiet tone.

   There used to be a per-phase colour here: green for ok, red for error, purple
   on the thinking row. It never actually rendered — \`base.css\` paints every
   \`.ic\` under \`#\${PREFIX}-root\`, and an id outranks any number of classes,
   so the wrapper's colour was overridden by the icon inside it. Making it work
   showed why it should not: a finished turn is thirty rows, nearly all of them
   \`ok\`, so the effect was a column of green demanding attention on behalf of
   "this worked", which is the least surprising thing a transcript can say.

   That argument has since been taken to its end across this whole file. Diff
   add/del is the only hue left in the panel — the one place where the thing
   being distinguished has no shape, weight or position of its own to carry it.
   Everything else ranks by the tools a monochrome column still has: the text
   ramp for emphasis, \`font-weight\` for the row that matters, \`opacity\` for
   the row that does not, the surface ladder for fills, and motion for pending.

   Failure is still the loudest thing here, just not the reddest — the result
   line under a failed row goes bright and bold (see \`.tl-res-text\` below),
   which is what separates it from thirty \`--ap-text-secondary\` siblings.

   Scoped to \`ROOT\` and reaching the \`.ic\` for the same specificity reason: a
   rule on the wrapper alone would lose to \`base.css\` and the glyphs would sit
   at \`--ap-icon-secondary\`, a step brighter than the rest of the row. */
.${PREFIX}-tl-glyph { display: inline-flex; flex: 0 0 auto; align-self: center; }
${ROOT} .${PREFIX}-tl-glyph .${PREFIX}-ic { --${PREFIX}-ic-tone: var(--ap-text-tertiary); }
.${PREFIX}-tl-row[data-phase="pending"] .${PREFIX}-tl-glyph { animation: ${PREFIX}-pulse 1s infinite; }

.${PREFIX}-tl-name { flex: 0 0 auto; color: var(--ap-text-secondary); white-space: nowrap; }
.${PREFIX}-tl-args {
  min-width: 0; flex: 0 1 auto; color: var(--ap-text-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* A failed step says so on its own line, bright rather than red — see the
   glyph note above. */
.${PREFIX}-tl-fail {
  min-width: 0; flex: 0 1 auto; color: var(--ap-text-primary); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${PREFIX}-tl-fail:empty { display: none; }

/* Expanded body. */
/* Collapsing is per-row state (see TimelineView.setCollapsed) — deliberately
   no \`.tl-collapsed .tl-body { display: none }\` here. A descendant rule like
   that outranks the row's own disclosure, which is what used to freeze every
   finished turn's rows shut. */
.${PREFIX}-tl-body { margin: 0 0 var(--ap-space-xs) 0; padding: 0 4px 0 26px; }
.${PREFIX}-tl-sum { margin: 0 0 var(--ap-space-xxs); color: var(--ap-text-tertiary); font-size: var(--ap-font-size-label); }

.${PREFIX}-tl-args-list {
  display: grid; grid-template-columns: auto 1fr; gap: 0 var(--ap-space-xs);
  margin: 0 0 var(--ap-space-xs) 0; padding: 0;
  font-family: var(--ap-font-mono); font-size: var(--ap-font-size-body); line-height: 1.6;
}
.${PREFIX}-tl-args-list dt { margin: 0; color: var(--ap-text-tertiary); }
.${PREFIX}-tl-args-list dd { margin: 0; color: var(--ap-text-secondary); word-break: break-word; }

/* Vertical overflow from \`.scroll-y\`; \`overflow-x\` stays here because a tool's
   output is preformatted and its long lines scroll sideways. */
.${PREFIX}-tl-out {
  margin: 0; padding: 6px 8px; max-height: 260px; overflow-x: auto;
  font-family: var(--ap-font-mono); font-size: var(--ap-font-size-body); line-height: 1.5;
  color: var(--ap-text-secondary); white-space: pre-wrap; word-break: break-word;
  background: var(--ap-surface-panel);
  border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-xs);
}
.${PREFIX}-tl-trunc {
  margin-top: 2px; font-family: var(--ap-font-mono);
  font-size: var(--ap-font-size-caption); color: var(--ap-text-tertiary);
}

/* Thinking. Sans and italic so it reads as reflection, not tool activity —
   carried by the label alone. The bulb stays at the timeline's one glyph tone
   like every other row: the italic word beside it already says what kind of row
   this is, and tinting the mark as well says it twice.

   The label was purple until the semantic palette lost that family, and the
   panel has since stopped spending hue on anything but diff add/del. It would
   not have earned one back regardless: "the model is thinking" is a *kind* of
   row rather than a state, and the sans face and the italic already carry that
   against a column of mono tool names. */
.${PREFIX}-tl-think-label { color: var(--ap-text-tertiary); }
.${PREFIX}-tl-think-text {
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-title); line-height: 1.55;
  color: var(--ap-text-secondary); white-space: pre-wrap; word-break: break-word;
}

/* Assistant prose inside the timeline keeps the bubble's sans body scale. */
.${PREFIX}-tl-text { padding: 2px 4px; margin: 2px 0 4px; font-size: var(--ap-font-size-title); color: var(--ap-text-primary); }

/* Todos, hung off the same rail as a tool result. */
/* Todos, indented under the step labels, a size and a tone down: the plan is
   context for the steps, not a second answer. */
.${PREFIX}-tl-todos { padding: 2px 4px 4px 26px; }
.${PREFIX}-tl-todos .${PREFIX}-todos { margin-top: 0; }
.${PREFIX}-tl-todos .${PREFIX}-todos li { font-size: var(--ap-font-size-label); color: var(--ap-text-secondary); padding: 1px 0; }

/* A diff nested in a tool body already sits inside a bordered box. */
.${PREFIX}-tl-body .${PREFIX}-diff { margin: 0; border: 0; border-radius: 0; }

.${PREFIX}-turn-result { padding: 0 4px; }
.${PREFIX}-turn-result:empty { display: none; }

/* Todos. Status rides opacity and weight, not hue.

   Completed used to be green and in-progress blue, which inverted the hierarchy
   the list actually wants: a checklist is read to find the row still in flight,
   and colouring the finished ones made the answered question the loud one. The
   \`check\` glyph and the line-through already say "done" twice over, so done
   recedes and in-progress is the single brightest, heaviest line. */
.${PREFIX}-todos { margin-top: var(--ap-space-sm); list-style: none; padding: 0; }
.${PREFIX}-todos li { display: flex; gap: var(--ap-space-xs); align-items: center; font-size: var(--ap-font-size-title); padding: 2px 0; opacity: .8; }
.${PREFIX}-todos li .${PREFIX}-ic { opacity: .6; }
.${PREFIX}-todos li[data-s="completed"] { opacity: .55; }
.${PREFIX}-todos li[data-s="completed"] span { text-decoration: line-through; }
.${PREFIX}-todos li[data-s="in_progress"] { opacity: 1; font-weight: 500; }

/* A collapsed disclosure outside the timeline. The timeline uses its status dot
   as the affordance and draws no chevron; anything else has to, or it reads as
   a line of inert text. */
.${PREFIX}-disc-chev { display: inline-flex; align-items: center; flex: 0 0 auto; color: var(--ap-text-tertiary); }
.${PREFIX}-disc-head {
  display: flex; align-items: center; gap: var(--ap-space-xs);
  width: 100%; padding: 5px 8px; cursor: pointer; text-align: left;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label);
  color: var(--ap-text-secondary);
  background: transparent; border: 0; border-radius: var(--ap-radius-sm);
  -webkit-appearance: none; appearance: none;
}
.${PREFIX}-disc-head:hover { color: var(--ap-text-primary); background: var(--ap-surface-hover); }
.${PREFIX}-disc-body { padding-top: var(--ap-space-xs); }
.${PREFIX}-follow-disc { margin-top: var(--ap-space-xs); }
/* Suggestions: a quiet line under the answer, not a filled bar. */
.${PREFIX}-follow-disc > .${PREFIX}-disc-head {
  width: auto; gap: 2px; padding: 4px 0; color: var(--ap-text-tertiary); font-size: var(--ap-font-size-title);
}
.${PREFIX}-follow-disc > .${PREFIX}-disc-head:hover { background: transparent; color: var(--ap-text-secondary); }

/* Changed files: one card under the answer. A header with the totals, then a
   folded row per file — name first, folder dimmer, counts at the end. */
.${PREFIX}-turn-files {
  margin-top: var(--ap-space-sm); overflow: hidden;
  background: var(--ap-surface-hover); border-radius: var(--ap-radius-sm);
}
.${PREFIX}-turn-files-head {
  display: flex; align-items: center; gap: var(--ap-space-xs); padding: 8px 10px;
  font-size: var(--ap-font-size-label);
}
.${PREFIX}-turn-files-title { font-weight: 500; color: var(--ap-text-primary); }
.${PREFIX}-turn-stat {
  display: inline-flex; gap: 4px; flex: 0 0 auto; white-space: nowrap;
  font-family: var(--ap-font-mono); font-size: var(--ap-font-size-caption); font-variant-numeric: tabular-nums;
}
.${PREFIX}-turn-stat-add { color: var(--ap-semantic-success); }
.${PREFIX}-turn-stat-del { color: var(--ap-semantic-error); }
.${PREFIX}-turn-files .${PREFIX}-diff { margin: 0; border: 0; border-top: 1px solid var(--ap-border-subtle); border-radius: 0; }
.${PREFIX}-turn-files .${PREFIX}-diff-head { background: transparent; padding: 6px 10px; }
.${PREFIX}-turn-files .${PREFIX}-diff-head:hover { background: var(--ap-surface-active); }
.${PREFIX}-diff-path { display: flex; align-items: baseline; gap: 6px; flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; }
.${PREFIX}-diff-head .${PREFIX}-diff-path .${PREFIX}-diff-file { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-family: var(--ap-font-sans); font-weight: 400; font-size: var(--ap-font-size-label); }
.${PREFIX}-diff-dir {
  min-width: 0; overflow: hidden; text-overflow: ellipsis;
  font-size: var(--ap-font-size-caption); color: var(--ap-text-tertiary);
}

/* Diffs. */
.${PREFIX}-diffs { margin-top: var(--ap-space-md); }
.${PREFIX}-diff { margin-bottom: var(--ap-space-sm); border: 1px solid var(--ap-border-default); border-radius: var(--ap-radius-md); overflow: hidden; }
/* Also the disclosure header for a collapsed file, hence the button reset and
   the pointer — a plain header and a toggle have to look identical here. */
.${PREFIX}-diff-head {
  display: flex; align-items: center; gap: var(--ap-space-xs);
  width: 100%; padding: 6px 10px; text-align: left; cursor: pointer;
  background: var(--ap-surface-active); font-size: var(--ap-font-size-body);
  color: var(--ap-text-primary); border: 0;
  -webkit-appearance: none; appearance: none;
}
.${PREFIX}-diff-head:hover { background: var(--ap-surface-selected); }
.${PREFIX}-diff-head .${PREFIX}-diff-file { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${PREFIX}-diff-more {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; flex: 0 0 auto; padding: 0; cursor: pointer;
  color: var(--ap-text-tertiary); background: transparent; border: 0;
  border-radius: var(--ap-radius-xs); opacity: 0;
}
.${PREFIX}-diff:hover .${PREFIX}-diff-more,
.${PREFIX}-diff-more:focus-visible { opacity: 1; }
.${PREFIX}-diff-more:hover { color: var(--ap-text-primary); background: var(--ap-surface-hover); }
.${PREFIX}-diff-plain { display: block; }
.${PREFIX}-diff-file { font-family: var(--ap-font-mono); color: var(--ap-text-primary); font-weight: 600; }
.${PREFIX}-diff-stat { font-family: var(--ap-font-mono); opacity: .5; }
.${PREFIX}-diff-body { margin: 0; padding: 6px 0; background: var(--ap-surface-panel); overflow-x: auto; font: var(--ap-font-size-body)/1.5 var(--ap-font-mono); }
.${PREFIX}-diff-line { padding: 0 10px; white-space: pre; }
.${PREFIX}-diff-add { background: var(--ap-semantic-success-bg); color: var(--ap-semantic-success); }
.${PREFIX}-diff-del { background: var(--ap-semantic-error-bg); color: var(--ap-semantic-error); }
/* Structural punctuation between hunks, not content — quieter than the code it
   separates. The add/del pair below are the only hue left in this panel. */
.${PREFIX}-diff-hunk { color: var(--ap-text-tertiary); }
.${PREFIX}-diff-ctx { opacity: .55; }

/* Follow-ups — same secondary-button recipe as the composer actions: 6px
   radius, 12px type, surface-hover default → surface-active on hover, so they
   read as one control family with Send rather than a third distinct shape. */
.${PREFIX}-follow { margin-top: var(--ap-space-sm); display: flex; flex-direction: column; gap: var(--ap-space-xs); }
.${PREFIX}-follow button {
  display: flex; align-items: center; gap: var(--ap-space-xs); text-align: left; cursor: pointer;
  font-family: var(--ap-font-sans); font-size: var(--ap-font-size-label); color: var(--ap-text-primary);
  background: var(--ap-surface-hover); border: 1px solid var(--ap-border-default);
  border-radius: var(--ap-radius-sm); padding: 6px 10px;
}
.${PREFIX}-follow button:hover { border-color: var(--ap-border-strong); background: var(--ap-surface-active); }
.${PREFIX}-follow button { --${PREFIX}-ic-tone: var(--ap-text-tertiary); }`;
