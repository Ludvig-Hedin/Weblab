import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Lovable", path: "/compare/lovable" },
]);

const description = `${APP_NAME} vs Lovable: ${APP_NAME} edits your existing React codebase on a visual canvas and ships pull requests. Lovable generates new apps from chat. Compare features, workflows, design system support, and team collaboration.`;

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
      {children}
    </>
  );
}
