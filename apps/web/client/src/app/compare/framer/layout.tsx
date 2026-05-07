import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Framer", path: "/compare/framer" },
]);

const description = `${APP_NAME} vs Framer: ${APP_NAME} connects to your existing React codebase and ships pull requests. Framer is a design-first site builder with AI layout generation and built-in hosting. Compare features, code ownership, and workflows.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} a Framer alternative?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} and Framer target different workflows. ${APP_NAME} edits your existing React codebase visually and ships pull requests to your repo. Framer builds new websites in Framer's hosted environment and is best for landing pages and marketing sites, not for editing an existing codebase.`,
      },
    },
    {
      "@type": "Question",
      name: "Can Framer work with my React design system?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Framer uses React under the hood but does not connect to your existing React codebase or component library. It manages its own component system within Framer. Weblab connects directly to your existing components and design tokens.",
      },
    },
    {
      "@type": "Question",
      name: "Does Framer give me code ownership?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Framer hosts your site on Framer's infrastructure. Exporting code is limited and produces Framer-specific output rather than portable React. Weblab writes changes to your own repository as pull requests, so you always own the code.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs Framer — React Codebase Editor vs Design-First Site Builder`,
  description,
  keywords: [
    "weblab vs framer",
    "framer alternative for developers",
    "framer vs react visual editor",
    "framer vs weblab",
    "react editor design system",
    "framer code ownership",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/framer`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/framer`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs Framer`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Framer`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs Framer`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Framer`,
      },
    ],
  },
};

export default function CompareFramerLayout({
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
