import { keywordsFor, LENGTH_UNITS } from "../css-length";
import type { Descriptor } from "../descriptors";
import { createNumField, type NumSpec } from "./num-field";
import type { ControlHandle, Gestures, OnChange } from "./types";

/*
 * The descriptor pipeline's numeric control.
 *
 * All the behaviour lives in `num-field.ts`; this is the ~30 lines that turn a
 * `Descriptor` into a `NumSpec` and a `NumHandle` into a `ControlHandle`. It
 * used to *be* the implementation, which is why five other places grew their
 * own copy of it — a control that can only be built from a full `Descriptor` is
 * unreachable from anything that edits four longhands at once, or one channel
 * of a colour, or an entry in a serialised shadow list.
 */

/** Translate a descriptor into the field spec it describes. */
export function specOf(descriptor: Descriptor): NumSpec {
  const unitless = descriptor.unit === "";
  return {
    fieldKey: descriptor.key,
    glyph: descriptor.fieldIcon ?? descriptor.fieldLabel,
    /*
     * Asked of the property, not handed out uniformly.
     *
     * This was one shared list — `auto, none, normal, inherit, initial, unset`
     * — given to every length field in the panel. Three of those are invalid on
     * most of the properties that got them, and `font-size: auto` was the
     * result: typed, accepted, repainted as though it had worked, and queued
     * for the agent. `keywordsFor` knows which words each property actually
     * takes, and always includes the globals, which really are legal anywhere.
     */
    keywords: keywordsFor(descriptor.cssProperty),
    label: descriptor.label,
    max: descriptor.max,
    min: descriptor.min,
    step: descriptor.step,
    suffix: descriptor.suffix,
    unit: descriptor.unit ?? "px",
    // A unitless field (opacity, line-height, z-index) takes a bare ratio, and
    // offering it `20rem` would be offering a value the property cannot use.
    // `line-height` is the one that also wants px, so it opts in by declaring
    // its own unit rather than by being special-cased here.
    units: unitless ? [] : [...LENGTH_UNITS],
  };
}

/** Number field with a drag-to-scrub grip. Emits live changes while dragging. */
export function createNumberScrub(
  descriptor: Descriptor,
  initial: string,
  onChange: OnChange,
  gestures?: Gestures
): ControlHandle {
  if (descriptor.asPercent) {
    return createPercentScrub(descriptor, initial, onChange, gestures);
  }
  const field = createNumField(
    specOf(descriptor),
    initial || descriptor.defaultValue,
    (css) => onChange(descriptor.cssProperty, css),
    gestures
  );
  return {
    destroy: field.destroy,
    element: field.element,
    onActivate: (open) => field.onActivate(open),
    properties: [descriptor.cssProperty],
    setToken: (name) => field.setToken(name),
    setValue(cssProperty, value) {
      if (cssProperty === descriptor.cssProperty) {
        field.setValue(value);
      }
    },
  };
}

const PERCENT = 100;

/** `0.8` → `"80"`: the percentage a 0-1 CSS value is shown as. */
export function toPercent(css: string): string {
  const n = Number.parseFloat(css);
  return Number.isNaN(n) ? css : String(Math.round(n * PERCENT * 10) / 10);
}

/**
 * What a typed percentage writes. A decimal up to 1 is taken as the fraction
 * itself (`0.8` → 0.8), so both ways of saying eighty percent work; anything
 * else is a percentage (`80` → 0.8). Clamped to 0-1.
 *
 * `shown` is the percentage the field held before. A value within one point of
 * it is a nudge (⌥-arrow or ⌥-scrub step by 0.1), not a fraction: going from
 * 0% to 0.3 means 0.3%, where typing 0.3 over 100% means 30%.
 */
export function fromPercent(raw: string, shown?: number): string | null {
  const text = raw.trim().replace("%", "");
  const n = Number.parseFloat(text);
  if (Number.isNaN(n)) {
    return null;
  }
  const nudge = shown !== undefined && Math.abs(n - shown) < 1;
  const fraction = text.includes(".") && n <= 1 && !nudge ? n : n / PERCENT;
  return String(Math.min(1, Math.max(0, Math.round(fraction * 1000) / 1000)));
}

/** A 0-1 property shown as 0-100%, the way a design tool shows opacity. */
function createPercentScrub(
  descriptor: Descriptor,
  initial: string,
  onChange: OnChange,
  gestures?: Gestures
): ControlHandle {
  let shown = Number.parseFloat(toPercent(initial || descriptor.defaultValue));
  const field = createNumField(
    {
      ...specOf(descriptor),
      max: PERCENT,
      min: 0,
      step: 1,
      suffix: "%",
      unit: "",
      units: ["%"],
    },
    toPercent(initial || descriptor.defaultValue),
    (typed) => {
      const css = fromPercent(typed, shown);
      if (css === null) {
        return;
      }
      onChange(descriptor.cssProperty, css);
      shown = Number.parseFloat(toPercent(css));
      field.setValue(toPercent(css));
    },
    gestures
  );
  return {
    destroy: field.destroy,
    element: field.element,
    onActivate: (open) => field.onActivate(open),
    properties: [descriptor.cssProperty],
    setToken: (name) => field.setToken(name),
    setValue(cssProperty, value) {
      if (cssProperty === descriptor.cssProperty) {
        shown = Number.parseFloat(toPercent(value));
        field.setValue(toPercent(value));
      }
    },
  };
}
