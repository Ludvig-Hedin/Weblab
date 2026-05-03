import { Icons } from '@weblab/ui/icons';
import type { ComponentInsertData } from '@weblab/models/element';

interface ComponentCardProps {
    data: ComponentInsertData;
    onDragStart: (e: React.DragEvent<HTMLButtonElement>, data: ComponentInsertData) => void;
    onClick: (data: ComponentInsertData) => void;
}

export const ComponentCard = ({ data, onDragStart, onClick }: ComponentCardProps) => (
    <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, data)}
        onClick={() => onClick(data)}
        title={data.filePath}
        className="group bg-background-secondary/40 hover:bg-background-weblab border-border-primary/40 hover:border-border-primary flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors"
    >
        <Icons.Component className="text-foreground-primary h-4 w-4 flex-shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-foreground-primary line-clamp-1 text-[11px] font-medium">
                {data.componentName}
            </span>
            <span className="text-muted-foreground line-clamp-1 text-[10px]">{data.filePath}</span>
        </div>
    </button>
);
