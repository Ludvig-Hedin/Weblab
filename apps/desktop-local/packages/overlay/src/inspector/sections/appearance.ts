import { cls, el } from "../../dom";
import { createMenu } from "../../popover-host";
import { CORNER_PROPERTIES, createCorners } from "../controls/corners";
import { APPEARANCE_GROUP } from "../descriptors";
import { readValue } from "../style-model";
import type { SectionContext } from "./context";

/**
 * The Appearance section: opacity and corner radius on one row, blend
 * mode below them, and Clip content for anything that has an inside.
 *
 * It used to be an opacity cell, a full-width labelled blend-mode select, and
 * `createCorners` bolted on inside an `if (group.id === "appearance")` branch
 * of the generic renderer — three unrelated heights in a section that is four
 * controls long. Opacity and corner radius belong on one line because that is
 * where a design tool puts them and because they are the two you reach for together.
 *
 * What is deliberately *not* here, since a design panel is as much about what
 * it refuses as what it offers:
 *
 * - **Corner smoothing.** The squircle has no CSS equivalent short of a
 *   `clip-path` that would fight `overflow`, `border` and every child.
 * - **`visibility`.** The layer tree's eye already owns show/hide. Two
 *   controls for one property in two places is the redundancy this pass
 *   exists to remove, not to add more of.
 * - **`cursor`.** Interaction, not appearance, and a thirty-option select of
 *   pointer shapes is noise at this density.
 * - **`filter` brightness/contrast/saturate.** Blur already lives in Effects,
 *   which is where design tools keep it; splitting one CSS property across two
 *   sections is how a panel stops being a system.
 * - **`isolation: isolate`** as the "Pass through" blend mode. It is an
 *   honest mapping and it is one more concept than the row can carry.
 */
export function renderAppearance(
  ctx: SectionContext,
  node: Element
): HTMLElement {
  const body = el("div", { class: cls("sect-body") });

  const opacity = APPEARANCE_GROUP.descriptors.find((d) => d.key === "opacity");
  const blend = APPEARANCE_GROUP.descriptors.find(
    (d) => d.key === "mixBlendMode"
  );

  // Figma's Appearance row: Opacity beside Corner radius, labels above, the
  // independent-corners switch in the action lane.
  const labelled = (text: string, control: HTMLElement): HTMLElement =>
    el("div", { class: cls("fgroup") }, [
      el("span", { class: cls("flabel"), text }),
      control,
    ]);
  const top = el("div", { class: cls("lane") });
  if (opacity) {
    const cell = ctx.fieldCell(opacity, node);
    cell.dataset.tip = "Layer opacity, children included";
    top.append(labelled("Opacity", cell));
  }
  const corners = createCorners(
    new Map(CORNER_PROPERTIES.map((p) => [p, readValue(node, p) || "0px"])),
    ctx.onChange,
    ctx.gestures,
    (properties) => ctx.tokenSlot(node, properties)
  );
  ctx.register(corners);
  top.append(labelled("Corner radius", corners.element));
  body.append(top);

  // Blend mode is an icon in the header, as in Figma: it is rarely changed,
  // and a full-width dropdown for it was the heaviest row in the section.
  const actions: HTMLElement[] = [];
  if (blend) {
    const current = (): string => readValue(node, "mix-blend-mode") || "normal";
    const blendButton = ctx.headerAction("blend-mode", "Blend mode", () => {
      createMenu(
        (blend.enumValues ?? []).map((option) => ({
          label: option.label,
          on: option.value === current(),
          run: () => {
            ctx.onChange("mix-blend-mode", option.value);
            paintBlend(option.value);
          },
        }))
      ).open(blendButton, "below");
    });
    const paintBlend = (value: string): void => {
      const label =
        blend.enumValues?.find((o) => o.value === value)?.label ?? value;
      blendButton.dataset.tip = `Blend mode: ${label}`;
      blendButton.setAttribute("aria-label", `Blend mode: ${label}`);
      blendButton.toggleAttribute("data-on", value !== "normal");
    };
    paintBlend(current());
    ctx.register({
      element: blendButton,
      properties: ["mix-blend-mode"],
      setValue: (_property, value) => paintBlend(value),
    });
    actions.push(blendButton);
  }

  return ctx.section("appearance", "Appearance", body, { actions });
}
