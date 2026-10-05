'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import type { CloudEditorScope } from '@/lib/cloud-editor/api';
import { cloudStudioApi, useCloudStudioCopy, type CloudStudioOnOperation, type StudioOperation } from './studio-api';

export interface CloudStudioTemplatesPanelProps {
    scope: CloudEditorScope; disabled?: boolean; onOperation: CloudStudioOnOperation;
    selection?: { path: string; oid: string } | null;
}
/** The parent owns exclusive source admission, durable retry identity and receipt-driven reload. */
export function CloudStudioTemplatesPanel({ scope, disabled = false, onOperation, selection }: CloudStudioTemplatesPanelProps) {
    const copy = useCloudStudioCopy();
    const data = useQuery(cloudStudioApi.get, scope);
    const [slug, setSlug] = useState('');
    const [slotId, setSlotId] = useState('');
    const [block, setBlock] = useState<'text-v1' | 'callout-v1'>('text-v1');
    const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
    if (!data) return <p className="text-foreground-secondary text-xs">{copy.loading}</p>;
    const settings = data.settings;
    const locked = disabled || busy;
    const run = async (operation: StudioOperation) => {
        if (locked) return;
        setBusy(true); setFailed(false);
        try { await onOperation({ kind: 'structure', actorId: data.actorId, expectedRevision: data.revision,
            expectedGeneration: settings?.generation ?? 0, operation }); }
        catch { setFailed(true); }
        finally { setBusy(false); }
    };
    const configure = (change: Partial<{ active: boolean; allowPages: boolean; allowedBlocks: Array<'text-v1' | 'callout-v1'> }>) => {
        if (settings) void run({ kind: 'configure', active: settings.active, allowPages: settings.allowPages, allowedBlocks: settings.allowedBlocks, ...change });
    };
    const slot = settings?.slots.find(entry => entry.id === slotId) ?? settings?.slots[0];
    const blockLabel = (value: 'text-v1' | 'callout-v1') => value === 'text-v1' ? copy.textBlock : copy.calloutBlock;
    const available = slot?.allowedBlocks.filter(value => settings?.allowedBlocks.includes(value)) ?? [];
    const selectedBlock = available.includes(block) ? block : available[0];
    return <section className="space-y-4 p-3" aria-label={copy.templates}>
        <h3 className="text-sm font-medium">{copy.templates}</h3>
        {failed && <p role="alert" className="text-destructive text-xs">{copy.error}</p>}
        {busy && <p role="status" className="text-foreground-secondary text-xs">{copy.working}</p>}
        {!settings ? data.canDesign ? <Button size="sm" disabled={locked} onClick={() => void run({ kind: 'install' })}>{copy.install}</Button>
            : <p className="text-foreground-secondary text-xs">{copy.notConfigured}</p> : <>
            {data.canDesign && <div className="space-y-3 border-b pb-4">
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={settings.allowPages} disabled={locked} onCheckedChange={checked => configure({ allowPages: checked === true })} />{copy.allowPages}</label>
                {(['text-v1', 'callout-v1'] as const).map(value => <label key={value} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={settings.allowedBlocks.includes(value)} disabled={locked} onCheckedChange={checked => configure({ allowedBlocks: checked === true ? [...settings.allowedBlocks, value] : settings.allowedBlocks.filter(item => item !== value) })} />
                    {value === 'text-v1' ? copy.allowText : copy.allowCallout}</label>)}
                <Button size="sm" variant="ghost" disabled={locked} onClick={() => configure({ active: !settings.active })}>{settings.active ? copy.pause : copy.resume}</Button>
            </div>}
            {!settings.active ? <p className="text-foreground-secondary text-xs">{copy.paused}</p> : <>
                {settings.allowPages && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void run({ kind: 'createPage', slug }); }}>
                    <label className="space-y-1 text-xs"><span>{copy.pageSlug}</span><Input value={slug} onChange={event => setSlug(event.target.value)} disabled={locked} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" required placeholder="about-the-studio" /></label>
                    <Button size="sm" type="submit" disabled={locked || !slug}>{copy.createPage}</Button>
                </form>}
                {slot && <div className="space-y-3 border-t pt-4">
                    <Select value={slot.id} onValueChange={setSlotId} disabled={locked}><SelectTrigger aria-label={copy.approvedSlot}><SelectValue /></SelectTrigger><SelectContent>
                        {settings.slots.map((entry, index) => <SelectItem key={entry.id} value={entry.id}>{copy.slot} {index + 1} · {entry.path.replace(/^src\/app/, '').replace(/\/page\.tsx$/, '') || '/'}</SelectItem>)}
                    </SelectContent></Select>
                    {slot.instances.map((instance, index) => <div key={instance.id} className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="mr-auto">{blockLabel(instance.block)} {index + 1}</span>
                        <Button size="xs" variant="ghost" disabled={locked || index === 0} onClick={() => void run({ kind: 'moveBlock', slotId: slot.id, instanceId: instance.id, position: index - 1 })}>{copy.moveUp}</Button>
                        <Button size="xs" variant="ghost" disabled={locked || index === slot.instances.length - 1} onClick={() => void run({ kind: 'moveBlock', slotId: slot.id, instanceId: instance.id, position: index + 1 })}>{copy.moveDown}</Button>
                        <Button size="xs" variant="ghost" disabled={locked || slot.instances.length <= slot.min} onClick={() => void run({ kind: 'removeBlock', slotId: slot.id, instanceId: instance.id })}>{copy.remove}</Button>
                    </div>)}
                    {selectedBlock && <><Select value={selectedBlock} onValueChange={value => { if (value === 'text-v1' || value === 'callout-v1') setBlock(value); }} disabled={locked}><SelectTrigger aria-label={copy.chooseBlock}><SelectValue /></SelectTrigger><SelectContent>
                        {available.map(value => <SelectItem key={value} value={value}>{blockLabel(value)}</SelectItem>)}
                    </SelectContent></Select><Button size="sm" disabled={locked || slot.instances.length >= slot.max} onClick={() => void run({ kind: 'insertBlock', slotId: slot.id, block: selectedBlock, position: slot.instances.length })}>{copy.addBlock}</Button></>}
                </div>}
                {data.canDesign && <div className="space-y-2 border-t pt-3"><Button size="sm" variant="outline" disabled={locked || !selection || !settings.allowedBlocks.length} onClick={() => {
                    if (selection) void run({ kind: 'approveSlot', path: selection.path.replace(/^\/+/, ''), parentOid: selection.oid, allowedBlocks: settings.allowedBlocks, min: 0, max: 10 });
                }}>{copy.approveSlot}</Button>{!slot && <p className="text-foreground-secondary text-xs">{copy.emptySlots}</p>}</div>}
            </>}
        </>}
    </section>;
}
