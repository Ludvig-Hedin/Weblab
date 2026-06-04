import type { FrameworkId } from '@weblab/framework';

export type ExternalTemplateCategory =
    | 'boilerplate'
    | 'starter'
    | 'portfolio'
    | 'marketing'
    | 'dashboard'
    | 'blog'
    | 'saas'
    | 'agency'
    | 'docs'
    | 'app'
    | 'ecommerce';

export interface ExternalTemplate {
    id: string;
    name: string;
    shortDescription: string;
    description: string;
    category: ExternalTemplateCategory;
    /**
     * Framework adapter this template targets. Used by the templates page to
     * filter ("show me static HTML templates") and by the create flow to set
     * the project's framework without asking the user. Defaults to 'nextjs'
     * when omitted, since every existing template was authored before
     * multi-framework support and is a Next.js project.
     */
    framework?: FrameworkId;
    tags: string[];
    sourceUrl: string;
    /**
     * Bare clone URL — must be `https://github.com/<owner>/<repo>`, never a
     * `/tree/<branch>/<path>` URL (issue #47). The previous shape passed the
     * tree URL through to the sandbox provisioner and broke imports for
     * subpath-based examples.
     */
    repoUrl: string;
    /**
     * Optional path inside the repo, when the template lives in a
     * monorepo/examples folder rather than at the repo root. Consumers
     * (`startPublicGitHubTemplate`) should use this to scope the import.
     */
    subpath?: string;
    previewUrl: string;
    branch: string;
    /**
     * Pre-seeded CodeSandbox sandbox ID. When present, the fast `fork` endpoint
     * is used (~2 s) instead of the slow `createFromGitHub` import (~90 s).
     * Populate by running `createFromGitHub` once per template and recording the
     * returned `sandboxId`.
     */
    sandboxId?: string;
    highlights: string[];
    bestFor: string;
    accentClassName: string;
    gradientClassName: string;
}

export const EXTERNAL_TEMPLATES: ExternalTemplate[] = [
    {
        id: 'startd',
        name: 'Startd',
        shortDescription: 'Modern starter with app-ready product scaffolding.',
        description:
            'A polished Next.js starter aimed at production app foundations, with a ready-made structure for quickly turning an idea into a useful web product.',
        category: 'starter',
        tags: ['Next.js', 'Starter', 'Product'],
        sourceUrl: 'https://nextjstemplates.com/templates/startd',
        repoUrl: 'https://github.com/jkytoela/next-startd',
        previewUrl: 'https://next-startd.vercel.app/',
        branch: 'main',
        highlights: [
            'Production-oriented starter',
            'Polished default pages',
            'Good for SaaS and app prototypes',
        ],
        bestFor: 'Starting a full product with more structure than a blank boilerplate.',
        accentClassName: 'text-cyan-200',
        gradientClassName: 'from-slate-950 via-cyan-950 to-blue-700',
    },
    {
        id: 'portfolio-starter-kit',
        name: 'Portfolio Starter Kit',
        shortDescription: 'Blog-backed portfolio starter from Vercel examples.',
        description:
            'A portfolio and writing starter that works well for personal sites, founder profiles, case studies, and content-first portfolios.',
        category: 'portfolio',
        tags: ['Portfolio', 'Blog', 'Content'],
        sourceUrl: 'https://vercel.com/templates/next.js/portfolio-starter-kit',
        repoUrl: 'https://github.com/vercel/examples',
        subpath: 'solutions/blog',
        previewUrl: 'https://portfolio-blog-starter.vercel.app/',
        branch: 'main',
        highlights: [
            'Portfolio-ready content structure',
            'Blog and writing support',
            'Vercel-maintained example',
        ],
        bestFor: 'Personal websites, writing portfolios, case-study portfolios, and creator sites.',
        accentClassName: 'text-amber-200',
        gradientClassName: 'from-stone-950 via-amber-950 to-orange-700',
    },
    {
        id: 'marketing-site',
        name: 'Marketing Site',
        shortDescription: 'Marketing-page starter based on the Next Drupal example.',
        description:
            'A marketing-site example suited for product pages, campaign pages, and content-led landing experiences that need a more editorial structure.',
        category: 'marketing',
        tags: ['Marketing', 'Landing Page', 'Content'],
        sourceUrl:
            'https://github.com/chapter-three/next-drupal/tree/main/examples/example-marketing',
        repoUrl: 'https://github.com/chapter-three/next-drupal',
        subpath: 'examples/example-marketing',
        previewUrl: 'https://next-example-marketing.vercel.app/',
        branch: 'main',
        highlights: [
            'Marketing-focused layout',
            'Content-led sections',
            'Useful for campaign and product pages',
        ],
        bestFor: 'Product marketing sites and editorial landing pages.',
        accentClassName: 'text-lime-200',
        gradientClassName: 'from-emerald-950 via-lime-950 to-green-700',
    },
    {
        id: 'shadcn-admin-dashboard',
        name: 'Next.js & shadcn/ui Admin Dashboard',
        shortDescription: 'Admin dashboard starter with shadcn/ui components.',
        description:
            'A dashboard template for operational products, admin tools, analytics surfaces, and internal tools that benefit from shadcn/ui conventions.',
        category: 'dashboard',
        tags: ['Dashboard', 'shadcn/ui', 'Admin'],
        sourceUrl: 'https://github.com/arhamkhnz/next-shadcn-admin-dashboard',
        repoUrl: 'https://github.com/arhamkhnz/next-shadcn-admin-dashboard',
        previewUrl: 'https://next-shadcn-admin-dashboard.vercel.app/',
        branch: 'main',
        highlights: [
            'Admin dashboard layout',
            'shadcn/ui component patterns',
            'Good base for internal tools',
        ],
        bestFor: 'Analytics dashboards, admin panels, and internal operations tools.',
        accentClassName: 'text-violet-200',
        gradientClassName: 'from-zinc-950 via-violet-950 to-indigo-700',
    },
    {
        id: 'blog-starter-kit',
        name: 'Blog Starter Kit',
        shortDescription: 'Canonical Next.js blog starter example.',
        description:
            'A focused blog starter for publishing, documentation-style articles, changelogs, and content-heavy sites.',
        category: 'blog',
        tags: ['Blog', 'Publishing', 'Next.js'],
        sourceUrl: 'https://github.com/vercel/next.js/tree/canary/examples/blog-starter',
        repoUrl: 'https://github.com/vercel/next.js',
        subpath: 'examples/blog-starter',
        previewUrl: 'https://next-blog-starter.vercel.app/',
        branch: 'canary',
        highlights: [
            'Simple publishing structure',
            'Canonical Next.js example',
            'Good for content-first sites',
        ],
        bestFor: 'Blogs, changelogs, lightweight documentation, and editorial sites.',
        accentClassName: 'text-rose-200',
        gradientClassName: 'from-rose-950 via-red-950 to-stone-800',
    },
];

