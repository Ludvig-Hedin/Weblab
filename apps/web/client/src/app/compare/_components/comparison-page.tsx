import Link from "next/link";

import { APP_NAME } from "@weblab/constants";
import { Button } from "@weblab/ui/button";

import { CTASection } from "../../_components/landing-page/cta-section";
import { WebsiteLayout } from "../../_components/website-layout";

export interface ComparisonRow {
  feature: string;
  weblab: string;
  competitor: string;
}

export interface ComparisonContent {
  competitorName: string;
  competitorSlug: string;
  competitorTagline: string;
  heroTitle: string;
  heroSubtitle: string;
  summary: {
    weblabIs: string;
    competitorIs: string;
    recommendation: string;
  };
  comparisonRows: ComparisonRow[];
  differences: Array<{
    title: string;
    body: string;
  }>;
  chooseCompetitorIf: string[];
  chooseWeblabIf: string[];
  faqs: Array<{ q: string; a: string }>;
}

export function ComparisonPage({ content }: { content: ComparisonContent }) {
  return (
    <WebsiteLayout showFooter={true}>
      <main className="bg-background text-foreground-primary">
        {/* Hero */}
        <section className="bg-black py-40">
          <div className="mx-auto max-w-6xl px-8">
            <p className="text-foreground-tertiary mb-4 text-sm uppercase tracking-wider">
              {APP_NAME} vs {content.competitorName}
            </p>
            <h1 className="mb-8 text-5xl leading-tight font-light md:text-6xl">
              {content.heroTitle}
            </h1>
            <p className="text-foreground-secondary max-w-2xl text-lg md:text-xl">
              {content.heroSubtitle}
            </p>
            <div className="mt-12 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/projects">Try {APP_NAME}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/features">See features</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Short answer */}
        <section className="py-32">
          <div className="mx-auto max-w-4xl px-8">
            <h2 className="mb-12 text-4xl font-light md:text-5xl">
              The short answer
            </h2>
            <div className="space-y-6 text-lg">
              <p>
                <span className="text-foreground-tertiary">
                  {content.competitorName} is
                </span>{" "}
                {content.summary.competitorIs}
              </p>
              <p>
                <span className="text-foreground-tertiary">{APP_NAME} is</span>{" "}
                {content.summary.weblabIs}
              </p>
              <p className="text-foreground-secondary border-foreground-tertiary/30 mt-8 border-l-2 pl-6">
                {content.summary.recommendation}
              </p>
            </div>
          </div>
        </section>

        {/* Side-by-side table */}
        <section className="bg-background py-32">
          <div className="mx-auto max-w-6xl px-8">
            <h2 className="mb-12 text-4xl font-light md:text-5xl">
              Side by side
            </h2>
            <div className="border-foreground-tertiary/20 overflow-x-auto rounded border">
              <table className="w-full min-w-full text-left">
                <thead>
                  <tr className="border-foreground-tertiary/20 bg-foreground-tertiary/5 border-b">
                    <th className="px-6 py-4 text-sm font-normal uppercase tracking-wider">
                      Feature
                    </th>
                    <th className="px-6 py-4 text-sm font-normal uppercase tracking-wider">
                      {APP_NAME}
                    </th>
                    <th className="text-foreground-tertiary px-6 py-4 text-sm font-normal uppercase tracking-wider">
                      {content.competitorName}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {content.comparisonRows.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-foreground-tertiary/10 border-b last:border-b-0"
                    >
                      <td className="px-6 py-5 align-top text-sm font-medium">
                        {row.feature}
                      </td>
                      <td className="text-foreground-primary px-6 py-5 align-top text-sm">
                        {row.weblab}
                      </td>
                      <td className="text-foreground-secondary px-6 py-5 align-top text-sm">
                        {row.competitor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Where they differ */}
        <section className="py-32">
          <div className="mx-auto max-w-4xl px-8">
            <h2 className="mb-16 text-4xl font-light md:text-5xl">
              Where they differ
            </h2>
            <div className="space-y-12">
              {content.differences.map((d) => (
                <div key={d.title}>
                  <h3 className="mb-3 text-2xl font-light">{d.title}</h3>
                  <p className="text-foreground-secondary text-lg leading-relaxed">
                    {d.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Choose which */}
        <section className="bg-foreground-tertiary/5 py-32">
          <div className="mx-auto grid max-w-6xl gap-12 px-8 md:grid-cols-2">
            <div>
              <h2 className="mb-8 text-3xl font-light md:text-4xl">
                Choose {content.competitorName} if
              </h2>
              <ul className="text-foreground-secondary space-y-3 text-lg">
                {content.chooseCompetitorIf.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-foreground-tertiary">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-foreground-primary mb-8 text-3xl font-light md:text-4xl">
                Choose {APP_NAME} if
              </h2>
              <ul className="text-foreground-primary space-y-3 text-lg">
                {content.chooseWeblabIf.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span>→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-32">
          <div className="mx-auto max-w-4xl px-8">
            <h2 className="mb-16 text-4xl font-light md:text-5xl">
              Common questions
            </h2>
            <div className="space-y-8">
              {content.faqs.map((f) => (
                <div
                  key={f.q}
                  className="border-foreground-tertiary/10 border-b pb-8 last:border-b-0"
                >
                  <h3 className="mb-3 text-xl font-light">{f.q}</h3>
                  <p className="text-foreground-secondary leading-relaxed">
                    {f.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Other comparisons */}
        <section className="border-foreground-tertiary/10 border-t py-24">
          <div className="mx-auto max-w-6xl px-8">
            <p className="text-foreground-tertiary mb-6 text-sm uppercase tracking-wider">
              Other comparisons
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                { slug: "lovable", name: "Lovable" },
                { slug: "bolt", name: "Bolt" },
                { slug: "v0", name: "v0" },
                { slug: "onlook", name: "Onlook" },
                { slug: "webflow", name: "Webflow" },
                { slug: "framer", name: "Framer" },
                { slug: "replit", name: "Replit" },
                { slug: "claude-code", name: "Claude Code" },
                { slug: "emergent", name: "Emergent" },
                { slug: "wix", name: "Wix" },
                { slug: "one-com", name: "one.com" },
              ]
                .filter((c) => c.slug !== content.competitorSlug)
                .map((c) => (
                  <Link
                    key={c.slug}
                    href={`/compare/${c.slug}`}
                    className="text-foreground-secondary hover:text-foreground-primary text-lg transition-colors"
                  >
                    {APP_NAME} vs {c.name}
                  </Link>
                ))}
              <Link
                href="/compare"
                className="text-foreground-secondary hover:text-foreground-primary text-lg transition-colors"
              >
                See all comparisons →
              </Link>
            </div>
          </div>
        </section>

        <CTASection
          href="/projects"
          ctaText={`Stop comparing.\nStart shipping.`}
          buttonText={`Try ${APP_NAME}`}
        />
      </main>
    </WebsiteLayout>
  );
}
