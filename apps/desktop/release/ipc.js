'use strict';

const { randomUUID } = require('node:crypto');

const { isTrustedSender } = require('../auth-policy');
const { REQUEST_ACTIVE, assertRequestActive } = require('./authorize');

const CONTENT_METHODS = new Set(['prepareContent', 'resumeContent', 'contentStatus']);
const METHODS = new Set(['connect', 'review', 'startBuild', 'status', 'publish', 'rollback', 'plan', 'acceptLive', ...CONTENT_METHODS]);

function publishingInput(method, value) {
    if (!METHODS.has(method) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid publishing request.');
    const allowed = ['projectId', 'branchId', 'jwt'];
    if (method === 'connect') allowed.push('vercelToken', 'vercelProjectId', 'teamId');
    if (method === 'review') allowed.push('planToken', 'cleanedFiles');
    if (['startBuild', 'publish'].includes(method)) allowed.push('releaseId');
    if (method === 'startBuild') allowed.push('production');
    if (method === 'rollback') allowed.push('expectedLiveDeploymentId', 'expectedPreviousDeploymentId', 'expectedDomains');
    if (method === 'acceptLive') allowed.push('expectedLiveDeploymentId', 'expectedDomains');
    if (['prepareContent', 'resumeContent'].includes(method)) allowed.push('connectionId', 'connectionRevision', 'selections');
    if (method === 'resumeContent') allowed.push('recovery');
    if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unexpected publishing input.');
    const text = (name, max) => {
        if (typeof value[name] !== 'string' || !value[name] || value[name].length > max || /[\x00-\x1f]/.test(value[name])) throw new Error('Invalid publishing input.');
    };
    text('projectId', 160); text('branchId', 160); text('jwt', 8192);
    if (['prepareContent', 'resumeContent'].includes(method)) {
        text('connectionId', 160);
        if (!Number.isSafeInteger(value.connectionRevision) || value.connectionRevision < 1 || !Array.isArray(value.selections) || value.selections.length > 8) throw new Error('Invalid content selection.');
        const seen = new Set();
        for (const pin of value.selections) {
            if (!pin || typeof pin !== 'object' || Array.isArray(pin) || Object.keys(pin).sort().join() !== 'archived,draftId,expectedRevision,providerRevision' ||
                typeof pin.draftId !== 'string' || !pin.draftId || pin.draftId.length > 160 || /[\x00-\x1f]/.test(pin.draftId) || seen.has(pin.draftId) ||
                !Number.isSafeInteger(pin.expectedRevision) || pin.expectedRevision < 1 || typeof pin.archived !== 'boolean' ||
                (pin.providerRevision !== null && (typeof pin.providerRevision !== 'string' || !pin.providerRevision || pin.providerRevision.length > 256 || /[\x00-\x1f]/.test(pin.providerRevision)))) throw new Error('Invalid content selection.');
            seen.add(pin.draftId);
        }
    }
    if (method === 'resumeContent' && value.recovery !== undefined && typeof value.recovery !== 'boolean') throw new Error('Choose an explicit recovery action.');
    if (method === 'connect') {
        text('vercelToken', 4096); text('vercelProjectId', 160);
        if (value.teamId !== undefined && value.teamId !== '') text('teamId', 160);
    }
    if (['rollback', 'acceptLive'].includes(method)) {
        text('expectedLiveDeploymentId', 160);
        if (method === 'rollback') text('expectedPreviousDeploymentId', 160);
        if (!Array.isArray(value.expectedDomains) || !value.expectedDomains.length || value.expectedDomains.length > 50 ||
            value.expectedDomains.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9.-]{1,253}$/.test(name)) ||
            new Set(value.expectedDomains.map((name) => name.toLowerCase())).size !== value.expectedDomains.length) {
            throw new Error('Review the exact destination domains first.');
        }
    }
    if (method === 'review') {
        if (!/^[a-f0-9]{64}$/.test(value.planToken)) throw new Error('Review this version first.');
        if (!Array.isArray(value.cleanedFiles) || value.cleanedFiles.length > 100) throw new Error('Invalid cleaned release files.');
        let total = 0;
        const paths = new Set();
        for (const file of value.cleanedFiles) {
            if (!file || typeof file !== 'object' || Object.keys(file).some((key) => !['path', 'updated'].includes(key)) ||
                typeof file.path !== 'string' || file.path.length > 1024 || paths.has(file.path) ||
                (file.updated !== null && typeof file.updated !== 'string')) throw new Error('Invalid cleaned release file.');
            paths.add(file.path);
            total += file.updated === null ? 0 : Buffer.byteLength(file.updated);
            if (total > 10 * 1024 * 1024) throw new Error('Reviewed changes are too large.');
        }
    }
    if (['startBuild', 'publish'].includes(method) && !/^[a-f0-9-]{36}$/.test(value.releaseId)) throw new Error('Invalid release identity.');
    if (method === 'startBuild' && typeof value.production !== 'boolean') throw new Error('Choose preview or production.');
    return value;
}

function registerPublishingIpc({ ipcMain, service, allowedOrigins, getWebContents, plan, content }) {
    const requests = new Map();
    ipcMain.handle('weblab:publishing-cancel', async (event) => {
        if (!isTrustedSender(event, getWebContents(), allowedOrigins)) return { success: false };
        for (const [id, active] of requests) if (active.sender === event.sender) requests.delete(id);
        return { success: true };
    });
    ipcMain.handle('weblab:publishing', async (event, payload) => {
        if (!isTrustedSender(event, getWebContents(), allowedOrigins)) return { success: false, error: 'Untrusted publishing request.' };
        const requestId = randomUUID();
        const active = { sender: event.sender, url: event.senderFrame.url };
        const invalidate = () => requests.delete(requestId);
        const listeners = [
            ['did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) invalidate(); }],
            ['did-navigate-in-page', (_event, _url, isMainFrame) => { if (isMainFrame) invalidate(); }],
            ['destroyed', invalidate],
        ];
        for (const [eventName, listener] of listeners) event.sender.on?.(eventName, listener);
        requests.set(requestId, active);
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid publishing request.');
            const { method, input } = payload;
            const verified = { ...publishingInput(method, input) };
            Object.defineProperty(verified, REQUEST_ACTIVE, { value: () => requests.get(requestId) === active &&
                event.senderFrame?.url === active.url && isTrustedSender(event, getWebContents(), allowedOrigins) });
            const result = CONTENT_METHODS.has(method) ? await service.withProject(verified, async (context) => {
                if (!content) throw new Error('Content preparation is unavailable.');
                const operation = { prepareContent: 'prepare', resumeContent: 'resume', contentStatus: 'status' }[method];
                const result = await content[operation](verified, context);
                await context.refreshAccess();
                return result;
            }) : method === 'plan' ? await service.withProject(verified, async ({ binding, refreshAccess }) => {
                const result = await plan(binding.root);
                await refreshAccess();
                return result;
            })
                : method === 'rollback' ? await service.publish(verified, true)
                    : await service[method](verified);
            assertRequestActive(verified);
            if (CONTENT_METHODS.has(method)) {
                const { productionSwitchEnabled: _closedCapability, ...status } = result;
                return { success: true, result: status };
            }
            return { success: true, result };
        } catch (error) {
            // Provider helpers never include credential values in their errors.
            return { success: false, error: error.message || 'Publishing could not be confirmed.' };
        } finally {
            requests.delete(requestId);
            for (const [eventName, listener] of listeners) event.sender.removeListener?.(eventName, listener);
        }
    });
}

module.exports = { registerPublishingIpc, publishingInput };