/**
 * STAGED Weblab-owned templates. Each entry corresponds to a repo under
 * `github.com/Ludvig-Hedin` scaffolded from `template-sources/<id>/`. Entries
 * stay commented out until:
 *   1. The repo exists on GitHub (`gh repo create Ludvig-Hedin/<id> --public`).
 *   2. A CodeSandbox template is seeded from the repo and the ID recorded as
 *      `sandboxId` (also added to `PUBLIC_TEMPLATE_SANDBOX_IDS` in
 *      `packages/constants/src/csb.ts`).
 *   3. A thumbnail PNG exists at `public/assets/templates/<id>.png`.
 *
 * Source-of-truth for the catalog (16 templates) and per-template build
 * prompts: `template-sources/_PROMPTS.md`. Reference template already built:
 * `template-sources/weblab-template-saas-nextjs/` — Alloyd brand.
 */
// const STAGED_WEBLAB_TEMPLATES: ExternalTemplate[] = [
//     {
//         id: 'weblab-template-saas-nextjs',
//         name: 'SaaS (Next.js)',
//         shortDescription: 'Clean SaaS marketing template with restrained mono + slate-blue accent.',
//         description:
//             'A tight Next.js 15 marketing site for a B2B SaaS product. Restrained mono palette, slate-blue whisper accent, dark mode, shadcn/ui primitives. Sections: nav, hero, features, pricing, testimonials, CTA, footer.',
//         category: 'saas',
//         tags: ['Next.js', 'SaaS', 'Tailwind v4', 'shadcn/ui'],
//         sourceUrl: 'https://github.com/Ludvig-Hedin/weblab-template-saas-nextjs',
//         repoUrl: 'https://github.com/Ludvig-Hedin/weblab-template-saas-nextjs',
//         previewUrl: 'https://weblab-template-saas-nextjs.vercel.app/',
//         branch: 'main',
//         highlights: [
//             'Restrained mono base, slate-blue whisper accent',
//             'Next.js 15 App Router + Tailwind v4 + shadcn/ui',
//             'Dark mode out of the box',
//         ],
//         bestFor: 'B2B SaaS marketing sites that want to look intentional, not loud.',
//         accentClassName: 'text-blue-200',
//         gradientClassName: 'from-slate-950 via-blue-950 to-indigo-800',
//     },
//     // ... 15 more staged entries follow the same shape. See
//     // `template-sources/_PROMPTS.md` for the catalog (saas/portfolio/blog/
//     // dashboard/ecommerce/agency/docs/app × nextjs/html).
// ];

export function getExternalTemplate(id: string): ExternalTemplate | undefined {
    return EXTERNAL_TEMPLATES.find((template) => template.id === id);
}

export function getRelatedExternalTemplates(
    template: ExternalTemplate,
    limit = 3,
): ExternalTemplate[] {
    return EXTERNAL_TEMPLATES.filter((candidate) => candidate.id !== template.id)
        .map((candidate) => ({
            template: candidate,
            score:
                (candidate.category === template.category ? 2 : 0) +
                candidate.tags.filter((tag) => template.tags.includes(tag)).length,
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit)
        .map(({ template }) => template);
}
