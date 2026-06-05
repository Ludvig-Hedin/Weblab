/**
 * Component-registry catalog builder.
 *
 * Builds the Weblab AI component catalog from four sources so the builder agent
 * has a fixed, described inventory to install from instead of inventing markup:
 *
 *   1. shadcn/ui      — primitives (registry index) + official blocks
 *   2. Watermelon UI  — full open registry (github)
 *   3. shadcnblocks   — every FREE block (probed; pro blocks are skipped)
 *   4. local pro      — reference/shadcn-pro-blocks (vendored, no install URL)
 *
 * Strategy is CATALOG-FIRST: registry blocks are catalogued (name + description +
 * install URL) but NOT vendored — the agent installs them on demand with
 * `bunx --bun shadcn@latest add "<installUrl>"`. Only the local pro blocks (no
 * URL) and a small CORE set are vendored as real source. This keeps the repo
 * from absorbing ~4500 third-party files while leaving none of them behind.
 *
 * Run (registries are outside the sandbox allowlist — disable it if a fetch
 * times out):
 *   bun run component-registry/scripts/fetch-components.mjs
 *   bun run component-registry/scripts/fetch-components.mjs --skip-shadcnblocks-probe  (use cache)
 *
 * Outputs (all generated — hand-edit tokens.css / blocks / templates instead):
 *   component-registry/<lib>/*.tsx        core vendored source (shadcn/watermelon)
 *   component-registry/pro/<cat>/*.tsx    vendored local pro blocks
 *   component-registry/manifest.json      full machine catalog (every item + description)
 *   component-registry/CATALOG.md         human-browsable catalog grouped by source/category
 *   component-registry/skill-catalog.md   compact catalog fragment embedded into skills/shadcn/SKILL.md
 */

import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ROOT, '..');
const SHADCN_STYLE = 'new-york';
const SKIP_SB_PROBE = process.argv.includes('--skip-shadcnblocks-probe');

/* ----------------------------------------------------------------- helpers */

function toComponentName(name) {
    return name
        .split(/[-_]/)
        .filter(Boolean)
        .map((p) => (p[0] ? p[0].toUpperCase() + p.slice(1) : p))
        .join('');
}

