import {
    listenForContentResize,
    listenForDomMutation,
    listenForResize,
    reportContentSize,
} from './dom';

// handleBodyReady runs twice per document — once from the local 300ms
// body-poll in ready.ts and once when the parent calls the exposed penpal
// method on connect. Neither installer below is idempotent (each constructs a
// fresh MutationObserver / adds a fresh listener), so without this guard every
// DOM mutation was processed twice and resize/content-resize fired twice per
// frame. Install exactly once.
let domChangeListenersInstalled = false;

export function listenForDomChanges() {
    if (domChangeListenersInstalled) return;
    domChangeListenersInstalled = true;
    listenForDomMutation();
    listenForResize();
    listenForContentResize();
}

export { reportContentSize };
