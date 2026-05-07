import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Webflow", path: "/compare/webflow" },
]);

const description = `${APP_NAME} vs Webflow: ${APP_NAME} edits your existing React codebase on a visual canvas and ships pull requests. Webflow is a no-code visual builder that outputs its own HTML/CSS with Webflow hosting. Compare features, workflows, and code ownership.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} a Webflow alternative?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} and Webflow serve different audiences. ${APP_NAME} is for teams with an existing React codebase who want visual editing that ships real pull requests. Webflow is a no-code tool for building websites without a codebase, using Webflow's proprietary HTML/CSS output and hosting.`,
      },
    },
    {
      "@type": "Question",
      name: "Can I use my React components in Webflow?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Webflow does not connect to React codebases or component libraries. It generates its own HTML, CSS, and JavaScript. If you want a visual editor that works with your real React components and design system, use ${APP_NAME} instead.`,
      },
    },
    {
      "@type": "Question",
      name: "Does Webflow export clean code?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Webflow offers a paid code export feature, but the exported code is Webflow's own CSS class naming convention and is not React. It is difficult to integrate into a React codebase. ${APP_NAME} writes changes directly to your existing TSX/JSX files as pull requests.`,
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs Webflow — React Visual Editor vs No-Code Website Builder`,
  description,
  keywords: [
    "weblab vs webflow",
    "webflow alternative for developers",
    "webflow vs react editor",
    "visual editor react codebase",
    "webflow no-code vs react visual editor",
    "webflow react alternative",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/webflow`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/webflow`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs Webflow`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Webflow`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs Webflow`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Webflow`,
      },
    ],
  },
};

export default function CompareWebflowLayout({
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
