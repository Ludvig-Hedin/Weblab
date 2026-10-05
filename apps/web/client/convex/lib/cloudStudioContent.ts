import { ConvexError, type Infer } from 'convex/values';
import type { journalItem, studioSettings, studioSlot } from '../cloudEditorStudioSchema';
import { nextCmsRevision } from './cmsRevision';

export type JournalItem = Infer<typeof journalItem>;
export type StudioSlot = Infer<typeof studioSlot>;
export type StudioSettings = { [K in keyof typeof studioSettings]: Infer<(typeof studioSettings)[K]> };
export interface CloudStudioFreezeInput { settings: StudioSettings; items: JournalItem[]; assets: Array<{ path: string; hash: string }> }
type ArtifactItem = Omit<Pick<JournalItem, 'key' | 'slug' | 'revision' | 'values'>, 'values'> & {
    values: Omit<JournalItem['values'], 'cover'> & { cover?: { path: string; alt: string; sourcePath?: string; hash?: string } };
};
export interface CloudStudioArtifact {
    profile: 'cloud-studio-v1'; mode: 'preview' | 'release'; generation: number;
    items: ArtifactItem[];
}
export const STUDIO_JSON_PATH = 'src/weblab-content/cloud-studio.json';
export const JOURNAL_LIMIT = 100;
export const STUDIO_PROFILE = 'cloud-studio-v1' as const;
const safeSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function studioStableJson(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        const object = entry as Record<string, unknown>;
        return Object.fromEntries(Object.keys(object).sort().map(key => [key, object[key]]));
    });
}
export function studioSlug(slug: string): string {
    if (slug.length < 1 || slug.length > 64 || !safeSlug.test(slug)) throw new ConvexError('CLOUD_STUDIO_INVALID_SLUG');
    return slug;
}
export function validateJournalValues(values: JournalItem['values'], assets?: ReadonlySet<string>): JournalItem['values'] {
    if (!values.title.trim() || values.title.length > 160 || values.excerpt.length > 500 || values.body.length > 30_000)
        throw new ConvexError('CLOUD_STUDIO_INVALID_VALUES');
    if (values.cover && (!/^\/(?!\/)[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|avif|gif)$/i.test(values.cover.path)
        || values.cover.path.split('/').some(part => part === '.' || part === '..') || values.cover.alt.length > 500
        || (assets && !assets.has(values.cover.path)))) throw new ConvexError('CLOUD_STUDIO_INVALID_ASSET');
    return { title: values.title, excerpt: values.excerpt, body: values.body,
        ...(values.cover ? { cover: { path: values.cover.path, alt: values.cover.alt } } : {}) };
}
export function validateJournalItems(items: JournalItem[]): void {
    if (items.length > JOURNAL_LIMIT) throw new ConvexError('CLOUD_STUDIO_ITEM_LIMIT');
    const keys = new Set<string>(), slugs = new Set<string>();
    for (const item of items) {
        if (!/^[A-Za-z0-9_-]{8,100}$/.test(item.key) || keys.has(item.key) || slugs.has(item.slug)
            || !Number.isSafeInteger(item.revision) || item.revision < 1 || item.revision >= Number.MAX_SAFE_INTEGER
            || !['draft', 'ready'].includes(item.status) || typeof item.archived !== 'boolean') throw new ConvexError('CLOUD_STUDIO_INVALID_ITEM');
        studioSlug(item.slug); validateJournalValues(item.values); keys.add(item.key); slugs.add(item.slug);
    }
}
export function updateJournalItem(items: JournalItem[], operation: Infer<typeof import('../cloudEditorStudioSchema').journalOperation>, assets: ReadonlySet<string>): JournalItem[] {
    validateJournalItems(items);
    const current = items.find(item => item.key === operation.key);
    if (!current && (operation.kind !== 'save' || operation.expectedItemRevision !== 0)) throw new ConvexError('CLOUD_STUDIO_ITEM_NOT_FOUND');
    let revision: number;
    try { revision = nextCmsRevision(current ?? { revision: 0 }, operation.expectedItemRevision); }
    catch { throw new ConvexError('CLOUD_STUDIO_ITEM_CONFLICT'); }
    let next: JournalItem;
    if (operation.kind === 'save') {
        if (current?.archived) throw new ConvexError('CLOUD_STUDIO_ITEM_ARCHIVED');
        next = { key: operation.key, slug: studioSlug(operation.slug), revision, status: operation.status, archived: false,
            values: validateJournalValues(operation.values, assets) };
    } else {
        if (!current || current.archived === (operation.kind === 'archive')) throw new ConvexError('CLOUD_STUDIO_INVALID_ITEM');
        const values = operation.kind === 'restore' ? validateJournalValues(operation.values ?? current.values, assets) : current.values;
        next = { ...current, values, revision, archived: operation.kind === 'archive', status: operation.kind === 'restore' ? 'draft' : current.status };
    }
    const result = [...items.filter(item => item.key !== operation.key), next].sort((a, b) => a.key.localeCompare(b.key));
    validateJournalItems(result); return result;
}
function publicItem(item: Pick<JournalItem, 'key' | 'slug' | 'revision' | 'values'>) {
    return { key: item.key, slug: item.slug, revision: item.revision, values: validateJournalValues(item.values) };
}
export function draftStudioArtifact(input: CloudStudioFreezeInput): CloudStudioArtifact {
    validateJournalItems(input.items);
    return { profile: STUDIO_PROFILE, mode: 'preview', generation: input.settings.generation,
        items: input.items.filter(item => !item.archived).map(publicItem).sort((a, b) => a.key.localeCompare(b.key)) };
}
export function serializeStudioArtifact(artifact: CloudStudioArtifact): string {
    // Original asset paths/hashes are retained only in the private release record.
    const content = JSON.stringify({ ...artifact, items: artifact.items.map(publicItem) }, null, 2) + '\n';
    if (new TextEncoder().encode(content).byteLength > 500_000) throw new ConvexError('CLOUD_STUDIO_CONTENT_TOO_LARGE');
    return content;
}
/** Same static JSON reader in preview and production. There is no network fallback. */
export function studioRendererFiles(): Array<{ path: string; content: string }> {
    return [{ path: 'src/app/journal/page.tsx', content: `import artifact from '../../weblab-content/cloud-studio.json';
const content = artifact as { profile: string; items: Array<{key: string; slug: string; values: {title: string; excerpt: string; body: string; cover?: {path: string; alt: string}}}> };
export default function JournalPage() {
  if (content.profile !== 'cloud-studio-v1') throw new Error('Unsupported content artifact');
  return <main data-oid="studio-journal-list-main" className="mx-auto max-w-6xl px-6 py-16 sm:px-10"><h1 data-oid="studio-journal-list-heading" className="text-4xl font-medium">Journal</h1><div data-oid="studio-journal-list-items" className="mt-10 space-y-12">{content.items.map(item => <article data-oid="studio-journal-list-item" key={item.key}><a data-oid="studio-journal-list-link" href={'/journal/' + item.slug}><h2 data-oid="studio-journal-list-title" className="text-2xl font-medium">{item.values.title}</h2></a><p data-oid="studio-journal-list-excerpt" className="mt-3 text-muted-foreground">{item.values.excerpt}</p></article>)}</div></main>;
}
` }, { path: 'src/app/journal/[slug]/page.tsx', content: `import { notFound } from 'next/navigation';
import artifact from '../../../weblab-content/cloud-studio.json';
const content = artifact as { profile: string; items: Array<{key: string; slug: string; values: {title: string; excerpt: string; body: string; cover?: {path: string; alt: string}}}> };
export const dynamicParams = false;
export function generateStaticParams() { return content.items.map(item => ({ slug: item.slug })); }
export default async function JournalItemPage({ params }: { params: Promise<{ slug: string }> }) {
  if (content.profile !== 'cloud-studio-v1') throw new Error('Unsupported content artifact');
  const { slug } = await params;
  const item = content.items.find(entry => entry.slug === slug);
  if (!item) notFound();
  const cover = 'cover' in item.values ? item.values.cover as { path: string; alt: string } : null;
  return <main data-oid="studio-journal-entry-main" className="mx-auto max-w-3xl px-6 py-16"><a data-oid="studio-journal-entry-back" href="/journal" className="text-sm underline">Journal</a><h1 data-oid="studio-journal-entry-title" className="mt-6 text-4xl font-medium">{item.values.title}</h1><p data-oid="studio-journal-entry-excerpt" className="mt-6 text-lg text-muted-foreground">{item.values.excerpt}</p>{cover && <img data-oid="studio-journal-entry-cover" src={cover.path} alt={cover.alt} className="mt-8 w-full" />}<div data-oid="studio-journal-entry-body" className="mt-8 whitespace-pre-wrap leading-relaxed">{item.values.body}</div></main>;
}
` }];
}
export function assertCloudStudioSource(input: CloudStudioFreezeInput, files: ReadonlyArray<{ path: string; text?: string; content?: string }>): void {
    for (const expected of [...studioRendererFiles(), { path: STUDIO_JSON_PATH, content: serializeStudioArtifact(draftStudioArtifact(input)) }]) {
        const matches = files.filter(file => file.path === expected.path);
        if (matches.length !== 1 || (matches[0]?.text ?? matches[0]?.content) !== expected.content) throw new ConvexError('CLOUD_STUDIO_PROJECTION_CHANGED');
    }
}
/** New drafts preserve an earlier live revision; only an explicit archive removes it. */
export function materializeCloudStudioRelease(input: CloudStudioFreezeInput, previous: CloudStudioArtifact | null) {
    if (input.settings.profile !== STUDIO_PROFILE || !input.settings.active) throw new ConvexError('CLOUD_STUDIO_UNAVAILABLE');
    validateJournalItems(input.items);
    if (previous && (previous.profile !== STUDIO_PROFILE || previous.mode !== 'release')) throw new ConvexError('CLOUD_STUDIO_INVALID_BASELINE');
    if (previous) validateJournalItems(previous.items.map(item => ({ ...item, status: 'ready', archived: false })));
    const assets = new Map(input.assets.map(asset => [asset.path, asset.hash]));
    if (assets.size !== input.assets.length || input.assets.some(asset => !/^public\/.+\.(?:png|jpe?g|webp|avif|gif)$/i.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.hash))) throw new ConvexError('CLOUD_STUDIO_INVALID_ASSET');
    const merged = new Map<string, ArtifactItem>();
    for (const item of previous?.items ?? []) {
        const cleaned = publicItem(item);
        if (item.values.cover) {
            const cover = item.values.cover;
            if (!cover.hash || !/^[a-f0-9]{64}$/.test(cover.hash) || !cover.sourcePath || !/^public\/.+\.(?:png|jpe?g|webp|avif|gif)$/i.test(cover.sourcePath)) throw new ConvexError('CLOUD_STUDIO_INVALID_BASELINE');
            const extension = cover.sourcePath.split('.').pop()!.toLowerCase();
            validateJournalValues({ ...cleaned.values, cover: { path: cover.sourcePath.slice('public'.length), alt: cover.alt } });
            if (cover.path !== `/_weblab-assets/${cover.hash}.${extension}`) throw new ConvexError('CLOUD_STUDIO_INVALID_BASELINE');
            merged.set(item.key, { ...cleaned, values: { ...cleaned.values, cover: { path: cover.path, alt: cover.alt, hash: cover.hash, sourcePath: cover.sourcePath } } });
        } else merged.set(item.key, cleaned);
    }
    const currentKeys = new Set(input.items.map(item => item.key));
    if ([...merged.keys()].some(key => !currentKeys.has(key))) throw new ConvexError('CLOUD_STUDIO_MISSING_LIVE_ITEM');
    for (const item of input.items) {
        if (item.archived) merged.delete(item.key);
        else if (item.status === 'ready') {
            const next: ArtifactItem = publicItem(item);
            if (item.values.cover) {
                const sourcePath = `public${item.values.cover.path}`, hash = assets.get(sourcePath);
                if (!hash) throw new ConvexError('CLOUD_STUDIO_INVALID_ASSET');
                const extension = sourcePath.split('.').pop()!.toLowerCase();
                next.values.cover = { ...item.values.cover, sourcePath, hash, path: `/_weblab-assets/${hash}.${extension}` };
            }
            merged.set(item.key, next);
        }
    }
    const items = [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
    if (new Set(items.map(item => item.slug)).size !== items.length) throw new ConvexError('CLOUD_STUDIO_LIVE_SLUG_CONFLICT');
    const artifact: CloudStudioArtifact = { profile: STUDIO_PROFILE, mode: 'release', generation: input.settings.generation, items };
    const assetRequirements = [...new Map(items.flatMap(item => item.values.cover ? [[item.values.cover.path, {
        path: item.values.cover.sourcePath!, hash: item.values.cover.hash!, targetPath: `public${item.values.cover.path}`,
    }] as const] : [])).values()];
    return { artifact, files: [...studioRendererFiles(), { path: STUDIO_JSON_PATH, content: serializeStudioArtifact(artifact) }],
        assetPaths: [...new Set(assetRequirements.map(asset => asset.path))], assetRequirements };
}
