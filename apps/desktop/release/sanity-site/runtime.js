'use strict';

const { PROFILE } = require('./profile');
const { hash, stable, refuse, clone } = require('./contract');

const DATA_PATH = 'src/lib/sanity/frozen-data.json';
const RUNTIME_PATH = 'src/lib/sanity/frozen-runtime.ts';
function runtimeSource(contentHash) {
    return `import "server-only";
import { createHash } from "node:crypto";
import imported from "./frozen-data.json";

type FrozenData = { version: number; adapterId: string; capturedAt: string; queryContract: Record<string,string>; named: Record<string,unknown>; parameterized: Record<string,Record<string,unknown>>; imageMap: Record<string,{path:string}> };
const data = imported as unknown as FrozenData;
function stable(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") { const record = value as Record<string,unknown>; return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + stable(record[key])).join(",") + "}"; }
  throw new Error("Frozen website content is invalid.");
}
function digest(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }
if (data.version !== 1 || data.adapterId !== ${JSON.stringify(PROFILE.id)} || digest(data) !== ${JSON.stringify(contentHash)}) throw new Error("Frozen website content changed. Prepare this version again.");
export function frozenQuery<T>(query: string, params: Record<string,unknown> = {}): T | null {
  const name = Object.keys(data.queryContract).find(key => data.queryContract[key] === query);
  if (!name) throw new Error("This query is outside the approved frozen website.");
  const details = data.parameterized[name];
  if (details) {
    if (Object.keys(params).length !== 1 || typeof params.slug !== "string") throw new Error("Frozen website query parameters changed.");
    if (!Object.hasOwn(details, params.slug)) return null;
    return JSON.parse(JSON.stringify(details[params.slug])) as T;
  }
  if (Object.keys(params).length || !Object.hasOwn(data.named, name)) throw new Error("Frozen website query result is missing.");
  return JSON.parse(JSON.stringify(data.named[name])) as T | null;
}
export function frozenImage(source: unknown, chain: Array<[string,string|number]>): string {
  const image = data.imageMap[digest({source,chain})];
  if (!image || !/^\\/weblab-frozen-sanity\\/[a-f0-9]{64}\\.(?:jpg|png|webp|gif|avif)$/.test(image.path)) throw new Error("This image is missing from the frozen website.");
  return image.path;
}
export function frozenCapturedAt(): string { return data.capturedAt; }
`;
}
function materializeRuntime(runtimePayload, contentHash, sourceHashes) {
    const files = [];
    const put = (path, text, phase = 'adapter') => {
        const bytes = Buffer.from(text, 'utf8');
        files.push({ path, bytes, sha256: hash(bytes), beforeSha256: sourceHashes[path] ?? null, kind: 'text', phase });
    };
    put('src/lib/sanity/writeClient.ts', `import "server-only";
function unavailable(): never { throw new Error("Sanity writes are unavailable in this frozen website."); }
export const hasWriteToken = false;
export const writeClient = { fetch: unavailable, create: unavailable, patch: unavailable, delete: unavailable, assets: { upload: unavailable } };
`, 'disable');
    put('src/actions/submit-offert.ts', `"use server";
export type OffertResult = { ok: true } | { ok: false; error: string };
export async function submitOffert(_formData: FormData): Promise<OffertResult> {
  return { ok: false, error: "Offertformuläret är inte tillgängligt här. Ring oss gärna så hjälper vi dig." };
}
`, 'disable');
    put('src/components/sections/contact-form.tsx', `import { PHONE_DISPLAY, PHONE_TEL } from "@/lib/constants";
export function ContactForm() {
  return <div className="flex flex-col gap-4"><h2 className="text-xl font-semibold">Kontakta oss för en offert</h2><p className="text-muted-foreground">Offertformuläret är inte tillgängligt här. Ring oss gärna så hjälper vi dig.</p><a href={\`tel:\${PHONE_TEL}\`} className="font-medium text-primary">{PHONE_DISPLAY}</a></div>;
}
`, 'disable');
    put('src/app/studio/[[...tool]]/Studio.tsx', `export default function Studio() { return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">Innehållsstudion är inte tillgänglig här</h1><p>Det här är en fryst webbversion. Hantera innehåll i den separata redigeringsmiljön.</p></main>; }
`, 'disable');
    put('src/app/studio/[[...tool]]/page.tsx', `import Studio from "./Studio";
export const dynamic = "force-static";
export default function StudioPage() { return <Studio />; }
`, 'disable');
    let contact = PROFILE.originals['src/app/(site)/kontakt/page.tsx'];
    contact = contact.replace('Beställ offert eller kontakta Cyklande Rörmokaren. Ring +46 8-500 333 70 eller fyll i formuläret — vi återkommer inom 24 timmar.', 'Kontakta oss för en offert. Offertformuläret är inte tillgängligt här. Ring oss gärna så hjälper vi dig.');
    contact = contact.replace('Berätta vad du behöver hjälp med så återkommer vi inom 24 timmar. Vi\n            lämnar oftast fast pris — bifoga gärna bilder för en snabbare offert.', 'Kontakta oss och berätta vad du behöver hjälp med.\n            Offertformuläret är inte tillgängligt här. Ring oss gärna för en offert.');
    put('src/app/(site)/kontakt/page.tsx', contact, 'disable');
    put(DATA_PATH, `${stable(runtimePayload)}\n`, 'content');
    put(RUNTIME_PATH, runtimeSource(contentHash), 'content');
    put('src/lib/sanity/fetch.ts', `import { frozenQuery } from "./frozen-runtime";
type FetchOptions = { revalidate?: number | false; tags?: string[] };
export async function sanityFetch<T>(query: string, params: Record<string,unknown> = {}, _options: FetchOptions = {}): Promise<T | null> { return frozenQuery<T>(query, params); }
`);
    put('src/lib/sanity/client.ts', `import { frozenQuery } from "./frozen-runtime";
const reader = { async fetch<T>(query: string, params: Record<string,unknown> = {}, _options?: unknown): Promise<T | null> { return frozenQuery<T>(query, params); } };
export const client = reader;
export const freshClient = reader;
`);
    put('src/lib/sanity/image.ts', `import type { SanityImageSource } from "@sanity/image-url";
import { frozenImage } from "./frozen-runtime";
export function urlFor(source: SanityImageSource) {
  const chain: Array<[string,string|number]> = [];
  const builder = {
    width(value: number) { chain.push(["width",value]); return builder; },
    height(value: number) { chain.push(["height",value]); return builder; },
    fit(value: string) { chain.push(["fit",value]); return builder; },
    auto(value: string) { chain.push(["auto",value]); return builder; },
    url() { return frozenImage(source,chain); },
  };
  return builder;
}
export type { SanityImageSource };
`);
    put('src/lib/sanity/queries.ts', PROFILE.originals['src/lib/sanity/queries.ts'].replace('import { defineQuery } from "next-sanity";', 'const defineQuery = (query: string): string => query;'));
    for (const [type, name] of [['tjanster', 'SERVICE_SLUGS_QUERY'], ['omraden', 'AREA_SLUGS_QUERY'], ['blogg', 'POST_SLUGS_QUERY']]) {
        const path = `src/app/(site)/${type}/[slug]/page.tsx`;
        const original = PROFILE.originals[path];
        const replacement = original.replace('import { freshClient } from "@/lib/sanity/client";\n', '')
            .replace('export const dynamicParams = true;', 'export const dynamicParams = false;')
            .replace('export const revalidate = 3600;', 'export const revalidate = false;')
            .replace(/export async function generateStaticParams\(\) \{[\s\S]*?\n\}/, `export async function generateStaticParams() {\n  const slugs = await sanityFetch<Array<{ slug: string }>>(${name});\n  if (!slugs) throw new Error("Frozen route membership is missing.");\n  return slugs.filter((entry) => entry.slug).map((entry) => ({ slug: entry.slug }));\n}`);
        if (replacement === original || replacement.includes('freshClient')) refuse('dynamic route adapter did not match the approved source.');
        put(path, replacement);
    }
    let sitemap = PROFILE.originals['src/app/sitemap.ts']
        .replace('import { freshClient } from "@/lib/sanity/client";', 'import { sanityFetch } from "@/lib/sanity/fetch";\nimport { frozenCapturedAt } from "@/lib/sanity/frozen-runtime";')
        .replace('export const revalidate = 3600;', 'export const revalidate = false;')
        .replace('const now = new Date();', 'const now = new Date(frozenCapturedAt());');
    const beginning = sitemap.indexOf('  let services:');
    if (beginning < 0) refuse('sitemap adapter did not match the approved source.');
    sitemap = sitemap.slice(0, beginning) + `  const slugs = await sanityFetch<Array<{ slug: string }>>(SERVICE_SLUGS_QUERY);
  if (!slugs) throw new Error("Frozen sitemap membership is missing.");
  const services: MetadataRoute.Sitemap = slugs.filter(entry => entry.slug).map(entry => ({ url: \`\${SITE_URL}/tjanster/\${entry.slug}\`, lastModified: now, changeFrequency: "monthly", priority: 0.6 }));
  return [...staticRoutes, ...services];
}
`;
    put('src/app/sitemap.ts', sitemap);
    return files;
}
function fileDescriptor(file) {
    return { path: file.path, sha256: file.sha256, beforeSha256: file.beforeSha256, kind: file.kind, phase: file.phase,
        length: file.bytes.length, ...(file.mimeType ? { mimeType: file.mimeType } : {}) };
}
function artifactDescriptor(artifact) {
    return { version: artifact.version, adapterId: artifact.adapterId, profileHash: artifact.profileHash, scope: clone(artifact.scope),
        captureId: artifact.captureId, contentHash: artifact.contentHash, draftHash: artifact.draftHash,
        sourceHash: artifact.sourceHash, sourceHashes: clone(artifact.sourceHashes), originalEvidenceHash: artifact.originalEvidenceHash,
        runtimePayload: clone(artifact.runtimePayload), draftPins: clone(artifact.draftPins), evidence: clone(artifact.evidence), selectedDrafts: clone(artifact.selectedDrafts),
        ...(artifact.predecessor ? { predecessor: clone(artifact.predecessor) } : {}), files: artifact.files.map(fileDescriptor) };
}

module.exports = { DATA_PATH, RUNTIME_PATH, runtimeSource, materializeRuntime, fileDescriptor, artifactDescriptor };
