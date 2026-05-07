import { APP_NAME } from "@weblab/constants";

import {
  ComparisonPage,
  type ComparisonContent,
} from "../_components/comparison-page";

const content: ComparisonContent = {
  competitorName: "v0",
  competitorSlug: "v0",
  competitorTagline: "AI component generator by Vercel",
  heroTitle: `${APP_NAME} vs v0: edit real components or generate new ones`,
  heroSubtitle: `v0 by Vercel generates new components and pages from natural-language prompts. ${APP_NAME} is a visual editor that takes the components you already have and lets your team edit them on an infinite canvas — with PRs as output.`,
  summary: {
    competitorIs:
      "an AI component and page generator. You describe a UI, v0 returns a code snippet (often shadcn/ui-flavored) you copy into your project.",
    weblabIs: `a visual editor for an existing React codebase. ${APP_NAME} reads your real components, lets you arrange and modify them on a canvas, and writes the change back as a pull request.`,
    recommendation: `v0 and ${APP_NAME} are complementary. Use v0 when you need a new component snippet quickly; use ${APP_NAME} to compose, refine, and ship those components inside your real product.`,
  },
  comparisonRows: [
    {
      feature: "What you get",
      weblab: "A visual editor connected to your real codebase",
      competitor: "Generated component code you copy-paste",
    },
    {
      feature: "Editing surface",
      weblab: "Infinite design canvas with live components",
      competitor: "Chat + preview + code",
    },
    {
      feature: "Output",
      weblab: "Pull request to your GitHub repository",
      competitor: "Code snippet, optional repo install",
    },
    {
      feature: "Design-system fit",
      weblab: "AI constrained to your existing design system",
      competitor: "Generates new shadcn/ui-style components",
    },
    {
      feature: "Multi-component layouts",
      weblab: "Compose pages from your real components",
      competitor: "Per-component prompts",
    },
    {
      feature: "Team collaboration",
      weblab: "Shared canvas, real-time editing",
      competitor: "Mostly individual prompt sessions",
    },
    {
      feature: "Frameworks",
      weblab: "React, Next.js",
      competitor: "React + shadcn/ui idiom",
    },
    {
      feature: "Open source",
      weblab: "Yes",
      competitor: "No",
    },
  ],
  differences: [
    {
      title: "Generation vs. composition",
      body: `v0’s strength is generating a new component from a prompt. ${APP_NAME}’s strength is composing pages and flows from the components you already maintain. For a new isolated UI, v0 is fastest. For assembling and editing a product, ${APP_NAME} is the canvas you draw on.`,
    },
    {
      title: "Snippets vs. pull requests",
      body: `v0 hands you code to paste. ${APP_NAME} writes a real diff against your repo and opens a PR — your branch protection rules, code review, and CI all apply automatically.`,
    },
    {
      title: "Per-component prompt vs. canvas-level editing",
      body: `In v0 you iterate on one component at a time in chat. In ${APP_NAME} you place real components on a canvas and edit them in context — including the spacing, order, and cross-component layout — exactly the way you would in a design tool.`,
    },
    {
      title: "Generic vs. design-system-aware",
      body: `v0 produces components in its own preferred style (often shadcn/ui-flavored). ${APP_NAME} only uses what already lives in your design system — your buttons, cards, and tokens. No drift, no parallel design system to maintain.`,
    },
  ],
  chooseCompetitorIf: [
    "You need a new component snippet fast",
    "Your project already uses shadcn/ui-style patterns",
    "You are exploring UI ideas in isolation",
    "You are happy copy-pasting code into your editor",
  ],
  chooseWeblabIf: [
    "You want to compose pages from your real components",
    "You have a design system the AI must respect",
    "You want changes to land as a pull request, not a paste",
    "Your designers want to edit production UI on a canvas",
    "You are pairing v0 with a real codebase and want a visual layer on top",
  ],
  faqs: [
    {
      q: `Can I use v0 and ${APP_NAME} together?`,
      a: `Yes — that’s a great combination. Use v0 to draft new components quickly, drop them into your repository, and use ${APP_NAME} to arrange, refine, and ship them in context with the rest of your design system.`,
    },
    {
      q: `Does ${APP_NAME} support shadcn/ui like v0?`,
      a: `${APP_NAME} works with shadcn/ui, Material UI, Chakra UI, Radix, Mantine, and other React component libraries. Your existing components are first-class citizens on the canvas.`,
    },
    {
      q: `Is ${APP_NAME} faster than v0?`,
      a: `Different stages, different speeds. v0 is fastest for spinning up a new isolated component. ${APP_NAME} is fastest for assembling, editing, and shipping a real product without dropping out to a separate design tool.`,
    },
  ],
};

export default function CompareV0Page() {
  return <ComparisonPage content={content} />;
}
