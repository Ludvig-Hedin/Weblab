'use client';
import { useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@weblab/ui/button';
import en from '../../../messages/cloud-images/en.json';
import sv from '../../../messages/cloud-images/sv.json';
export function useCloudImageCopy(): typeof en { return useLocale().startsWith('sv') ? sv : en; }
export function CloudImageUpload({ disabled, onUpload }: { disabled: boolean; onUpload: (file: File) => Promise<boolean> }) {
    const copy = useCloudImageCopy();
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    return <div className="space-y-2">
        <input ref={input} type="file" className="hidden" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy}
            onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (!file || disabled || busy) return;
                setBusy(true); setFailed(false);
                try { setFailed(!await onUpload(file)); } catch { setFailed(true); } finally { setBusy(false); }
            }} />
        <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? copy.busy : copy.upload}</Button>
        <p className="text-foreground-secondary text-xs">{copy.hint}</p>
        {failed && <p role="alert" className="text-xs">{copy.failed}</p>}
    </div>;
}
