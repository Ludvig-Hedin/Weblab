import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "Onlook alternative", path: "/compare/onlook" },
]);

const description = `Looking for an Onlook alternative? ${APP_NAME} is a visual editor for React built on the same open-source foundations, with extended workflows, AI integrations, and team collaboration.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} an Onlook alternative?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} is built on the same open-source foundations as Onlook (Apache 2.0). It extends them with additional workflows for Claude Code and vibe coding, design-system-aware AI, and team collaboration.`,
      },
    },
    {
      "@type": "Question",
      name: "Is Weblab open source like Onlook?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Yes. ${APP_NAME} is open source. The repository is at https://github.com/Ludvig-Hedin/Weblab.`,
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `Onlook alternative — ${APP_NAME}, a maintained visual editor for React`,
  description,
  keywords: [
    "onlook alternative",
    "weblab vs onlook",
    "open source visual editor for react",
    "cursor for designers open source",
    "react visual editor open source",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/onlook`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/onlook`,
    type: "article",
    siteName: APP_NAME,
    title: `Onlook alternative — ${APP_NAME}`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `Onlook alternative — ${APP_NAME}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Onlook alternative — ${APP_NAME}`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `Onlook alternative — ${APP_NAME}`,
      },
    ],
  },
};

export default function CompareOnlookLayout({
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
