export enum Tags {
    TEMPLATE = 'template',
}

/**
 * Text-level (phrasing) tags that inline text editing treats as part of a
 * text block: double-clicking a heading whose children are only text, <br>
 * and these tags edits the whole heading at once.
 */
export const INLINE_TEXT_TAGS: readonly string[] = [
    'span',
    'strong',
    'em',
    'b',
    'i',
    'a',
    'u',
    's',
    'small',
    'mark',
    'sub',
    'sup',
    'code',
    'abbr',
    'cite',
    'q',
    'del',
    'ins',
    'kbd',
    'time',
    'dfn',
    'samp',
    'var',
    'bdi',
    'bdo',
];
