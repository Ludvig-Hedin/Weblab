'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { usePaginatedQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import type { Doc, Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Switch } from '@weblab/ui/switch';
import { Textarea } from '@weblab/ui/textarea';
import { transKeys } from '@/i18n/keys';

interface FieldProps {
    projectId: Id<'projects'>;
    field: Doc<'cmsFields'>;
    value: unknown;
    disabled: boolean;
    onChange: (value: unknown) => void;
}
interface FieldConfig { options?: string[]; multiple?: boolean; collectionId?: string; format?: string }
export function ItemField({ projectId, field, value, disabled, onChange }: FieldProps) {
    const t = useTranslations();
    const id = `field-${field._id}`;
    const config = (field.config ?? {}) as FieldConfig;
    const string = typeof value === 'string' ? value : '';
    if (field.type === 'image') {
        const image = value && typeof value === 'object' ? value as { url?: string; alt?: string; path?: string } : {};
        return <div className="space-y-2">
            <Input id={id} type="url" disabled={disabled} aria-label={t(transKeys.cms.readiness.imageUrl)} value={image.url ?? ''}
                placeholder="https://" onChange={(event) => onChange(event.target.value ? { ...image, url: event.target.value } : null)} />
            <Input disabled={disabled || !image.url} aria-label={t(transKeys.cms.readiness.imageAlt)} placeholder={t(transKeys.cms.readiness.imageAlt)} value={image.alt ?? ''}
                onChange={(event) => onChange({ ...image, alt: event.target.value })} />
        </div>;
    }
    if (field.type === 'option') {
        const options = Array.isArray(config.options) ? config.options.filter((option) => typeof option === 'string' && option.length > 0) : [];
        if (!options.length) return <p className="text-foreground-secondary text-mini">{t(transKeys.cms.readiness.configureOptions)}</p>;
        return <ChoiceField id={id} value={value} options={options.map((option) => ({ id: option, label: option }))} multiple={config.multiple === true} disabled={disabled} onChange={onChange} />;
    }
    if (field.type === 'reference') {
        return <ReferenceField {...{ projectId, field, value, disabled, onChange }} />;
    }
    if (field.type === 'boolean') return <Switch id={id} disabled={disabled} checked={value === true} onCheckedChange={onChange} />;
    if (field.type === 'rich_text') return <Textarea id={id} disabled={disabled} rows={5} value={string} onChange={(event) => onChange(event.target.value)} />;
    if (field.type === 'number') return <Input id={id} disabled={disabled} type="number" value={typeof value === 'number' ? value : ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />;
    if (field.type === 'date') return <Input id={id} disabled={disabled} type="date" value={string.slice(0, 10)} onChange={(event) => onChange(event.target.value || null)} />;
    return <Input id={id} disabled={disabled} type={config.format === 'url' ? 'url' : 'text'} value={string} onChange={(event) => onChange(event.target.value || null)} />;
}

function ChoiceField({ id, value, options, multiple, disabled, onChange }: { id: string; value: unknown; options: { id: string; label: string }[]; multiple: boolean; disabled: boolean; onChange: (value: unknown) => void }) {
    const t = useTranslations();
    const chosen = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : [];
    const missing = chosen.filter((item) => !options.some((option) => option.id === item));
    if (multiple) return <div id={id} className="space-y-2">
        {[...options, ...missing.map((item) => ({ id: item, label: t(transKeys.cms.readiness.unavailableSelection) }))].map((option) => <label key={option.id} className="text-mini flex items-center gap-2">
            <Checkbox disabled={disabled} checked={chosen.includes(option.id)} onCheckedChange={(checked) => onChange(checked ? [...chosen, option.id] : chosen.filter((item) => item !== option.id))} />{option.label}
        </label>)}
    </div>;
    return <div className="flex items-center gap-2"><Select disabled={disabled} value={chosen[0] ?? ''} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue placeholder={t(transKeys.cms.readiness.chooseValue)} /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
            {missing.map((item) => <SelectItem key={item} value={item} disabled>{t(transKeys.cms.readiness.unavailableSelection)}</SelectItem>)}
        </SelectContent>
    </Select><Button type="button" size="sm" variant="ghost" disabled={disabled || !chosen.length} onClick={() => onChange(null)}>{t(transKeys.cms.readiness.clear)}</Button></div>;
}

function ReferenceField({ projectId, field, value, disabled, onChange }: FieldProps) {
    const t = useTranslations();
    const config = (field.config ?? {}) as FieldConfig;
    const collectionId = config.collectionId;
    const { results, status, loadMore } = usePaginatedQuery(api.cmsItems.listPage,
        collectionId ? { projectId, collectionId: collectionId as Id<'cmsCollections'> } : 'skip', { initialNumItems: 50 });
    const [search, setSearch] = useState('');
    if (!collectionId) return <p className="text-foreground-secondary text-mini">{t(transKeys.cms.readiness.configureReference)}</p>;
    const options = results.map((item) => {
        const values = item.values as Record<string, unknown>;
        const title = Object.values(values).find((entry) => typeof entry === 'string' && entry.length > 0);
        return { id: item._id, label: item.slug || (typeof title === 'string' ? title : item._id) };
    }).filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));
    return <div className="space-y-2">
        <Input disabled={disabled} aria-label={t(transKeys.cms.readiness.searchLoaded)} placeholder={t(transKeys.cms.readiness.searchLoaded)} value={search} onChange={(event) => setSearch(event.target.value)} />
        <ChoiceField id={`field-${field._id}`} {...{ value, options, disabled, onChange }} multiple={config.multiple === true} />
        {status === 'CanLoadMore' ? <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => loadMore(50)}>{t(transKeys.cms.readiness.loadMore)}</Button> : null}
    </div>;
}
