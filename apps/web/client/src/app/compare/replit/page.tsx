import { APP_NAME } from "@weblab/constants";

import {
  ComparisonPage,
  type ComparisonContent,
} from "../_components/comparison-page";

const content: ComparisonContent = {
  competitorName: "Replit",
  competitorSlug: "replit",
  competitorTagline: "Browser IDE with AI agent that builds and deploys apps",
  heroTitle: `${APP_NAME} vs Replit: visual canvas editor vs browser IDE with AI`,
  heroSubtitle: `Replit is a powerful cloud IDE where an AI agent builds and deploys full-stack apps from natural language. ${APP_NAME} is a visual canvas editor that connects to your local React codebase, lets designers make changes without touching code, and ships pull requests engineers can merge.`,
  summary: {
    competitorIs:
      "a browser-based coding environment. You write code (or describe it to the AI agent) and Replit handles running, hosting, and deployment. The AI agent can build entire full-stack apps from prompts, provision databases, install dependencies, and deploy automatically.",
    weblabIs: `a visual design editor for an existing React codebase. ${APP_NAME} reads your real components and Tailwind classes, lets anyone on the team make visual changes on an infinite canvas, and writes every change back to your local files as a pull request — no terminal required for the designer.`,
    recommendation: `If you want to build a full-stack app from scratch in the browser without local setup, Replit's AI agent is fast and capable. If you already have a React codebase and want designers to contribute visual changes without learning the terminal, ${APP_NAME} is the right tool.`,
  },
  comparisonRows: [
    {
      feature: "Primary use case",
      weblab: "Visual editing of existing React components",
      competitor: "AI-assisted coding and deployment in the browser",
    },
    {
      feature: "Editing interface",
      weblab: "Infinite visual canvas — click, drag, and design",
      competitor: "Code editor with live preview",
    },
    {
      feature: "Who can use it",
      weblab: "Designers and engineers (no terminal required for designers)",
      competitor: "Primarily developers comfortable with code",
    },
    {
      feature: "AI behavior",
      weblab: "AI constrained to your existing design system and components",
      competitor: "AI agent (Agent 4) generates new code from prompts",
    },
    {
      feature: "Output",
      weblab: "Pull request to your GitHub repository",
      competitor: "Running app deployed to Replit's infrastructure",
    },
    {
      feature: "Design system",
      weblab: "Reads and respects your existing tokens and components",
      competitor: "AI generates new styles per prompt",
    },
    {
      feature: "Existing codebase",
      weblab: "Connects to your local project directly",
      competitor: "Import from GitHub supported; optimized for new projects",
    },
    {
      feature: "Languages",
      weblab: "React / Next.js (JSX/TSX)",
      competitor: "50+ languages (JavaScript, Python, Go, Rust, and more)",
    },
    {
      feature: "Open source",
      weblab: "Yes",
      competitor: "No",
    },
  ],
  differences: [
    {
      title: "Visual canvas vs code editor",
      body: `Replit is fundamentally a code editor with a live preview. You write code (or prompt the AI to write it) and see the result. ${APP_NAME} is fundamentally a visual canvas — you click on a component, change its layout or styles, and the code is written for you. Designers can work in ${APP_NAME} without ever opening a terminal.`,
    },
    {
      title: "Design system awareness",
      body: `Replit's AI agent generates code that looks correct but may introduce new CSS, new component patterns, or new dependencies that do not match your design system. ${APP_NAME}'s AI is constrained to use only the components and tokens that already exist in your codebase, so every change stays on-brand.`,
    },
    {
      title: "GitHub PR vs Replit deployment",
      body: `Replit deploys directly to Replit's hosting. Changes bypass your existing code review process. ${APP_NAME} produces a pull request in your GitHub repository. Your engineers see a normal PR, run CI/CD, review the diff, and merge — the same process as any other code change.`,
    },
    {
      title: "Breadth vs depth",
      body: `Replit supports 50+ languages and is a general-purpose development environment. ${APP_NAME} specializes deeply in React UI — with an infinite canvas, layer panel, style inspector, component library browsing, and design token support. It does one thing exceptionally well.`,
    },
  ],
  chooseCompetitorIf: [
    "You want to build a full-stack app from scratch in the browser",
    "You do not have a local development environment set up",
    "You need backend, database, and deployment in one place",
    "You are comfortable coding and want AI to write code from prompts",
    "You work in frameworks or languages other than React / JavaScript",
  ],
  chooseWeblabIf: [
    "You have an existing React or Next.js codebase",
    "Designers need to make visual changes without touching the terminal",
    "Visual changes must go through your GitHub PR workflow",
    "You need AI that respects your design system, not free-form code generation",
    "You care about design-engineering team collaboration",
  ],
  faqs: [
    {
      q: `Is ${APP_NAME} a Replit alternative for front-end work?`,
      a: `${APP_NAME} and Replit solve different problems. ${APP_NAME} specializes in visual editing of existing React codebases with design system awareness. Replit is a general-purpose cloud IDE best for building apps from scratch or backend work. For front-end teams with an existing React codebase, ${APP_NAME} provides a visual layer that Replit does not.`,
    },
    {
      q: "Does Replit have a visual canvas editor?",
      a: `Replit does not have a visual canvas editor. You interact with code in a text editor and see the result in a preview pane. There is no way to click a component on screen, drag it to a new position, or visually adjust its Tailwind classes. ${APP_NAME} provides this visual layer.`,
    },
    {
      q: `Can I import a Replit project into ${APP_NAME}?`,
      a: `If your Replit project is a React application, you can export it to GitHub and then open it in ${APP_NAME}. ${APP_NAME} connects to any local React project directory — it does not matter where the code was originally written.`,
    },
    {
      q: "Does Replit support design tokens and component libraries?",
      a: `Replit does not have native support for design tokens or component library inspection. ${APP_NAME} reads your existing components, Tailwind config, and CSS variables to make the AI and the visual canvas aware of your design system.`,
    },
  ],
};

export default function CompareReplitPage() {
  return <ComparisonPage content={content} />;
}
