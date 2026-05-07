import { APP_NAME } from "@weblab/constants";

import {
  ComparisonPage,
  type ComparisonContent,
} from "../_components/comparison-page";

const content: ComparisonContent = {
  competitorName: "Webflow",
  competitorSlug: "webflow",
  competitorTagline: "No-code visual website builder",
  heroTitle: `${APP_NAME} vs Webflow: edit your React codebase or build a no-code site`,
  heroSubtitle: `Webflow is a powerful no-code builder that generates its own HTML/CSS on Webflow's hosting. ${APP_NAME} connects to your existing React codebase, lets designers and engineers edit together on an infinite canvas, and ships changes as pull requests to GitHub.`,
  summary: {
    competitorIs:
      "a visual no-code website builder. You design using Webflow's drag-and-drop canvas, and Webflow generates its own HTML, CSS, and JavaScript. Sites live on Webflow's hosting, and exporting code produces Webflow-specific markup.",
    weblabIs: `a visual editor for your existing React codebase. ${APP_NAME} reads your real components, lets your team design on an infinite canvas, and writes every change back to your repository as a pull request using your own JSX, Tailwind, and design tokens.`,
    recommendation: `If you do not have a codebase and want a polished no-code website with built-in CMS and hosting, Webflow is excellent. If your team already has a React codebase and a design system you want to preserve, ${APP_NAME} is the right fit.`,
  },
  comparisonRows: [
    {
      feature: "Input",
      weblab: "Your existing React / Next.js codebase",
      competitor: "Webflow's own visual canvas (no external code)",
    },
    {
      feature: "Output",
      weblab: "Pull request to your GitHub repository (JSX/TSX)",
      competitor: "Webflow-hosted site; paid code export (Webflow HTML/CSS)",
    },
    {
      feature: "Design system",
      weblab: "AI constrained to your existing tokens, components, and styles",
      competitor: "Webflow's own class system; no import of your design tokens",
    },
    {
      feature: "Hosting",
      weblab: "Wherever you already deploy (Vercel, AWS, etc.)",
      competitor: "Webflow hosting required for live sites",
    },
    {
      feature: "React support",
      weblab: "Native — reads and writes your real React components",
      competitor: "None — Webflow generates its own HTML, not React",
    },
    {
      feature: "Team collaboration",
      weblab: "Designers + engineers on the same canvas, PR-based review",
      competitor: "Webflow Editor for content; Designer for layout",
    },
    {
      feature: "CMS",
      weblab: "Bring your own CMS (Next.js, Contentful, Sanity, etc.)",
      competitor: "Webflow CMS built-in (up to 2,000–10,000 items by plan)",
    },
    {
      feature: "Open source",
      weblab: "Yes",
      competitor: "No",
    },
    {
      feature: "Pricing",
      weblab: "Free to open source; paid plans for teams",
      competitor: "From $23/month per site (annual billing)",
    },
  ],
  differences: [
    {
      title: "Code ownership vs platform lock-in",
      body: `Webflow's exported code uses Webflow's own CSS class conventions and is not portable into a React project. ${APP_NAME} produces pull requests in your own JSX files — the output is just React code your engineers already own and can maintain without ${APP_NAME}.`,
    },
    {
      title: "Your components vs Webflow's components",
      body: `Webflow has its own component and symbol system. If your team has already invested in a React design system — with custom Button, Card, and Form components — Webflow cannot use them. ${APP_NAME} reads your real components and constrains the AI to use exactly those, so the design system never drifts.`,
    },
    {
      title: "Developer workflow vs no-code workflow",
      body: `Webflow is optimized for people who do not want to touch code. It is excellent for marketing teams and agencies building new sites. ${APP_NAME} is optimized for teams that already have engineering workflows — PRs, CI, code review — and want visual design to plug into that flow rather than replace it.`,
    },
    {
      title: "Hosting flexibility",
      body: `Webflow requires Webflow hosting for live sites. ${APP_NAME} produces code that deploys anywhere your React app already deploys. If you use Vercel, Netlify, AWS, or a self-hosted setup, nothing changes.`,
    },
  ],
  chooseCompetitorIf: [
    "You do not have a React codebase and need a website fast",
    "Your team is non-technical and wants drag-and-drop editing",
    "You want built-in CMS, hosting, and eCommerce in one platform",
    "You are building marketing sites, not product UIs",
    "You are comfortable with Webflow's proprietary ecosystem",
  ],
  chooseWeblabIf: [
    "You have an existing React or Next.js codebase",
    "You need visual changes to integrate with your GitHub PR workflow",
    "You have a design system your AI edits must respect",
    "Designers and engineers collaborate on the same product",
    "You want to deploy to any infrastructure, not just Webflow's",
  ],
  faqs: [
    {
      q: `Is ${APP_NAME} a Webflow alternative for developers?`,
      a: `Yes, for teams with React codebases. ${APP_NAME} gives React developers a visual editing layer that connects to their real components and ships pull requests — something Webflow cannot do. Webflow remains a better choice for non-technical teams building standalone websites without a codebase.`,
    },
    {
      q: "Can Webflow export React code?",
      a: "No. Webflow exports its own HTML, CSS, and some JavaScript. The exported code is not React and cannot be dropped into a React project or component library. It uses Webflow's BEM-style class naming conventions.",
    },
    {
      q: `Does ${APP_NAME} have a CMS like Webflow?`,
      a: `${APP_NAME} does not include a built-in CMS. It is designed to work with whatever CMS your React project already uses — Next.js MDX, Contentful, Sanity, Prismic, or a custom API. The visual editor edits the presentation layer; the data layer stays yours.`,
    },
    {
      q: "Is Webflow good for React developers?",
      a: `Webflow is not designed for React developers. It does not read React components, cannot use your design tokens, and does not produce React output. If you are a React developer looking for a visual editor, ${APP_NAME} is built specifically for you.`,
    },
  ],
};

export default function CompareWebflowPage() {
  return <ComparisonPage content={content} />;
}
