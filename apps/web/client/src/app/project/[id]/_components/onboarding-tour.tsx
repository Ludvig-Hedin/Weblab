'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import localforage from 'localforage';

import { Button } from '@weblab/ui/button';
import { cn } from '@weblab/ui/utils';

import { ONBOARDING_SEEN_KEY } from '@/utils/constants';
import { resolveOnboardingVisibility } from './onboarding-visibility';

/**
 * First-run editor onboarding tour.
 *
 * Shows up to 3 floating tooltip cards anchored at `[data-tour="..."]` selectors.
 * Steps whose targets are not currently in the DOM are silently skipped so we
 * don't crash if the layout changes or the user is in a mode that hides a panel.
 *
 * Flag is stored via localforage under `weblab-onboarding-seen` — once truthy,
 * the component renders nothing.
 */

interface TourStep {
    /** CSS selector for the element to anchor the tooltip beside. */
    target: string;
    /** Side of the target the tooltip sits on. */
    side: 'left' | 'right' | 'bottom' | 'top';
    /** 1-line title — keep terse. */
    title: string;
    /** 1-2 sentence body — keep concise; users don't read tour copy. */
    body: string;
}

const STEPS: TourStep[] = [
    {
        target: '[data-tour="chat-panel"]',
        side: 'left',
        title: 'AI lives here',
        body: 'Describe changes and the assistant will edit your code.',
    },
    {
        target: '[data-tour="canvas"]',
        side: 'right',
        title: 'Your canvas',
        body: 'Click any element to select and edit it visually.',
    },
    {
        target: '[data-tour="preview-button"]',
        side: 'bottom',
        title: 'Preview your work',
        body: 'Hit play to see your site live. Refresh to pick up the latest changes.',
    },
];

const CARD_WIDTH = 280;
const CARD_OFFSET = 12;
const VIEWPORT_PADDING = 12;

interface CardPosition {
    top: number;
    left: number;
}

function computeCardPosition(rect: DOMRect, side: TourStep['side']): CardPosition {
    // Approximate card height — we don't know the rendered size yet, but a
    // ~96px floor keeps the math simple and the card visible. Real overflow is
    // handled via the viewport-clamp at the bottom.
    const approxHeight = 110;
    let top = 0;
    let left = 0;
    switch (side) {
        case 'left':
            top = rect.top + rect.height / 2 - approxHeight / 2;
            left = rect.left - CARD_WIDTH - CARD_OFFSET;
            break;
        case 'right':
            top = rect.top + rect.height / 2 - approxHeight / 2;
            left = rect.right + CARD_OFFSET;
            break;
        case 'top':
            top = rect.top - approxHeight - CARD_OFFSET;
            left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
            break;
        case 'bottom':
        default:
            top = rect.bottom + CARD_OFFSET;
            left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
            break;
    }
    // Clamp into viewport so we never render off-screen on narrow displays.
    const maxLeft = window.innerWidth - CARD_WIDTH - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - approxHeight - VIEWPORT_PADDING;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));
    top = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop));
    return { top, left };
}

interface OnboardingTourProps {
    /** Skip the tour entirely (e.g., during a creation flow). */
    suppressed?: boolean;
}

