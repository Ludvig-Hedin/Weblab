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

const sample = `## Why Weblab

Weblab makes shipping a **visual diff** that runs on your code:

- React, Next.js, Vue, Svelte
- Tailwind, CSS Modules, styled-components
- AI-assisted edits with a single click

\`\`\`tsx
export function Hero() {
  return <h1 className="text-title1">Design at the speed of thought.</h1>;
}
\`\`\`
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
                <CodeBlock
                    code={`const greet = (name: string) => \`Hello, \${name}!\`;\n\nconsole.log(greet('Weblab'));`}
                    language="ts"
                >
                    <CodeBlockCopyButton />
                </CodeBlock>
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
