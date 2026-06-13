'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { FIELD_BASE_CLASSES } from './constants';
import { IconFile, IconLink, IconMail, IconPage, IconPhone } from './glyphs';

export interface LinkSuggestion {
    /** Unique id within the source group. */
    id: string;
    /** Display label (e.g. page title or filename). */
    label: string;
    /** Sub-label (e.g. URL path or folder). */
    sub?: string;
    /** The href that will be written on commit. */
    href: string;
    /** Source bucket — used to group in the dropdown. */
    kind: 'page' | 'file' | 'email' | 'phone' | 'external';
}

export interface SmartLinkInputProps {
    /** Current href. */
    value: string;
    /** Commit handler. */
    onCommit: (href: string) => void;
    /** Pages available in this project (titles + paths). */
    pages?: { id: string; title: string; path: string }[];
    /** Asset files available (filenames + folders). */
    files?: { id: string; name: string; folder: string; url: string }[];
    placeholder?: string;
    className?: string;
}

const EMAIL_RE = /^\w[\w.+-]*@[\w-]+\.\w[\w.-]*$/;
const PHONE_RE = /^\+?[\d][\d\s()-]{5,}$/;

function normalize(input: string): string {
    const v = input.trim();
    if (v === '') return '';
    if (/^[a-z]+:/i.test(v)) return v;
    if (v.startsWith('/')) return v;
    if (EMAIL_RE.test(v)) return `mailto:${v}`;
    if (PHONE_RE.test(v)) return `tel:${v.replace(/[^\d+]/g, '')}`;
    if (v.includes('.')) return `https://${v}`;
    return v;
}

function fuzzyMatch(needle: string, haystack: string): boolean {
    if (!needle) return true;
    const n = needle.toLowerCase();
    return haystack.toLowerCase().includes(n);
}

/**
 * Smart `href` input with categorised autocomplete dropdown.
 *
 * Suggestion sources (in order):
 *   1. Pages — match by title or path
 *   2. Files — match by filename
 *   3. Email — when input matches an email pattern
 *   4. Phone — when input matches a phone pattern
 *   5. External — fallback "Go to https://{value}" row
 *
 * On commit:
 *   - Selecting a suggestion writes its `href` verbatim.
 *   - Free-typed input is normalized: bare domain → `https://`,
 *     email → `mailto:`, phone → `tel:`. Paths starting with `/` and
 *     full URLs are left alone.
 */
