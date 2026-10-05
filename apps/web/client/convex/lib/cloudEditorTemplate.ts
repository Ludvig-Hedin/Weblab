// Import the pure scaffold module directly: the provider barrel also loads Node-only SDKs.
import { getNextJsScaffoldFiles } from '../../../../../packages/code-provider/src/scaffold-templates';

import type { PilotContent } from './cloudPilot';
import { validatePilotContent } from './cloudPilot';

export interface CloudEditorFile {
    path: string;
    content: string;
}

// Literal string children are supported by the inline text editor. Encoding angle
// brackets also keeps arbitrary supplied text out of HTML/script delimiters.
function text(value: string): string {
    return `{${JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}}`;
}

function attribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;');
}

/**
 * Source-backed starter for the shared visual editor. IDs are stable and unique
 * across the complete project, including the shared navigation and footer.
 * The server supplies the two current bootstrap bundles before starting Next.
 */
export function createCloudEditorFiles(name: string, legacyContent?: PilotContent): CloudEditorFile[] {
    if (!name.trim() || name.length > 160) throw new Error('CLOUD_EDITOR_INVALID_NAME');
    const legacy = legacyContent ? validatePilotContent(legacyContent) : undefined;
    const title = legacy?.title ?? 'Thoughtful design, made together.';
    const description = legacy?.description ?? 'We help independent businesses find their voice and bring it to life, from the first conversation to the finished website.';
    const alignment = legacy?.alignment === 'center' ? 'items-center text-center' : 'items-start text-left';
    const heroImage = legacy?.imageUrl
        ? `<img data-oid="ce-home-image" src="${attribute(legacy.imageUrl)}" alt="${attribute(legacy.imageAlt)}" className="mt-12 aspect-[16/9] w-full object-cover" />`
        : legacy ? '' : '<img data-oid="ce-home-image" src="/studio-image.svg" alt="Studio image" className="mt-12 aspect-[16/9] w-full object-cover" />';
    const cta = legacy
        ? legacy.ctaHref ? `<a data-oid="ce-home-cta" href="${attribute(legacy.ctaHref)}" className="mt-8 inline-flex border-b border-foreground pb-1 text-base font-medium">${text(legacy.ctaLabel)}</a>` : ''
        : '<a data-oid="ce-home-cta" href="/about#contact" className="mt-8 inline-flex border-b border-foreground pb-1 text-base font-medium">Let’s talk about your project</a>';

    const layout = `import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = { title: ${JSON.stringify(name).replace(/</g, '\\u003c')} };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-oid="ce-layout-html">
      <body data-oid="ce-layout-body" className="min-h-screen bg-background text-foreground antialiased">
        <a data-oid="ce-layout-skip" href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-50 focus:bg-background focus:p-3">Skip to content</a>
        <header data-oid="ce-layout-header" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-7 sm:px-10">
          <a data-oid="ce-layout-name" href="/" className="max-w-full break-words text-xl font-semibold tracking-tight">${text(name)}</a>
          <nav data-oid="ce-layout-nav" aria-label="Main navigation" className="flex items-center gap-6 text-sm">
            <a data-oid="ce-layout-work" href="/#work" className="hover:underline underline-offset-4">Work</a>
            <a data-oid="ce-layout-about" href="/about" className="hover:underline underline-offset-4">About</a>
            <a data-oid="ce-layout-contact" href="/about#contact" className="hover:underline underline-offset-4">Contact</a>
          </nav>
        </header>
        {children}
        <footer data-oid="ce-layout-footer" className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:px-10">
          <p data-oid="ce-layout-footer-name">${text(name)}</p>
          <a data-oid="ce-layout-footer-link" href="/about#contact" className="hover:underline underline-offset-4">Start a conversation</a>
        </footer>
        <Script id="weblab-preload-script" src="/weblab-preload-script.js" type="module" strategy="afterInteractive" />
        <Script id="weblab-ix-runtime" src="/weblab-ix-runtime.js" type="module" strategy="afterInteractive" data-interactions-src="/_weblab/interactions.json" />
      </body>
    </html>
  );
}
`;

    const home = `export default function HomePage() {
  return (
    <main id="main" data-oid="ce-home-main" className="mx-auto max-w-6xl px-6 sm:px-10">
      <section data-oid="ce-home-hero" className="flex flex-col py-16 sm:py-24 ${alignment}">
        <h1 data-oid="ce-home-title" className="max-w-3xl whitespace-pre-wrap break-words text-4xl font-medium leading-[1.12] tracking-tight sm:text-6xl">${text(title)}</h1>
        <p data-oid="ce-home-description" className="mt-6 max-w-xl whitespace-pre-wrap break-words text-lg leading-relaxed text-muted-foreground">${text(description)}</p>
        ${cta}
        ${heroImage}
      </section>
      <section id="work" data-oid="ce-home-work" className="border-t border-border py-12 sm:py-16">
        <div data-oid="ce-home-work-intro" className="grid gap-5 sm:grid-cols-2 sm:gap-12">
          <h2 data-oid="ce-home-work-title" className="text-3xl font-medium tracking-tight">A closer look at our work</h2>
          <p data-oid="ce-home-work-description" className="max-w-md text-base leading-relaxed text-muted-foreground">Clear identities and useful websites. Each project starts with the people who will use it.</p>
        </div>
        <div data-oid="ce-home-projects" className="mt-10 grid gap-12 md:grid-cols-2">
          <article data-oid="ce-home-project-one" className="flex flex-col gap-4">
            <div data-oid="ce-home-project-one-art" className="flex aspect-[4/3] items-end bg-[#e4e8e3] p-8 sm:p-10">
              <p data-oid="ce-home-project-one-wordmark" className="text-5xl font-medium tracking-tight text-[#34453b] sm:text-6xl">Fieldwork</p>
            </div>
            <h3 data-oid="ce-home-project-one-title" className="text-xl font-medium">A fresh identity for a growing idea</h3>
            <p data-oid="ce-home-project-one-description" className="leading-relaxed text-muted-foreground">An identity concept built around simple forms, natural colors and a clear point of view.</p>
          </article>
          <article data-oid="ce-home-project-two" className="flex flex-col gap-4">
            <div data-oid="ce-home-project-two-art" className="flex aspect-[4/3] items-center justify-center bg-[#ede9e2] p-8 sm:p-10">
              <p data-oid="ce-home-project-two-wordmark" className="text-5xl font-light tracking-wide text-[#514b43] sm:text-6xl">Common</p>
            </div>
            <h3 data-oid="ce-home-project-two-title" className="text-xl font-medium">A place for good conversation</h3>
            <p data-oid="ce-home-project-two-description" className="leading-relaxed text-muted-foreground">A website concept that makes a neighborhood space easy to discover and explore.</p>
          </article>
        </div>
      </section>
      <section data-oid="ce-home-services" className="grid gap-8 border-t border-border py-12 sm:grid-cols-2 sm:gap-12 sm:py-16">
        <h2 data-oid="ce-home-services-title" className="max-w-sm text-3xl font-medium tracking-tight">From a clear idea to a considered result.</h2>
        <div data-oid="ce-home-service-list" className="space-y-7">
          <div data-oid="ce-home-brand-service">
            <h3 data-oid="ce-home-brand-title" className="text-lg font-medium">Brand identity</h3>
            <p data-oid="ce-home-brand-description" className="mt-2 leading-relaxed text-muted-foreground">Positioning, visual identity and the everyday details that make a business recognizable.</p>
          </div>
          <div data-oid="ce-home-web-service">
            <h3 data-oid="ce-home-web-title" className="text-lg font-medium">Digital design</h3>
            <p data-oid="ce-home-web-description" className="mt-2 leading-relaxed text-muted-foreground">Websites that are easy to understand, comfortable to use and ready to grow.</p>
          </div>
          <a data-oid="ce-home-about-link" href="/about" className="inline-flex border-b border-foreground pb-1 font-medium">Meet the studio</a>
        </div>
      </section>
    </main>
  );
}
`;

    const about = `export default function AboutPage() {
  return (
    <main id="main" data-oid="ce-about-main" className="mx-auto max-w-6xl px-6 sm:px-10">
      <section data-oid="ce-about-intro" className="grid gap-8 py-16 sm:grid-cols-2 sm:gap-12 sm:py-24">
        <h1 data-oid="ce-about-title" className="max-w-md text-4xl font-medium leading-[1.12] tracking-tight sm:text-5xl">Small studio. Shared ambition.</h1>
        <div data-oid="ce-about-story" className="space-y-6 text-lg leading-relaxed text-muted-foreground">
          <p data-oid="ce-about-story-one">We work closely with people who care about what they do. Together, we turn complex questions into clear, practical design.</p>
          <p data-oid="ce-about-story-two">Our process is open and collaborative. You speak directly with the people doing the work, from the first sketch to the final detail.</p>
        </div>
      </section>
      <section data-oid="ce-about-process" className="border-t border-border py-12 sm:py-16">
        <h2 data-oid="ce-about-process-title" className="text-3xl font-medium tracking-tight">How we work</h2>
        <div data-oid="ce-about-step-one" className="grid gap-3 py-8 sm:grid-cols-2 sm:gap-12">
          <h3 data-oid="ce-about-step-one-title" className="text-xl font-medium">Listen first</h3>
          <p data-oid="ce-about-step-one-description" className="max-w-lg leading-relaxed text-muted-foreground">We ask questions, learn about your audience and agree on what the project needs to achieve.</p>
        </div>
        <div data-oid="ce-about-step-two" className="grid gap-3 py-5 sm:grid-cols-2 sm:gap-12">
          <h3 data-oid="ce-about-step-two-title" className="text-xl font-medium">Make it tangible</h3>
          <p data-oid="ce-about-step-two-description" className="max-w-lg leading-relaxed text-muted-foreground">We share ideas early, explore them together and refine a direction through honest feedback.</p>
        </div>
        <div data-oid="ce-about-step-three" className="grid gap-3 py-8 sm:grid-cols-2 sm:gap-12">
          <h3 data-oid="ce-about-step-three-title" className="text-xl font-medium">Build for everyday use</h3>
          <p data-oid="ce-about-step-three-description" className="max-w-lg leading-relaxed text-muted-foreground">We bring the details together and leave you with a site and an identity you can keep making your own.</p>
        </div>
      </section>
      <section id="contact" data-oid="ce-about-contact" className="grid gap-8 border-t border-border py-12 sm:grid-cols-2 sm:gap-12 sm:py-16">
        <h2 data-oid="ce-about-contact-title" className="text-3xl font-medium tracking-tight">Have something in mind?</h2>
        <div data-oid="ce-about-contact-details" className="space-y-5">
          <p data-oid="ce-about-contact-description" className="max-w-md leading-relaxed text-muted-foreground">Tell us what you are working on, what you need and when you would like to begin.</p>
          <a data-oid="ce-about-email" href="mailto:hello@example.com" className="inline-flex border-b border-foreground pb-1 text-lg font-medium">hello@example.com</a>
        </div>
      </section>
    </main>
  );
}
`;

    return getNextJsScaffoldFiles().map((file) => {
        if (file.path === 'package.json') return { ...file, content: JSON.stringify({
            name: 'weblab-cloud-site', private: true, packageManager: 'bun@1.3.10',
            scripts: { dev: 'next dev --turbopack', build: 'next build', start: 'next start' },
            dependencies: { next: '16.2.6', react: '19.2.6', 'react-dom': '19.2.6', tailwindcss: '4.1.5', '@tailwindcss/postcss': '4.1.5' },
            devDependencies: { typescript: '5.9.3', '@types/node': '22.19.19', '@types/react': '19.2.15', '@types/react-dom': '19.2.3' },
        }, null, 2) + '\n' };
        if (file.path === 'src/app/layout.tsx') return { ...file, content: layout };
        if (file.path === 'src/app/page.tsx') return { ...file, content: home };
        return file;
    }).concat([
        { path: 'src/app/about/page.tsx', content: about },
        { path: 'public/studio-image.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#e4e8e3"/><text x="100" y="780" font-family="sans-serif" font-size="140" fill="#34453b">Studio</text></svg>' },
        { path: 'next.config.ts', content: "import type { NextConfig } from 'next';\n\nconst config: NextConfig = { allowedDevOrigins: process.env.WEBLAB_PREVIEW_HOST ? [process.env.WEBLAB_PREVIEW_HOST] : [] };\nexport default config;\n" },
    ]);
}
