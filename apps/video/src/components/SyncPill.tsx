import React from 'react';
import { RefreshCw } from 'lucide-react';

import { fontStack, palette } from '../utils/tokens';

export interface SyncPillProps {
    /** 0..1 of the pulse animation. */
    pulse?: number;
    label?: string;
}

export const SyncPill: React.FC<SyncPillProps> = ({ pulse = 0, label = 'Synced' }) => {
    const rotation = pulse * 360;
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(0,129,222,0.10)',
                border: `1px solid rgba(0,129,222,0.45)`,
                color: palette.textPrimary,
                fontFamily: fontStack,
                fontSize: 13,
                letterSpacing: 0.2,
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    transform: `rotate(${rotation}deg)`,
                    color: palette.blueSoft,
                }}
            >
                <RefreshCw size={14} />
            </span>
            {label}
        </div>
    );
};
