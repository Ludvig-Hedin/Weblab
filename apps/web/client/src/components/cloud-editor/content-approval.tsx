'use client';

import type { ReactNode } from 'react';
import { Component, useEffect, useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Checkbox } from '@weblab/ui/checkbox';
import { Input } from '@weblab/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Textarea } from '@weblab/ui/textarea';

import type { CloudSource } from '@/components/store/editor/sandbox/cloud-source';
import type { CloudEditorScope } from '@/lib/cloud-editor/api';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { cloudContentApi } from './content-api';
import { CloudImageUpload, useCloudImageCopy } from './image-upload';

export type CloudAttributeField = 'src' | 'alt' | 'href' | 'className';
type Field = 'text' | CloudAttributeField;
type Binding = {
    oid: string;
    fields: Field[];
    allowImageUploads?: boolean;
    allowedValues?: { src?: string[]; href?: string[] };
    choices?: Record<string, string>;
    choiceLabels?: Record<string, string>;
};
export type CloudContentSelection = {
    scopeKey: string;
    oid: string;
    path: string;
    revision: number;
    tag: string;
    attributes: Record<string, string>;
    plainText: boolean;
    unsupportedReason?: string;
};
type AssetReader = (url: string) => Promise<Blob | null>;
type ApprovalOptions = {
    allowImageUploads?: boolean;
    values?: string[];
    choices?: Record<string, string>;
    choiceLabels?: Record<string, string>;
};
type EditAttribute = (
    field: CloudAttributeField,
    value: string,
    generation: number,
    revision: number,
) => Promise<boolean>;
type Props = {
    source: CloudSource;
    scope: CloudEditorScope;
    selection: CloudContentSelection | null;
    onEditText: () => void;
    onEditAttribute: EditAttribute;
    onUploadImage: (file: File, generation: number, revision: number) => Promise<boolean>;
    readAsset: AssetReader;
    onDraftChange: (selection: CloudContentSelection | null) => void;
    draftPinned: boolean;
};

/** Replace only this field; approvals for other fields and other elements survive. */
function replaceField(
    binding: Binding | undefined,
    oid: string,
    field: Field,
    enabled: boolean,
    options?: ApprovalOptions,
): Binding | null {
    const fields = (binding?.fields ?? []).filter((value) => value !== field);
    if (enabled) fields.push(field);
    if (!fields.length) return null;
    const allowedValues = { ...binding?.allowedValues };
    if (field === 'src' || field === 'href') {
        delete allowedValues[field];
        if (enabled) allowedValues[field] = options?.values ?? [];
    }
    const choices =
        field === 'className' ? (enabled ? options?.choices : undefined) : binding?.choices;
    const choiceLabels =
        field === 'className'
            ? enabled
                ? options?.choiceLabels
                : undefined
            : binding?.choiceLabels;
    return {
        oid,
        fields,
        ...(Object.keys(allowedValues).length ? { allowedValues } : {}),
        ...(fields.includes('src') && (options?.allowImageUploads ?? binding?.allowImageUploads) ? { allowImageUploads: true } : {}),
        ...(choices ? { choices } : {}),
        ...(choiceLabels ? { choiceLabels } : {}),
    };
}

