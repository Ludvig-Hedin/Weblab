import type { Element, HtmlNode, MarkupContext } from './html';
import type { ImportFile, ImportReport } from './types';
import {
    childElements,
    emitAttributes,
    emitNode,
    getAttr,
    isComment,
    isElement,
    isText,
    literal,
    normalizedMarkup,
    textContent,
} from './html';

export type PageDocument = ImportReport['pages'][number] & {
    file: string;
    html: Element;
    head: Element;
    body: Element;
    scripts: Element[];
    context: MarkupContext;
};

export function scriptsIn(element: Element): Element[] {
    return childElements(element).flatMap((child) => {
        if (child.tagName !== 'script') return child.tagName === 'template' ? [] : scriptsIn(child);
        const type = getAttr(child, 'type')?.trim().toLowerCase() ?? '';
        return !type || /^(module|(?:text|application)\/(?:java|ecma)script)$/.test(type)
            ? [child]
            : [];
    });
}

function withoutScripts(parent: Element, scripts: ReadonlySet<Element>): HtmlNode[] {
    parent.childNodes = parent.childNodes.filter((node) => !isElement(node) || !scripts.has(node));
    for (const child of childElements(parent)) withoutScripts(child, scripts);
    return parent.childNodes;
}

export function takeSharedChrome(pages: PageDocument[]) {
    const normal = pages.filter((page) => page.kind === 'page');
    for (const page of pages) withoutScripts(page.body, new Set(page.scripts));
    if (normal.length < 2) return {};

    const significance = (node: HtmlNode) =>
        !isComment(node) && !(isText(node) && !node.value.trim());
    let containers = normal.map((page) => page.body);
    const wrappers: Element[] = [];
    // Webflow projects often put both sections inside one or more page-wrapper
    // divs. Recreate those wrappers in the layout to keep selectors and position.
    while (true) {
        const candidates = containers.map((element) => element.childNodes.filter(significance));
        const first = candidates[0]?.[0];
        if (!first || !isElement(first) || first.tagName !== 'div' || hasClass(first, 'w-nav'))
            break;
        const props = emitAttributes(first, normal[0]!.context);
        const matching: Element[] = [];
        for (const [index, nodes] of candidates.entries()) {
            const candidate = nodes[0];
            if (
                nodes.length !== 1 ||
                !candidate ||
                !isElement(candidate) ||
                candidate.tagName !== first.tagName ||
                emitAttributes(candidate, normal[index]!.context) !== props
            )
                break;
            matching.push(candidate);
        }
        if (matching.length !== containers.length) break;
        wrappers.push(first);
        containers = matching;
    }

    function extract(isChrome: (element: Element) => boolean, edge: 'first' | 'last') {
        const candidates = containers.map(({ childNodes }) => {
            const nodes = childNodes.filter(significance);
            return edge === 'first' ? nodes[0] : nodes.at(-1);
        });
        const first = candidates[0];
        if (!first || !isElement(first) || !isChrome(first)) return;
        const normalized = literal(normalizedMarkup(first));
        if (candidates.some((node) => !node || literal(normalizedMarkup(node)) !== normalized))
            return;

        containers.forEach((container, index) => {
            container.childNodes = container.childNodes.filter(
                (node) => node !== candidates[index],
            );
        });
        return { node: first, context: normal[0]!.context };
    }

    const nav = extract(
        (element) => element.tagName === 'nav' || hasClass(element, 'w-nav'),
        'first',
    );
    const footer = extract(
        (element) =>
            element.tagName === 'footer' ||
            getAttr(element, 'role') === 'contentinfo' ||
            hasClass(element, 'footer'),
        'last',
    );
    if (!nav && !footer) return {};
    for (const [index, page] of normal.entries())
        page.body.childNodes = containers[index]!.childNodes;
    return { nav, footer, wrappers, context: normal[0]!.context };
}

function hasClass(element: Element, name: string) {
    return (getAttr(element, 'class') ?? '').split(/\s+/).includes(name);
}

export function pageSource(page: PageDocument, metadata: Record<string, unknown>, base?: string) {
    const content =
        page.kind === 'cms-template'
            ? '<main><h1>CMS template</h1><p>Connect a CMS collection to render entries on this route.</p></main>'
            : page.body.childNodes.map((node) => emitNode(node, page.context)).join('');
    const metadataBase = base ? `metadataBase: new URL(${literal(base)}), ` : '';
    return `import type { Metadata } from "next";
${content.includes(' as CSSProperties}') ? 'import type { CSSProperties } from "react";\n' : ''}

export const metadata = { ${metadataBase}...${literal(metadata)} } as Metadata;

export default function Page() {
    return <>${content}</>;
}
`;
}

