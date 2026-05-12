'use client';

import { useEffect, useRef, useState } from 'react';
import { AlignLeft } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { CmsFilterClause } from '@weblab/models';
import type { ActionElement } from '@weblab/models/actions';
import { CmsBindingKind, CmsFieldType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { toast } from '@weblab/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { Section } from './section';

/**
 * Right-panel "Content" section. Visible only when the selected element is
 * a `<div data-weblab-list>` (the CMS list marker). Lets the user configure
 * the REPEAT binding without opening the bind dialog.
 *
 * Returns null when the section is not applicable, so the accordion doesn't
 * render an empty slot.
 */
export const ContentSection = observer(function ContentSection() {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const selected = editorEngine.elements.selected[0];
    const t = useTranslations();

    const [actionElement, setActionElement] = useState<ActionElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!selected) {
            setActionElement(null);
            return;
        }
        const frameData = editorEngine.frames.get(selected.frameId);
        if (!frameData?.view) {
            setActionElement(null);
            return;
        }
        void (async () => {
            try {
                const next = await frameData.view!.getActionElement(selected.domId);
                if (!cancelled) setActionElement(next);
            } catch {
                if (!cancelled) setActionElement(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editorEngine.frames, selected]);

    const isList = !!actionElement?.attributes && 'data-weblab-list' in actionElement.attributes;

    const collectionsQuery = api.cms.collection.list.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId && isList },
    );
    const bindingsQuery = api.cms.binding.listForProject.useQuery(
        { projectId: projectId ?? '' },
        { enabled: !!projectId && isList },
    );

    const oid = selected?.oid ?? null;
    const existing = oid ? (bindingsQuery.data?.find((b) => b.oid === oid) ?? null) : null;
    const repeatBinding =
        existing && existing.binding.kind === CmsBindingKind.REPEAT ? existing.binding : null;

    const collectionId = repeatBinding?.collectionId ?? '';
    const fieldsQuery = api.cms.field.listByCollection.useQuery(
        { projectId: projectId ?? '', collectionId },
        { enabled: !!projectId && !!collectionId && isList },
    );

    const utils = api.useUtils();
    const upsertMutation = api.cms.binding.upsert.useMutation();

    if (!selected || !oid || !isList || !projectId) return null;

    const collections = collectionsQuery.data ?? [];
    const fields = fieldsQuery.data ?? [];

    const setCount = repeatBinding ? 1 : 0;

    const update = async (patch: {
        collectionId?: string;
        sort?: { fieldKey: string; direction: 'asc' | 'desc' } | null;
        limit?: number | null;
        filters?: CmsFilterClause[] | null;
        filterMode?: 'and' | 'or' | null;
    }) => {
        const next: Parameters<typeof upsertMutation.mutateAsync>[0]['binding'] = {
            kind: CmsBindingKind.REPEAT,
            collectionId: patch.collectionId ?? repeatBinding?.collectionId ?? '',
            sort:
                patch.sort === null ? undefined : (patch.sort ?? repeatBinding?.sort ?? undefined),
            limit:
                patch.limit === null
                    ? undefined
                    : (patch.limit ?? repeatBinding?.limit ?? undefined),
            filters:
                patch.filters === null
                    ? undefined
                    : (patch.filters ?? repeatBinding?.filters ?? undefined),
            filterMode:
                patch.filterMode === null
                    ? undefined
                    : (patch.filterMode ?? repeatBinding?.filterMode ?? undefined),
        };
        if (!next.collectionId) {
            toast.error(t(transKeys.cms.bind.repeat.pickCollection));
            return;
        }
        try {
            await upsertMutation.mutateAsync({ projectId, oid, binding: next });
            await utils.cms.binding.listForProject.invalidate({ projectId });
            await utils.cms.binding.snapshot.invalidate({ projectId });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t(transKeys.cms.bind.failed));
        }
    };

    const onLimitBlur = (value: string) => {
        const trimmed = value.trim();
        if (trimmed === '') {
            void update({ limit: null });
            return;
        }
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 1) {
            toast.error(t(transKeys.cms.bind.repeat.invalidLimit));
            return;
        }
        void update({ limit: n });
    };

    return (
        <Section
            id="content"
            title={t(transKeys.cms.list.contentSection)}
            icon={AlignLeft}
            setCount={setCount}
        >
            <div className="flex flex-col gap-3 px-3 py-1">
                <div className="space-y-1.5">
                    <Label
                        htmlFor="list-content-collection"
                        className="text-foreground-secondary text-mini"
                    >
                        {t(transKeys.cms.bind.repeat.collection)}
                    </Label>
                    <Select
                        value={collectionId}
                        onValueChange={(v) => void update({ collectionId: v })}
                    >
                        <SelectTrigger id="list-content-collection" className="text-mini h-7">
                            <SelectValue
                                placeholder={
                                    collections.length === 0
                                        ? t(transKeys.cms.bind.collectionEmpty)
                                        : t(transKeys.cms.bind.collectionPick)
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {collections.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label
                        htmlFor="list-content-sort"
                        className="text-foreground-secondary text-mini"
                    >
                        {t(transKeys.cms.bind.repeat.sortField)}
                    </Label>
                    <Select
                        value={repeatBinding?.sort?.fieldKey ?? ''}
                        onValueChange={(v) =>
                            void update({
                                sort: v
                                    ? {
                                          fieldKey: v,
                                          direction: repeatBinding?.sort?.direction ?? 'asc',
                                      }
                                    : null,
                            })
                        }
                        disabled={!collectionId || fields.length === 0}
                    >
                        <SelectTrigger id="list-content-sort" className="text-mini h-7">
                            <SelectValue placeholder={t(transKeys.cms.bind.repeat.sortNone)} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">
                                {t(transKeys.cms.bind.repeat.sortNone)}
                            </SelectItem>
                            {fields.map((f) => (
                                <SelectItem key={f.id} value={f.key}>
                                    {f.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {repeatBinding?.sort?.fieldKey ? (
                    <div className="space-y-1.5">
                        <Label
                            htmlFor="list-content-direction"
                            className="text-foreground-secondary text-mini"
                        >
                            {t(transKeys.cms.bind.repeat.sortDirection)}
                        </Label>
                        <Select
                            value={repeatBinding.sort.direction}
                            onValueChange={(v) =>
                                void update({
                                    sort: {
                                        fieldKey: repeatBinding.sort!.fieldKey,
                                        direction: v as 'asc' | 'desc',
                                    },
                                })
                            }
                        >
                            <SelectTrigger id="list-content-direction" className="text-mini h-7">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="asc">
                                    {t(transKeys.cms.bind.repeat.sortAsc)}
                                </SelectItem>
                                <SelectItem value="desc">
                                    {t(transKeys.cms.bind.repeat.sortDesc)}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}

                <div className="space-y-1.5">
                    <Label
                        htmlFor="list-content-limit"
                        className="text-foreground-secondary text-mini"
                    >
                        {t(transKeys.cms.bind.repeat.limit)}
                    </Label>
                    <Input
                        id="list-content-limit"
                        type="number"
                        min={1}
                        defaultValue={repeatBinding?.limit ?? ''}
                        placeholder={t(transKeys.cms.bind.repeat.limitPlaceholder)}
                        onBlur={(e) => onLimitBlur(e.target.value)}
                        className="text-mini h-7"
                    />
                </div>

                <FilterEditor
                    filters={repeatBinding?.filters ?? []}
                    filterMode={repeatBinding?.filterMode ?? 'and'}
                    fields={fields}
                    onChange={(next, mode) =>
                        void update({
                            filters: next.length === 0 ? null : next,
                            filterMode: next.length === 0 ? null : mode,
                        })
                    }
                    t={t}
                />
            </div>
        </Section>
    );
});

// ---------------------------------------------------------------------------
// Filter editor — multi-clause AND filter UI for REPEAT bindings.
// ---------------------------------------------------------------------------

interface FilterField {
    id: string;
    key: string;
    name: string;
    type: CmsFieldType;
    config?: Record<string, unknown>;
}

const TEXTUAL_TYPES = new Set<CmsFieldType>([
    CmsFieldType.TEXT,
    CmsFieldType.RICH_TEXT,
    CmsFieldType.SLUG,
]);

function opsForFieldType(type: CmsFieldType | undefined): CmsFilterClause['op'][] {
    if (!type) return ['is_set', 'is_unset'];
    if (TEXTUAL_TYPES.has(type)) {
        return ['eq', 'neq', 'contains', 'starts_with', 'is_set', 'is_unset'];
    }
    if (type === CmsFieldType.NUMBER) return ['eq', 'neq', 'is_set', 'is_unset'];
    if (type === CmsFieldType.DATE) return ['before', 'after', 'is_set', 'is_unset'];
    if (type === CmsFieldType.BOOLEAN) return ['eq', 'is_set'];
    return ['is_set', 'is_unset'];
}

function FilterEditor({
    filters,
    filterMode,
    fields,
    onChange,
    t,
}: {
    filters: CmsFilterClause[];
    filterMode: 'and' | 'or';
    fields: FilterField[];
    onChange: (next: CmsFilterClause[], mode: 'and' | 'or') => void;
    t: ReturnType<typeof import('next-intl').useTranslations>;
}) {
    // Local copy so rapid edits don't fire one network request per keystroke.
    // Synced from parent on identity change; debounced upward on edits.
    const [localFilters, setLocalFilters] = useState<CmsFilterClause[]>(filters);
    const [localMode, setLocalMode] = useState<'and' | 'or'>(filterMode);
    const lastEmittedRef = useRef<{ filters: CmsFilterClause[]; mode: 'and' | 'or' }>({
        filters,
        mode: filterMode,
    });
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        setLocalFilters(filters);
        setLocalMode(filterMode);
        lastEmittedRef.current = { filters, mode: filterMode };
    }, [filters, filterMode]);

    useEffect(() => {
        if (
            deepEqualClauses(localFilters, lastEmittedRef.current.filters) &&
            localMode === lastEmittedRef.current.mode
        )
            return;
        const id = setTimeout(() => {
            lastEmittedRef.current = { filters: localFilters, mode: localMode };
            onChangeRef.current(localFilters, localMode);
        }, 300);
        return () => clearTimeout(id);
    }, [localFilters, localMode]);

    const replace = (index: number, next: CmsFilterClause) => {
        setLocalFilters((prev) => {
            const copy = prev.slice();
            copy[index] = next;
            return copy;
        });
    };
    const remove = (index: number) => {
        setLocalFilters((prev) => {
            const copy = prev.slice();
            copy.splice(index, 1);
            return copy;
        });
    };
    const add = () => {
        const first = fields[0];
        if (!first) return;
        const op = opsForFieldType(first.type)[0] ?? 'is_set';
        setLocalFilters((prev) => [...prev, makeDefaultClause(first.key, op)]);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Label className="text-foreground-secondary text-mini">
                    {t(transKeys.cms.filters.title)}
                </Label>
                <div className="flex items-center gap-1">
                    {localFilters.length > 1 ? (
                        <Select
                            value={localMode}
                            onValueChange={(v) => setLocalMode(v as 'and' | 'or')}
                        >
                            <SelectTrigger className="text-mini h-6 w-[60px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="and">All</SelectItem>
                                <SelectItem value="or">Any</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : null}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={add}
                        disabled={fields.length === 0}
                        className="h-6 px-1.5"
                    >
                        <Icons.Plus className="mr-1 h-3 w-3" />
                        {t(transKeys.cms.filters.add)}
                    </Button>
                </div>
            </div>
            {localFilters.length === 0 ? (
                <p className="text-foreground-tertiary text-mini">
                    {t(transKeys.cms.filters.empty)}
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {localFilters.map((clause, idx) => {
                        const field = fields.find((f) => f.key === clause.fieldKey);
                        const ops = opsForFieldType(field?.type);
                        return (
                            <li key={idx} className="flex items-center gap-1.5">
                                <Select
                                    value={clause.fieldKey}
                                    onValueChange={(key) => {
                                        const newField = fields.find((f) => f.key === key);
                                        const newOps = opsForFieldType(newField?.type);
                                        const fallbackOp = newOps[0] ?? 'is_set';
                                        replace(idx, makeDefaultClause(key, fallbackOp));
                                    }}
                                >
                                    <SelectTrigger className="text-mini h-7 flex-1">
                                        <SelectValue
                                            placeholder={t(transKeys.cms.filters.fieldPlaceholder)}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fields.map((f) => (
                                            <SelectItem key={f.id} value={f.key}>
                                                {f.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={clause.op}
                                    onValueChange={(op) =>
                                        replace(
                                            idx,
                                            coerceClause(
                                                clause.fieldKey,
                                                op as CmsFilterClause['op'],
                                                clause,
                                            ),
                                        )
                                    }
                                >
                                    <SelectTrigger className="text-mini h-7 w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ops.map((op) => (
                                            <SelectItem key={op} value={op}>
                                                {t(opLabelKey(op))}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {clause.op === 'is_set' || clause.op === 'is_unset' ? null : (
                                    <FilterValueInput
                                        // `key` forces remount when the field
                                        // or op changes so the displayed value
                                        // reflects the new clause's value.
                                        key={`${idx}-${clause.fieldKey}-${clause.op}`}
                                        clause={clause}
                                        field={field}
                                        onBlur={(value) => replace(idx, withValue(clause, value))}
                                    />
                                )}
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => remove(idx)}
                                    className="h-7 w-7"
                                    aria-label={t(transKeys.cms.filters.remove)}
                                >
                                    <Icons.CrossL className="h-3 w-3" />
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function makeDefaultClause(fieldKey: string, op: CmsFilterClause['op']): CmsFilterClause {
    if (op === 'is_set' || op === 'is_unset') return { fieldKey, op };
    if (op === 'before' || op === 'after') return { fieldKey, op, value: '' };
    if (op === 'eq' || op === 'neq') return { fieldKey, op, value: '' };
    return { fieldKey, op, value: '' };
}

function coerceClause(
    fieldKey: string,
    op: CmsFilterClause['op'],
    prev: CmsFilterClause,
): CmsFilterClause {
    const value = clauseValue(prev);
    if (op === 'is_set' || op === 'is_unset') return { fieldKey, op };
    if (op === 'before' || op === 'after') {
        return { fieldKey, op, value: typeof value === 'string' ? value : '' };
    }
    if (op === 'eq' || op === 'neq') {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return { fieldKey, op, value };
        }
        return { fieldKey, op, value: '' };
    }
    return { fieldKey, op, value: typeof value === 'string' ? value : '' };
}

function clauseValue(clause: CmsFilterClause): string | number | boolean | undefined {
    return 'value' in clause ? clause.value : undefined;
}

function withValue(clause: CmsFilterClause, raw: string): CmsFilterClause {
    if (clause.op === 'is_set' || clause.op === 'is_unset') return clause;
    if (clause.op === 'before' || clause.op === 'after') {
        return { fieldKey: clause.fieldKey, op: clause.op, value: raw };
    }
    if (clause.op === 'contains' || clause.op === 'starts_with') {
        return { fieldKey: clause.fieldKey, op: clause.op, value: raw };
    }
    // eq / neq accept string|number|boolean — keep as string in the UI.
    return { fieldKey: clause.fieldKey, op: clause.op, value: raw };
}

function opLabelKey(op: CmsFilterClause['op']) {
    switch (op) {
        case 'eq':
            return transKeys.cms.filters.opEq;
        case 'neq':
            return transKeys.cms.filters.opNeq;
        case 'before':
            return transKeys.cms.filters.opBefore;
        case 'after':
            return transKeys.cms.filters.opAfter;
        case 'contains':
            return transKeys.cms.filters.opContains;
        case 'starts_with':
            return transKeys.cms.filters.opStartsWith;
        case 'is_set':
            return transKeys.cms.filters.opIsSet;
        case 'is_unset':
            return transKeys.cms.filters.opIsUnset;
    }
}

function deepEqualClauses(a: CmsFilterClause[], b: CmsFilterClause[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        // Clauses are flat objects with 2-3 primitive keys; JSON compare is
        // simpler than enumerating each variant.
        if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
    }
    return true;
}

/**
 * Renders the right input for the clause's value:
 *   - date/datetime → datetime-local
 *   - option (with config.options) → select
 *   - reference (with config.collectionId) → text input (full reference
 *     picker is a follow-up — needs an items query in this scope)
 *   - boolean → select true/false
 *   - number → number input
 *   - default → text input
 */
function FilterValueInput({
    clause,
    field,
    onBlur,
}: {
    clause: CmsFilterClause;
    field: FilterField | undefined;
    onBlur: (value: string) => void;
}) {
    const initial = String(
        clauseValue(clause) === undefined || clauseValue(clause) === null
            ? ''
            : clauseValue(clause),
    );
    const [draft, setDraft] = useState(initial);

    if (clause.op === 'is_set' || clause.op === 'is_unset') return null;

    if (clause.op === 'before' || clause.op === 'after') {
        return (
            <Input
                type="datetime-local"
                value={toDatetimeLocal(draft)}
                onChange={(e) => setDraft(fromDatetimeLocal(e.target.value))}
                onBlur={() => onBlur(draft)}
                className="text-mini h-7 flex-1"
            />
        );
    }

    if (field?.type === CmsFieldType.BOOLEAN && (clause.op === 'eq' || clause.op === 'neq')) {
        return (
            <Select
                value={draft || 'true'}
                onValueChange={(v) => {
                    setDraft(v);
                    onBlur(v);
                }}
            >
                <SelectTrigger className="text-mini h-7 flex-1">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="true">true</SelectItem>
                    <SelectItem value="false">false</SelectItem>
                </SelectContent>
            </Select>
        );
    }

    if (field?.type === CmsFieldType.OPTION) {
        const config = (field as { config?: Record<string, unknown> }).config ?? {};
        const options = readOptionList(config);
        if (options.length > 0) {
            return (
                <Select
                    value={draft}
                    onValueChange={(v) => {
                        setDraft(v);
                        onBlur(v);
                    }}
                >
                    <SelectTrigger className="text-mini h-7 flex-1">
                        <SelectValue placeholder="Pick…" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }
    }

    return (
        <Input
            type={field?.type === CmsFieldType.NUMBER ? 'number' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onBlur(draft)}
            className="text-mini h-7 flex-1"
        />
    );
}

function readOptionList(config: Record<string, unknown>): { value: string; label: string }[] {
    const raw = config.options;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry: unknown) => {
            if (!entry || typeof entry !== 'object') return null;
            const obj = entry as Record<string, unknown>;
            const value = typeof obj.value === 'string' ? obj.value : null;
            if (!value) return null;
            const label = typeof obj.label === 'string' ? obj.label : value;
            return { value, label };
        })
        .filter((x): x is { value: string; label: string } => x !== null);
}

/** ISO-or-date-only → value attribute for `<input type="datetime-local">`. */
function toDatetimeLocal(value: string): string {
    if (!value) return '';
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
    if (!value) return '';
    // datetime-local has no timezone — interpret as local then emit ISO so
    // both sides of the date comparator parse consistently.
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return value;
    return new Date(ms).toISOString();
}
