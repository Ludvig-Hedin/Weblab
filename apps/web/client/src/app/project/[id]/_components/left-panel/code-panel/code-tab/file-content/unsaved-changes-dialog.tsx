import { Button } from '@weblab/ui/button';

interface UnsavedChangesDialogProps {
    onSave: () => Promise<void>;
    onDiscard: () => void;
    onCancel: () => void;
    fileCount?: number;
}

export function UnsavedChangesDialog({
    onSave,
    onDiscard,
    onCancel,
    fileCount = 1,
}: UnsavedChangesDialogProps) {
    const isMultiple = fileCount > 1;
    return (
        <div className="bg-card border-border absolute top-4 left-1/2 z-50 w-[320px] -translate-x-1/2 rounded-lg border p-4 shadow-lg">
            <div className="text-foreground text-small mb-4">
                You have unsaved changes. Are you sure you want to close{' '}
                {isMultiple ? `${fileCount} files` : 'this file'}?
            </div>
            <div className="flex justify-end gap-1">
                <Button onClick={onDiscard} variant="ghost" className="text-red hover:text-red">
                    Discard
                </Button>
                <Button
                    onClick={onSave}
                    variant="ghost"
                    className="text-foreground-brand text-small"
                >
                    Save
                </Button>
                <Button variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}
