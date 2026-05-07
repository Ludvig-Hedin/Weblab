import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Wix", path: "/compare/wix" },
]);

const description = `${APP_NAME} vs Wix: ${APP_NAME} edits your React codebase visually and ships code you own. Wix is a drag-and-drop website builder for small businesses with no code ownership. Compare who each tool is really built for.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} better than Wix for developers?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} is built for developers and design-engineering teams working on React codebases. Wix is built for small business owners who want a website without touching code. The audiences barely overlap — if you have a React codebase, Wix is not the right tool.`,
      },
    },
    {
      "@type": "Question",
      name: "Can developers use Wix with a React codebase?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Wix does not integrate with external React codebases. You build inside Wix's platform and your site lives on Wix's hosting. There is no pull request, no GitHub integration, and no way to use your own component library. Weblab is designed specifically for this use case.",
      },
    },
    {
      "@type": "Question",
      name: "What is Wix Harmony?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Wix Harmony, launched in January 2026, is Wix's hybrid AI website builder combining natural language creation via an AI agent called Aria with traditional drag-and-drop editing. It is designed for small business websites, not for engineering teams with React codebases.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs Wix — React Codebase Editor vs Small Business Website Builder`,
  description,
  keywords: [
    "weblab vs wix",
    "wix alternative for developers",
    "wix vs react editor",
    "developer website builder vs wix",
    "wix harmony comparison",
    "react visual editor wix alternative",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/wix`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/wix`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs Wix`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Wix`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs Wix`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Wix`,
      },
    ],
  },
};

export default function CompareWixLayout({
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
