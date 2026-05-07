import { APP_NAME } from "@weblab/constants";

import {
  ComparisonPage,
  type ComparisonContent,
} from "../_components/comparison-page";

const content: ComparisonContent = {
  competitorName: "Emergent",
  competitorSlug: "emergent",
  competitorTagline: "Multi-agent AI full-stack app builder",
  heroTitle: `${APP_NAME} vs Emergent: edit your codebase or build a new app from scratch`,
  heroSubtitle: `Emergent is a multi-agent AI platform that builds full-stack applications — frontend, backend, database, auth, and payments — from natural language. ${APP_NAME} connects to your existing React codebase, lets designers and engineers make visual changes on a canvas, and ships pull requests to GitHub.`,
  summary: {
    competitorIs:
      "a full-stack AI app builder powered by a multi-agent system. You describe your app in natural language, and Emergent's agents handle architecture, coding, testing, and deployment — including auth, database, payments, and mobile apps. It is optimized for building new applications from zero.",
    weblabIs: `a visual editor for an existing React codebase. ${APP_NAME} reads your real components and design system, lets your team make precise UI changes on an infinite canvas, and writes every change back to your GitHub repository as a pull request. No new stack, no lock-in.`,
    recommendation: `If you are a founder or maker starting from zero and need a full-stack app built fast — with auth, database, and deployment included — Emergent is a powerful choice. If you have an existing React product with a design system and an engineering team, ${APP_NAME} keeps your existing stack intact and makes it visually editable.`,
  },
  comparisonRows: [
    {
      feature: "Starting point",
      weblab: "Your existing React codebase",
      competitor: "Natural language prompt (generates from scratch)",
    },
    {
      feature: "Output",
      weblab: "Pull request to your GitHub repository",
      competitor: "Deployed full-stack app (auth, DB, payments, hosting)",
    },
    {
      feature: "Interface",
      weblab: "Infinite visual canvas — click and design your real components",
      competitor: "Chat-based prompt with live preview",
    },
    {
      feature: "Design system",
      weblab: "AI constrained to your existing components and tokens",
      competitor: "AI generates new UI freely per prompt",
    },
    {
      feature: "Backend / database",
      weblab: "Bring your own (no backend assumptions)",
      competitor: "Included — auth, PostgreSQL, payments, mobile out of the box",
    },
    {
      feature: "Hosting",
      weblab: "Your existing deployment",
      competitor: "Emergent-managed hosting",
    },
    {
      feature: "Code ownership",
      weblab: "Your repo, your conventions, your files",
      competitor: "GitHub export available; Emergent controls the initial stack",
    },
    {
      feature: "Team collaboration",
      weblab: "Designers + engineers on the same canvas with PR review",
      competitor: "Team and enterprise plans with role-based access",
    },
    {
      feature: "Open source",
      weblab: "Yes",
      competitor: "No",
    },
  ],
  differences: [
    {
      title: "Net-new app vs existing codebase",
      body: `Emergent's core strength is going from zero to a deployed full-stack application fast. If you do not have a codebase, Emergent's multi-agent system does impressive work. ${APP_NAME}'s core strength is connecting to a codebase you already have — reading your components, respecting your design system, and making visual changes that fit seamlessly into your existing engineering workflow.`,
    },
    {
      title: "Design system integrity",
      body: `Emergent generates new UI per prompt. It does not have access to your brand's color tokens, spacing scale, or component library. ${APP_NAME} is explicitly constrained to use only what exists in your codebase — every AI change uses your real Button, your real typography, your real spacing. There is no brand drift.`,
    },
    {
      title: "Pull requests vs deployed apps",
      body: `Emergent produces a running application that you can export to GitHub. ${APP_NAME} produces a pull request in your existing repository. This means your team's CI pipeline, code review process, and deployment workflow all stay exactly in place — ${APP_NAME} integrates with your existing process rather than replacing it.`,
    },
    {
      title: "Batteries included vs bring your own",
      body: `Emergent bundles auth, database, payments, and hosting. That is great when you are starting from zero but creates coupling to Emergent's chosen technology stack. ${APP_NAME} makes no assumptions about your backend, database, or hosting — it works with whatever your team already uses.`,
    },
  ],
  chooseCompetitorIf: [
    "You are building a brand-new full-stack app from scratch",
    "You need auth, database, payments, and hosting without engineering setup",
    "You are a founder or solo maker with no existing codebase",
    "Mobile app support (React Native) is a requirement",
    "Speed from idea to deployed product is the primary goal",
  ],
  chooseWeblabIf: [
    "You have an existing React or Next.js product",
    "Your team has a design system you cannot afford to drift from",
    "Visual changes must go through GitHub PR review",
    "Designers need to contribute UI changes without writing code",
    "You want to keep your existing backend, database, and hosting",
  ],
  faqs: [
    {
      q: `Is ${APP_NAME} an Emergent alternative?`,
      a: `${APP_NAME} and Emergent operate at different points in the development journey. Emergent is for building new apps from scratch — it generates a full stack from a prompt. ${APP_NAME} is for teams with an existing React codebase who want visual editing and design system compliance. They rarely compete for the same decision.`,
    },
    {
      q: "Does Emergent support design systems?",
      a: "Emergent does not import or enforce external design systems. Its AI generates UI based on the prompt, not based on your existing component library or design tokens. If you have a design system that the AI must respect, Weblab is designed for this use case.",
    },
    {
      q: "Can I use Emergent to edit an existing React app?",
      a: "Emergent is optimized for generating new applications. While it can import a GitHub repository, the multi-agent system is designed for net-new development, not for making targeted visual edits to existing components. Weblab connects to your existing codebase and provides a canvas for precise editing.",
    },
    {
      q: "How big is Emergent?",
      a: "As of 2026, Emergent reports 5M+ users and $100M+ ARR, making it one of the significant AI app builders in the market. It targets non-technical founders and product teams who want to build full-stack apps without hiring engineers.",
    },
  ],
};

export default function CompareEmergentPage() {
  return <ComparisonPage content={content} />;
}
