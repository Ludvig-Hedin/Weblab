import type { DefaultTreeAdapterMap } from 'parse5';
import { defaultTreeAdapter, html as parse5Html } from 'parse5';
import postcss from 'postcss';
import { find, hastToReact, html, svg } from 'property-information';

import type { RewriteReference } from './assets';
import { rewriteCssUrls, rewriteSrcSet, rewriteStylesheet } from './assets';

export type HtmlNode = DefaultTreeAdapterMap['childNode'];
export type Element = DefaultTreeAdapterMap['element'];
type Parent = Pick<Element, 'childNodes'>;
type Attribute = Element['attrs'][number];

export const isElement = (node: HtmlNode): node is Element =>
    defaultTreeAdapter.isElementNode(node);
export const isText = (node: HtmlNode): node is DefaultTreeAdapterMap['textNode'] =>
    defaultTreeAdapter.isTextNode(node);
export const isComment = (node: HtmlNode): node is DefaultTreeAdapterMap['commentNode'] =>
    defaultTreeAdapter.isCommentNode(node);

export function getAttr(element: Element, name: string) {
    return element.attrs.find((attribute) => attribute.name === name && !attribute.prefix)?.value;
}

export function childElements(parent: Parent) {
    return parent.childNodes.filter(isElement);
}

export function* elements(parent: Element): Generator<Element> {
    yield parent;
    for (const child of childElements(parent)) yield* elements(child);
}

export function textContent(element: Element) {
    let text = '';
    for (const child of element.childNodes) {
        if (isText(child)) text += child.value;
        if (isElement(child)) text += textContent(child);
    }
    return text;
}

export function literal(value: unknown) {
    return JSON.stringify(value)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

const voidTags = new Set(
    'area base br col embed hr img input link meta param source track wbr'.split(' '),
);
const assetAttributes = new Set([
    'src',
    'poster',
    'background',
    'data-src',
    'data-poster-url',
    'data-bg',
    'data-background-image',
    'xlink:href',
]);

export interface MarkupContext {
    source: string;
    rewrite: RewriteReference;
    replaceFont: (value: string) => string;
    warn: (message: string) => void;
}

function children(element: Element) {
    return defaultTreeAdapter.getTagName(element) === 'template' && 'content' in element
        ? (element.content as Parent).childNodes
        : element.childNodes;
}

export function rewriteAttributes(element: Element, context: MarkupContext): void {
    for (const attribute of element.attrs) {
        const name = qualifiedName(attribute);
        if (name === 'srcset' || name === 'data-srcset') {
            attribute.value = rewriteSrcSet(attribute.value, context.rewrite);
        } else if (name === 'data-video-urls') {
            attribute.value = attribute.value
                .split(',')
                .map((url) => context.rewrite(url))
                .join(',');
        } else if (name === 'href') {
            const kind = ['a', 'area'].includes(element.tagName) ? 'link' : 'asset';
            attribute.value = context.rewrite(attribute.value, kind);
        } else if (assetAttributes.has(name) || (name === 'data' && element.tagName === 'object')) {
            attribute.value = context.rewrite(attribute.value);
        }
    }
    for (const child of children(element).filter(isElement)) rewriteAttributes(child, context);
}

function qualifiedName(attribute: Attribute) {
    return attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name;
}

function cssProperty(property: string) {
    if (property.startsWith('--')) return property;
    return property
        .toLowerCase()
        .replace(/^-ms-/, 'ms-')
        .replace(/-([a-z])/g, (_, character: string) => character.toUpperCase());
}

function inlineStyles(value: string, context: MarkupContext) {
    const styles = new Map<string, string>();
    try {
        const rules = postcss.parse(`x{${value}}`).first;
        if (rules?.type !== 'rule') return {};
        rules.walkDecls((declaration) => {
            let style = rewriteCssUrls(declaration.value, context.rewrite);
            if (declaration.prop.toLowerCase() === 'font-family')
                style = context.replaceFont(style);
            if (declaration.important) {
                style += ' !important';
                context.warn('An inline !important declaration needs manual review.');
            }
            styles.set(cssProperty(declaration.prop), style);
        });
    } catch {
        context.warn('An invalid inline style needs manual review.');
    }
    return Object.fromEntries(styles);
}

function attributeString(value: string) {
    return (
        '"' +
        value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r/g, '&#13;')
            .replace(/\n/g, '&#10;') +
        '"'
    );
}

