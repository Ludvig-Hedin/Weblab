import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Replit", path: "/compare/replit" },
]);

const description = `${APP_NAME} vs Replit: ${APP_NAME} is a visual canvas editor for your existing React codebase. Replit is a browser-based IDE with an AI agent that builds and deploys full-stack apps from prompts. Compare features, design system support, and code ownership.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Is ${APP_NAME} a Replit alternative?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} and Replit solve different problems. Replit is a cloud IDE that lets you write and run code in the browser, with an AI agent that generates and deploys full-stack apps. ${APP_NAME} is a visual design-and-code editor that connects to your local React codebase and ships pull requests to GitHub.`,
      },
    },
    {
      "@type": "Question",
      name: "Does Replit support visual editing for React?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Replit is code-first: you write code in an editor and see a preview. It does not provide a visual canvas for editing existing React components. Weblab provides an infinite design canvas where you can select, drag, resize, and style your real React components visually.",
      },
    },
    {
      "@type": "Question",
      name: "Can I import my existing React project into Replit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Replit supports importing from GitHub, but its AI agent is optimized for generating new apps. Weblab is designed specifically for editing existing React codebases — connecting to your local project, reading your components and design tokens, and writing changes back as pull requests.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs Replit — Visual React Editor vs Browser IDE + AI Agent`,
  description,
  keywords: [
    "weblab vs replit",
    "replit alternative",
    "replit vs visual editor react",
    "replit vs weblab",
    "react visual editor vs cloud ide",
    "replit design system",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/replit`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/replit`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs Replit`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Replit`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs Replit`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Replit`,
      },
    ],
  },
};

export default function CompareReplitLayout({
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
