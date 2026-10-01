import type { TextBlock } from '../lib/content';

export function ArticleBody({ blocks }: { blocks: TextBlock[] }) {
    return (
        <div className="space-y-6">
            {blocks.map((block) => {
                const text = block.children.map((span) => {
                    let value = <span key={span._key}>{span.text}</span>;
                    if (span.marks.includes('strong'))
                        value = <strong key={span._key}>{value}</strong>;
                    if (span.marks.includes('em')) value = <em key={span._key}>{value}</em>;
                    return value;
                });

                return block.style === 'h2' ? (
                    <h2 key={block._key} className="pt-4 text-2xl font-medium">
                        {text}
                    </h2>
                ) : (
                    <p key={block._key} className="text-lg leading-relaxed">
                        {text}
                    </p>
                );
            })}
        </div>
    );
}