export function layoutSource(
    documents: { page: PageDocument; head: Element[] }[],
    chrome: ReturnType<typeof takeSharedChrome>,
    fonts: { imports: string; skipScript: (script: Element) => boolean },
) {
    const scripts = new Map<
        string,
        { index: number; id: string; props: string; content: string }
    >();
    const shells = documents.map(({ page, head }) => {
        const { context } = page;
        const seenSources = new Set<string>();
        const indices: number[] = [];
        for (const script of page.scripts) {
            if (fonts.skipScript(script)) continue;
            const src = getAttr(script, 'src');
            if (src && seenSources.has(src)) continue;
            if (src) seenSources.add(src);
            const props = emitAttributes(script, context, ['id', 'async', 'defer']);
            const content = textContent(script);
            const originalId = getAttr(script, 'id');
            const key = literal([props, content, originalId ?? null]);
            let record = scripts.get(key);
            if (!record) {
                const index = scripts.size;
                record = { index, id: originalId ?? `webflow-script-${index}`, props, content };
                scripts.set(key, record);
            }
            indices.push(record.index);
        }
        const rawAttributes = Object.fromEntries(
            page.html.attrs
                .filter(({ name }) => /^data-[\w-]+$/.test(name))
                .map(({ name, value }) => [name, value]),
        );
        const htmlAttributes = emitAttributes(
            page.html,
            context,
            Object.keys(rawAttributes).concat(fonts.imports ? ['class'] : []),
        );
        const className = fonts.imports
            ? ` className={[${literal(getAttr(page.html, 'class') ?? '')}, fontClasses].filter(Boolean).join(" ")}`
            : '';
        const bodyAttributes = emitAttributes(page.body, context);
        const headMarkup = head
            .map((node) => '\n                ' + emitNode(node, context))
            .join('');
        const body =
            page.kind === 'page' && chrome.context ? '{siteChrome(children)}' : '{children}';
        return `    [${literal(page.route)}, (children, script) => (
        <html {...${literal(rawAttributes)}}${htmlAttributes}${className}>
            <head>${headMarkup}${headMarkup ? '\n            ' : ''}</head>
            <body${bodyAttributes}>
                ${body}
                {${literal(indices)}.map(script)}
            </body>
        </html>
    )],`;
    });
    const scriptMarkup = [...scripts.values()].map(({ index, id, props, content }) => {
        const inline = content ? ` dangerouslySetInnerHTML={{__html: ${literal(content)}}}` : '';
        return `    <Script key={${index}} id={${literal(id)}} strategy="beforeInteractive"${props}${inline} />,`;
    });
    let chromeMarkup = '';
    if (chrome.context) {
        const nav = chrome.nav ? emitNode(chrome.nav.node, chrome.nav.context) : '';
        const footer = chrome.footer ? emitNode(chrome.footer.node, chrome.footer.context) : '';
        const context = chrome.context;
        const inner = chrome.wrappers.reduceRight(
            (body, wrapper) => `<div${emitAttributes(wrapper, context)}>${body}</div>`,
            `${nav}{children}${footer}`,
        );
        chromeMarkup = `function siteChrome(children: ReactNode) {
    return <>${inner}</>;
}
`;
    }
    const usesStyles = [chromeMarkup, ...shells].some((value) =>
        value.includes(' as CSSProperties}'),
    );
    return `import type { ${usesStyles ? 'CSSProperties, ' : ''}ReactNode } from "react";
import { headers } from "next/headers";
${scripts.size ? 'import Script from "next/script";\n' : ''}${fonts.imports}

const scripts: ReactNode[] = [
${scriptMarkup.join('\n')}
];
${chromeMarkup}
const layouts = new Map<string, (children: ReactNode, script: (index: number) => ReactNode) => ReactNode>([
${shells.join('\n')}
]);

export default async function RootLayout({ children }: { children: ReactNode }) {
    const path = (await headers()).get("x-webflow-import-path") ?? "/";
    const layout = layouts.get(path) ?? layouts.values().next().value!;
    return layout(children, (index) => scripts[index]);
}
`;
}

export const middlewareSource = `import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
    const headers = new Headers(request.headers);
    const pathname = request.nextUrl.pathname.split("/").map((segment) => {
        try { return encodeURIComponent(decodeURIComponent(segment)); }
        catch { return segment; }
    }).join("/");
    headers.set("x-webflow-import-path", pathname.replace(/\\/$/, "") || "/");
    return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/).*)"] };
`;

export const projectFiles: ImportFile[] = [
    {
        path: 'package.json',
        content:
            JSON.stringify(
                {
                    name: 'webflow-imported-site',
                    private: true,
                    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
                    dependencies: { next: '^15.5.0', react: '^19.1.0', 'react-dom': '^19.1.0' },
                    devDependencies: {
                        typescript: '^5.5.4',
                        '@types/node': '^22',
                        '@types/react': '^19',
                        '@types/react-dom': '^19',
                    },
                },
                null,
                2,
            ) + '\n',
    },
    { path: 'middleware.ts', content: middlewareSource },
];
