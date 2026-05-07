import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs v0", path: "/compare/v0" },
]);

const description = `${APP_NAME} vs v0 by Vercel: ${APP_NAME} edits your real components on a canvas. v0 generates new components from prompts. Compare design-system support, output, and team workflow.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} a v0 alternative?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} and v0 are different tools for different stages. v0 generates new component snippets from prompts. ${APP_NAME} is a visual editor for an existing React codebase that ships pull requests.`,
      },
    },
    {
      "@type": "Question",
      name: `Can I use v0-generated components inside ${APP_NAME}?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `Yes. Drop v0-generated components into your repository and ${APP_NAME} will let you arrange and edit them visually on the canvas like any other React component.`,
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs v0 by Vercel — Visual Editor vs AI Component Generator`,
  description,
  keywords: [
    "weblab vs v0",
    "v0 alternative",
    "v0 vs weblab",
    "ai component generator alternative",
    "visual editor for react",
    "shadcn ui visual editor",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/v0`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/v0`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs v0`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs v0`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs v0`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs v0`,
      },
    ],
  },
};

export default function CompareV0Layout({
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
