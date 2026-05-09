import type { ComponentInsertData } from '@weblab/models/element';
import { Icons } from '@weblab/ui/icons';

interface ComponentCardProps {
    data: ComponentInsertData;
    onDragStart: (e: React.DragEvent<HTMLButtonElement>, data: ComponentInsertData) => void;
}

export const ComponentCard = ({ data, onDragStart }: ComponentCardProps) => (
    <button
        type="button"
        draggable
        onDragStart={(e) => onDragStart(e, data)}
        title={`${data.componentName} — drag to canvas`}
        className="group bg-background-tab-strip/60 hover:bg-background-tab-active border-border/60 hover:border-border flex w-full cursor-grab items-center gap-2 rounded-md border p-2 text-left transition-colors active:cursor-grabbing"
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
