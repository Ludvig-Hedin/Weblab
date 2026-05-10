import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';

import { fontStack, palette } from '../utils/tokens';

export type Breakpoint = 'desktop' | 'tablet' | 'mobile';

export interface BreakpointPillProps {
    active: Breakpoint;
}

const items: { id: Breakpoint; label: string; Icon: typeof Monitor }[] = [
    { id: 'desktop', label: 'Desktop', Icon: Monitor },
    { id: 'tablet', label: 'Tablet', Icon: Tablet },
    { id: 'mobile', label: 'Mobile', Icon: Smartphone },
];

export const BreakpointPill: React.FC<BreakpointPillProps> = ({ active }) => {
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: 4,
                borderRadius: 999,
                border: `1px solid ${palette.border}`,
                background: palette.surface,
                fontFamily: fontStack,
            }}
        >
            {items.map(({ id, label, Icon }) => {
                const isActive = id === active;
                return (
                    <div
                        key={id}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: isActive ? palette.surfaceElevated : 'transparent',
                            color: isActive ? palette.textPrimary : palette.textMuted,
                            fontSize: 11,
                            letterSpacing: 0.2,
                            transition: 'none',
                        }}
                    >
                        <Icon size={12} />
                        {label}
                    </div>
                );
            })}
        </div>
    );
};
