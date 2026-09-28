/**
 * Content-source markers hidden inside CMS strings ("stega").
 *
 * Sanity's visual editing, and Vercel's encoder it is built on, append a run
 * of invisible zero-width characters to every string it serves in preview. The
 * run encodes a small JSON payload whose `href` opens that exact field in the
 * CMS. For the editor that is two facts in one: the text came from the CMS, so
 * it must not be written into the code, and here is where to change it instead.
 */

/** The four characters the encoding uses, one base-4 digit each. */
const DIGITS = ["\u200B", "\u200C", "\u200D", "\uFEFF"] as const;
// Alternations rather than character classes: a class of zero-width
// characters is exactly what the misleading-class lint exists to flag.
const RUN = /(?:\u200B|\u200C|\u200D|\uFEFF){8,}/;
const ALL = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g;
/** Digits per encoded character: four base-4 digits make one byte. */
const DIGITS_PER_CHAR = 4;

export interface StegaInfo {
  /** Where to edit the value, when the payload names one. */
  href: string | null;
  /** The payload's origin, e.g. `sanity.io`. */
  origin: string | null;
}

/** Whether a string carries a hidden content-source marker. */
export function hasStega(value: string): boolean {
  return RUN.test(value);
}

/** The visible text, with every zero-width character removed. */
export function cleanStega(value: string): string {
  return value.replace(ALL, "");
}

function decodeDigits(run: string, offset: number): string | null {
  let out = "";
  for (
    let i = offset;
    i + DIGITS_PER_CHAR <= run.length;
    i += DIGITS_PER_CHAR
  ) {
    let code = 0;
    for (let j = 0; j < DIGITS_PER_CHAR; j += 1) {
      const digit = DIGITS.indexOf(run[i + j] as (typeof DIGITS)[number]);
      if (digit === -1) {
        return null;
      }
      code = code * 4 + digit;
    }
    out += String.fromCharCode(code);
  }
  return out;
}

/**
 * Decode the payload, or null when there is none or it cannot be read.
 *
 * Tolerant on purpose: encoders differ on whether a fixed prefix precedes the
 * data, so every alignment of the first few characters is tried and the first
 * one that parses as JSON wins. A marker that cannot be decoded still counts
 * for `hasStega` — the value is still the CMS's — it just has no link.
 */
export function decodeStega(value: string): StegaInfo | null {
  const run = RUN.exec(value)?.[0];
  if (!run) {
    return null;
  }
  for (let offset = 0; offset < DIGITS_PER_CHAR * 2; offset += 1) {
    const text = decodeDigits(run, offset);
    const start = text?.indexOf("{") ?? -1;
    if (!text || start === -1) {
      continue;
    }
    try {
      const payload = JSON.parse(text.slice(start)) as Record<string, unknown>;
      return {
        href: typeof payload.href === "string" ? payload.href : null,
        origin: typeof payload.origin === "string" ? payload.origin : null,
      };
    } catch {
      // Try the next alignment.
    }
  }
  return { href: null, origin: null };
}

/** The encoder's inverse, for tests. */
export function encodeStega(payload: object): string {
  let out = "";
  for (const char of JSON.stringify(payload)) {
    const code = char.charCodeAt(0);
    let digits = "";
    let rest = code;
    for (let j = 0; j < DIGITS_PER_CHAR; j += 1) {
      digits = (DIGITS[rest % 4] ?? "") + digits;
      rest = Math.floor(rest / 4);
    }
    out += digits;
  }
  return out;
}
