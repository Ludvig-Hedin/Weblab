'use client';

import { Button } from '@weblab/ui/button';
import {
    ContextMenu,
    ContextMenuCheckboxItem,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarShortcut,
    MenubarTrigger,
} from '@weblab/ui/menubar';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '@weblab/ui/navigation-menu';

import { Section } from '../section';

export function MenusDemo() {
    return (
        <div id="menus">
            <Section
                title="Dropdown menu"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            Actions <Icons.ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel>Project</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <Icons.Pencil className="mr-2 h-4 w-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.Copy className="mr-2 h-4 w-4" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.ExternalLink className="mr-2 h-4 w-4" /> Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                            <Icons.Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </Section>

            <Section
                title="Context menu"
                tag="menus"
                inspectId="context-menu"
                filePath="packages/ui/src/components/context-menu.tsx"
            >
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div className="border-border text-foreground-tertiary flex h-32 w-64 cursor-default items-center justify-center rounded-xl border border-dashed text-xs">
                            Right-click anywhere here
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                        <ContextMenuLabel>Element</ContextMenuLabel>
                        <ContextMenuSeparator />
                        <ContextMenuItem>Edit</ContextMenuItem>
                        <ContextMenuItem>Duplicate</ContextMenuItem>
                        <ContextMenuCheckboxItem checked>Visible</ContextMenuCheckboxItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem className="text-destructive">Delete</ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Section>

            <Section
                title="Menubar"
                tag="menus"
                inspectId="menubar"
                filePath="packages/ui/src/components/menubar.tsx"
            >
                <Menubar>
                    <MenubarMenu>
                        <MenubarTrigger>File</MenubarTrigger>
                        <MenubarContent>
                            <MenubarItem>
                                New project <MenubarShortcut>⌘N</MenubarShortcut>
                            </MenubarItem>
                            <MenubarItem>
                                Open <MenubarShortcut>⌘O</MenubarShortcut>
                            </MenubarItem>
                            <MenubarSeparator />
                            <MenubarItem>Save</MenubarItem>
                        </MenubarContent>
                    </MenubarMenu>
                    <MenubarMenu>
                        <MenubarTrigger>Edit</MenubarTrigger>
                        <MenubarContent>
                            <MenubarItem>
                                Undo <MenubarShortcut>⌘Z</MenubarShortcut>
                            </MenubarItem>
                            <MenubarItem>
                                Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
                            </MenubarItem>
                        </MenubarContent>
                    </MenubarMenu>
                    <MenubarMenu>
                        <MenubarTrigger>View</MenubarTrigger>
                        <MenubarContent>
                            <MenubarItem>Zoom in</MenubarItem>
                            <MenubarItem>Zoom out</MenubarItem>
                        </MenubarContent>
                    </MenubarMenu>
                </Menubar>
            </Section>

            <Section
                title="Navigation menu"
                tag="menus"
                inspectId="navigation-menu"
                filePath="packages/ui/src/components/navigation-menu.tsx"
            >
                <NavigationMenu>
                    <NavigationMenuList>
                        <NavigationMenuItem>
                            <NavigationMenuTrigger>Product</NavigationMenuTrigger>
                            <NavigationMenuContent>
                                <ul className="grid w-72 gap-2 p-3">
                                    <li>
                                        <NavigationMenuLink className="hover:bg-accent block rounded-md p-2 text-sm">
                                            Visual editor
                                        </NavigationMenuLink>
                                    </li>
                                    <li>
                                        <NavigationMenuLink className="hover:bg-accent block rounded-md p-2 text-sm">
                                            AI chat
                                        </NavigationMenuLink>
                                    </li>
                                    <li>
                                        <NavigationMenuLink className="hover:bg-accent block rounded-md p-2 text-sm">
                                            CMS
                                        </NavigationMenuLink>
                                    </li>
                                </ul>
                            </NavigationMenuContent>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <NavigationMenuLink className="block px-3 py-2 text-sm">
                                Pricing
                            </NavigationMenuLink>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <NavigationMenuLink className="block px-3 py-2 text-sm">
                                Docs
                            </NavigationMenuLink>
                        </NavigationMenuItem>
                    </NavigationMenuList>
                </NavigationMenu>
            </Section>
        </div>
    );
}
