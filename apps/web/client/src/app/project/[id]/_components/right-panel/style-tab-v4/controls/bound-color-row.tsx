'use client';

import { observer } from 'mobx-react-lite';

import type { ColorRowProps } from './color-row';
import { useColorVariable } from '../hooks/use-color-variable';
import { ColorPickerInline } from './color-picker-inline';
import { ColorRow, colorToLiteral } from './color-row';
import { ColorVariablePicker, TokenEditPanel } from './variable-controls';

export interface BoundColorRowProps extends Omit<ColorRowProps, 'pickerContent'> {
    /** CSS color property this row edits (e.g. `background-color`). */
    property: string;
}

/**
 * `ColorRow` that knows about color variables. When the element's class binds
 * the property to a variable, the row shows the variable name with hover
 * actions to edit or detach it. Otherwise a hover connect button lets the user
 * pick a variable.
 */
export const BoundColorRow = observer(function BoundColorRow({
    property,
    value,
    onCommit,
    mixed,
    ...rest
}: BoundColorRowProps) {
    const controls = useColorVariable(property);
    const binding = controls?.binding ?? null;

    // A new color on a bound property replaces the variable class, so the
    // old utility can't keep winning over the new one.
    const commit = (next: string) => {
        if (binding && controls && next) controls.detach(colorToLiteral(next));
        else onCommit(next);
    };

    return (
        <ColorRow
            {...rest}
            value={value}
            mixed={mixed}
            onCommit={commit}
            pickerContent={<ColorPickerInline value={value} onCommit={commit} />}
            variable={binding}
            onDetachVariable={
                binding && controls
                    ? () => controls.detach(colorToLiteral(controls.renderedColor || value))
                    : undefined
            }
            renderEditVariable={
                binding?.editable
                    ? (close) => <TokenEditPanel name={binding.varName} onClose={close} />
                    : undefined
            }
            renderConnectVariable={
                controls
                    ? (close) => (
                          <ColorVariablePicker
                              options={controls.options}
                              current={binding?.varName}
                              onPick={(varName) => {
                                  controls.connect(varName);
                                  close();
                              }}
                          />
                      )
                    : undefined
            }
        />
    );
});
