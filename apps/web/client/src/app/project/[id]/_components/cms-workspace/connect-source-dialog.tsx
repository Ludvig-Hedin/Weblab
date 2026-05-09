'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { CmsSourceType } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { Tabs, TabsList, TabsTrigger } from '@weblab/ui/tabs';
import { Textarea } from '@weblab/ui/textarea';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

interface Props {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after a source is successfully created. The parent opens the
     *  map-collections dialog with this id. */
    onSourceCreated: (sourceId: string) => void;
}

type ExternalSourceType = CmsSourceType.PAYLOAD | CmsSourceType.STRAPI | CmsSourceType.REST;

type CredentialState = Record<string, string>;

const DEFAULT_CREDS: Record<ExternalSourceType, CredentialState> = {
    [CmsSourceType.PAYLOAD]: { baseUrl: '', apiKey: '', usersSlug: '', collectionSlugs: '' },
    [CmsSourceType.STRAPI]: { baseUrl: '', apiToken: '', contentTypes: '' },
    [CmsSourceType.REST]: { baseUrl: '', apiKey: '', endpointsJson: '' },
};

export const ConnectSourceDialog = ({ projectId, open, onOpenChange, onSourceCreated }: Props) => {
    const t = useTranslations();
    const [type, setType] = useState<ExternalSourceType>(CmsSourceType.PAYLOAD);
    const [name, setName] = useState('');
    const [creds, setCreds] = useState<Record<ExternalSourceType, CredentialState>>(DEFAULT_CREDS);
    const [testStatus, setTestStatus] = useState<
        { ok: true } | { ok: false; reason: string } | null
    >(null);

    const utils = api.useUtils();
    const testMutation = api.cms.source.testConnection.useMutation();
    const createMutation = api.cms.source.create.useMutation();

    const reset = () => {
        setType(CmsSourceType.PAYLOAD);
        setName('');
        setCreds(DEFAULT_CREDS);
        setTestStatus(null);
    };
    const close = () => {
        onOpenChange(false);
        // Defer reset until the dialog has animated closed.
        setTimeout(reset, 200);
    };

    const updateCred = (key: string, value: string) =>
        setCreds((prev) => ({
            ...prev,
            [type]: { ...prev[type], [key]: value },
        }));

    const handleTest = async () => {
        setTestStatus(null);
        try {
            const result = await testMutation.mutateAsync({
                projectId,
                type,
                credentials: stripBlank(creds[type]),
            });
            setTestStatus(result);
            if (!result.ok) toast.error(result.reason);
        } catch (err) {
            const reason = err instanceof Error ? err.message : 'Unknown error';
            setTestStatus({ ok: false, reason });
            toast.error(reason);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error(t(transKeys.cms.sources.connect.nameRequired));
            return;
        }
        if (testStatus?.ok !== true) {
            toast.error(t(transKeys.cms.sources.connect.testFirst));
            return;
        }
        try {
            const created = await createMutation.mutateAsync({
                projectId,
                type,
                name: name.trim(),
                credentials: stripBlank(creds[type]),
            });
            await utils.cms.source.list.invalidate({ projectId });
            toast.success(t(transKeys.cms.sources.connect.created));
            if (created) onSourceCreated(created.id);
            close();
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : t(transKeys.cms.sources.connect.failed),
            );
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => (!o ? close() : null)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t(transKeys.cms.sources.connect.title)}</DialogTitle>
                    <DialogDescription>
                        {t(transKeys.cms.sources.connect.description)}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <Tabs
                        value={type}
                        onValueChange={(v) => {
                            setType(v as ExternalSourceType);
                            setTestStatus(null);
                        }}
                    >
                        <TabsList>
                            <TabsTrigger value={CmsSourceType.PAYLOAD}>
                                {t(transKeys.cms.sources.payload)}
                            </TabsTrigger>
                            <TabsTrigger value={CmsSourceType.STRAPI}>
                                {t(transKeys.cms.sources.strapi)}
                            </TabsTrigger>
                            <TabsTrigger value={CmsSourceType.REST}>
                                {t(transKeys.cms.sources.rest)}
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="space-y-1.5">
                        <Label htmlFor="source-name">
                            {t(transKeys.cms.sources.connect.nameLabel)}
                        </Label>
                        <Input
                            id="source-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t(transKeys.cms.sources.connect.namePlaceholder)}
                        />
                    </div>

                    {type === CmsSourceType.PAYLOAD && (
                        <PayloadFields creds={creds[type]} onChange={updateCred} t={t} />
                    )}
                    {type === CmsSourceType.STRAPI && (
                        <StrapiFields creds={creds[type]} onChange={updateCred} t={t} />
                    )}
                    {type === CmsSourceType.REST && (
                        <RestFields creds={creds[type]} onChange={updateCred} t={t} />
                    )}

                    {testStatus ? (
                        <div
                            className={
                                testStatus.ok
                                    ? 'text-foreground-positive text-mini'
                                    : 'text-red text-mini'
                            }
                        >
                            {testStatus.ok
                                ? t(transKeys.cms.sources.connect.testOk)
                                : `${t(transKeys.cms.sources.connect.testFailed)}: ${testStatus.reason}`}
                        </div>
                    ) : null}
                </div>

                <DialogFooter className="flex-row justify-between sm:justify-between">
                    <Button variant="ghost" onClick={close}>
                        {t(transKeys.cms.sources.connect.cancel)}
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={handleTest}
                            disabled={testMutation.isPending}
                        >
                            {t(transKeys.cms.sources.connect.testButton)}
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={createMutation.isPending || testStatus?.ok !== true}
                        >
                            {t(transKeys.cms.sources.connect.saveButton)}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

type T = ReturnType<typeof useTranslations>;

interface FieldsProps {
    creds: CredentialState;
    onChange: (key: string, value: string) => void;
    t: T;
}

function PayloadFields({ creds, onChange, t }: FieldsProps) {
    return (
        <div className="space-y-3">
            <Field
                label={t(transKeys.cms.sources.connect.baseUrl)}
                placeholder="https://cms.example.com"
                value={creds.baseUrl ?? ''}
                onChange={(v) => onChange('baseUrl', v)}
            />
            <Field
                label={t(transKeys.cms.sources.connect.apiKey)}
                value={creds.apiKey ?? ''}
                onChange={(v) => onChange('apiKey', v)}
                secret
            />
            <Field
                label={t(transKeys.cms.sources.connect.payloadUsersSlug)}
                placeholder="users"
                value={creds.usersSlug ?? ''}
                onChange={(v) => onChange('usersSlug', v)}
            />
            <Field
                label={t(transKeys.cms.sources.connect.payloadCollections)}
                placeholder="blog,docs,jobs"
                value={creds.collectionSlugs ?? ''}
                onChange={(v) => onChange('collectionSlugs', v)}
                help={t(transKeys.cms.sources.connect.payloadCollectionsHelp)}
            />
        </div>
    );
}

function StrapiFields({ creds, onChange, t }: FieldsProps) {
    return (
        <div className="space-y-3">
            <Field
                label={t(transKeys.cms.sources.connect.baseUrl)}
                placeholder="https://strapi.example.com"
                value={creds.baseUrl ?? ''}
                onChange={(v) => onChange('baseUrl', v)}
            />
            <Field
                label={t(transKeys.cms.sources.connect.apiToken)}
                value={creds.apiToken ?? ''}
                onChange={(v) => onChange('apiToken', v)}
                secret
            />
            <Field
                label={t(transKeys.cms.sources.connect.strapiTypes)}
                placeholder="blog-posts,authors"
                value={creds.contentTypes ?? ''}
                onChange={(v) => onChange('contentTypes', v)}
                help={t(transKeys.cms.sources.connect.strapiTypesHelp)}
            />
        </div>
    );
}

function RestFields({ creds, onChange, t }: FieldsProps) {
    return (
        <div className="space-y-3">
            <Field
                label={t(transKeys.cms.sources.connect.baseUrl)}
                placeholder="https://api.example.com"
                value={creds.baseUrl ?? ''}
                onChange={(v) => onChange('baseUrl', v)}
            />
            <Field
                label={t(transKeys.cms.sources.connect.restApiKey)}
                value={creds.apiKey ?? ''}
                onChange={(v) => onChange('apiKey', v)}
                secret
                optional
            />
            <div className="space-y-1.5">
                <Label htmlFor="rest-endpoints">
                    {t(transKeys.cms.sources.connect.restEndpoints)}
                </Label>
                <Textarea
                    id="rest-endpoints"
                    rows={4}
                    placeholder='[{"name":"Posts","path":"/posts"}]'
                    value={creds.endpointsJson ?? ''}
                    onChange={(e) => onChange('endpointsJson', e.target.value)}
                />
                <p className="text-foreground-tertiary text-mini">
                    {t(transKeys.cms.sources.connect.restEndpointsHelp)}
                </p>
            </div>
        </div>
    );
}

function Field({
    label,
    placeholder,
    value,
    onChange,
    help,
    secret,
    optional,
}: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (v: string) => void;
    help?: string;
    secret?: boolean;
    optional?: boolean;
}) {
    return (
        <div className="space-y-1.5">
            <Label>
                {label}
                {optional ? <span className="text-foreground-tertiary"> · optional</span> : null}
            </Label>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                type={secret ? 'password' : 'text'}
                autoComplete="off"
            />
            {help ? <p className="text-foreground-tertiary text-mini">{help}</p> : null}
        </div>
    );
}

function stripBlank(creds: CredentialState): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(creds)) {
        if (v && v.trim() !== '') out[k] = v;
    }
    return out;
}
