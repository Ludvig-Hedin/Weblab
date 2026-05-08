interface ColorRowProps {
    label: string;
    colors: string[];
}

export const ColorRow = ({ label, colors }: ColorRowProps) => (
    <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-mini">{label}</span>
        <div className="grid grid-cols-6 gap-1">
            {colors.map((color, index) => (
                <div
                    key={`${label}-${index}`}
                    className="hover:ring-border-primary border-foreground/10 aspect-square w-full cursor-pointer rounded-lg border hover:ring-2"
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
    </div>
);