export function SmartLinkInput({
    value,
    onCommit,
    pages = [],
    files = [],
    placeholder,
    className,
}: SmartLinkInputProps) {
    const t = useTranslations('editor.stylePanel');
    const resolvedPlaceholder = placeholder ?? t('smartLink.placeholder');
    const [draft, setDraft] = React.useState(value);
    const [open, setOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // Mirror `open` into a ref so the deferred blur handler reads the
    // current value instead of the stale closure capture (which was always
    // `true` because the user was typing in the open popover at blur time
    // → free-typed text was silently discarded on blur).
    const openRef = React.useRef(open);
    React.useEffect(() => {
        openRef.current = open;
    }, [open]);

    React.useEffect(() => {
        if (document.activeElement !== inputRef.current) setDraft(value);
    }, [value]);

    const suggestions = React.useMemo<LinkSuggestion[]>(() => {
        const q = draft.trim();
        if (!q) {
            // empty input: still show top pages
            return pages.slice(0, 5).map<LinkSuggestion>((p) => ({
                id: `page-${p.id}`,
                label: p.title,
                sub: p.path,
                href: p.path,
                kind: 'page',
            }));
        }
        const list: LinkSuggestion[] = [];

        // Pages
        for (const p of pages) {
            if (fuzzyMatch(q, p.title) || fuzzyMatch(q, p.path)) {
                list.push({
                    id: `page-${p.id}`,
                    label: p.title,
                    sub: p.path,
                    href: p.path,
                    kind: 'page',
                });
            }
        }
        // Files
        for (const f of files) {
            if (fuzzyMatch(q, f.name)) {
                list.push({
                    id: `file-${f.id}`,
                    label: f.name,
                    sub: f.folder,
                    href: f.url,
                    kind: 'file',
                });
            }
        }
        // Email / phone shortcuts
        if (EMAIL_RE.test(q)) {
            list.push({
                id: 'email-fallback',
                label: t('smartLink.sendEmailTo', { email: q }),
                href: `mailto:${q}`,
                kind: 'email',
            });
        }
        if (PHONE_RE.test(q)) {
            list.push({
                id: 'phone-fallback',
                label: t('smartLink.callPhone', { phone: q }),
                href: `tel:${q.replace(/[^\d+]/g, '')}`,
                kind: 'phone',
            });
        }
        // External fallback
        const hasMatch = list.length > 0;
        if (!hasMatch || !q.startsWith('/')) {
            const url = normalize(q);
            if (url) {
                list.push({
                    id: 'external-fallback',
                    label: t('smartLink.goTo', { url }),
                    href: url,
                    kind: 'external',
                });
            }
        }
        return list.slice(0, 12);
    }, [draft, pages, files, t]);

    const grouped = React.useMemo(() => {
        const groups: Record<LinkSuggestion['kind'], LinkSuggestion[]> = {
            page: [],
            file: [],
            email: [],
            phone: [],
            external: [],
        };
        for (const s of suggestions) groups[s.kind].push(s);
        return groups;
    }, [suggestions]);

    const [highlighted, setHighlighted] = React.useState(0);
    React.useEffect(() => {
        setHighlighted(0);
    }, [draft]);

    const flatList = React.useMemo(
        () => [
            ...grouped.page,
            ...grouped.file,
            ...grouped.email,
            ...grouped.phone,
            ...grouped.external,
        ],
        [grouped],
    );

    const commitSuggestion = (s: LinkSuggestion) => {
        setDraft(s.href);
        if (s.href !== value) onCommit(s.href);
        setOpen(false);
        inputRef.current?.blur();
    };

    const commitFreeText = () => {
        const next = normalize(draft);
        setDraft(next);
        if (next !== value) onCommit(next);
        setOpen(false);
    };

    return (
        <div className={cn('relative w-full', className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <div
                        className={cn(
                            FIELD_BASE_CLASSES,
                            'flex min-w-0 items-center gap-2',
                            open && 'border-foreground-brand',
                        )}
                    >
                        <span
                            className="text-foreground-tertiary inline-flex w-[14px] shrink-0 items-center justify-center [&_svg]:h-[14px] [&_svg]:w-[14px]"
                            aria-hidden
                        >
                            <IconLink size={14} />
                        </span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={draft}
                            placeholder={resolvedPlaceholder}
                            spellCheck={false}
                            onFocus={() => setOpen(true)}
                            onChange={(e) => {
                                setDraft(e.target.value);
                                setOpen(true);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setHighlighted((i) => Math.min(i + 1, flatList.length - 1));
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setHighlighted((i) => Math.max(i - 1, 0));
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const pick = flatList[highlighted];
                                    if (pick) commitSuggestion(pick);
                                    else commitFreeText();
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setDraft(value);
                                    setOpen(false);
                                    e.currentTarget.blur();
                                }
                            }}
                            onBlur={(e) => {
                                // Defer to allow click on a popover item (which calls
                                // commitSuggestion → setOpen(false)) to fire first. Read
                                // openRef.current — not the closure-captured `open` —
                                // because `open` is always `true` at blur time when the
                                // user was typing in the popover-open input.
                                window.setTimeout(() => {
                                    if (!openRef.current) commitFreeText();
                                }, 100);
                                void e;
                            }}
                            className="text-foreground-primary placeholder:text-muted-foreground text-mini min-w-0 flex-1 cursor-text bg-transparent outline-none"
                        />
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    className="w-[var(--radix-popover-trigger-width)] rounded-md p-1"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    {flatList.length === 0 ? (
                        <div className="text-muted-foreground text-mini px-2 py-2">{t('smartLink.noMatches')}</div>
                    ) : (
                        <>
                            {grouped.page.length > 0 && (
                                <DropdownSection title={t('smartLink.pages')}>
                                    {grouped.page.map((s) => (
                                        <DropdownItem
                                            key={s.id}
                                            label={s.label}
                                            sub={s.sub}
                                            icon={<IconPage size={13} />}
                                            highlighted={flatList[highlighted]?.id === s.id}
                                            onSelect={() => commitSuggestion(s)}
                                        />
                                    ))}
                                </DropdownSection>
                            )}
                            {grouped.file.length > 0 && (
                                <DropdownSection title={t('smartLink.files')}>
                                    {grouped.file.map((s) => (
                                        <DropdownItem
                                            key={s.id}
                                            label={s.label}
                                            sub={s.sub}
                                            icon={<IconFile size={13} />}
                                            highlighted={flatList[highlighted]?.id === s.id}
                                            onSelect={() => commitSuggestion(s)}
                                        />
                                    ))}
                                </DropdownSection>
                            )}
                            {grouped.email.length > 0 && (
                                <DropdownSection title={t('smartLink.email')}>
                                    {grouped.email.map((s) => (
                                        <DropdownItem
                                            key={s.id}
                                            label={s.label}
                                            sub={s.sub}
                                            icon={<IconMail size={13} />}
                                            highlighted={flatList[highlighted]?.id === s.id}
                                            onSelect={() => commitSuggestion(s)}
                                        />
                                    ))}
                                </DropdownSection>
                            )}
                            {grouped.phone.length > 0 && (
                                <DropdownSection title={t('smartLink.phone')}>
                                    {grouped.phone.map((s) => (
                                        <DropdownItem
                                            key={s.id}
                                            label={s.label}
                                            sub={s.sub}
                                            icon={<IconPhone size={13} />}
                                            highlighted={flatList[highlighted]?.id === s.id}
                                            onSelect={() => commitSuggestion(s)}
                                        />
                                    ))}
                                </DropdownSection>
                            )}
                            {grouped.external.length > 0 && (
                                <DropdownSection title={t('smartLink.orUse')}>
                                    {grouped.external.map((s) => (
                                        <DropdownItem
                                            key={s.id}
                                            label={s.label}
                                            icon={<IconLink size={13} />}
                                            accent
                                            highlighted={flatList[highlighted]?.id === s.id}
                                            onSelect={() => commitSuggestion(s)}
                                        />
                                    ))}
                                </DropdownSection>
                            )}
                        </>
                    )}
                </PopoverContent>
            </Popover>
        </div>
    );
}

function DropdownSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="py-0.5">
            <div className="text-foreground-tertiary px-2 pt-1.5 pb-1 text-[11px]">{title}</div>
            {children}
        </div>
    );
}