export function emitAttributes(
    element: Element,
    context: MarkupContext,
    skip: readonly string[] = [],
) {
    const attributes: string[] = [];
    for (const attribute of element.attrs) {
        const name = qualifiedName(attribute);
        if (skip.includes(name)) continue;
        if (
            /^on/i.test(name) ||
            /^(?:dangerouslySetInnerHTML|ref|key|suppressHydrationWarning)$/i.test(name)
        ) {
            context.warn(
                `Skipped the ${name} attribute on <${element.tagName}>. Review custom behavior.`,
            );
            continue;
        }
        const info = find(element.namespaceURI === parse5Html.NS.SVG ? svg : html, name);
        let property =
            name.startsWith('data-') || name.startsWith('aria-')
                ? name
                : Object.hasOwn(hastToReact, info.property)
                  ? hastToReact[info.property]!
                  : info.property;
        const value = attribute.value;
        if (element.tagName === 'input') {
            if (name === 'checked') property = 'defaultChecked';
            if (name === 'value') property = 'defaultValue';
        }
        if (name === 'style') {
            attributes.push(`style={${literal(inlineStyles(value, context))} as CSSProperties}`);
        } else if (!/^[-\w]+$/.test(property)) {
            attributes.push(`{...{${literal(property)}: ${literal(value)}}}`);
        } else if (info.boolean || (info.overloadedBoolean && !value)) {
            attributes.push(property);
        } else if (info.number && value.trim() && Number.isFinite(Number(value))) {
            attributes.push(`${property}={${Number(value)}}`);
        } else {
            attributes.push(`${property}=${attributeString(value)}`);
        }
    }
    return attributes.length ? ' ' + attributes.join(' ') : '';
}

function selectedOptions(element: Element) {
    const options = [...elements(element)].filter((option) => option.tagName === 'option');
    const selected = options
        .filter((option) => getAttr(option, 'selected') !== undefined)
        .map(
            (option) => getAttr(option, 'value') ?? textContent(option).trim().replace(/\s+/g, ' '),
        );
    return getAttr(element, 'multiple') === undefined ? selected.at(-1) : selected;
}

export function emitNode(node: HtmlNode, context: MarkupContext): string {
    if (isText(node)) return node.value ? `{${literal(node.value)}}` : '';
    if (isComment(node)) return `{/*${node.data.replace(/\*\//g, '* /')}*/}`;
    if (!isElement(node)) return '';

    const { tagName } = node;
    const skip = ['textarea', 'select'].includes(tagName)
        ? ['value']
        : tagName === 'option'
          ? ['selected']
          : [];
    let props = emitAttributes(node, context, skip);
    if (tagName === 'textarea') props += ` defaultValue={${literal(textContent(node))}}`;
    if (tagName === 'select') {
        const selected = selectedOptions(node);
        if (selected !== undefined) props += ` defaultValue={${literal(selected)}}`;
    }
    if (node.namespaceURI === parse5Html.NS.HTML && voidTags.has(tagName)) {
        return `<${tagName}${props} />`;
    }
    if (['script', 'style', 'noscript'].includes(tagName)) {
        const raw = textContent(node);
        const content =
            tagName === 'style'
                ? rewriteStylesheet(
                      raw,
                      context.source,
                      context.rewrite,
                      context.replaceFont,
                      context.warn,
                  )
                : raw;
        return `<${tagName}${props} dangerouslySetInnerHTML={{__html: ${literal(content)}}} />`;
    }
    const contents =
        tagName === 'textarea'
            ? ''
            : children(node)
                  .map((child) => emitNode(child, context))
                  .join('');
    return `<${tagName}${props}>${contents}</${tagName}>`;
}

export function normalizedMarkup(node: HtmlNode): unknown {
    if (isText(node)) return node.value;
    if (!isElement(node)) return null;
    return [
        node.tagName,
        node.attrs
            .map((attribute) => [qualifiedName(attribute), attribute.value])
            .sort(([left], [right]) => String(left).localeCompare(String(right))),
        children(node)
            .filter(
                (child) =>
                    !isComment(child) &&
                    !(isText(child) && /^\s+$/.test(child.value) && child.value.includes('\n')),
            )
            .map(normalizedMarkup),
    ];
}
