'use client';

import type { TokenRowData } from './lib/group-tokens';
import type { ConfirmFn } from './lib/token-mutations';
import { TextStyleEditor } from './editors/text-style-editor';
import { VariableTokenEditor } from './editors/variable-token-editor';

export interface TokenEditorProps {
    row: TokenRowData;
    onClose: () => void;
    confirm: ConfirmFn;
}

/** Picks the inline editor for a row based on its token kind. */
export function TokenEditor({ row, onClose, confirm }: TokenEditorProps) {
    if (row.kind === 'text-style') {
        return <TextStyleEditor row={row} onClose={onClose} confirm={confirm} />;
    }
    return <VariableTokenEditor row={row} onClose={onClose} confirm={confirm} />;
}
