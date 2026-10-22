'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@weblab/ui/dialog';
import { SanityBlogWorkspace } from './workspace';
import { useWorkingLevelActive } from '@/components/working-level/editor-gate';

/** Opening or closing Blog never disposes the mounted Full editor. */
export function SanityBlogDialog({ projectId, branchId }: { projectId: string; branchId: string }) {
    const t = useTranslations('sanityBlog');
    const [open, setOpen] = useState(false);
    const active = useWorkingLevelActive();
    const prepareClose = useRef<(() => boolean) | null>(null);
    const close = () => { if (prepareClose.current?.() !== false) setOpen(false); };
    return <>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{t('title')}</Button>
        <Dialog open={open && active} onOpenChange={(next) => { if (next) setOpen(true); else close(); }}>
            <DialogContent className="bg-background h-[90vh] max-h-[900px] gap-0 overflow-auto p-0 sm:max-w-6xl [&>button:last-child]:hidden">
                <DialogTitle className="sr-only">{t('title')}</DialogTitle>
                <DialogDescription className="sr-only">{t('draftOnly')}</DialogDescription>
                <SanityBlogWorkspace projectId={projectId} branchId={branchId} prepareCloseRef={prepareClose} onClose={close} />
            </DialogContent>
        </Dialog>
    </>;
}