/** Run `fn` over `items` with a fixed concurrency pool. */
async function mapPool(items, concurrency, fn) {
    const out = new Array(items.length);
    let i = 0;
    async function worker() {
        while (i < items.length) {
            const idx = i++;
            out[idx] = await fn(items[idx], idx);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return out;
}

async function fetchText(url, headers) {
    const res = await fetch(url, { headers: { accept: 'application/json', ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

/** Split a numeric variant suffix: "hero-section-5" -> { stem:"hero-section", n:"5" }. */
function splitVariant(name) {
    const m = /^(.*?)[-_]?(\d+)$/.exec(name);
    if (m && m[1]) return { stem: m[1], n: m[2] };
    return { stem: name, n: '' };
}

// Stem -> "what it is / what it contains" template. Used for sources without
// their own descriptions (Watermelon, local pro). Keep entries concise but
// concrete about layout + contents.
const STEM_DESC = {
    'hero-section': 'Hero: large headline, supporting subtext, and primary/secondary CTAs',
    hero: 'Hero: large headline, supporting subtext, and primary/secondary CTAs',
    'feature-section': 'Feature section: titled capability blocks with copy and icons/visuals',
    feature: 'Feature block: capability with title, copy, and an icon or visual',
    features: 'Features grid: multiple capability blocks',
    'pricing-section': 'Pricing: plan tiers with price, feature list, and CTA',
    pricing: 'Pricing: plan tiers with price, feature list, and CTA',
    'pricing-table': 'Pricing table: side-by-side plan comparison',
    testimonial: 'Testimonial: customer quote with name, role, and avatar',
    testimonials: 'Testimonials: grid/carousel of customer quotes',
    'testimonials-section': 'Testimonials section: customer quotes with attribution',
    cta: 'Call to action: headline, supporting line, and a button',
    'cta-section': 'Call to action section: headline, supporting line, and buttons',
    footer: 'Footer: link columns, brand, legal, and social links',
    'section-footer': 'Section footer: closing links/legal row for a section',
    navbar: 'Navbar: brand, primary nav links, and actions',
    'lp-navbar': 'Landing-page navbar: brand, links, and CTA',
    nav: 'Navigation: brand and primary links',
    'nav-main': 'Sidebar main nav: grouped navigation items',
    'nav-user': 'Sidebar user menu: avatar, name, and account actions',
    'nav-projects': 'Sidebar projects nav: project list with actions',
    header: 'Header section: title, description, and supporting actions',
    'header-section': 'Header section: title, description, and supporting actions',
    'page-header': 'Page header: page title, breadcrumb/meta, and actions',
    'section-header': 'Section header: eyebrow, heading, and description',
    faq: 'FAQ: question/answer accordion list',
    'faq-section': 'FAQ section: question/answer accordion list',
    accordion: 'Accordion: collapsible disclosure rows',
    alert: 'Alert: inline status callout with title and message',
    avatar: 'Avatar: image with fallback initials',
    badge: 'Badge: small status/tag label',
    banner: 'Banner: full-width announcement strip with action',
    bento: 'Bento grid: asymmetric tiles of varying size/importance',
    'bento-grid': 'Bento grid: asymmetric tiles of varying size/importance',
    blog: 'Blog: article cards with image, title, excerpt, and meta',
    'blog-section': 'Blog section: article card grid',
    button: 'Button: action control with variants',
    card: 'Card: titled surface with content and optional footer',
    cards: 'Cards: grid of titled surfaces',
    carousel: 'Carousel: horizontally scrollable slides',
    chart: 'Chart: data visualization (line/bar/area)',
    contact: 'Contact: form with fields and submit, often with details panel',
    'contact-section': 'Contact section: form with fields and submit',
    dialog: 'Dialog: modal overlay with content and actions',
    modal: 'Modal: overlay with content and actions',
    dropdown: 'Dropdown: trigger with a menu of actions',
    form: 'Form: labeled inputs with validation and submit',
    gallery: 'Gallery: image/media grid',
    input: 'Input: text field with label and states',
    login: 'Login: email/password (or OAuth) sign-in form',
    'sign-in': 'Sign-in: email/password (or OAuth) form',
    signup: 'Sign-up: registration form with fields and submit',
    'sign-up': 'Sign-up: registration form with fields and submit',
    sidebar: 'Sidebar: app navigation rail with sections',
    'app-shell': 'App shell: sidebar + topbar + content layout',
    stats: 'Stats: metric figures with labels and trend',
    'stats-section': 'Stats section: metric figures with labels',
    stat: 'Stat: single metric with label and trend',
    table: 'Table: rows/columns with header and actions',
    'table-header': 'Table header: title, filters, and actions above a table',
    tabs: 'Tabs: switch between panels',
    tooltip: 'Tooltip: hover/focus hint',
    timeline: 'Timeline: ordered events with markers',
    team: 'Team: member cards with photo, name, and role',
    'team-section': 'Team section: member cards with photo, name, role',
    logo: 'Logo wall: partner/customer logos row or grid',
    'logo-section': 'Logo section: partner/customer logos',
    '404-section': '404: not-found message with navigation back',
    'empty-section': 'Empty state: message with a clear primary action',
    banners: 'Banner: full-width announcement strip with action',
    'description-list': 'Description list: key/value detail rows',
    'rich-text-section': 'Rich-text section: long-form prose layout',
    settings: 'Settings: grouped preference controls with labels',
    pattern: 'Pattern: composed UI pattern example',
};

function deriveDescription(name, category) {
    const { stem, n } = splitVariant(name);
    const key = stem.toLowerCase();
    const base =
        STEM_DESC[key] ||
        STEM_DESC[category] ||
        STEM_DESC[(category || '').replace(/s$/, '')] ||
        `${stem.replace(/[-_]/g, ' ')} component`;
    return n ? `${base} (variant ${n})` : base;
}

/* --------------------------------------------------------- source builders */

/** CORE: a small vendored set so common primitives ship as real source too. */
const CORE_VENDOR = [
    ['button', 'primitive', 'Button with variant + size system'],
    ['card', 'primitive', 'Surface container: Card, Header, Title, Content, Footer'],
    ['input', 'primitive', 'Text input'],
    ['label', 'primitive', 'Form label'],
    ['textarea', 'primitive', 'Multi-line text input'],
    ['badge', 'primitive', 'Status / tag badge'],
    ['separator', 'primitive', 'Hairline divider'],
    ['accordion', 'primitive', 'Disclosure accordion'],
    ['tabs', 'primitive', 'Tabbed sections'],
    ['dialog', 'primitive', 'Modal dialog'],
    ['switch', 'primitive', 'Toggle switch'],
    ['checkbox', 'primitive', 'Checkbox'],
    ['skeleton', 'primitive', 'Loading skeleton'],
    ['tooltip', 'primitive', 'Hover tooltip'],
    ['select', 'primitive', 'Select dropdown'],
    ['avatar', 'primitive', 'Avatar image with fallback'],
];

function flattenShadcnPath(p) {
    return p.replace(/^ui\//, '').replace(/^src\//, '');
}

async function vendorCore() {
    const out = [];
    for (const [name, category, description] of CORE_VENDOR) {
        const url = `https://ui.shadcn.com/r/styles/${SHADCN_STYLE}/${name}.json`;
        try {
            const json = JSON.parse(await fetchText(url));
            for (const f of json.files ?? []) {
                const rel = join('shadcn', flattenShadcnPath(f.path ?? `${name}.tsx`));
                const abs = join(ROOT, rel);
                await mkdir(dirname(abs), { recursive: true });
                await writeFile(abs, String(f.content ?? '').replace(/\r\n/g, '\n'), 'utf8');
            }
            out.push({
                name,
                lib: 'shadcn',
                category,
                description,
                componentName: toComponentName(name),
                importPath: `@/components/ui/${name}`,
                installUrl: url,
                vendored: true,
            });
            console.log(`  vendor shadcn/${name}`);
        } catch (err) {
            console.warn(`  ! core ${name}: ${err.message}`);
        }
    }
    return out;
}

async function catalogShadcnUi(haveNames) {
    const idx = JSON.parse(await fetchText('https://ui.shadcn.com/r/index.json'));
    const out = [];
    for (const item of idx) {
        if (item.type !== 'registry:ui') continue;
        if (haveNames.has(`shadcn:${item.name}`)) continue;
        out.push({
            name: item.name,
            lib: 'shadcn',
            category: 'primitive',
            description: item.description || `shadcn/ui ${item.name} primitive`,
            componentName: toComponentName(item.name),
            importPath: `@/components/ui/${item.name}`,
            installUrl: `https://ui.shadcn.com/r/styles/${SHADCN_STYLE}/${item.name}.json`,
            vendored: false,
        });
    }
    return out;
}

const SHADCN_BLOCK_CANDIDATES = [
    ...Array.from({ length: 16 }, (_, i) => `sidebar-${String(i + 1).padStart(2, '0')}`),
    'dashboard-01',
    ...Array.from({ length: 5 }, (_, i) => `login-${String(i + 1).padStart(2, '0')}`),
];

async function catalogShadcnBlocks() {
    const results = await mapPool(SHADCN_BLOCK_CANDIDATES, 8, async (name) => {
        const url = `https://ui.shadcn.com/r/styles/${SHADCN_STYLE}/${name}.json`;
        try {
            const json = JSON.parse(await fetchText(url));
            if (!json.files?.length) return null;
            const desc = name.startsWith('sidebar')
                ? 'App sidebar layout with collapsible nav, header, and content'
                : name.startsWith('dashboard')
                  ? 'Dashboard page: sidebar, stat cards, and charts'
                  : 'Login page layout with form and branding';
            return {
                name,
                lib: 'shadcn',
                category: 'block',
                description: `${desc} (${name})`,
                componentName: toComponentName(name),
                importPath: `@/components/${name}`,
                installUrl: url,
                vendored: false,
            };
        } catch {
            return null;
        }
    });
    return results.filter(Boolean);
}

async function catalogWatermelon() {
    const list = JSON.parse(
        await fetchText(
            'https://api.github.com/repos/WatermelonCorp/watermellon-registry/contents/public/r?per_page=1000',
        ),
    );
    const names = list
        .filter((x) => typeof x.name === 'string' && x.name.endsWith('.json'))
        .map((x) => x.name.slice(0, -5));
    return names.map((name) => {
        const { stem } = splitVariant(name);
        return {
            name,
            lib: 'watermelon',
            category: stem.toLowerCase(),
            description: deriveDescription(name, stem.toLowerCase()),
            componentName: toComponentName(name),
            importPath: `@/components/watermelon-ui/${name}`,
            // Install via raw github — registry.watermelon.sh serves a SPA, not JSON.
            installUrl: `https://raw.githubusercontent.com/WatermelonCorp/watermellon-registry/main/public/r/${name}.json`,
            vendored: false,
        };
    });
}

async function catalogShadcnblocksFree() {
    const reg = JSON.parse(await fetchText('https://www.shadcnblocks.com/r/registry.json'));
    const items = (reg.items ?? []).filter((i) => i.name);
    const cacheFile = join(ROOT, '.cache', 'shadcnblocks-free.json');
    let freeNames = null;
    if (SKIP_SB_PROBE && existsSync(cacheFile)) {
        freeNames = new Set(JSON.parse(await readFile(cacheFile, 'utf8')));
        console.log(`  using cached free list: ${freeNames.size}`);
    } else {
        console.log(`  probing ${items.length} shadcnblocks for free access…`);
        let done = 0;
        const flags = await mapPool(items, 24, async (it) => {
            try {
                const txt = await fetchText(`https://www.shadcnblocks.com/r/${it.name}.json`);
                const j = JSON.parse(txt);
                const free = !!(j.files && j.files[0] && j.files[0].content);
                if (++done % 400 === 0) console.log(`    …${done}/${items.length}`);
                return free ? it.name : null;
            } catch {
                return null;
            }
        });
        freeNames = new Set(flags.filter(Boolean));
        await mkdir(dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, JSON.stringify([...freeNames], null, 0), 'utf8');
        console.log(`  free: ${freeNames.size} / ${items.length}`);
    }
    return items
        .filter((it) => freeNames.has(it.name))
        .map((it) => ({
            name: it.name,
            lib: 'shadcnblocks',
            category: (it.type === 'registry:component' ? 'component' : it.title || '')
                .toString()
                .toLowerCase()
                .replace(/\s*\d+.*/, '')
                .trim() || 'block',
            description: it.description || it.title || `shadcnblocks ${it.name}`,
            componentName: toComponentName(it.name),
            importPath: `@/components/${it.name}`,
            installUrl: `https://www.shadcnblocks.com/r/${it.name}.json`,
            vendored: false,
        }));
}

async function vendorProBlocks() {
    const src = join(REPO_ROOT, 'reference', 'shadcn-pro-blocks', 'components');
    if (!existsSync(src)) {
        console.warn('  ! no local pro blocks at reference/shadcn-pro-blocks');
        return [];
    }
    const destRoot = join(ROOT, 'pro');
    await mkdir(destRoot, { recursive: true });
    const out = [];
    async function walk(dir, relParts) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const abs = join(dir, e.name);
            if (e.isDirectory()) {
                await walk(abs, [...relParts, e.name]);
            } else if (e.name.endsWith('.tsx')) {
                const category = relParts[0] || 'components';
                const name = basename(e.name, '.tsx');
                const destRel = join('pro', ...relParts, e.name);
                const destAbs = join(ROOT, destRel);
                await mkdir(dirname(destAbs), { recursive: true });
                await cp(abs, destAbs);
                out.push({
                    name,
                    lib: 'pro',
                    category: category.replace(/-sections?$/, '').replace(/s$/, ''),
                    description: deriveDescription(name, category.replace(/-sections?$/, '')),
                    componentName: toComponentName(name),
                    importPath: `@/components/${['pro', ...relParts].join('/')}/${name}`,
                    installUrl: null,
                    vendored: true,
                });
            }
        }
    }
    await walk(src, []);
    console.log(`  vendored ${out.length} local pro blocks`);
    return out;
}

/* -------------------------------------------------------------- emit files */

function emitCatalogMd(byLib) {
    const lines = ['# Component catalog', '', 'Generated by scripts/fetch-components.mjs. Do not hand-edit.', ''];
    const libTitle = {
        shadcn: 'shadcn/ui',
        shadcnblocks: 'shadcnblocks (free)',
        watermelon: 'Watermelon UI',
        pro: 'Local pro blocks (vendored)',
    };
    for (const lib of ['shadcn', 'shadcnblocks', 'watermelon', 'pro']) {
        const items = byLib[lib] || [];
        if (!items.length) continue;
        lines.push(`## ${libTitle[lib]} — ${items.length}`, '');
        const byCat = {};
        for (const it of items) (byCat[it.category] ||= []).push(it);
        for (const cat of Object.keys(byCat).sort()) {
            lines.push(`### ${cat} (${byCat[cat].length})`, '');
            for (const it of byCat[cat].sort((a, b) => a.name.localeCompare(b.name))) {
                const install = it.installUrl ? ` — \`${it.installUrl}\`` : ' — (vendored local)';
                lines.push(`- **${it.name}**: ${it.description}${install}`);
            }
            lines.push('');
        }
    }
    return lines.join('\n') + '\n';
}

function emitSkillCatalog(byLib, total) {
    const lines = [
        `Total catalogued: ${total} components/blocks across shadcn/ui, shadcnblocks (free), Watermelon UI, and local pro blocks.`,
        '',
        'Install patterns (run in the user project):',
        '- shadcn/ui: `bunx --bun shadcn@latest add "https://ui.shadcn.com/r/styles/new-york/<name>.json"`',
        '- shadcnblocks (free): `bunx --bun shadcn@latest add "https://www.shadcnblocks.com/r/<name>.json"`',
        '- Watermelon UI: `bunx --bun shadcn@latest add "https://raw.githubusercontent.com/WatermelonCorp/watermellon-registry/main/public/r/<name>.json"`',
        "- Local pro blocks: a curated reference set bundled with Weblab (NOT in the user's workspace — don't read those paths). Reproduce the pattern with installed shadcn/ui primitives, or install the closest shadcnblocks/Watermelon equivalent.",
        '',
        'Counts by source/category (install any item by name with the pattern above):',
        '',
    ];
    const libTitle = {
        shadcn: 'shadcn/ui',
        shadcnblocks: 'shadcnblocks (free)',
        watermelon: 'Watermelon UI',
        pro: 'Local pro',
    };
    for (const lib of ['shadcn', 'shadcnblocks', 'watermelon', 'pro']) {
        const items = byLib[lib] || [];
        if (!items.length) continue;
        const byCat = {};
        for (const it of items) (byCat[it.category] ||= []).push(it);
        lines.push(`### ${libTitle[lib]} (${items.length})`);
        for (const cat of Object.keys(byCat).sort()) {
            const names = byCat[cat].map((i) => i.name).sort();
            lines.push(`- **${cat}** (${names.length}): ${names.join(', ')}`);
        }
        lines.push('');
    }
    return lines.join('\n') + '\n';
}

/* -------------------------------------------------------------------- main */

async function run() {
    console.log('Vendoring core primitives…');
    const core = await vendorCore();
    const have = new Set(core.map((c) => `${c.lib}:${c.name}`));

    console.log('Cataloguing shadcn/ui…');
    const ui = await catalogShadcnUi(have);
    const blocks = await catalogShadcnBlocks();

    console.log('Cataloguing Watermelon UI…');
    const watermelon = await catalogWatermelon();

    console.log('Cataloguing shadcnblocks (free)…');
    let shadcnblocks = [];
    try {
        shadcnblocks = await catalogShadcnblocksFree();
    } catch (err) {
        console.warn(`  ! shadcnblocks failed: ${err.message}`);
    }

    console.log('Vendoring local pro blocks…');
    const pro = await vendorProBlocks();

    const all = [...core, ...ui, ...blocks, ...shadcnblocks, ...watermelon, ...pro];
    all.sort((a, b) => (a.lib + a.name).localeCompare(b.lib + b.name));

    const byLib = {};
    for (const it of all) (byLib[it.lib] ||= []).push(it);

    const manifest = {
        generatedBy: 'component-registry/scripts/fetch-components.mjs',
        note: 'Generated. Re-run the fetcher to update. Hand-edit tokens.css / blocks / templates instead.',
        counts: Object.fromEntries(Object.entries(byLib).map(([k, v]) => [k, v.length])),
        total: all.length,
        installPatterns: {
            shadcn: 'https://ui.shadcn.com/r/styles/new-york/<name>.json',
            shadcnblocks: 'https://www.shadcnblocks.com/r/<name>.json',
            watermelon:
                'https://raw.githubusercontent.com/WatermelonCorp/watermellon-registry/main/public/r/<name>.json',
        },
        components: all,
    };
    await writeFile(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    await writeFile(join(ROOT, 'CATALOG.md'), emitCatalogMd(byLib), 'utf8');
    await writeFile(join(ROOT, 'skill-catalog.md'), emitSkillCatalog(byLib, all.length), 'utf8');

    console.log(`\nDone. ${all.length} catalogued:`);
    for (const [k, v] of Object.entries(byLib)) console.log(`  ${k}: ${v.length}`);
    console.log('Wrote manifest.json, CATALOG.md, skill-catalog.md');
}

await run();
