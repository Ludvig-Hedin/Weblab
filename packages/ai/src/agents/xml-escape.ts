/**
 * Escape characters that would break the XML-like prompt delimiters used by
 * inline-edit and tab-complete templates.  & must be replaced before < / >
 * so we don't double-escape the resulting entities.
 */
export function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
