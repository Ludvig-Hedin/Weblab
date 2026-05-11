'use client';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@weblab/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@weblab/ui/avatar';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@weblab/ui/dialog';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@weblab/ui/drawer';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@weblab/ui/hover-card';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@weblab/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { Section } from '../section';

export function OverlaysDemo() {
    return (
        <div id="overlays">
            <Section
                title="Dialog"
                tag="overlays"
                inspectId="dialog"
                filePath="packages/ui/src/components/dialog.tsx"
            >
                <div className="flex flex-wrap items-center gap-3">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline">Open dialog</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create project</DialogTitle>
                                <DialogDescription>
                                    Give your project a name and choose how you want to get started.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="dg-name">Project name</Label>
                                    <Input id="dg-name" placeholder="My awesome project" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline">Cancel</Button>
                                <Button>Create</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">Delete project</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. All project data will be
                                    permanently deleted.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </Section>

            <Section
                title="Sheet"
                tag="overlays"
                inspectId="sheet"
                filePath="packages/ui/src/components/sheet.tsx"
            >
                <div className="flex flex-wrap items-center gap-3">
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                        <Sheet key={side}>
                            <SheetTrigger asChild>
                                <Button variant="outline">From {side}</Button>
                            </SheetTrigger>
                            <SheetContent side={side}>
                                <SheetHeader>
                                    <SheetTitle>Sheet from {side}</SheetTitle>
                                    <SheetDescription>
                                        Slides in from the {side} edge of the viewport.
                                    </SheetDescription>
                                </SheetHeader>
                            </SheetContent>
                        </Sheet>
                    ))}
                </div>
            </Section>

            <Section
                title="Drawer"
                tag="overlays"
                inspectId="drawer"
                filePath="packages/ui/src/components/drawer.tsx"
            >
                <Drawer>
                    <DrawerTrigger asChild>
                        <Button variant="outline">Open drawer</Button>
                    </DrawerTrigger>
                    <DrawerContent>
                        <div className="mx-auto w-full max-w-md p-4">
                            <DrawerHeader>
                                <DrawerTitle>Drawer title</DrawerTitle>
                                <DrawerDescription>
                                    Swipe-up drawer powered by Vaul.
                                </DrawerDescription>
                            </DrawerHeader>
                            <DrawerFooter>
                                <Button>Confirm</Button>
                                <DrawerClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DrawerClose>
                            </DrawerFooter>
                        </div>
                    </DrawerContent>
                </Drawer>
            </Section>

            <Section
                title="Popover"
                tag="overlays"
                inspectId="popover"
                filePath="packages/ui/src/components/popover.tsx"
            >
                <div className="flex flex-wrap items-center gap-3">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline">Open popover</Button>
                        </PopoverTrigger>
                        <PopoverContent>
                            <div className="space-y-3">
                                <p className="text-foreground text-sm font-medium">Dimensions</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>Width</Label>
                                        <Input defaultValue="100%" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Height</Label>
                                        <Input defaultValue="auto" />
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </Section>

            <Section
                title="Hover card"
                tag="overlays"
                inspectId="hover-card"
                filePath="packages/ui/src/components/hover-card.tsx"
            >
                <HoverCard>
                    <HoverCardTrigger asChild>
                        <Button variant="link">@weblab</Button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-72">
                        <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10">
                                <AvatarFallback>WB</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="text-foreground text-sm font-medium">Weblab</p>
                                <p className="text-foreground-tertiary text-xs">
                                    AI-powered visual editor for production codebases.
                                </p>
                            </div>
                        </div>
                    </HoverCardContent>
                </HoverCard>
            </Section>

            <Section title="Tooltip" tag="overlays" inspectId="tooltip">
                <div className="flex flex-wrap items-center gap-4">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon">
                                <Icons.InfoCircled className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Info tooltip</TooltipContent>
                    </Tooltip>
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                        <Tooltip key={side}>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    {side}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side={side}>{side} side</TooltipContent>
                        </Tooltip>
                    ))}
                </div>
            </Section>
        </div>
    );
}
