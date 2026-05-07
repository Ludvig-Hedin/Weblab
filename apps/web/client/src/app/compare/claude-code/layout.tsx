import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs Claude Code", path: "/compare/claude-code" },
]);

const description = `${APP_NAME} vs Claude Code: ${APP_NAME} is a visual canvas editor for React. Claude Code is a terminal CLI that edits files via AI prompts. Compare how they handle design systems, UI editing, and team collaboration.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `How does ${APP_NAME} differ from Claude Code?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `Claude Code is a terminal-based AI coding assistant. You describe changes in plain text and Claude edits your files. ${APP_NAME} gives you a visual infinite canvas where you click, drag, and design directly on your React components — and the AI is constrained to your existing design system to prevent brand drift.`,
      },
    },
    {
      "@type": "Question",
      name: "Can Claude Code do visual editing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Claude Code operates entirely in the terminal. It reads and writes code files but has no visual canvas. You cannot click on components, drag layouts, or see a live visual preview in Claude Code. ${APP_NAME} provides a WYSIWYG canvas where visual changes map directly to code.`,
      },
    },
    {
      "@type": "Question",
      name: `Does ${APP_NAME} replace Claude Code?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} and Claude Code are complementary. Claude Code is best for broad code tasks — refactoring logic, writing tests, implementing features. ${APP_NAME} is best when designers and developers want to make visual changes to a React UI without touching the terminal. Many teams use both.`,
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs Claude Code — Visual Canvas Editor vs AI Terminal CLI`,
  description,
  keywords: [
    "weblab vs claude code",
    "claude code alternative",
    "visual editor vs ai terminal",
    "claude code design system",
    "react visual editor vs cli",
    "anthropic claude code comparison",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/claude-code`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/claude-code`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs Claude Code`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Claude Code`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs Claude Code`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs Claude Code`,
      },
    ],
  },
};

export default function CompareClaudeCodeLayout({
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
