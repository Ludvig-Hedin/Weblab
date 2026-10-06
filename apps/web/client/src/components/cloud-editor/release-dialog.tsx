'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useLocale } from 'next-intl';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import { CloudReleases } from './releases';
import { sourceProfileCapabilities } from '@convex/lib/cloudImportManifest';
import en from '../../../messages/cloud-releases/en.json';
import sv from '../../../messages/cloud-releases/sv.json';

export const CloudReleaseDialog = observer(({ source }: { source: CloudSource }) => {
    const [open, setOpen] = useState(false);
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const imported = source.state.profile === 'imported-next-v1';
    const title = imported ? copy.importedVersionsTitle : copy.title;
    if (!source.state.accessReady || source.state.loading || (!sourceProfileCapabilities(source.state.profile).release && !(imported && source.canDesign))) return null;
    return <Dialog open={open} onOpenChange={setOpen}>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{title}</Button>
        <DialogContent closeLabel={copy.closeRemoval} className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
            <CloudReleases {...source.scope} hideTitle captureDisabled={!source.canWrite || source.hasLocalWork || source.hasPendingChanges} />
        </DialogContent>
    </Dialog>;
});
