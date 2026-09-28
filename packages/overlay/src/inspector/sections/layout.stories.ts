import type { Meta, StoryObj } from "@storybook/html-vite";
import { sectionStory } from "../../stories/story-panel";
import { renderAutoLayout } from "./auto-layout";
import { renderConstraints } from "./constraints";
import { renderPosition } from "./position";

/*
 * The geometry sections: Position, Constraints and Layout (which holds size,
 * auto layout and spacing, as Figma's does).
 *
 * Grouped into one file because they are one subject — where the element is, how
 * big it is, and how it arranges what is inside it — and because they share the
 * property that makes them impossible to test under happy-dom.
 *
 * **Every one of these reads a measured box.** Position's X and Y are not CSS
 * values at all: they are a measurement, which is why `ControlHandle.properties`
 * has a clause about controls whose display is *derived* rather than mirrored,
 * listing the properties that can change the measurement and re-measuring in
 * `setValue`. Size decides Hug/Fill/Fixed from `declaredValue` against a real
 * resolved width. Constraints reads the offset parent's box.
 *
 * Under happy-dom all of that is zeros unless a test patches
 * `getBoundingClientRect` per node with `sizeOf()`. Here it is simply true,
 * because the browser laid the page out. These stories are the only place the
 * geometry sections are shown real numbers.
 *
 * That claim was not quite true until recently, and the way it failed is worth
 * recording. `build()` used to mount the specimen on `document.body`, construct
 * the panel — which seeds from the box it measures right there — and only then
 * hand the page to `stage()`, which re-parents it into a pane several hundred
 * pixels narrower. Every number in these five sections had been read from a
 * container the reader never saw. Both paths now seed a frame after mount.
 */

const meta: Meta = {
  title: "Inspector/Sections/Layout",
};

export default meta;

/**
 * Position on a statically-positioned card.
 *
 * X and Y are measured against the offset parent, and the mode select offers the
 * four `position` values that mean something here.
 */
export const Position: StoryObj = {
  render: () =>
    sectionStory(renderPosition, "card", {
      caption: {
        what: "X and Y on a static element — a measurement against the offset parent, not a CSS value.",
      },
    }),
};

/**
 * Position on an absolutely-positioned badge.
 *
 * `.badge` is `position: absolute` with negative `top` and `right` insets inside
 * a `position: relative` card. This is the case the section is really for, and
 * the negative values are what a naive min-0 field would have refused.
 */
export const Absolute: StoryObj = {
  render: () =>
    sectionStory(renderPosition, "badge", {
      caption: {
        try: "note the negative insets — a field with a naive `min: 0` would have refused to show them",
        what: "`position: absolute` with negative `top` and `right`, which is what the section is really for.",
      },
    }),
};

/**
 * Constraints — the pin-to-edge model, applied to CSS insets.
 *
 * Only meaningful on a positioned element, which is why `renderSections` gates
 * it and why `shapeKey` has to carry `position`: change the element from static
 * to absolute and the section must appear, which is a rebuild rather than a
 * re-seed.
 */
export const Constraints: StoryObj = {
  render: () =>
    sectionStory(renderConstraints, "badge", {
      caption: {
        what: "Pin-to-edge over CSS insets. It exists only for positioned elements, which is why `shapeKey` carries `position`.",
      },
    }),
};

/**
 * Layout on a flex column, in Figma's order: Flow, Resizing, Alignment and
 * Gap, Padding, Margin, Clip content.
 */
export const AutoLayout: StoryObj = {
  render: () =>
    sectionStory(
      (ctx, node) => renderAutoLayout(ctx, node, { showBounds: false }),
      "card",
      {
        caption: {
          try: "flip Flow between Vertical and Horizontal — the alignment pad's two axes swap meaning",
          what: "A flex column: Flow, Resizing, the 3×3 pad beside Gap, Padding and Margin.",
        },
      }
    ),
};

/** The same section with min and max open, from the W or H mode menu. */
export const WithMinMax: StoryObj = {
  render: () =>
    sectionStory(
      (ctx, node) => renderAutoLayout(ctx, node, { showBounds: true }),
      "card",
      {
        caption: {
          what: "Min and max open under Resizing, as the W / H mode menu leaves them.",
        },
      }
    ),
};

/**
 * Auto layout on a CSS grid.
 *
 * The section's other branch: `grid-template-columns`, `grid-auto-flow` and two
 * independent gaps replace the flex controls. `.tiles` is a real three-column
 * grid, so the track editor has something to show.
 */
export const Grid: StoryObj = {
  render: () =>
    sectionStory(
      (ctx, node) => renderAutoLayout(ctx, node, { showBounds: false }),
      "tiles",
      {
        caption: {
          what: "The section's other branch: a real three-column grid, so the track editor has tracks to edit.",
        },
      }
    ),
};

/** The geometry sections at `MIN_DOCK_W`, where the four-field splits bite. */
export const Narrow: StoryObj = {
  render: () =>
    sectionStory(
      (ctx, node) => renderAutoLayout(ctx, node, { showBounds: false }),
      "card",
      {
        caption: {
          what: "`MIN_DOCK_W`, where a four-field split has the least room to work with.",
        },
        narrow: true,
      }
    ),
};
