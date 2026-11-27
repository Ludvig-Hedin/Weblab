import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parse } from 'parse5';

import type { PageDocument } from './project';
import type { ImportFile, ImportReport, WebflowImportResult } from './types';
import { createReferenceRewriter, encodePath, rewriteStylesheet } from './assets';
import { planFonts } from './fonts';
import { childElements, elements, getAttr, rewriteAttributes } from './html';
import { readMetadata } from './metadata';
import { layoutSource, pageSource, projectFiles, scriptsIn, takeSharedChrome } from './project';

export type { ImportFile, ImportReport, WebflowImportResult } from './types';

const frameWidths = [
    [991, 'down'],
    [767, 'down'],
    [479, 'down'],
    [1280, 'up'],
    [1440, 'up'],
    [1920, 'up'],
] as const;

const featureReasons = {
    ecommerce: 'Webflow Ecommerce needs its hosted catalog, cart and checkout.',
    memberships: 'Webflow memberships need a user account and authentication backend.',
    localization:
        'This export contains Webflow localization. Only single-language exports are supported.',
};

const decoder = new TextDecoder();
const readText = (file: ImportFile) =>
    typeof file.content === 'string' ? file.content : decoder.decode(file.content);

/** Read an unpacked export. Symlinks and hidden archive artifacts are ignored. */
export async function importWebflowExport(directory: string): Promise<WebflowImportResult> {
    const files: ImportFile[] = [];
    async function walk(relative: string) {
        const entries = await readdir(join(directory, relative), { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
            const path = posix.join(relative, entry.name);
            if (entry.isDirectory()) await walk(path);
            if (entry.isFile())
                files.push({
                    path,
                    content: new Uint8Array(await readFile(join(directory, path))),
                });
        }
    }
    await walk('');
    return convertWebflowExport(files);
}

/** Convert export entries in memory. Source HTML and scripts are never executed. */
export function convertWebflowExport(input: readonly ImportFile[]): WebflowImportResult {
    const files: ImportFile[] = [];
    const report: ImportReport = {
        pages: [],
        forms: [],
        refused: [],
        missingAssets: [],
        warnings: [],
    };
    const warnings = new Set<string>();
    const missingAssets = new Map<string, ImportReport['missingAssets'][number]>();
    const frames = frameWidths.map(([width, direction]) => ({ width, direction }));
    const refuse = (
        feature: ImportReport['refused'][number]['feature'],
        source: string,
        reason: string,
    ) => {
        if (
            !report.refused.some(
                (item) =>
                    item.feature === feature && item.source === source && item.reason === reason,
            )
        ) {
            report.refused.push({ feature, source, reason });
        }
    };
    function finish(): WebflowImportResult {
        report.missingAssets = [...missingAssets.values()];
        report.warnings = [...warnings];
        const artifact = {
            path: 'weblab-import-report.json',
            content: JSON.stringify(report, null, 2) + '\n',
        };
        return { files: report.refused.length ? [artifact] : [...files, artifact], report, frames };
    }

    const entries = new Map<string, ImportFile>();
    for (const entry of [...input].sort((left, right) =>
        left.path < right.path ? -1 : left.path === right.path ? 0 : 1,
    )) {
        const valid =
            !/[\\:\p{Cc}]/u.test(entry.path) &&
            entry.path
                .split('/')
                .every((segment) => segment && segment !== '.' && segment !== '..');
        if (!valid || entries.has(entry.path)) {
            refuse(
                'invalid-export',
                entry.path,
                'Export paths must be unique, relative POSIX paths inside the export.',
            );
        } else {
            entries.set(entry.path, entry);
        }
    }
    if (report.refused.length) return finish();
    const paths = new Set(entries.keys());
    const routes = new Map<string, string>();
    const routeSources = new Map<string, string>();
    const sources = [...entries.values()].filter(({ path }) => /\.html?$/i.test(path));
    if (!sources.length) {
        refuse('invalid-export', '.', 'The export contains no HTML pages.');
        return finish();
    }

    for (const { path } of sources) {
        const segments = path.replace(/\.html?$/i, '').split('/');
        const isIndex = segments.at(-1)?.toLowerCase() === 'index';
        if (isIndex) segments.pop();
        if (
            segments.some((segment) => !segment || /^[@.]|[[\]()%?#]/.test(segment)) ||
            segments[0] === '_next' ||
            segments[0] === '_not-found'
        ) {
            refuse(
                'invalid-export',
                path,
                'This file name cannot be represented as an App Router route.',
            );
            continue;
        }

        const route = '/' + encodePath(segments.join('/'));
        const prior = routeSources.get(route);
        if (prior) refuse('invalid-export', path, `Both ${prior} and ${path} map to ${route}.`);
        if (entries.has(segments.join('/'))) {
            refuse('invalid-export', path, `A public file already occupies the route ${route}.`);
        }
        routeSources.set(route, path);
        routes.set(path, route);
    }

    const rewriteFor = (source: string) =>
        createReferenceRewriter(source, paths, routes, (path) => {
            missingAssets.set(JSON.stringify([source, path]), { source, path });
        });
    const locales = new Map<string, string>();
    const languages = new Map<string, string>();
    const pages: PageDocument[] = [];

    for (const entry of sources) {
        const source = entry.path;
        const route = routes.get(source);
        if (route === undefined) continue;
        const html = childElements(parse(readText(entry)))[0]!;
        const [head, body] = childElements(html);
        if (!head || !body) {
            refuse('invalid-export', source, 'This document has no importable head and body.');
            continue;
        }
        const kind = /^detail_/i.test(posix.basename(source)) ? 'cms-template' : 'page';
        const folder = route
            .slice(1)
            .split('/')
            .filter(Boolean)
            .map((segment) => decodeURIComponent(segment).replace(/^_/, '%5F'))
            .join('/');
        const file = ['app', folder, 'page.tsx'].filter(Boolean).join('/');
        const context = {
            source,
            rewrite: rewriteFor(source),
            replaceFont: (value: string) => value,
            warn: (message: string) => warnings.add(`${source}: ${message}`),
        };
        const page: PageDocument = {
            source,
            route,
            kind,
            file,
            html,
            head,
            body,
            context,
            scripts: [...scriptsIn(head), ...scriptsIn(body)],
        };
        pages.push(page);
        report.pages.push({ source, route, kind });

        const locale = getAttr(html, 'data-wf-locale');
        if (locale) locales.set(locale, source);
        const language = getAttr(html, 'lang')?.toLowerCase();
        if (language) languages.set(language, source);
        for (const element of elements(html)) {
            const className = getAttr(element, 'class') ?? '';
            const attrNames = element.attrs.map(({ name }) => name);
            if (
                /(?:^|\s)w-commerce[-\w]*/.test(className) ||
                attrNames.some((name) => /^data-(?:wf-)?commerce[-\w]*/.test(name))
            ) {
                refuse('ecommerce', source, featureReasons.ecommerce);
            }
            if (
                /(?:^|\s)w-users[-\w]*/.test(className) ||
                attrNames.some((name) => name.startsWith('data-wf-user'))
            ) {
                refuse('memberships', source, featureReasons.memberships);
            }
            if (
                (element.tagName === 'link' &&
                    getAttr(element, 'rel')?.toLowerCase() === 'alternate' &&
                    getAttr(element, 'hreflang')) ||
                /(?:^|\s)w-locales-(?:list|item|wrapper)(?:\s|$)/.test(className)
            ) {
                refuse('localization', source, featureReasons.localization);
            }

            if (element.tagName === 'form') {
                report.forms.push({
                    page: route,
                    id: getAttr(element, 'id') ?? null,
                    name: getAttr(element, 'data-name') ?? getAttr(element, 'name') ?? null,
                    action: getAttr(element, 'action') ?? null,
                });
            }
        }
        if (kind === 'cms-template')
            context.warn(
                'CMS template placeholder. Collection data and bindings must be connected separately.',
            );
    }
    for (const group of [locales, languages]) {
        if (group.size > 1) {
            for (const source of group.values())
                refuse('localization', source, featureReasons.localization);
        }
    }
    if (report.forms.length)
        warnings.add(
            'Review each listed form. Submissions hosted by Webflow stop working after import.',
        );
    if (report.refused.length) return finish();

    pages.sort((left, right) =>
        left.route < right.route ? -1 : left.route === right.route ? 0 : 1,
    );
    const normalPages = pages.filter((page) => page.kind === 'page');
    const fonts = planFonts(
        (normalPages.length ? normalPages : pages).map((page) => page.scripts),
        (message) => warnings.add(message),
    );
    const documents = pages.map((page) => {
        page.context.replaceFont = fonts.replaceFont;
        const seo = readMetadata(page.head, page.context.rewrite);
        rewriteAttributes(page.head, page.context);
        rewriteAttributes(page.body, page.context);
        const head = seo.retained.filter((node) => !page.scripts.includes(node));
        return { page, head, metadata: seo.metadata, base: seo.base };
    });
    const chrome = takeSharedChrome(pages);
    files.push(...projectFiles, {
        path: 'app/layout.tsx',
        content: layoutSource(documents, chrome, fonts),
    });
    for (const { page, metadata, base } of documents) {
        files.push({ path: page.file, content: pageSource(page, metadata, base) });
    }
    for (const entry of entries.values()) {
        if (routes.has(entry.path)) continue;
        const content = /\.css$/i.test(entry.path)
            ? rewriteStylesheet(
                  readText(entry),
                  entry.path,
                  rewriteFor(entry.path),
                  fonts.replaceFont,
                  (message) => warnings.add(message),
              )
            : entry.content;
        files.push({ path: 'public/' + entry.path, content });
    }
    return finish();
}
