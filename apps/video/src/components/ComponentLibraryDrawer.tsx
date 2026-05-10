import React from 'react';
import {
    Crown,
    Image as ImageIcon,
    LayoutGrid,
    MessageSquareQuote,
    Receipt,
    Wand2,
} from 'lucide-react';

import { fontStack, palette } from '../utils/tokens';

interface CardSpec {
    label: string;
    Icon: typeof LayoutGrid;
    /** Tiny visual preview painted inside the card. */
    preview: React.ReactNode;
}

// Mini visual previews — 1-3 lines representing the actual component shape.
const HeroPreview: React.FC = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div
            style={{
                height: 5,
                width: '70%',
                borderRadius: 2,
                background: 'rgba(255,255,255,0.85)',
            }}
        />
        <div
            style={{
                height: 4,
                width: '50%',
                borderRadius: 2,
                background: 'rgba(255,255,255,0.4)',
            }}
        />
        <div
            style={{
                height: 4,
                width: '40%',
                borderRadius: 2,
                background: 'rgba(255,255,255,0.4)',
            }}
        />
        <div
            style={{
                height: 7,
                width: 28,
                borderRadius: 3,
                background: palette.blue,
                marginTop: 3,
            }}
        />
    </div>
);

const FeaturePreview: React.FC = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {[0, 1, 2].map((i) => (
            <div
                key={i}
                style={{
                    height: 22,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                }}
            />
        ))}
    </div>
);

const PricingPreview: React.FC = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
        {[0, 1, 2].map((i) => (
            <div
                key={i}
                style={{
                    height: 26,
                    borderRadius: 3,
                    background: i === 1 ? 'rgba(0,129,222,0.32)' : 'rgba(255,255,255,0.08)',
                    border:
                        i === 1
                            ? '1px solid rgba(0,129,222,0.55)'
                            : '1px solid rgba(255,255,255,0.12)',
                }}
            />
        ))}
    </div>
);

const TestimonialPreview: React.FC = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div
            style={{
                height: 4,
                width: '90%',
                borderRadius: 2,
                background: 'rgba(255,255,255,0.55)',
            }}
        />
        <div
            style={{
                height: 4,
                width: '80%',
                borderRadius: 2,
                background: 'rgba(255,255,255,0.4)',
            }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: palette.purple }} />
            <div
                style={{
                    height: 4,
                    width: 36,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.5)',
                }}
            />
        </div>
    </div>
);

const LogoPreview: React.FC = () => (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        {[0, 1, 2, 3].map((i) => (
            <div
                key={i}
                style={{
                    width: 16,
                    height: 5,
                    borderRadius: 1.5,
                    background: 'rgba(255,255,255,0.5)',
                }}
            />
        ))}
    </div>
);

const FooterPreview: React.FC = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    style={{
                        height: 4,
                        width: 18,
                        borderRadius: 1.5,
                        background: 'rgba(255,255,255,0.45)',
                    }}
                />
            ))}
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
        <div
            style={{
                height: 3,
                width: '60%',
                borderRadius: 1.5,
                background: 'rgba(255,255,255,0.3)',
            }}
        />
    </div>
);

const cards: CardSpec[] = [
    { label: 'Hero', Icon: Wand2, preview: <HeroPreview /> },
    { label: 'Feature grid', Icon: LayoutGrid, preview: <FeaturePreview /> },
    { label: 'Pricing', Icon: Crown, preview: <PricingPreview /> },
    { label: 'Testimonials', Icon: MessageSquareQuote, preview: <TestimonialPreview /> },
    { label: 'Logo cloud', Icon: ImageIcon, preview: <LogoPreview /> },
    { label: 'Footer', Icon: Receipt, preview: <FooterPreview /> },
];

export interface ComponentLibraryDrawerProps {
    /** 0..1 progress of the drawer's slide-in. */
    progress: number;
    /** Index of the card currently hovered/selected (drawn with accent ring). */
    highlightIndex?: number;
}

export const ComponentLibraryDrawer: React.FC<ComponentLibraryDrawerProps> = ({
    progress,
    highlightIndex,
}) => {
    const offsetY = (1 - progress) * 280;
    return (
        <div
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                transform: `translateY(${offsetY}px)`,
                background: palette.surface,
                borderTop: `1px solid ${palette.border}`,
                padding: 18,
                fontFamily: fontStack,
                boxShadow: '0 -16px 40px rgba(0,0,0,0.45)',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 14,
                    color: palette.textSecondary,
                }}
            >
                <div
                    style={{
                        fontSize: 11,
                        color: palette.textMuted,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        fontWeight: 500,
                    }}
                >
                    Components
                </div>
                <div
                    style={{
                        height: 1,
                        flex: 1,
                        background: palette.border,
                    }}
                />
                <div
                    style={{
                        fontSize: 11,
                        color: palette.textMuted,
                    }}
                >
                    {cards.length} blocks
                </div>
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: 12,
                }}
            >
                {cards.map(({ label, Icon, preview }, i) => {
                    const highlighted = highlightIndex === i;
                    return (
                        <div
                            key={label}
                            style={{
                                background: palette.surfaceElevated,
                                border: `1px solid ${
                                    highlighted ? 'rgba(0,129,222,0.55)' : palette.border
                                }`,
                                boxShadow: highlighted ? '0 0 0 2px rgba(0,129,222,0.18)' : 'none',
                                borderRadius: 10,
                                padding: 12,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                color: palette.textSecondary,
                                minHeight: 120,
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    background: palette.background,
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 6,
                                    padding: 10,
                                }}
                            >
                                {preview}
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 11.5,
                                    color: palette.textPrimary,
                                }}
                            >
                                <Icon size={11} strokeWidth={1.7} color={palette.textMuted} />
                                {label}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
