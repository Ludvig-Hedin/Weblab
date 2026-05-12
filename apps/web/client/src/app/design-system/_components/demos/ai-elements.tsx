'use client';

import {
    CodeBlock,
    CodeBlockCopyButton,
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
    Response,
    Tool,
    ToolContent,
    ToolHeader,
} from '@weblab/ui/ai-elements';

import { Section } from '../section';

// Brand-aligned: neutral Response sample, no embedded fenced code block (the
// upstream Streamdown renderer uses Prism's oneDark which is too saturated for
// Weblab chrome). The dedicated Code block section below shows the proper
// `<CodeBlock>` primitive in a tight container.
const sample = `## Why Weblab

Weblab makes shipping a **visual diff** that runs on your code.

- React, Next.js, Vue, Svelte
- Tailwind, CSS Modules, styled-components
- AI-assisted edits with a single click

Visual edits commit back to your branch as a regular PR — no lock-in, no
proprietary format. Connect your repo, open a file in the canvas, ship.
`;

export function AIElementsDemo() {
    return (
        <div id="ai-elements">
            <Section
                title="Response"
                tag="ai-elements"
                inspectId="ai-elements"
                filePath="packages/ui/src/components/ai-elements/response.tsx"
            >
                <div className="bg-background-secondary/30 border-border max-w-2xl rounded-xl border p-4">
                    <Response>{sample}</Response>
                </div>
            </Section>

            <Section
                title="Code block"
                tag="ai-elements"
                inspectId="ai-elements"
                filePath="packages/ui/src/components/ai-elements/code-block.tsx"
            >
                <div className="max-w-xl">
                    <CodeBlock
                        code={`const greet = (name: string) => \`Hello, \${name}!\`;`}
                        language="ts"
                        className="border-border bg-background-secondary [&_pre]:!bg-background-secondary [&_pre]:!p-3 [&_code]:!text-[12px] [&_code]:!leading-relaxed [&_*]:!text-foreground [&_.token.keyword]:!text-foreground-secondary [&_.token.function]:!text-foreground [&_.token.string]:!text-foreground-tertiary [&_.token.punctuation]:!text-foreground-tertiary [&_.token.operator]:!text-foreground-tertiary [&_.token.template-string]:!text-foreground-tertiary"
                    >
                        <CodeBlockCopyButton className="h-6 w-6 [&>svg]:!size-3" />
                    </CodeBlock>
                </div>
                <p className="text-foreground-tertiary mt-2 max-w-xl text-xs">
                    Brand override: tokens collapse to <code>--foreground</code> + tertiary, no
                    library accents. Pass <code>className</code> to scope.
                </p>
            </Section>

            <Section
                title="Reasoning"
                tag="ai-elements"
                inspectId="ai-elements"
                filePath="packages/ui/src/components/ai-elements/reasoning.tsx"
            >
                <Reasoning className="max-w-2xl" duration={3}>
                    <ReasoningTrigger />
                    <ReasoningContent>
                        Considering the user's request, I should first read the file to confirm the
                        current import structure, then apply the change with a minimal diff. After
                        that I'll run the typechecker to verify nothing else broke.
                    </ReasoningContent>
                </Reasoning>
            </Section>

            <Section
                title="Tool invocation"
                tag="ai-elements"
                inspectId="ai-elements"
                filePath="packages/ui/src/components/ai-elements/tool.tsx"
            >
                <Tool className="max-w-2xl">
                    <ToolHeader type="tool-read-file" state="output-available" />
                    <ToolContent>
                        <div className="text-foreground-secondary p-3 text-xs">
                            <p className="font-mono">Read packages/ui/src/components/button.tsx</p>
                            <p className="text-foreground-tertiary mt-2">189 lines, 4.2 KB</p>
                        </div>
                    </ToolContent>
                </Tool>
            </Section>
        </div>
    );
}
