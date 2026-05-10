import React from 'react';
import { Check, Globe } from 'lucide-react';

import { APP_DOMAIN } from '../utils/brand';
import { fontStack, palette } from '../utils/tokens';

export interface PublishCardProps {
    /** 0..1 of the URL type-on. */
    urlProgress?: number;
    /** 0..1 of the soft pulse. */
    pulse?: number;
}

export const PublishCard: React.FC<PublishCardProps> = ({ urlProgress = 1, pulse = 0 }) => {
    const visibleChars = Math.floor(APP_DOMAIN.length * Math.min(1, Math.max(0, urlProgress)));
    const visibleUrl = APP_DOMAIN.slice(0, visibleChars);
    const haloOpacity = 0.08 + Math.sin(pulse * Math.PI) * 0.18;
    const isPublished = urlProgress >= 1;

    return (
        <div
            style={{
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                fontFamily: fontStack,
                minWidth: 320,
                position: 'relative',
                boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: -8,
                    borderRadius: 18,
                    background: `rgba(0,129,222,${haloOpacity})`,
                    filter: 'blur(14px)',
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #0081DE 0%, #920EFF 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0,
                    position: 'relative',
                }}
            >
                <Globe size={20} strokeWidth={1.7} />
            </div>
            <div style={{ position: 'relative', flex: 1 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <div
                        style={{
                            fontSize: 10.5,
                            color: palette.textMuted,
                            letterSpacing: 0.6,
                            textTransform: 'uppercase',
                            fontWeight: 500,
                        }}
                    >
                        Live
                    </div>
                    {isPublished && (
                        <div
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 7px',
                                borderRadius: 999,
                                background: 'rgba(34,197,94,0.16)',
                                color: '#22c55e',
                                fontSize: 10,
                                fontWeight: 500,
                            }}
                        >
                            <Check size={9} strokeWidth={2.4} /> Published
                        </div>
                    )}
                </div>
                <div
                    style={{
                        fontSize: 18,
                        color: palette.textPrimary,
                        marginTop: 4,
                        letterSpacing: -0.1,
                        fontWeight: 500,
                    }}
                >
                    {visibleUrl}
                    <span
                        style={{
                            display: 'inline-block',
                            width: 1.5,
                            height: 16,
                            background: palette.textPrimary,
                            marginLeft: 2,
                            verticalAlign: 'middle',
                            opacity: urlProgress < 1 ? 1 : 0,
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
