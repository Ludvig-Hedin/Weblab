import type { Metadata } from "next";

import { APP_DOMAIN, APP_NAME } from "@weblab/constants";

import { breadcrumbSchema } from "../../seo";

const breadcrumbsJsonLd = breadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "Compare", path: "/compare" },
  { name: "vs one.com", path: "/compare/one-com" },
]);

const description = `${APP_NAME} vs one.com: ${APP_NAME} is a visual React codebase editor for engineering teams. one.com is a budget hosting and website builder for small businesses. See why developers choose Weblab over drag-and-drop website builders.`;

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: `Who should use ${APP_NAME} instead of one.com?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: `${APP_NAME} is for teams with an existing React codebase — developers, designers, and product teams who want visual editing that ships pull requests. one.com is for individuals and small businesses who want an affordable website with no technical requirements. They serve completely different audiences.`,
      },
    },
    {
      "@type": "Question",
      name: "Does one.com support React development?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "one.com does not support React development or custom codebases. It is a drag-and-drop template builder with basic hosting. You cannot connect your React project, use your component library, or push changes as pull requests. Weblab is built for exactly this purpose.",
      },
    },
    {
      "@type": "Question",
      name: "What is one.com best for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "one.com is best for individuals and small businesses that want an affordable hosted website with minimal setup — domain registration, email, and a simple drag-and-drop builder starting under $1/month. It is not designed for developers, design systems, or production React applications.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: `${APP_NAME} vs one.com — React Visual Editor vs Budget Website Builder`,
  description,
  keywords: [
    "weblab vs one.com",
    "one.com alternative for developers",
    "react editor vs website builder",
    "developer tools vs one.com",
    "one com comparison",
    "react visual editor one com alternative",
  ],
  alternates: {
    canonical: `https://${APP_DOMAIN}/compare/one-com`,
  },
  openGraph: {
    url: `https://${APP_DOMAIN}/compare/one-com`,
    type: "article",
    siteName: APP_NAME,
    title: `${APP_NAME} vs one.com`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs one.com`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} vs one.com`,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} vs one.com`,
      },
    ],
  },
};

export default function CompareOneComLayout({
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
