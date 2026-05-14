import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { Color } from '@weblab/utility';
import { SystemTheme } from '@weblab/models/assets';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { ToggleGroup, ToggleGroupItem } from '@weblab/ui/toggle-group';

import { useEditorEngine } from '@/components/store/editor';
import { ColorNameInput } from './color-name-input';
import { BrandPalletGroup } from './color-pallet-group';

const ColorPanel = observer(() => {
    const [theme, setTheme] = useState<SystemTheme>(SystemTheme.LIGHT);
    const [isAddingNewGroup, setIsAddingNewGroup] = useState(false);

    const editorEngine = useEditorEngine();
    const themeManager = editorEngine.theme;

    const { colorGroups, colorDefaults } = themeManager;

    useEffect(() => {
        themeManager.scanConfig();
    }, []);

    const handleRename = async (groupName: string, newName: string) => {
        await themeManager.rename(groupName, newName);
    };

    const handleDelete = async (groupName: string, colorName?: string) => {
        await themeManager.delete(groupName, colorName);
    };

    const handleColorChange = async (
        groupName: string,
        index: number,
        newColor: Color,
        newName: string,
        parentName?: string,
    ) => {
        await themeManager.update(groupName, index, newColor, newName, parentName, theme, false);
    };

    const handleColorChangeEnd = async (
        groupName: string,
        index: number,
        newColor: Color,
        newName: string,
        parentName?: string,
    ) => {
        await themeManager.update(groupName, index, newColor, newName, parentName, theme, true);
    };

    const handleDuplicate = async (
        groupName: string,
        colorName: string,
        isDefaultPalette?: boolean,
    ) => {
        await themeManager.duplicate(groupName, colorName, isDefaultPalette, theme);
    };

    const handleAddNewGroup = async (newName: string) => {
        await themeManager.add(newName);
        setIsAddingNewGroup(false);
    };

    const handleDefaultColorChange = async (
        groupName: string,
        colorIndex: number,
        newColor: Color,
    ) => {
        await themeManager.handleDefaultColorChange(groupName, colorIndex, newColor, theme);
    };

    const handleClose = () => {
        editorEngine.state.setBrandTab(null);
    };

    return (
        <div className="text-active text-mini flex h-full w-full flex-grow flex-col overflow-y-auto p-0">
            <div className="border-border bg-background fixed top-0 right-0 left-0 z-10 flex items-center justify-start gap-2 border-b py-1.5 pr-2.5 pl-3">
                <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-background-secondary h-7 w-7 rounded-md"
                    onClick={handleClose}
                >
                    <Icons.ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-foreground text-small font-normal">Brand Colors</h2>
            </div>
            {/* Theme Toggle */}
            <div className="border-border mt-[2.5rem] border-b px-4 py-3">
                <ToggleGroup
                    type="single"
                    value={theme}
                    onValueChange={(value) => {
                        if (value) setTheme(value as SystemTheme);
                    }}
                    className="bg-background-secondary w-full gap-0 rounded-md p-0.5"
                >
                    <ToggleGroupItem
                        value={SystemTheme.LIGHT}
                        aria-label="Light mode"
                        className="text-muted-foreground hover:bg-foreground/8 hover:text-foreground-primary data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:hover:bg-foreground text-mini h-7 gap-1.5 border-0 shadow-none transition-colors duration-150"
                    >
                        <Icons.Sun className="h-3.5 w-3.5" />
                        Light mode
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value={SystemTheme.DARK}
                        aria-label="Dark mode"
                        className="text-muted-foreground hover:bg-foreground/8 hover:text-foreground-primary data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:hover:bg-foreground text-mini h-7 gap-1.5 border-0 shadow-none transition-colors duration-150"
                    >
                        <Icons.Moon className="h-3.5 w-3.5" />
                        Dark mode
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>

            {/* Brand Palette Groups section */}
            <div className="border-border flex flex-col gap-4 border-b px-4 py-[18px]">
                <div className="flex flex-col gap-3">
                    {/* Theme color groups */}
                    {Object.entries(colorGroups).map(([groupName, colors]) => (
                        <BrandPalletGroup
                            key={groupName}
                            theme={theme}
                            title={groupName}
                            colors={colors}
                            onRename={handleRename}
                            onDelete={(colorName) => handleDelete(groupName, colorName)}
                            onColorChange={handleColorChange}
                            onColorChangeEnd={handleColorChangeEnd}
                            onDuplicate={(colorName) => handleDuplicate(groupName, colorName)}
                        />
                    ))}
                </div>
                {isAddingNewGroup ? (
                    <div className="flex flex-col gap-1">
                        <ColorNameInput
                            initialName=""
                            onSubmit={handleAddNewGroup}
                            onCancel={() => setIsAddingNewGroup(false)}
                        />
                    </div>
                ) : (
                    <Button
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground bg-background-secondary hover:bg-background-secondary/70 border-border text-small h-10 w-full rounded-lg border"
                        onClick={() => setIsAddingNewGroup(true)}
                    >
                        <Icons.Plus className="mr-1.5 h-4 w-4" />
                        Add a new group
                    </Button>
                )}
            </div>

            {/* Color Palette section */}
            <div className="border-border flex flex-col gap-4 border-b px-4 py-[18px]">
                <h3 className="text-small mb-1 font-medium">Default Colors</h3>
                {Object.entries(colorDefaults).map(([colorName, colors]) => (
                    <BrandPalletGroup
                        key={colorName}
                        theme={theme}
                        title={colorName}
                        colors={colors}
                        onRename={handleRename}
                        onDelete={(colorItem) => handleDelete(colorName, colorItem)}
                        onColorChange={(groupName, colorIndex, newColor) =>
                            handleDefaultColorChange(colorName, colorIndex, newColor)
                        }
                        onColorChangeEnd={(groupName, colorIndex, newColor) =>
                            handleDefaultColorChange(colorName, colorIndex, newColor)
                        }
                        onDuplicate={(colorItem) => handleDuplicate(colorName, colorItem, true)}
                        isDefaultPalette={true}
                    />
                ))}
            </div>
        </div>
    );
});

export default ColorPanel;