interface DropdownItemProps {
    icon: React.ReactNode;
    label: string;
    sub?: string;
    accent?: boolean;
    highlighted?: boolean;
    onSelect: () => void;
}

function DropdownItem({ icon, label, sub, accent, highlighted, onSelect }: DropdownItemProps) {
    return (
        <button
            type="button"
            onMouseDown={(e) => {
                // Prevent input blur before we can commit
                e.preventDefault();
                onSelect();
            }}
            className={cn(
                'grid w-full cursor-pointer items-center gap-2 rounded-[10px] px-2 text-left transition-colors',
                'h-[32px]',
                'grid-cols-[20px_1fr_auto]',
                'hover:bg-foreground/[0.05]',
                highlighted && 'bg-foreground/[0.08]',
            )}
        >
            <span
                className={cn(
                    'text-foreground-tertiary inline-flex shrink-0 items-center justify-center',
                    accent && 'text-foreground-brand',
                )}
                aria-hidden
            >
                {icon}
            </span>
            <span
                className={cn(
                    'text-foreground-primary text-mini min-w-0 truncate',
                    accent && 'text-foreground-brand',
                )}
            >
                {label}
            </span>
            {sub && (
                <span className="text-foreground-tertiary truncate font-mono text-[11px]">
                    {sub}
                </span>
            )}
        </button>
    );
}
