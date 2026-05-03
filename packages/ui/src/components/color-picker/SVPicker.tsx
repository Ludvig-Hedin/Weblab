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

    const saturationGradient = `linear-gradient(to right, hsl(${hueDeg}, 0%, 100%), hsl(${hueDeg}, 100%, 50%))`;
    const valueGradient = `linear-gradient(to top, hsl(${hueDeg}, 0%, 0%), hsl(${hueDeg}, 0%, 100%))`;

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
