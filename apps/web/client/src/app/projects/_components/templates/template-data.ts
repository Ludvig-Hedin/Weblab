import type { FrameworkId } from '@weblab/framework';
import { STATIC_HTML_SANDBOX_ID } from '@weblab/constants';

export type ExternalTemplateCategory =
    | 'boilerplate'
    | 'starter'
    | 'portfolio'
    | 'marketing'
    | 'dashboard'
    | 'blog';

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
        id: 'static-html-starter',
        name: 'Static HTML',
        shortDescription: 'Plain HTML, CSS, and JavaScript — no build step, no framework.',
        description:
            'A minimal static site with an index.html, stylesheet, and script file. Use this when you want full control over your markup without a JavaScript framework or bundler — ideal for landing pages, portfolios, and quick prototypes.',
        category: 'starter',
        framework: 'static-html',
        tags: ['HTML', 'CSS', 'JavaScript'],
        sourceUrl: `https://codesandbox.io/p/sandbox/${STATIC_HTML_SANDBOX_ID}`,
        // Fast path forks sandboxId (~2 s). repoUrl is only reached if the
        // CSB fork endpoint is unavailable — replace with the actual repo that
        // backs STATIC_HTML_SANDBOX_ID once that is known.
        repoUrl: 'https://github.com/h5bp/html5-boilerplate',
        previewUrl: `https://${STATIC_HTML_SANDBOX_ID}.csb.app/`,
        branch: 'main',
        sandboxId: STATIC_HTML_SANDBOX_ID,
        highlights: [
            'Zero dependencies — no npm or bundler required',
            'index.html, style.css, and app.js ready to edit',
            'Instant live preview via static file server',
        ],
        bestFor:
            'Landing pages, portfolios, prototypes, and any project that does not need React or a build step.',
        accentClassName: 'text-orange-200',
        gradientClassName: 'from-orange-950 via-amber-900 to-yellow-700',
    },
    {
        id: 'nextjs-boilerplate',
        name: 'Next.js Boilerplate',
        shortDescription: 'Vercel-maintained baseline for new Next.js apps.',
        description:
            'A clean Vercel example used as the default foundation for new Next.js app starts. Use this when you need the safest, most minimal Next.js baseline before adding product-specific UI.',
        category: 'boilerplate',
        tags: ['Next.js', 'Vercel', 'Boilerplate'],
        sourceUrl: 'https://github.com/vercel/vercel/tree/main/examples/nextjs',
        repoUrl: 'https://github.com/vercel/vercel',
        subpath: 'examples/nextjs',
        // Vercel's marketing page (vercel.com/templates/...) refuses
        // iframe embedding via X-Frame-Options, which used to surface as
        // a chrome-error inside the templates detail page. The
        // canonical *deployed* boilerplate is hosted on the standard
        // *.vercel.app domain — no XFO, embeds cleanly.
        previewUrl: 'https://nextjs-boilerplate.vercel.app/',
        branch: 'main',
        highlights: [
            'Minimal Next.js app structure',
            'Vercel-first deployment path',
            'Good base for custom AI generation',
        ],
        bestFor: 'Fresh Next.js apps that should start from a minimal, trusted foundation.',
        accentClassName: 'text-neutral-200',
        gradientClassName: 'from-neutral-950 via-neutral-800 to-neutral-600',
    },
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
