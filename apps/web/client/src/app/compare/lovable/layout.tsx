import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Lovable", path: "/compare/lovable" },
]);

const description = `${APP_NAME} vs Lovable: ${APP_NAME} edits your existing React codebase on a visual canvas and ships pull requests. Lovable generates new apps from chat. Compare features, workflows, design system support, and team collaboration.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} a Lovable alternative?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} is a visual editor for React that connects to your existing codebase. It is best understood as a complement or alternative to Lovable depending on whether you want to edit a real codebase visually or generate a new app from prompts.`,
      },
    },
    {
      "@type": "Question",
      name: "When should I choose Lovable instead of Weblab?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Choose Lovable when you want to spin up a brand-new app from a prompt and you do not yet have a codebase, design system, or component library to extend.",
      },
    },
    {
      "@type": "Question",
      name: `Does ${APP_NAME} use my real React components like Lovable does?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} edits your real React components on an infinite canvas and writes the changes back to your repository as a pull request. AI suggestions are constrained to your existing design system.`,
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs Lovable — Visual Editor for React vs AI App Builder`,
  description,
  keywords: [
    "weblab vs lovable",
    "lovable alternative",
    "lovable vs weblab",
    "visual editor for react",
    "ai app builder comparison",
    "cursor for designers vs lovable",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/lovable`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/lovable`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs Lovable`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Lovable`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs Lovable`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Lovable`,
      },
    ],
  },
};

export default function CompareLovableLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
