import type React from 'react';
import { clamp } from 'lodash';

import { Color } from '@weblab/utility';

import { usePointerStroke } from '../../hooks/use-pointer-stroke';
import { ColorHandle } from './ColorSlider';

interface SVPickerGradientProps extends React.HTMLAttributes<HTMLDivElement> {}

const SVPickerGradient: React.FC<SVPickerGradientProps> = ({ ...props }) => (
    <div className="absolute inset-0 z-[-1]" {...props} data-oid="b2b4c8a31b"></div>
);

interface SVPickerWrapProps extends React.HTMLAttributes<HTMLDivElement> {}

const SVPickerWrap: React.FC<SVPickerWrapProps> = ({ children, ...props }) => (
    <div className="relative z-0" {...props} data-oid="8d0e3cc23e">
        {children}
    </div>
);

interface SVPickerBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

const SVPickerBody: React.FC<SVPickerBodyProps> = ({ children, ...props }) => (
    <div
        className="relative cursor-pointer overflow-hidden rounded-sm border border-gray-300 shadow-inner"
        {...props}
        data-oid="87752956e8"
    >
        {children}
    </div>
);

/** Returns the pure saturated color (S=100%, L=50%) for a hue in degrees as rgba. */
function hueToRgba(hueDeg: number): string {
    const h = ((hueDeg % 360) + 360) % 360;
    const s = h / 60;
    const x = Math.round(255 * (1 - Math.abs((s % 2) - 1)));
    const [r, g, b] =
        s < 1
            ? [255, x, 0]
            : s < 2
              ? [x, 255, 0]
              : s < 3
                ? [0, 255, x]
                : s < 4
                  ? [0, x, 255]
                  : s < 5
                    ? [x, 0, 255]
                    : [255, 0, x];
    return `rgba(${r},${g},${b},1)`;
}

export const SVPicker: React.FC<{
    width: number;
    height: number;
    handleSize: number;
    color: Color;
    onChangeEnd: (color: Color) => void;
    onChange: (color: Color) => void;
    onMouseDown: (color: Color) => void;
}> = ({ width, height, handleSize, color, onChangeEnd, onChange, onMouseDown }) => {
    const hueDeg = Math.round(color.h * 360);

    // Convert hue to pure saturated rgba (S=100%, L=50%) for gradient endpoints.
    // hsl(H, 0%, 100%) = white, hsl(H, 0%, 0%) = black regardless of hue.
    const pureHue = hueToRgba(hueDeg);
    const saturationGradient = `linear-gradient(to right, rgba(255,255,255,1), ${pureHue})`;
    const valueGradient = `linear-gradient(to top, rgba(0,0,0,1), rgba(255,255,255,1))`;

    const valueAtEvent = (e: React.MouseEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const s = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const v = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
        return new Color({ ...color, s, v });
    };

    const pointerProps = usePointerStroke<HTMLElement>({
        onBegin: (e) => {
            onMouseDown(valueAtEvent(e));
        },
        onMove: (e) => {
            onChange(valueAtEvent(e));
        },
        onEnd: (e) => {
            onChangeEnd(valueAtEvent(e));
        },
    });

    return (
        <SVPickerWrap data-oid="205249de89">
            <SVPickerBody
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                }}
                {...pointerProps}
                data-oid="7ee75b73e6"
            >
                <SVPickerGradient style={{ background: valueGradient }} data-oid="42b16b62ac" />
                <SVPickerGradient
                    style={{ background: saturationGradient, mixBlendMode: 'multiply' }}
                    data-oid="db6d4bfbbe"
                />

                <ColorHandle
                    style={{
                        position: 'absolute',
                        left: `${-handleSize / 2 + width * color.s}px`,
                        top: `${-handleSize / 2 + height * (1 - color.v)}px`,
                        width: `${handleSize}px`,
                        height: `${handleSize}px`,
                        color: color.toHex(),
                    }}
                    data-oid="b75c1bd754"
                />
            </SVPickerBody>
        </SVPickerWrap>
    );
};