function AssetThumbnail({ url, readAsset }: { url: string; readAsset: AssetReader }) {
    const [preview, setPreview] = useState<string | null>(null);
    useEffect(() => {
        let current = true;
        let objectUrl: string | null = null;
        setPreview(null);
        void readAsset(url)
            .then((blob) => {
                if (!current || !blob) return;
                objectUrl = URL.createObjectURL(blob);
                setPreview(objectUrl);
            })
            .catch(() => undefined);
        return () => {
            current = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url, readAsset]);
    return (
        <span className="bg-background-secondary flex h-16 w-full items-center justify-center overflow-hidden rounded-sm">
            {preview ? (
                <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-contain"
                    onError={() => setPreview(null)}
                />
            ) : (
                <span className="text-foreground-tertiary text-xs">
                    {url.split('.').pop()?.toUpperCase()}
                </span>
            )}
        </span>
    );
}

function AttributeControl({
    field,
    label,
    options,
    value,
    generation,
    revision,
    disabled,
    onEdit,
    readAsset,
    source,
    selection,
    onDraftChange,
}: {
    source: CloudSource;
    selection: CloudContentSelection;
    onDraftChange: (selection: CloudContentSelection | null) => void;
    field: CloudAttributeField;
    label: string;
    options?: Array<{ id?: string; label: string; value: string }>;
    value: string;
    generation: number;
    revision: number;
    disabled: boolean;
    onEdit: EditAttribute;
    readAsset: AssetReader;
}) {
    const copy = useCloudEditorCopy();
    const storageKey = `weblab:cloud-attribute-draft:v1:${JSON.stringify([selection.scopeKey, selection.path, selection.oid, field])}`;
    const [draft, setDraft] = useState({ value, generation, revision });
    const [dirty, setDirty] = useState(false);
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [storageFailed, setStorageFailed] = useState(false);
    const dirtyRef = useRef(false);
    const saving = useRef(false);
    const mounted = useRef(true);
    const stale =
        dirty && (draft.generation !== generation || draft.revision !== source.state.savedRevision);
    function persist(next: typeof draft | null) {
        try {
            if (next) {
                const prefix = 'weblab:cloud-attribute-draft:v1:';
                let count = 0;
                for (let i = 0; i < sessionStorage.length; i++) {
                    if (sessionStorage.key(i)?.startsWith(prefix)) count++;
                }
                if (count >= 20 && sessionStorage.getItem(storageKey) === null)
                    throw new Error('Draft limit');
                sessionStorage.setItem(storageKey, JSON.stringify(next));
            } else sessionStorage.removeItem(storageKey);
            setStorageFailed(false);
            return true;
        } catch {
            setStorageFailed(true);
            return false;
        }
    }
    useEffect(() => {
        mounted.current = true;
        if (field !== 'alt') return;
        const release = source.registerLocalWork(() => dirtyRef.current);
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (dirtyRef.current || saving.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', beforeUnload);
        try {
            const raw = sessionStorage.getItem(storageKey);
            if (raw) {
                if (raw.length > 8000) throw new Error('Invalid draft');
                const restored: unknown = JSON.parse(raw);
                if (
                    !restored ||
                    typeof restored !== 'object' ||
                    !('value' in restored) ||
                    typeof restored.value !== 'string' ||
                    restored.value.length > 1000 ||
                    !('generation' in restored) ||
                    typeof restored.generation !== 'number' ||
                    !Number.isSafeInteger(restored.generation) ||
                    !('revision' in restored) ||
                    typeof restored.revision !== 'number' ||
                    !Number.isSafeInteger(restored.revision)
                )
                    throw new Error('Invalid draft');
                setDraft({
                    value: restored.value,
                    generation: restored.generation,
                    revision: restored.revision,
                });
                dirtyRef.current = true;
                setDirty(true);
                onDraftChange(selection);
            }
        } catch {
            setStorageFailed(true);
        }
        return () => {
            mounted.current = false;
            release();
            window.removeEventListener('beforeunload', beforeUnload);
        };
        // This component is keyed by immutable actor/project/branch/path/OID/field identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, storageKey]);
    useEffect(() => {
        if (!dirtyRef.current) setDraft({ value, generation, revision });
    }, [value, generation, revision, dirty]);
    async function save(next: string, expectedGeneration: number, expectedRevision: number) {
        if (disabled || saving.current || stale) return;
        saving.current = true;
        setPending(true);
        setFailed(false);
        // Release only this draft's guard. Other local work still blocks the action.
        dirtyRef.current = false;
        let saved = false;
        try {
            saved = await onEdit(field, next, expectedGeneration, expectedRevision);
            if (!saved) {
                if (mounted.current) setFailed(true);
                return;
            }
            if (field === 'alt' && !persist(null)) {
                saved = false;
                return;
            }
            if (mounted.current) {
                setDirty(false);
                onDraftChange(null);
            }
        } catch {
            if (mounted.current) setFailed(true);
        } finally {
            dirtyRef.current = !saved && dirty;
            saving.current = false;
            if (mounted.current) setPending(false);
        }
    }
    return (
        <div className="space-y-2">
            <label className="block space-y-1">
                <span>{label}</span>
                {field === 'src' && options ? (
                    <span className="grid grid-cols-2 gap-2">
                        {options.map((option) => (
                            <button
                                type="button"
                                key={option.value}
                                disabled={disabled || pending}
                                aria-pressed={option.value === value}
                                title={option.value}
                                className={`space-y-1 rounded-md border p-1 text-left disabled:opacity-50 ${option.value === value ? 'border-foreground' : 'border-border'}`}
                                onClick={() => {
                                    void save(option.value, generation, revision);
                                }}
                            >
                                <AssetThumbnail url={option.value} readAsset={readAsset} />
                                <span className="block truncate px-1">{option.label}</span>
                            </button>
                        ))}
                    </span>
                ) : options ? (
                    <Select
                        value={(() => {
                            const option = options.find((entry) => entry.value === value);
                            return option?.id ?? option?.value ?? '';
                        })()}
                        disabled={disabled || pending}
                        onValueChange={(next) => {
                            const option = options.find(
                                (entry) => (entry.id ?? entry.value) === next,
                            );
                            if (option) void save(option.value, generation, revision);
                        }}
                    >
                        <SelectTrigger className="w-full" size="sm" aria-label={label}>
                            <SelectValue placeholder={copy.contentChooseOption} />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((option) => (
                                <SelectItem
                                    key={option.id ?? option.value}
                                    value={option.id ?? option.value}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Input
                        value={draft.value}
                        maxLength={1000}
                        readOnly={disabled || pending || stale}
                        onChange={(event) => {
                            const next = { ...draft, value: event.target.value.slice(0, 1000) };
                            setDraft(next);
                            dirtyRef.current = true;
                            setDirty(true);
                            onDraftChange(selection);
                            persist(next);
                            setFailed(false);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void save(draft.value, draft.generation, draft.revision);
                            }
                        }}
                    />
                )}
            </label>
            {!options && dirty && (
                <div className="flex gap-1">
                    <Button
                        size="xs"
                        loading={pending}
                        disabled={disabled || pending || stale}
                        onClick={() => {
                            void save(draft.value, draft.generation, draft.revision);
                        }}
                    >
                        {copy.memberSave}
                    </Button>
                    <Button
                        size="xs"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                            if (!persist(null)) return;
                            dirtyRef.current = false;
                            setDirty(false);
                            setFailed(false);
                            onDraftChange(null);
                        }}
                    >
                        {copy.contentDiscardDraft}
                    </Button>
                </div>
            )}
            {stale && <p role="alert">{copy.contentDraftStale}</p>}
            {storageFailed && (
                <p role="alert" className="text-destructive">
                    {copy.contentDraftStorageFailed}
                </p>
            )}
            {failed && (
                <p role="alert" className="text-destructive">
                    {copy.contentAttributeFailed}
                </p>
            )}
        </div>
    );
}

function ApprovalSettings({
    scope,
    selection,
    binding,
    busy,
    onChange,
    readAsset,
}: {
    scope: CloudEditorScope;
    selection: CloudContentSelection;
    binding?: Binding;
    busy: boolean;
    readAsset: AssetReader;
    onChange: (field: Field, enabled: boolean, options?: ApprovalOptions) => Promise<void>;
}) {
    const copy = useCloudEditorCopy();
    const imageCopy = useCloudImageCopy();
    const assets = useQuery(cloudContentApi.assets, selection.tag === 'img' ? scope : 'skip');
    const [images, setImages] = useState(
        binding?.allowedValues?.src ?? (selection.attributes.src ? [selection.attributes.src] : []),
    );
    const [links, setLinks] = useState(
        (
            binding?.allowedValues?.href ??
            (selection.attributes.href ? [selection.attributes.href] : [])
        ).join('\n'),
    );
    const [variantName, setVariantName] = useState('');
    const enabled = (field: Field) => binding?.fields.includes(field) === true;
    const choices = binding?.choices ?? {};
    const choiceLabels = binding?.choiceLabels ?? {};
    const currentClasses = selection.attributes.className;
    const linkValues = [
        ...new Set(
            links
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean),
        ),
    ];
    const validName =
        variantName.trim().length > 0 &&
        variantName.trim().length <= 80 &&
        !/[\u0000-\u001f\u007f]/.test(variantName) &&
        !['__proto__', 'constructor', 'prototype'].includes(variantName.trim()) &&
        !Object.values(choiceLabels).includes(variantName.trim());
    const approve = (field: Field, values?: string[]) => {
        void onChange(field, true, values ? { values } : undefined);
    };
    const lock = (field: Field) => {
        void onChange(field, false);
    };
    return (
        <div className="space-y-4">
            {enabled('src') && <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={binding?.allowImageUploads === true} disabled={busy}
                    onCheckedChange={checked => void onChange('src', true, { values: binding?.allowedValues?.src ?? [], allowImageUploads: checked === true })} />
                {imageCopy.allow}
            </label>}
            {selection.plainText && (
                <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => {
                        void onChange('text', !enabled('text'));
                    }}
                >
                    {enabled('text') ? copy.contentRemoveApproval : copy.contentAllow}
                </Button>
            )}
            {selection.tag === 'img' && selection.attributes.src !== undefined && (
                <div className="space-y-2">
                    <h3 className="font-medium">{copy.contentImageChoices}</h3>
                    <p className="text-foreground-secondary">{copy.contentExistingImagesOnly}</p>
                    {assets === undefined ? (
                        <p role="status">{copy.loading}</p>
                    ) : (
                        <>
                            {assets.assets.length === 0 && (
                                <p className="text-foreground-secondary">{copy.contentNoImages}</p>
                            )}
                            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                                {assets.assets.map((asset) => (
                                    <label
                                        key={asset.url}
                                        className="space-y-1 rounded-md border p-1"
                                    >
                                        <AssetThumbnail url={asset.url} readAsset={readAsset} />
                                        <span className="flex items-center gap-1 px-1">
                                            <Checkbox
                                                checked={images.includes(asset.url)}
                                                disabled={
                                                    busy || asset.url === selection.attributes.src
                                                }
                                                onCheckedChange={(checked) =>
                                                    setImages((current) =>
                                                        checked === true
                                                            ? [...new Set([...current, asset.url])]
                                                            : current.filter(
                                                                  (value) => value !== asset.url,
                                                              ),
                                                    )
                                                }
                                            />
                                            <span className="min-w-0 truncate" title={asset.url}>
                                                {asset.path.replace(/^public\//, '')}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            {!assets.assets.some(
                                (asset) => asset.url === selection.attributes.src,
                            ) && (
                                <p className="text-foreground-secondary">
                                    {copy.contentCurrentImageUnavailable}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-1">
                                <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={
                                        busy ||
                                        !images.length ||
                                        assets.revision !== selection.revision ||
                                        !assets.assets.some(
                                            (asset) => asset.url === selection.attributes.src,
                                        )
                                    }
                                    onClick={() => approve('src', images)}
                                >
                                    {copy.contentSaveImageChoices}
                                </Button>
                                {enabled('src') && (
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => lock('src')}
                                    >
                                        {copy.contentLockField}
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
            {selection.tag === 'img' && selection.attributes.alt !== undefined && (
                <label className="flex items-center gap-2">
                    <Checkbox
                        checked={enabled('alt')}
                        disabled={busy}
                        onCheckedChange={(checked) => {
                            void onChange('alt', checked === true);
                        }}
                    />
                    {copy.contentAllowAlt}
                </label>
            )}
            {selection.tag === 'a' && selection.attributes.href !== undefined && (
                <div className="space-y-2">
                    <label className="block space-y-1">
                        <span className="font-medium">{copy.contentLinkChoices}</span>
                        <Textarea
                            value={links}
                            disabled={busy}
                            onChange={(event) => setLinks(event.target.value)}
                            rows={3}
                            aria-label={copy.contentLinkChoices}
                        />
                    </label>
                    <p className="text-foreground-secondary">{copy.contentLinkChoicesHint}</p>
                    <div className="flex flex-wrap gap-1">
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={busy || !linkValues.includes(selection.attributes.href)}
                            onClick={() => approve('href', linkValues)}
                        >
                            {copy.contentSaveLinkChoices}
                        </Button>
                        {enabled('href') && (
                            <Button
                                size="xs"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => lock('href')}
                            >
                                {copy.contentLockField}
                            </Button>
                        )}
                    </div>
                </div>
            )}
            {currentClasses !== undefined && (
                <div className="space-y-2">
                    <h3 className="font-medium">{copy.contentVariants}</h3>
                    <p className="text-foreground-secondary">{copy.contentCaptureVariantHint}</p>
                    {Object.keys(choices).length > 0 && (
                        <ul className="space-y-1">
                            {Object.entries(choices).map(([name, value]) => (
                                <li key={name} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{choiceLabels[name] ?? name}</span>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={busy || value === currentClasses}
                                        onClick={() => {
                                            const remaining = Object.fromEntries(
                                                Object.entries(choices).filter(
                                                    ([key]) => key !== name,
                                                ),
                                            );
                                            void onChange(
                                                'className',
                                                Object.keys(remaining).length > 0,
                                                {
                                                    choices: remaining,
                                                    choiceLabels: Object.fromEntries(
                                                        Object.entries(choiceLabels).filter(
                                                            ([key]) => key !== name,
                                                        ),
                                                    ),
                                                },
                                            );
                                        }}
                                    >
                                        {copy.contentRemoveOption}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Input
                        value={variantName}
                        maxLength={80}
                        disabled={busy}
                        aria-label={copy.contentVariantName}
                        placeholder={copy.contentVariantName}
                        onChange={(event) => setVariantName(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-1">
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={busy || !validName || Object.keys(choices).length >= 20}
                            onClick={() => {
                                let index = 0;
                                while (Object.hasOwn(choices, `variant_${index}`)) index++;
                                const id = `variant_${index}`;
                                void onChange('className', true, {
                                    choices: { ...choices, [id]: currentClasses },
                                    choiceLabels: { ...choiceLabels, [id]: variantName.trim() },
                                });
                            }}
                        >
                            {copy.contentCaptureVariant}
                        </Button>
                        {enabled('className') && (
                            <Button
                                size="xs"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => lock('className')}
                            >
                                {copy.contentLockField}
                            </Button>
                        )}
                    </div>
                </div>
            )}
            {!selection.plainText &&
                selection.tag !== 'img' &&
                selection.tag !== 'a' &&
                currentClasses === undefined && (
                    <p className="text-foreground-secondary">{copy.contentUnsupported}</p>
                )}
        </div>
    );
}

class ApprovalBoundary extends Component<
    { children: ReactNode; fallback: string },
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? (
            <p role="alert" className="text-destructive">
                {this.props.fallback}
            </p>
        ) : (
            this.props.children
        );
    }
}

export const CloudContentApproval = observer(
    ({
        source,
        scope,
        selection,
        onEditText,
        onEditAttribute,
        onUploadImage,
        readAsset,
        onDraftChange,
        draftPinned,
    }: Props) => {
        const copy = useCloudEditorCopy();
        const approve = useAction(cloudContentApi.approve);
        const revoke = useMutation(cloudContentApi.revoke);
        const [pending, setPending] = useState(false);
        const [failure, setFailure] = useState<{ target: string; message: string } | null>(null);
        const inFlight = useRef(false);
        const path = selection?.path.replace(/^\/+/, '') ?? '';
        const target = `${selection?.scopeKey ?? ''}:${path}:${selection?.oid ?? ''}`;
        const contract = source.state.contracts?.contracts.find((row) => row.path === path);
        const bindings: Binding[] = contract?.active ? contract.bindings : [];
        const binding = bindings.find((row) => row.oid === selection?.oid);
        const unsupported =
            selection?.unsupportedReason ||
            (selection &&
            (!/^(?:src\/)?app\/(?:.*\/)?page\.tsx$/.test(path) ||
                !/^[a-z][a-z0-9]*$/.test(selection.tag))
                ? copy.contentUnsupported
                : null);
        const busy =
            pending ||
            source.state.pending ||
            source.state.loading ||
            source.hasLocalWork ||
            selection?.revision !== source.state.savedRevision;
        const ready =
            !!source.state.contracts &&
            source.state.contracts.revision === source.state.savedRevision;

        async function change(field: Field, enabled: boolean, options?: ApprovalOptions) {
            if (!selection || !source.canDesign || busy || !ready || inFlight.current) return;
            inFlight.current = true;
            setPending(true);
            setFailure(null);
            try {
                const replacement = replaceField(binding, selection.oid, field, enabled, options);
                const next = bindings.filter((row) => row.oid !== selection.oid);
                if (replacement) next.push(replacement);
                if (!next.length && contract)
                    await revoke({ ...scope, path, expectedGeneration: contract.generation });
                else
                    await approve({
                        ...scope,
                        path,
                        expectedRevision: source.state.savedRevision,
                        expectedGeneration: contract?.generation ?? 0,
                        bindings: next,
                    });
                await source.refreshCapabilities();
            } catch {
                setFailure({ target, message: copy.contentApprovalFailed });
            } finally {
                inFlight.current = false;
                setPending(false);
            }
        }

        return (
            <section className="space-y-3 border-b p-3 text-xs" aria-label={copy.contentTitle}>
                <h2 className="font-medium">{copy.contentTitle}</h2>
                {draftPinned && selection && (
                    <div role="status" className="space-y-1 rounded-md border p-2">
                        <p>{copy.contentDraftPinned}</p>
                        <p className="text-foreground-secondary break-all">
                            {selection.attributes.src?.split('/').pop() ?? selection.oid}
                        </p>
                    </div>
                )}
                {!selection ? (
                    <p className="text-foreground-secondary">{copy.contentSelect}</p>
                ) : unsupported ? (
                    <p className="text-foreground-secondary">{unsupported}</p>
                ) : source.canDesign && !source.isContentMode ? (
                    <ApprovalBoundary
                        key={`${target}:${source.state.accessReady}`}
                        fallback={copy.contentApprovalFailed}
                    >
                        <ApprovalSettings
                            key={`${target}:${contract?.generation ?? 0}`}
                            scope={scope}
                            selection={selection}
                            binding={binding}
                            busy={busy || !ready}
                            onChange={change}
                            readAsset={readAsset}
                        />
                    </ApprovalBoundary>
                ) : (
                    <>
                        {binding?.allowImageUploads && binding.fields.includes('src') && <CloudImageUpload disabled={busy || draftPinned || !source.canWrite} onUpload={file => onUploadImage(file, contract?.generation ?? 0, selection.revision)} />}
                        {!binding?.fields.length && (
                            <p className="text-foreground-secondary">{copy.contentElementLocked}</p>
                        )}
                        {binding?.fields.includes('text') && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                disabled={busy || !source.canEditText(path, selection.oid)}
                                onClick={onEditText}
                            >
                                {copy.contentEdit}
                            </Button>
                        )}
                        {(['src', 'alt', 'href', 'className'] as const)
                            .filter(
                                (field) =>
                                    binding?.fields.includes(field) ||
                                    (draftPinned && field === 'alt'),
                            )
                            .map((field) => {
                                const options =
                                    field === 'className'
                                        ? Object.entries(binding?.choices ?? {}).map(
                                              ([id, value]) => ({
                                                  id,
                                                  label: binding?.choiceLabels?.[id] ?? id,
                                                  value,
                                              }),
                                          )
                                        : field === 'src' || field === 'href'
                                          ? binding?.allowedValues?.[field]?.map((value) => ({
                                                value,
                                                label:
                                                    field === 'src'
                                                        ? value.split('/').pop() || value
                                                        : value,
                                            }))
                                          : undefined;
                                return (
                                    <AttributeControl
                                        key={`${target}:${field}`}
                                        field={field}
                                        label={
                                            field === 'src'
                                                ? copy.contentImage
                                                : field === 'alt'
                                                  ? copy.contentAlt
                                                  : field === 'href'
                                                    ? copy.contentLink
                                                    : copy.contentVariant
                                        }
                                        options={options}
                                        value={selection.attributes[field] ?? ''}
                                        generation={contract?.generation ?? 0}
                                        revision={selection.revision}
                                        disabled={
                                            (field === 'alt' && draftPinned
                                                ? pending ||
                                                  source.state.pending ||
                                                  source.state.loading
                                                : busy || draftPinned) ||
                                            !source.canWrite ||
                                            !source.canEditAttribute(path, selection.oid, field)
                                        }
                                        source={source}
                                        selection={selection}
                                        onDraftChange={onDraftChange}
                                        onEdit={onEditAttribute}
                                        readAsset={readAsset}
                                    />
                                );
                            })}
                    </>
                )}
                {source.hasLocalWork && source.canDesign && !source.isContentMode && (
                    <p className="text-foreground-secondary">{copy.contentSaveFirst}</p>
                )}
                {failure?.target === target && (
                    <p role="alert" className="text-destructive">
                        {failure.message}
                    </p>
                )}
            </section>
        );
    },
);
