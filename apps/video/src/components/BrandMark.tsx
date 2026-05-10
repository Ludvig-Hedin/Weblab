import React from 'react';
import { Img, staticFile } from 'remotion';

export interface BrandMarkProps {
    variant?: 'logo' | 'wordmark';
    width?: number;
    height?: number;
    style?: React.CSSProperties;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
    variant = 'wordmark',
    width,
    height,
    style,
}) => {
    const src = variant === 'wordmark' ? 'brand/wordmark.svg' : 'brand/logo.svg';
    return (
        <Img
            src={staticFile(src)}
            style={{
                width,
                height,
                ...style,
            }}
        />
    );
};
