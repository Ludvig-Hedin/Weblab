'use client';

import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

import { cn } from '../utils';
import { buttonVariants } from './button';

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
    return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} data-oid="32afc98958" />;
}

function AlertDialogTrigger({
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
    return (
        <AlertDialogPrimitive.Trigger
            data-slot="alert-dialog-trigger"
            {...props}
            data-oid="3125d53672"
        />
    );
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
    return (
        <AlertDialogPrimitive.Portal
            data-slot="alert-dialog-portal"
            {...props}
            data-oid="f82bc0877b"
        />
    );
}

function AlertDialogOverlay({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
    return (
        <AlertDialogPrimitive.Overlay
            data-slot="alert-dialog-overlay"
            className={cn(
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
                className,
            )}
            {...props}
            data-oid="01a5d6e7c7"
        />
    );
}

function AlertDialogContent({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
    return (
        <AlertDialogPortal data-oid="03932aa191">
            <AlertDialogOverlay data-oid="65c93496e8" />
            <AlertDialogPrimitive.Content
                data-slot="alert-dialog-content"
                className={cn(
                    'bg-background-weblab data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg backdrop-blur-xl duration-200 sm:max-w-lg',
                    className,
                )}
                {...props}
                data-oid="9d7de63d64"
            />
        </AlertDialogPortal>
    );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-dialog-header"
            className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
            {...props}
            data-oid="d79f305084"
        />
    );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-dialog-footer"
            className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
            {...props}
            data-oid="15d6184b55"
        />
    );
}

function AlertDialogTitle({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
    return (
        <AlertDialogPrimitive.Title
            data-slot="alert-dialog-title"
            className={cn('text-lg font-semibold', className)}
            {...props}
            data-oid="3e78a039b4"
        />
    );
}

function AlertDialogDescription({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
    return (
        <AlertDialogPrimitive.Description
            data-slot="alert-dialog-description"
            className={cn('text-muted-foreground text-sm', className)}
            {...props}
            data-oid="50f90d9689"
        />
    );
}

function AlertDialogAction({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
    return (
        <AlertDialogPrimitive.Action
            className={cn(buttonVariants(), className)}
            {...props}
            data-oid="87dc7a4faf"
        />
    );
}

function AlertDialogCancel({
    className,
    ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
    return (
        <AlertDialogPrimitive.Cancel
            className={cn(buttonVariants({ variant: 'outline' }), className)}
            {...props}
            data-oid="3c23889aca"
        />
    );
}

export {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger,
};
