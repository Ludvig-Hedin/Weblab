import { fetchConfig, getConfigUrl } from './config-loader';
import { resolveTargets } from './target-resolver';
import {
    applyInitialStepsToElement,
    pauseAnimationOnElement,
    playAnimationOnElement,
    scrubAnimationOnElement,
} from './timeline';
import {
    applyAllInitialStates,
    attachAllTriggers,
    findAnimationById,
} from './triggers';

import type {
    InteractionsDocument,
    IxRuntime,
    PlayOptions,
} from './types';

let currentDoc: InteractionsDocument = {
    version: 1,
    breakpoints: [],
    interactions: [],
};

function loadConfig(doc: InteractionsDocument) {
    currentDoc = doc;
    applyAllInitialStates(currentDoc);
    attachAllTriggers(currentDoc);
}

async function reloadFromUrl(): Promise<void> {
    const url = getConfigUrl();
    if (!url) return;
    const doc = await fetchConfig(url);
    if (doc) loadConfig(doc);
}

function playInteraction(ixId: string, animationId: string, opts?: PlayOptions) {
    const found = findAnimationById(currentDoc, ixId, animationId);
    if (!found) return null;
    const { ix, animation } = found;
    const target = animation.targetOverride ?? ix.target;
    const triggerEl =
        opts?.triggerEl ??
        (ix.trigger.sourceIxId
            ? document.querySelector<HTMLElement>(
                  `[data-wb-ix="${ix.trigger.sourceIxId}"]`,
              )
            : document.body);
    const targets = resolveTargets(triggerEl, target);
    if (targets.length === 0) return null;

    const first = targets[0];
    if (!first) return null;
    for (let i = 1; i < targets.length; i++) {
        const el = targets[i];
        if (!el) continue;
        playAnimationOnElement(el, animationId, animation, opts);
    }
    return playAnimationOnElement(first, animationId, animation, opts);
}

function pauseInteraction(ixId: string, animationId: string) {
    const found = findAnimationById(currentDoc, ixId, animationId);
    if (!found) return;
    const { ix, animation } = found;
    const target = animation.targetOverride ?? ix.target;
    const triggerEl = ix.trigger.sourceIxId
        ? document.querySelector<HTMLElement>(
              `[data-wb-ix="${ix.trigger.sourceIxId}"]`,
          )
        : document.body;
    const targets = resolveTargets(triggerEl, target);
    for (const el of targets) pauseAnimationOnElement(el, animationId);
}

function setScrubTime(ixId: string, animationId: string, tMs: number) {
    const found = findAnimationById(currentDoc, ixId, animationId);
    if (!found) return;
    const { ix, animation } = found;
    const target = animation.targetOverride ?? ix.target;
    const triggerEl = ix.trigger.sourceIxId
        ? document.querySelector<HTMLElement>(
              `[data-wb-ix="${ix.trigger.sourceIxId}"]`,
          )
        : document.body;
    const targets = resolveTargets(triggerEl, target);
    for (const el of targets) scrubAnimationOnElement(el, animationId, animation, tMs);
}

function applyInitialStates() {
    applyAllInitialStates(currentDoc);
}

function resolveTargetsForIxId(ixId: string): HTMLElement[] {
    const ix = currentDoc.interactions.find((i) => i.id === ixId);
    if (!ix) return [];
    const triggerEl = ix.trigger.sourceIxId
        ? document.querySelector<HTMLElement>(
              `[data-wb-ix="${ix.trigger.sourceIxId}"]`,
          )
        : document.body;
    return resolveTargets(triggerEl, ix.target);
}

const runtime: IxRuntime = {
    loadConfig,
    reloadFromUrl,
    playInteraction,
    pauseInteraction,
    setScrubTime,
    applyInitialStates,
    resolveTargets: resolveTargetsForIxId,
};

if (typeof window !== 'undefined') {
    window.__weblabIx = runtime;

    // Optional postMessage hook for the editor preload script to broadcast a
    // "config has changed on disk" signal without going through penpal directly.
    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        if (event.data.type === 'weblab:ix-reload') {
            void reloadFromUrl();
        }
        if (event.data.type === 'weblab:ix-apply-config' && event.data.doc) {
            try {
                loadConfig(event.data.doc as InteractionsDocument);
            } catch (err) {
                console.warn('[weblab-ix] Failed to hot-swap config', err);
            }
        }
    });

    const bootstrap = async () => {
        const url = getConfigUrl();
        if (!url) return;
        const doc = await fetchConfig(url);
        if (doc) loadConfig(doc);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => void bootstrap());
    } else {
        void bootstrap();
    }
}

export default runtime;
