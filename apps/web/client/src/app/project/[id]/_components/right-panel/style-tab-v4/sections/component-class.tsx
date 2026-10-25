'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import type { CssModuleProperty } from '@weblab/models/actions';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { useEditorEngine } from '@/components/store/editor';
import type { CssModuleStyleInspection } from '@/components/store/editor/code';
import { CSS_MODULE_PROPERTIES } from '@/components/store/editor/code/css-module-declaration';
import { Section } from './section';

/** Source-owned class controls have an explicit shared scope and an Apply step. */
export const ComponentClassSection = observer(function ComponentClassSection() {
    const engine = useEditorEngine();
    const t = useTranslations('componentClass');
    const selected = engine.elements.selected[0];
    const branchId = selected?.branchId;
    const oid = selected?.oid;
    const frameId = selected?.frameId;
    const domId = selected?.domId;
    const mode = engine.style.mode;
    const local = branchId && engine.branches.getBranchDataById(branchId)?.branch.runtime.type === 'local';
    const [inspection, setInspection] = useState<CssModuleStyleInspection | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [revision, setRevision] = useState(0);
    const [property, setProperty] = useState<CssModuleProperty>('margin-top');
    // Keep typed values when a frame reload gives the same source a new domId,
    // or when the designer visits another selection before coming back.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [notice, setNotice] = useState<{ key: string; status: 'saved' | 'refresh' | 'failed' } | null>(null);

    useEffect(() => {
        let cancelled = false;
        setInspection(null);
        setLoading(false);
        if (!local || !branchId || !oid || !frameId || !domId || mode !== 'root') return;
        setLoading(true);
        void engine.code.inspectCssModuleStyle({ branchId, oid, frameId, domId }).then(value => {
            if (cancelled) return;
            setInspection(value);
            setProperty(previous => value.properties[previous] !== undefined ? previous
                : CSS_MODULE_PROPERTIES.find(candidate => value.properties[candidate] !== undefined) ?? 'margin-top');
        }).catch(() => { /* Unsupported source stays visibly unavailable. */ }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [engine, local, branchId, oid, frameId, domId, mode, revision]);

    if (!local || !selected || engine.elements.selected.length !== 1) return null;
    const key = inspection ? `${inspection.branchId}:${inspection.cssPath}:${inspection.className}:${property}` : '';
    const original = inspection?.properties[property] ?? '';
    const draft = drafts[key] ?? original;
    const currentNotice = notice?.key === key ? notice.status : null;
    const activeInspection = inspection?.branchId === branchId && inspection.oid === oid && inspection.frameId === frameId && inspection.domId === domId;
    const labels: Record<CssModuleProperty, string> = {
        'margin-top': t('marginTop'), 'max-width': t('maxWidth'), color: t('color'), 'font-weight': t('fontWeight'),
    };
    const refreshPending = engine.code.cssModulePreview?.branchId === branchId && engine.code.cssModulePreview.status !== 'requested';

    async function apply() {
        if (!inspection || !activeInspection || saving) return;
        const captured = inspection;
        const capturedProperty = property;
        const capturedKey = key;
        const capturedDraft = draft;
        setSaving(true);
        setNotice(null);
        try {
            const result = await engine.code.applyCssModuleStyle(captured, capturedProperty, capturedDraft);
            setDrafts(previous => {
                if (previous[capturedKey] !== capturedDraft) return previous;
                const remaining = { ...previous };
                delete remaining[capturedKey];
                return remaining;
            });
            setNotice({ key: capturedKey, status: result === 'saved' ? 'saved' : 'refresh' });
            setRevision(value => value + 1);
        } catch {
            setNotice({ key: capturedKey, status: 'failed' });
        } finally { setSaving(false); }
    }

    return (
        <Section id="component-class" title={t('title')}>
            <div className="space-y-3 px-3 pb-3">
                <p className="text-foreground-secondary text-mini">{t('allSizes')}</p>
                {loading && <p className="text-foreground-tertiary text-mini">{t('loading')}</p>}
                {!loading && !inspection && <p className="text-foreground-tertiary text-mini">{t('unavailable')}</p>}
                {inspection && <>
                    <p className="text-foreground-tertiary text-mini">{t('shared', { className: `.${inspection.className}` })}</p>
                    <label className="block space-y-1 text-mini">
                        <span className="text-foreground-secondary">{t('property')}</span>
                        <select className="bg-background-secondary border-border w-full rounded border px-2 py-1.5" value={property}
                            disabled={saving} onChange={event => { setProperty(event.target.value as CssModuleProperty); setNotice(null); }}>
                            {CSS_MODULE_PROPERTIES.filter(candidate => inspection.properties[candidate] !== undefined).map(candidate =>
                                <option key={candidate} value={candidate}>{labels[candidate]}</option>)}
                        </select>
                    </label>
                    <label className="block space-y-1 text-mini">
                        <span className="text-foreground-secondary">{t('value')}</span>
                        <Input value={draft} disabled={saving} onChange={event => {
                            const value = event.target.value;
                            setDrafts(previous => ({ ...previous, [key]: value }));
                            setNotice(null);
                        }} />
                    </label>
                    <p className="text-foreground-tertiary text-mini">{property === 'color' ? t('colorHint') : property === 'font-weight' ? t('weightHint') : t('lengthHint')}</p>
                    <Button size="sm" className="w-full" disabled={saving || !activeInspection || draft === original} onClick={() => { void apply(); }}>
                        {saving ? t('saving') : t('apply')}
                    </Button>
                </>}
                {currentNotice === 'failed' && <p role="alert" className="text-mini">{t('failed')}</p>}
                {currentNotice === 'saved' && <p role="status" className="text-foreground-tertiary text-mini">{t('saved')}</p>}
                {(currentNotice === 'refresh' || refreshPending) && <div className="space-y-2">
                    <p role="status" className="text-foreground-tertiary text-mini">{t('refreshPending')}</p>
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => {
                        if (branchId && engine.code.refreshCssModulePreview(branchId)) setNotice({ key, status: 'saved' });
                    }}>{t('refresh')}</Button>
                </div>}
            </div>
        </Section>
    );
});
