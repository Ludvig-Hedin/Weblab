import { APP_NAME } from '@weblab/constants';

import type { ComparisonContent } from '../_components/comparison-page';
import { ComparisonPage } from '../_components/comparison-page';

const content: ComparisonContent = {
    competitorName: 'Claude Code',
    competitorSlug: 'claude-code',
    competitorTagline: "Anthropic's AI terminal CLI for coding",
    heroTitle: `${APP_NAME} vs Claude Code: visual canvas vs AI terminal`,
    heroSubtitle: `Claude Code is Anthropic's terminal-first AI coding CLI — it edits files, runs tests, and plans multi-file refactors from the command line. ${APP_NAME} gives your team an infinite visual canvas on top of your React components, letting designers ship UI changes as pull requests without opening a terminal.`,
    summary: {
        competitorIs:
            'a terminal-based AI coding assistant from Anthropic. You describe what you want in the terminal, and Claude Code reads your codebase, plans changes across multiple files, edits them, and runs tests to verify. It operates entirely in text — there is no visual layer.',
        weblabIs: `a visual design editor for React codebases. ${APP_NAME} provides an infinite canvas where you can select real components, adjust layout and styles visually, and have AI make constrained changes using your design tokens. Every change is written back to your repository as a pull request.`,
        recommendation: `Claude Code and ${APP_NAME} are highly complementary tools. Claude Code is best for logic, refactoring, tests, and multi-file changes. ${APP_NAME} is best for visual UI work where seeing the result matters and design system compliance is critical. Many engineering teams use both.`,
    },
    comparisonRows: [
        {
            feature: 'Interface',
            weblab: 'Infinite visual canvas — WYSIWYG React editor',
            competitor: 'Terminal CLI — text-based commands and file edits',
        },
        {
            feature: 'Who uses it',
            weblab: 'Designers, engineers, and product teams editing UI',
            competitor: 'Engineers comfortable in the terminal',
        },
        {
            feature: 'Design system awareness',
            weblab: 'AI constrained to your existing components, tokens, and styles',
            competitor: 'Reads your codebase but no visual design system enforcement',
        },
        {
            feature: 'Output',
            weblab: 'Pull request with visual diff',
            competitor: 'Edited files in your local repo',
        },
        {
            feature: 'Visual preview',
            weblab: 'Live canvas preview with your real components',
            competitor: 'None — text editor only',
        },
        {
            feature: 'Strength',
            weblab: 'UI design, visual layout, component styling',
            competitor: 'Logic, refactoring, tests, multi-file changes',
        },
        {
            feature: 'Frameworks',
            weblab: 'React, Next.js',
            competitor: 'Any language or framework',
        },
        {
            feature: 'Open source',
            weblab: 'Yes',
            competitor: 'No (Claude Code is a proprietary Anthropic tool)',
        },
        {
            feature: 'Pricing',
            weblab: 'Free to open source; paid plans for teams',
            competitor: 'Included with Claude Pro/Max/Team/Enterprise subscriptions',
        },
    ],
    differences: [
        {
            title: 'Visual vs text',
            body: `The fundamental difference is the interface. Claude Code operates entirely in your terminal — you describe a change in words, and Claude edits files. ${APP_NAME} gives you a visual canvas where you click, drag, and design. For UI work, seeing the result in real time is often faster than describing it in text.`,
        },
        {
            title: 'Design system enforcement',
            body: `Claude Code reads your codebase and tries to follow your conventions, but it has no built-in mechanism to enforce design system compliance. It may introduce new Tailwind classes, new component patterns, or new color values. ${APP_NAME}'s AI is explicitly constrained to your existing design tokens and component library — it cannot invent new styles.`,
        },
        {
            title: 'Designer access',
            body: `Claude Code requires comfort with the terminal and reading code. Designers who do not write code cannot use it for UI work. ${APP_NAME} gives designers a visual editing surface so they can contribute UI changes directly — without opening a terminal, without learning JSX.`,
        },
        {
            title: 'Complementary, not competing',
            body: `The best engineering teams use Claude Code for logic and ${APP_NAME} for visual UI. Claude Code excels at refactoring data models, writing tests, implementing backend features, and multi-file restructuring. ${APP_NAME} excels at layout, component styling, design system polish, and anything where seeing the result matters.`,
        },
    ],
    chooseCompetitorIf: [
        'You are a developer comfortable in the terminal',
        'The task involves logic, refactoring, tests, or backend code',
        'You need to work across 10+ files in one task',
        "You want Anthropic's Claude model editing your code directly",
        'You are working in frameworks or languages other than React / JavaScript',
    ],
    chooseWeblabIf: [
        'You are editing React UI and want to see changes visually',
        'Designers need to contribute without using the terminal',
        'Design system compliance is critical — AI must not invent new styles',
        'You want visual changes to go through a pull request with a visual diff',
        'The work is design-engineering collaboration on a shared React codebase',
    ],
    faqs: [
        {
            q: `Does ${APP_NAME} use Claude under the hood?`,
            a: `${APP_NAME} integrates with multiple AI providers including Claude. The key distinction is that ${APP_NAME}'s AI is constrained to your design system — it can only use the components and tokens that exist in your codebase, regardless of which model is driving the changes.`,
        },
        {
            q: 'Can Claude Code edit React components visually?',
            a: 'No. Claude Code operates entirely in the terminal and does not have a visual canvas. It reads and writes code files as text. There is no way to click on a component, drag a layout, or see a live visual preview in Claude Code.',
        },
        {
            q: `Should I use ${APP_NAME} or Claude Code for React UI work?`,
            a: `Use ${APP_NAME} when the work is visual — layout, component styling, spacing, and design system polish. Use Claude Code when the work is logical — refactoring component props, writing tests, implementing new state management, or multi-file changes. For many teams, the answer is both.`,
        },
        {
            q: 'Is Claude Code free?',
            a: "Claude Code is included with Anthropic's paid Claude subscriptions (Pro, Max, Team, and Enterprise). Anthropic has increased Claude Code's rate limits for paid plans — check Anthropic's pricing page for current details.",
        },
    ],
};

export default function CompareClaudeCodePage() {
    return <ComparisonPage content={content} />;
}
