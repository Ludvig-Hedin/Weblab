import { useEffect, useMemo, useRef, useState } from 'react';
import type { SerializedNode, Framework, StyleMode, CodegenOptions } from '../codegen/types';
import type { PluginToUIMessage, UIToPluginMessage } from '../shared/messages';
import { generateReact } from '../codegen/react';
import { generateHTML } from '../codegen/html';
import { SegmentedControl } from './components/SegmentedControl';

export function App() {
    const [nodes, setNodes] = useState<SerializedNode[]>([]);
    const [framework, setFramework] = useState<Framework>('react');
    const [styleMode, setStyleMode] = useState<StyleMode>('tailwind');
    const [copied, setCopied] = useState(false);
    const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const ready: UIToPluginMessage = { type: 'READY' };
        parent.postMessage({ pluginMessage: ready }, '*');

        const handleMessage = (event: MessageEvent) => {
            const data = event.data?.pluginMessage as PluginToUIMessage | undefined;
            if (data?.type === 'SELECTION') {
                setNodes(data.nodes);
                setCopied(false);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        return () => {
            if (copiedTimeoutRef.current !== null) {
                clearTimeout(copiedTimeoutRef.current);
            }
        };
    }, []);

    const code = useMemo(() => {
        const options: CodegenOptions = { framework, styleMode };
        return framework === 'react'
            ? generateReact(nodes, options)
            : generateHTML(nodes, options);
    }, [nodes, framework, styleMode]);

    const hasSelection = nodes.length > 0;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(true);
        if (copiedTimeoutRef.current !== null) {
            clearTimeout(copiedTimeoutRef.current);
        }
        copiedTimeoutRef.current = setTimeout(() => {
            setCopied(false);
            copiedTimeoutRef.current = null;
        }, 2000);
    };

    return (
        <div
            style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                background: '#1e1e1e',
                color: '#e0e0e0',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                fontSize: 13,
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #2d2d2d',
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <span style={{ fontWeight: 600 }}>Weblab Export</span>
                {!hasSelection && (
                    <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>
                        Select a frame in Figma
                    </span>
                )}
            </div>

            {/* Controls */}
            <div
                style={{
                    padding: '10px 14px',
                    display: 'flex',
                    gap: 12,
                    borderBottom: '1px solid #2d2d2d',
                    flexWrap: 'wrap',
                }}
            >
                <SegmentedControl
                    label="Framework"
                    options={[
                        { value: 'react', label: 'React' },
                        { value: 'html', label: 'HTML' },
                    ]}
                    value={framework}
                    onChange={(v) => setFramework(v as Framework)}
                />
                <SegmentedControl
                    label="Style"
                    options={[
                        { value: 'tailwind', label: 'Tailwind' },
                        { value: 'inline', label: 'Inline' },
                        { value: 'css-modules', label: 'CSS Mod.' },
                    ]}
                    value={styleMode}
                    onChange={(v) => setStyleMode(v as StyleMode)}
                />
            </div>

            {/* Code preview */}
            <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
                <pre
                    style={{
                        margin: 0,
                        fontSize: 11,
                        lineHeight: 1.7,
                        color: hasSelection ? '#d4d4d4' : '#444',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        fontFamily: "'Fira Code', 'Cascadia Code', monospace",
                    }}
                >
                    {code}
                </pre>
            </div>

            {/* Copy button */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid #2d2d2d' }}>
                <button
                    onClick={handleCopy}
                    disabled={!hasSelection}
                    style={{
                        width: '100%',
                        padding: '8px 0',
                        background: hasSelection ? (copied ? '#16a34a' : '#0057FF') : '#2a2a2a',
                        color: hasSelection ? '#fff' : '#555',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: hasSelection ? 'pointer' : 'not-allowed',
                    }}
                >
                    {copied ? '✓ Copied!' : 'Copy code'}
                </button>
            </div>
        </div>
    );
}
