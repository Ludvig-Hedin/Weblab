'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { matchesPublicationPin, type ContentSelection, type ContentStatus, type PublicationDraft } from '@/lib/sanity-publication-selection';

export function SanityPublicationSelection({ rows, selected, status, busy, hasMore, onToggle, onMore, onPrepare, onResume, onRecover }: {
    rows: PublicationDraft[]; selected: ContentSelection[]; status: ContentStatus | null;
    busy: boolean; hasMore: boolean;
    onToggle(row: PublicationDraft, checked: boolean): void;
    onMore(): void; onPrepare(): void; onResume(): void; onRecover(): void;
}) {
    const t = useTranslations('editor.publishing.content');
    const stale = rows.some(row => {
        const pin = selected.find(item => item.draftId === row.id);
        return pin && !matchesPublicationPin(row, pin);
    });
    const pending = status?.status === 'pending';
    const prepared = status?.status === 'prepared';
    return <section className="space-y-3 border-t pt-3">
        <h3 className="font-medium">{t('title')}</h3>
        <p>{t('description')}</p>
        <p className="text-foreground-tertiary">{t('limits')}</p>
        {rows.length === 0 && <p>{t('noDrafts')}</p>}
        {rows.map(row => {
            const pin = selected.find(item => item.draftId === row.id);
            const changed = !!pin && !matchesPublicationPin(row, pin);
            return <label key={row.id} className="flex items-start gap-2">
                <Checkbox className="mt-1" checked={!!pin} disabled={busy || pending || (!pin && selected.length >= 8)} onCheckedChange={value => onToggle(row, value === true)} />
                <span className="min-w-0"><span className="block break-words">{row.title}</span><span className="block break-all text-foreground-tertiary">{row.slug}</span>{row.archived && <span className="block">{t('archive')}</span>}{changed && <span className="block text-red-400">{t('stale')}</span>}</span>
            </label>;
        })}
        <p>{t('selected', { count: String(selected.length) })}</p>
        {hasMore && <Button variant="ghost" size="sm" disabled={busy || pending} onClick={onMore}>{t('more')}</Button>}
        {status?.status === 'complete' && <p role="status">{t('complete')}</p>}
        {status?.status === 'needsPreparation' && <p role="status">{t('needsPreparation')}</p>}
        {prepared && <p role="status">{t('prepared')}</p>}
        {pending ? <><p role="status">{t('pending')}</p><Button disabled={busy} onClick={onResume}>{t('resume')}</Button><p className="text-foreground-tertiary">{t('recoveryDescription')}</p><Button variant="outline" disabled={busy} onClick={onRecover}>{t('recover')}</Button></> : <Button variant="outline" disabled={busy || stale} onClick={onPrepare}>{t('prepare')}</Button>}
    </section>;
}
