'use client';

import { useCallback, useMemo } from 'react';
import useEyeDropper from 'use-eye-dropper';

import { Color } from '@weblab/utility';

import { Button } from '../button';
import { Icons } from '../icons';

type EyeDropperButtonProps = React.ComponentProps<'button'> & {
    onColorSelect?: (color: Color) => void;
};

export const useIsEyeDropperSupported = () => {
    const { isSupported } = useEyeDropper();
    const isSupportedFlag = useMemo(() => isSupported(), [isSupported]);
    return isSupportedFlag;
};

export const EyeDropperButton = ({ onColorSelect, disabled }: EyeDropperButtonProps) => {
    const { open, isSupported } = useEyeDropper();

    const pickColor = useCallback(() => {
        const openPicker = async () => {
            try {
                const result = await open();
                const color = Color.from(result.sRGBHex);
                onColorSelect?.(color);
            } catch (e: any) {
                console.error('Error while opening color picker: ', e);
            }
        };
        openPicker();
    }, [open, onColorSelect]);

    return (
        <Button
            variant="ghost"
            size="icon"
            disabled={!isSupported() || disabled}
            onClick={pickColor}
            data-oid="ba9f93d378"
        >
            <Icons.EyeDropper data-oid="afb95d2a21" />
        </Button>
    );
};

export default EyeDropperButton;
