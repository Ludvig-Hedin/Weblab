import {
    listenForContentResize,
    listenForDomMutation,
    listenForResize,
    reportContentSize,
} from './dom';

export function listenForDomChanges() {
    listenForDomMutation();
    listenForResize();
    listenForContentResize();
}

export { reportContentSize };
