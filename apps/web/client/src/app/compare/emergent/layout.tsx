import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Emergent", path: "/compare/emergent" },
]);

const description = `${APP_NAME} vs Emergent: ${APP_NAME} visually edits your existing React codebase and ships pull requests. Emergent generates full-stack apps from natural language using a multi-agent system. Compare code ownership, design system support, and team workflows.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} an Emergent alternative?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} and Emergent target different starting points. Emergent builds brand-new full-stack applications from prompts using a multi-agent system and includes auth, database, payments, and hosting out of the box. ${APP_NAME} connects to your existing React codebase, lets your team edit visually on a canvas, and ships pull requests.`,
      },
    },
    {
      "@type": "Question",
      name: "Does Emergent support my existing React codebase?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Emergent is optimized for generating new applications from scratch. It does not connect to an existing React codebase or read your design tokens and component library. Weblab is purpose-built for teams with an existing codebase who want visual editing that respects their design system.",
      },
    },
    {
      "@type": "Question",
      name: "Can I export my Emergent app to my own repo?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Emergent offers GitHub export for code ownership. However the architecture and stack are determined by Emergent's multi-agent system. ${APP_NAME} produces pull requests against your existing repository, using your existing file structure and component conventions.`,
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs Emergent — React Codebase Editor vs Multi-Agent App Builder`,
  description,
  keywords: [
    "weblab vs emergent",
    "emergent ai alternative",
    "emergent vs visual editor react",
    "react codebase vs ai app builder",
    "emergent sh comparison",
    "vibe coding vs visual editor",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/emergent`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/emergent`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs Emergent`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Emergent`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs Emergent`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Emergent`,
      },
    ],
  },
};

export default function CompareEmergentLayout({
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
