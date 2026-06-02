'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Textarea } from '@weblab/ui/textarea';

import { useEditorEngine } from '@/components/store/editor';

// Crawlers that identify AI/LLM training + assistant bots. Blocking these is the
// "disallow AI bots" traffic control — written as standard robots.txt rules.
const AI_BOTS = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'CCBot',
    'Google-Extended',
    'anthropic-ai',
    'ClaudeBot',
    'PerplexityBot',
    'Bytespider',
];

const AI_BLOCK = AI_BOTS.map((bot) => `User-agent: ${bot}\nDisallow: /`).join('\n\n');

const DEFAULT_ROBOTS = 'User-agent: *\nAllow: /\n';
const DEFAULT_LLMS = `# llms.txt\n# Guidance for LLMs about this site.\n# See https://llmstxt.org\n`;
const DEFAULT_SITEMAP =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';

/**
 * A load → edit → save editor for a single text file in the project's public/
 * directory. The file itself is the source of truth (read on mount, written on
 * save), so what the served site exposes always matches what's shown here.
 */
const FileEditorSection = observer(
    ({
        title,
        description,
        path,
        defaultContent,
        placeholder,
        mono = false,
        children,
    }: {
        title: string;
        description: string;
        path: string;
        defaultContent: string;
        placeholder?: string;
        mono?: boolean;
        children?: (insert: (text: string) => void) => React.ReactNode;
    }) => {
        const editorEngine = useEditorEngine();
        const [value, setValue] = useState('');
        const [saved, setSaved] = useState('');
        const [loading, setLoading] = useState(true);
        const [saving, setSaving] = useState(false);

        useEffect(() => {
            // Local flag per effect-invocation — safe against stale closures even
            // if deps change while an async load is in flight (shared-ref pattern
            // would reset the flag when the new effect starts, letting old loads
            // write stale state).
            let cancelled = false;
            const load = async () => {
                try {
                    const sandbox = editorEngine.activeSandbox;
                    const exists = await sandbox.fileExists(path);
                    const content = exists ? String(await sandbox.readFile(path)) : defaultContent;
                    if (!cancelled) {
                        setValue(content);
                        setSaved(content);
                    }
                } catch {
                    if (!cancelled) {
                        setValue(defaultContent);
                        setSaved(defaultContent);
                    }
                } finally {
                    if (!cancelled) setLoading(false);
                }
            };
            void load();
            return () => {
                cancelled = true;
            };
        }, [editorEngine, path, defaultContent]);

        const isDirty = value !== saved;

        const handleSave = async () => {
            setSaving(true);
            try {
                await editorEngine.activeSandbox.writeFile(path, value);
                setSaved(value);
                toast.success(`Saved ${path}`);
            } catch {
                toast.error(`Could not write ${path}. Make sure the project is running.`);
            } finally {
                setSaving(false);
            }
        };

        const insert = (text: string) => {
            setValue((prev) => {
                if (prev.includes(text.trim().split('\n')[0] ?? text)) return prev;
                const sep = prev.length > 0 && !prev.endsWith('\n\n') ? '\n\n' : '';
                return `${prev}${sep}${text.trim()}\n`;
            });
        };

        return (
            <section className="space-y-3 py-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-regularPlus">{title}</h3>
                        <p className="text-small text-foreground-secondary">{description}</p>
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0"
                        onClick={() => void handleSave()}
                        disabled={!isDirty || saving || loading}
                    >
                        {saving && <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                </div>
                {children && <div className="flex flex-wrap gap-2">{children(insert)}</div>}
                <Textarea
                    value={loading ? '' : value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={loading ? 'Loading…' : placeholder}
                    disabled={loading}
                    spellCheck={false}
                    className={mono ? 'text-small min-h-40 font-mono' : 'text-small min-h-40'}
                />
            </section>
        );
    },
);

export const SeoTab = observer(() => {
    return (
        <div className="divide-border flex flex-col divide-y px-6">
            <section className="space-y-1 py-6">
                <h2 className="text-largePlus">SEO</h2>
                <p className="text-regular text-foreground-secondary">
                    Page titles, descriptions, and Open Graph live in the Site tab. Here you control
                    crawlers and machine-readable files served from your site root.
                </p>
            </section>

            <FileEditorSection
                title="robots.txt"
                description="Controls which crawlers may index your site. Served at /robots.txt."
                path="public/robots.txt"
                defaultContent={DEFAULT_ROBOTS}
                placeholder={DEFAULT_ROBOTS}
                mono
            >
                {(insert) => (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => insert(AI_BLOCK)}
                        >
                            Block AI bots
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => insert('User-agent: *\nDisallow:')}
                        >
                            Allow all crawlers
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => insert('User-agent: *\nDisallow: /')}
                        >
                            Block all crawlers
                        </Button>
                    </>
                )}
            </FileEditorSection>

            <FileEditorSection
                title="llms.txt"
                description="Guidance for LLMs and AI assistants about your site. Served at /llms.txt."
                path="public/llms.txt"
                defaultContent={DEFAULT_LLMS}
                placeholder={DEFAULT_LLMS}
                mono
            />

            <FileEditorSection
                title="sitemap.xml"
                description="A custom sitemap served at /sitemap.xml. Leave the default if you generate one at build time."
                path="public/sitemap.xml"
                defaultContent={DEFAULT_SITEMAP}
                placeholder={DEFAULT_SITEMAP}
                mono
            />
        </div>
    );
});