export const OnboardingTour = ({ suppressed = false }: OnboardingTourProps) => {
    // Source of truth: per-user Convex flag (durable across browsers/devices).
    const user = useQuery(api.users.me);
    const markEditorOnboardingSeen = useMutation(api.users.markEditorOnboardingSeen);
    // localforage cache: `null` until read; used only to avoid a flash before
    // the per-user flag round-trips.
    const [localSeen, setLocalSeen] = useState<boolean | null>(null);
    // In-memory hide for the current mount (does not persist).
    const [dismissed, setDismissed] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [position, setPosition] = useState<CardPosition | null>(null);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const finishedRef = useRef(false);

    // Read the local cache once on mount (optimistic only — the per-user flag
    // above is authoritative).
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const seen = await localforage.getItem<boolean>(ONBOARDING_SEEN_KEY);
                if (!cancelled) setLocalSeen(!!seen);
            } catch (err) {
                // localforage failures shouldn't break the editor — just skip.
                console.warn('Onboarding flag read failed', err);
                if (!cancelled) setLocalSeen(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const shouldShow =
        !dismissed && resolveOnboardingVisibility({ suppressed, user, localSeen }) === true;

    /**
     * Hide the tour. `persist: true` for a genuine dismissal/completion — writes
     * the durable per-user flag (+ local cache) so it never returns. `persist:
     * false` hides only for this mount (e.g. anchors aren't in the DOM yet)
     * WITHOUT burning the flag, so a real first-run can still surface later.
     */
    const finish = useCallback(
        (persist: boolean) => {
            setDismissed(true);
            if (!persist || finishedRef.current) return;
            finishedRef.current = true;
            setLocalSeen(true);
            void localforage.setItem(ONBOARDING_SEEN_KEY, true).catch((err) => {
                console.warn('Onboarding flag write failed', err);
            });
            void markEditorOnboardingSeen({}).catch((err) => {
                console.warn('Onboarding flag persist failed', err);
            });
        },
        [markEditorOnboardingSeen],
    );

    // Advance over steps whose target isn't in the DOM, then position the card.
    useLayoutEffect(() => {
        if (!shouldShow) return;
        // Find the first step at-or-after `stepIndex` whose target exists.
        let cursor = stepIndex;
        let element: Element | null = null;
        while (cursor < STEPS.length) {
            const step = STEPS[cursor];
            if (!step) break;
            element = document.querySelector(step.target);
            if (element) break;
            cursor += 1;
        }
        if (cursor >= STEPS.length) {
            // No anchors in the DOM right now — hide without persisting so a
            // genuine first-run can still show once the panels are mounted.
            finish(false);
            return;
        }
        if (cursor !== stepIndex) {
            setStepIndex(cursor);
            return;
        }
        if (!element) {
            finish(false);
            return;
        }
        const step = STEPS[cursor];
        if (!step) {
            finish(false);
            return;
        }
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        setPosition(computeCardPosition(rect, step.side));
    }, [shouldShow, stepIndex, finish]);

    // Reposition on resize — keeps card aligned if the user resizes the panel.
    useEffect(() => {
        if (!shouldShow) return;
        const reposition = () => {
            const step = STEPS[stepIndex];
            if (!step) return;
            const el = document.querySelector(step.target);
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setTargetRect(rect);
            setPosition(computeCardPosition(rect, step.side));
        };
        window.addEventListener('resize', reposition);
        return () => window.removeEventListener('resize', reposition);
    }, [shouldShow, stepIndex]);

    // ESC dismisses the tour.
    useEffect(() => {
        if (!shouldShow) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                finish(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shouldShow, finish]);

    if (!shouldShow || !position) return null;

    const step = STEPS[stepIndex];
    if (!step) return null;
    const isLast = stepIndex === STEPS.length - 1;

    return (
        <>
            {/* Transparent backdrop — captures clicks to dismiss but doesn't dim
                the editor. We want users to *see* the editor while reading.
                Keyboard users dismiss via the ESC handler wired above. */}
            <div
                aria-hidden="true"
                onClick={() => finish(true)}
                className="fixed inset-0 z-[1000] bg-transparent"
            />
            {/* Subtle highlight ring around the active target. Pointer-events
                disabled so clicks pass through to the backdrop / dismiss. */}
            {targetRect && (
                <div
                    aria-hidden="true"
                    className="ring-foreground-brand pointer-events-none fixed z-[1001] rounded-md ring-2 ring-offset-2 ring-offset-transparent"
                    style={{
                        top: targetRect.top - 4,
                        left: targetRect.left - 4,
                        width: targetRect.width + 8,
                        height: targetRect.height + 8,
                    }}
                />
            )}
            {/* The tour card itself. onClick stops backdrop dismissal when
                clicking inside; it's not a real action, so the a11y key-handler
                rules don't apply. */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
            <div
                role="dialog"
                aria-label="Editor tour"
                className={cn(
                    'border-border bg-background-secondary fixed z-[1002] rounded-md border p-3 shadow-lg',
                    'flex flex-col gap-2',
                )}
                style={{
                    top: position.top,
                    left: position.left,
                    width: CARD_WIDTH,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-2">
                    <p className="text-foreground-primary text-small font-medium">{step.title}</p>
                    <span className="text-foreground-tertiary text-mini shrink-0">
                        {stepIndex + 1} / {STEPS.length}
                    </span>
                </div>
                <p className="text-foreground-secondary text-mini">{step.body}</p>
                <div className="mt-1 flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => finish(true)}>
                        Skip
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                            if (isLast) {
                                finish(true);
                            } else {
                                setStepIndex((i) => i + 1);
                            }
                        }}
                    >
                        {isLast ? 'Got it' : 'Next'}
                    </Button>
                </div>
            </div>
        </>
    );
};
