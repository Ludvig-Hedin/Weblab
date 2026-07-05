import { processDomNow } from './dom.ts';
import { listenForDomChanges } from './events/index.ts';
import { cssManager } from './style/css-manager.ts';

export function handleBodyReady() {
    listenForDomChanges();
    keepDomUpdated();
    cssManager.injectDefaultStyles();
}

let domUpdateInterval: ReturnType<typeof setInterval> | null = null;

function keepDomUpdated() {
    if (domUpdateInterval !== null) {
        clearInterval(domUpdateInterval);
        domUpdateInterval = null;
    }

    const interval = setInterval(() => {
        try {
            // Use the IMMEDIATE variant: `processDom` is debounced and returns
            // the last completed run's result (undefined on the first tick), so
            // `!== null` was true on tick one and the interval cleared itself
            // before ever attempting a real run — killing the child-side
            // layer-tree self-heal during cold boot.
            if (processDomNow() !== null) {
                clearInterval(interval);
                domUpdateInterval = null;
            }
        } catch (err) {
            clearInterval(interval);
            domUpdateInterval = null;
            console.warn('Error in keepDomUpdated:', err);
        }
    }, 5000);

    domUpdateInterval = interval;
}

const handleDocumentBody = setInterval(() => {
    window.onerror = function logError(errorMsg, url, lineNumber) {
        console.log(`Unhandled error: ${errorMsg} ${url} ${lineNumber}`);
    };

    if (window?.document?.body) {
        clearInterval(handleDocumentBody);
        try {
            handleBodyReady();
        } catch (err) {
            console.log('Error in documentBodyInit:', err);
        }
    }
}, 300);
