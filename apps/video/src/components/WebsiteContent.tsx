import React from 'react';
import { ArrowRight, CheckCircle2, Sparkles, Zap } from 'lucide-react';

import { fontStack } from '../utils/tokens';

export type WebsiteVariant = 'default' | 'softened' | 'features' | 'imported' | 'minimal';

export interface WebsiteContentProps {
    variant?: WebsiteVariant;
    /** Highlight rectangle position around an editable element. 0 = none. */
    selection?: 'h1' | 'subhead' | 'cta' | 'none';
    /** Site name shown in nav. */
    siteName?: string;
}

/**
 * Renders a real-looking light-mode website inside a frame. The website is
 * white/light so it contrasts with the dark editor canvas.
 */
export const WebsiteContent: React.FC<WebsiteContentProps> = ({
    variant = 'default',
    selection = 'none',
    siteName = 'northwind',
}) => {
    const isSoft = variant === 'softened';
    const headlineColor = isSoft ? '#1f2937' : '#0a0a0a';
    const accent = isSoft ? '#0081DE' : '#0a0a0a';

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: '#ffffff',
                color: '#0a0a0a',
                fontFamily: fontStack,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* Nav */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 48px',
                    borderBottom: '1px solid #f0f0f0',
                    flexShrink: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                        style={{
                            width: 18,
                            height: 18,
                            borderRadius: 5,
                            background: 'linear-gradient(135deg, #0081DE 0%, #920EFF 100%)',
                        }}
                    />
                    <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.1 }}>
                        {siteName}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 28, fontSize: 13, color: '#525252' }}>
                    <span>Product</span>
                    <span>Pricing</span>
                    <span>Customers</span>
                    <span>Docs</span>
                </div>
                <div
                    style={{
                        padding: '8px 16px',
                        borderRadius: 999,
                        background: '#0a0a0a',
                        color: '#fff',
                        fontSize: 12.5,
                        fontWeight: 500,
                    }}
                >
                    Get started
                </div>
            </div>

            {/* Hero */}
            <div
                style={{
                    flex: 1,
                    padding: '72px 48px 48px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: 22,
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 14px',
                        borderRadius: 999,
                        border: '1px solid #e5e5e5',
                        background: '#fafafa',
                        fontSize: 12,
                        color: '#525252',
                    }}
                >
                    <Sparkles size={12} strokeWidth={1.8} color="#0081DE" /> New · Series A funding
                </div>

                <div style={{ position: 'relative', maxWidth: 720 }}>
                    {selection === 'h1' && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: '-6px -10px',
                                border: '1.5px solid #0081DE',
                                borderRadius: 6,
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    <div
                        style={{
                            fontSize: 56,
                            lineHeight: 1.05,
                            fontWeight: isSoft ? 500 : 600,
                            letterSpacing: -1.4,
                            color: headlineColor,
                        }}
                    >
                        {variant === 'imported'
                            ? 'Your store, only better.'
                            : 'Tools to build calmly.'}
                    </div>
                </div>

                <div style={{ position: 'relative', maxWidth: 540 }}>
                    {selection === 'subhead' && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: '-4px -8px',
                                border: '1.5px solid #0081DE',
                                borderRadius: 6,
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    <div
                        style={{
                            fontSize: 17,
                            lineHeight: 1.55,
                            color: '#525252',
                            fontWeight: 400,
                        }}
                    >
                        Design, write, and ship a site without juggling tools. Every change syncs
                        back to your project automatically.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 4, position: 'relative' }}>
                    {selection === 'cta' && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: '-4px -8px',
                                border: '1.5px solid #0081DE',
                                borderRadius: 8,
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                    <div
                        style={{
                            padding: '12px 22px',
                            borderRadius: 10,
                            background: accent,
                            color: '#fff',
                            fontSize: 13.5,
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        Start building <ArrowRight size={14} strokeWidth={2} />
                    </div>
                    <div
                        style={{
                            padding: '12px 22px',
                            borderRadius: 10,
                            border: '1px solid #e5e5e5',
                            color: '#0a0a0a',
                            fontSize: 13.5,
                            fontWeight: 500,
                        }}
                    >
                        Watch demo
                    </div>
                </div>

                {variant === 'features' && (
                    <div
                        style={{
                            marginTop: 28,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 16,
                            width: '100%',
                            maxWidth: 760,
                        }}
                    >
                        {[
                            { Icon: Zap, t: 'Built-in speed', d: 'Edge-rendered everywhere.' },
                            {
                                Icon: CheckCircle2,
                                t: 'Always in sync',
                                d: 'Code, design, content — one project.',
                            },
                            {
                                Icon: Sparkles,
                                t: 'AI on tap',
                                d: 'Refine sections in plain English.',
                            },
                        ].map(({ Icon, t, d }) => (
                            <div
                                key={t}
                                style={{
                                    border: '1px solid #ececec',
                                    borderRadius: 12,
                                    padding: 16,
                                    textAlign: 'left',
                                    background: '#fff',
                                }}
                            >
                                <Icon size={16} strokeWidth={1.7} color="#0081DE" />
                                <div
                                    style={{
                                        fontSize: 13.5,
                                        fontWeight: 600,
                                        marginTop: 8,
                                        color: '#0a0a0a',
                                    }}
                                >
                                    {t}
                                </div>
                                <div style={{ fontSize: 12.5, color: '#737373', marginTop: 4 }}>
                                    {d}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
