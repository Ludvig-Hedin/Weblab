import { observer } from 'mobx-react-lite';

import { VARIANTS } from '@weblab/fonts';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { extractFontParts } from '@weblab/utility';

export interface FontFile {
    name: string;
    file: {
        name: string;
        buffer: number[];
    };
    weight: string;
    style: string;
}

interface FontFilesProps {
    fontFiles: FontFile[];
    onWeightChange: (index: number, weight: string) => void;
    onStyleChange: (index: number, style: string) => void;
    onRemoveFont: (index: number) => void;
}

const FontFiles = observer(
    ({ fontFiles, onWeightChange, onStyleChange, onRemoveFont }: FontFilesProps) => {
        if (fontFiles.length === 0) {
            return null;
        }

        return (
            <div className="max-h-[350px] flex-1 space-y-2 overflow-y-auto pb-6">
                {fontFiles.map((font, index) => (
                    <div
                        key={index}
                        className="border-foreground/10 bg-foreground/5 flex flex-col space-y-2 rounded-lg border p-3"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-small font-normal">
                                    {extractFontParts(font.file.name).family}
                                </span>
                                <span className="text-muted-foreground text-mini">
                                    {font.file.name}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <select
                                        className="bg-foreground/5 border-foreground/10 text-foreground hover:bg-background-hover hover:text-accent-foreground hover:border-border-hover text-small cursor-pointer appearance-none rounded-md border p-2 pr-8"
                                        value={font.weight}
                                        onChange={(e) => onWeightChange(index, e.target.value)}
                                    >
                                        {VARIANTS.map((variant) => (
                                            <option key={variant.value} value={variant.value}>
                                                {variant.name} ({variant.value})
                                            </option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                        <Icons.ChevronDown className="text-muted-foreground h-4 w-4" />
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="border-foreground/10 bg-foreground/5 h-9 w-9 rounded-md border"
                                    onClick={() => onRemoveFont(index)}
                                >
                                    <Icons.Trash className="text-muted-foreground h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    },
);

export default FontFiles;
