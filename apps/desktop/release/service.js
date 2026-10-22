'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { freezeFiles, assertSourceOnlyRelease, sha256 } = require('./policy');
const { VercelApi } = require('./vercel');

function publicDeployment(deployment) {
    if (!deployment) return null;
    let url = null;
    if (typeof deployment.url === 'string' && /^[a-zA-Z0-9-]+\.vercel\.app$/.test(deployment.url)) {
        url = `https://${deployment.url}`;
    }
    return { id: deployment.id, readyState: deployment.readyState, url };
}

function settingsHash(project) {
    return sha256(Buffer.from(JSON.stringify({
        accountId: project.accountId, framework: project.framework, nodeVersion: project.nodeVersion,
        rootDirectory: project.rootDirectory, buildCommand: project.buildCommand,
        installCommand: project.installCommand, outputDirectory: project.outputDirectory,
        ssoProtection: project.ssoProtection, rollingRelease: project.rollingRelease ?? null,
    })));
}

function destinationHash(routing) {
    return sha256(Buffer.from(JSON.stringify(routing.aliases.map((alias) => alias.name.toLowerCase()).sort())));
}

function publicState(state) {
    return { target: state.target ?? null, routingChanged: state.routingChanged === true,
        observedRouting: state.observedRouting ?? null, live: state.routingChanged || (state.observedRouting && state.observedRouting.deploymentId !== state.live?.deploymentId) ? null : state.live, pending: state.pending, releases: state.releases.map((release) => ({
        id: release.id, createdAt: release.createdAt, sourceHash: release.sourceHash,
        changedFiles: release.changedFiles, includedPaths: release.includedPaths ?? [], skippedPaths: release.skippedPaths ?? [], target: release.target ?? null, sharedPublicConfig: release.sharedPublicConfig ?? [],
        preview: publicDeployment(release.preview), production: publicDeployment(release.production), publishedAt: release.publishedAt ?? null,
    })) };
}

class PublishingService {
    constructor({ store, authorize, requirePrivateRoot, snapshot, validateSnapshot, apiFactory = (connection) => new VercelApi(connection), now = Date.now }) {
        Object.assign(this, { store, authorize, requirePrivateRoot, snapshot, validateSnapshot, apiFactory, now });
    }

    async withProject(input, operation, { sourcePublication = false, productionSwitch = false } = {}) {
        const authorization = await this.authorize(input);
        const assertContentReady = (access) => {
            if (productionSwitch && access.productionSwitchEnabled !== true) throw new Error('Live publication is unavailable until shared publishing coordination is ready. Preview and review remain available.');
            if (sourcePublication && access.cmsRequired) throw new Error('This site needs a reviewed CMS content snapshot. CMS publishing is not available yet.');
        };
        assertContentReady(authorization);
        const root = await this.requirePrivateRoot(authorization.rootPath);
        if (root !== path.resolve(authorization.rootPath)) throw new Error('The local project binding changed.');
        const binding = { userId: authorization.userId, projectId: authorization.projectId, branchId: authorization.branchId, root };
        const key = sha256(Buffer.from(JSON.stringify(binding)));
        const result = await this.store.locked(key, async (directory) => {
            const refreshAccess = async () => {
                const current = await this.authorize(input);
                assertContentReady(current);
                if (current.userId !== binding.userId || current.projectId !== binding.projectId || current.branchId !== binding.branchId || path.resolve(current.rootPath) !== binding.root) {
                    throw new Error('Your account or project changed. Open publishing again.');
                }
            };
            // Only after fresh server authorization is it safe to decrypt this connection.
            const connection = await this.store.connection(directory);
            if (connection && JSON.stringify(connection.binding) !== JSON.stringify(binding)) throw new Error('The saved Vercel connection belongs to another account.');
            const record = await this.store.state(directory);
            return operation({ directory, binding, connection, record, refreshAccess });
        });
        return { ...result, productionSwitchEnabled: authorization.productionSwitchEnabled === true };
    }

    async assertReviewedRouting({ directory, record, refreshAccess }, routing) {
        if (record.state.routingChanged) throw new Error('The live website changed outside Weblab. Review its connection again.');
        if (routing.current === record.state.live?.deploymentId &&
            destinationHash(routing) === destinationHash({ aliases: (record.state.target?.domains ?? []).map((name) => ({ name })) })) return;
        await refreshAccess();
        const latest = await this.store.state(directory);
        latest.state.routingChanged = true;
        latest.state.observedRouting = { deploymentId: routing.current, domains: routing.aliases.map((alias) => alias.name) };
        await this.store.saveState(directory, latest.state, latest.bytes);
        throw new Error('Another publisher changed the live version or the destination domains changed. Review the connection again.');
    }

    async clearRefusedIntent(directory, expectedIntent) {
        // A definite refusal proves this owned request did not mutate Vercel.
        // Retire only its intent, even if the initiating window was closed.
        const latest = await this.store.state(directory);
        if (JSON.stringify(latest.state.pending) !== JSON.stringify(expectedIntent)) throw new Error('The publishing request changed. Check its status.');
        latest.state.pending = null;
        await this.store.saveState(directory, latest.state, latest.bytes);
    }

    async connect(input) {
        return this.withProject(input, async ({ directory, binding, connection, record, refreshAccess }) => {
            if (record.state.pending) throw new Error('Reconcile the pending publication before changing its connection.');
            if (connection && (connection.projectId !== input.vercelProjectId || (connection.teamId ?? null) !== (input.teamId ?? null))) {
                throw new Error('This site is already connected to another Vercel project.');
            }
            const candidate = { token: input.vercelToken, projectId: input.vercelProjectId, teamId: input.teamId || undefined };
            const api = this.apiFactory(candidate);
            const project = await api.project();
            const routing = await api.routing();
            const previous = await api.deployment(routing.current);
            if (previous.readyState !== 'READY' || previous.target !== 'production') throw new Error('A ready previous production version is required for rollback.');
            await api.environmentBindings([]);
            await refreshAccess();
            if (record.state.live && (routing.current !== record.state.live.deploymentId ||
                destinationHash(routing) !== destinationHash({ aliases: (record.state.target?.domains ?? []).map((name) => ({ name })) }))) record.state.routingChanged = true;
            record.state.observedRouting = { deploymentId: routing.current, domains: routing.aliases.map((alias) => alias.name) };
            record.state.target = { projectId: candidate.projectId, teamId: candidate.teamId ?? null,
                name: project.name, domains: routing.aliases.map((alias) => alias.name) };
            await this.store.saveConnection(directory, { ...candidate, accountId: project.accountId, binding });
            if (!record.state.live) {
                record.state.live = { deploymentId: routing.current, releaseId: null, previousDeploymentId: null };
            }
            await this.store.saveState(directory, record.state, record.bytes);
            return { connected: true, name: project.name, ...publicState(record.state) };
        });
    }

    async acceptLive(input) {
        return this.withProject(input, async ({ directory, connection, record, refreshAccess }) => {
            if (!connection || record.state.pending) throw new Error('Reconcile pending publishing before reviewing the connection.');
            const api = this.apiFactory(connection);
            const project = await api.project();
            const routing = await api.routing();
            if (routing.current !== input.expectedLiveDeploymentId ||
                destinationHash(routing) !== destinationHash({ aliases: input.expectedDomains.map((name) => ({ name })) })) {
                throw new Error('The live website changed again. Review its current version first.');
            }
            const deployment = await api.deployment(routing.current);
            if (deployment.readyState !== 'READY' || deployment.target !== 'production') throw new Error('A ready production version is required.');
            const verified = await api.routing();
            if (verified.current !== routing.current || destinationHash(verified) !== destinationHash(routing)) throw new Error('The live website changed again.');
            await refreshAccess();
            record.state.live = { deploymentId: routing.current, releaseId: null, previousDeploymentId: null };
            record.state.target = { projectId: connection.projectId, teamId: connection.teamId ?? null, name: project.name, domains: routing.aliases.map((alias) => alias.name) };
            record.state.routingChanged = false;
            record.state.observedRouting = { deploymentId: routing.current, domains: record.state.target.domains };
            await this.store.saveState(directory, record.state, record.bytes);
            return { connected: true, ...publicState(record.state) };
        });
    }

    async review(input) {
        return this.withProject(input, async ({ directory, binding, connection, record, refreshAccess }) => {
            if (!connection) throw new Error('Connect your Vercel project first.');
            if (record.state.pending) throw new Error('Reconcile the pending publication before reviewing another version.');
            if (record.state.routingChanged) throw new Error('The live website changed outside Weblab. Review its connection again.');
            if (record.state.releases.length >= 100) throw new Error('Publishing history reached its storage limit.');
            const source = await this.snapshot(binding.root, input.planToken, input.cleanedFiles);
            const frozen = freezeFiles(source.files);
            assertSourceOnlyRelease(frozen);
            const api = this.apiFactory(connection);
            const project = await api.project();
            const environmentHash = await api.environmentBindings([]);
            const routing = await api.routing();
            await this.assertReviewedRouting({ directory, record, refreshAccess }, routing);
            await refreshAccess();
            const id = randomUUID();
            const artifactHash = await this.store.saveArtifact(directory, id, frozen);
            record.state.releases.push({
                id, artifactHash, sourceHash: frozen.hash, planToken: input.planToken,
                copyId: source.copyId, settingsHash: settingsHash(project), environmentHash,
                destinationHash: destinationHash(routing), target: { projectId: connection.projectId,
                    teamId: connection.teamId ?? null, name: project.name, domains: routing.aliases.map((alias) => alias.name) },
                sharedPublicConfig: api.sharedPublicConfig ?? [],
                previousDeploymentId: routing.current, createdAt: this.now(),
                changedFiles: source.changedFiles ?? input.cleanedFiles.map((file) => file.path),
                includedPaths: source.includedPaths ?? frozen.files.map((file) => file.path), skippedPaths: source.skippedPaths ?? [],
            });
            await this.store.saveState(directory, record.state, record.bytes);
            return { ...publicState(record.state), createdReleaseId: id };
        }, { sourcePublication: true });
    }

    async startBuild(input) {
        return this.withProject(input, async ({ directory, binding, connection, record, refreshAccess }) => {
            if (!connection) throw new Error('Connect Vercel first.');
            if (record.state.pending) throw new Error('A Vercel request is pending. Check its status first.');
            if (record.state.routingChanged) throw new Error('The live website changed outside Weblab. Review its connection again.');
            const release = record.state.releases.find((item) => item.id === input.releaseId);
            if (!release) throw new Error('Review this version before building it.');
            const production = input.production === true;
            if (production && release.preview?.readyState !== 'READY') throw new Error('Check the ready protected preview before building production.');
            const artifact = freezeFiles((await this.store.artifact(directory, release.id, release.artifactHash)).files);
            if (artifact.hash !== release.sourceHash) throw new Error('The reviewed version changed.');
            assertSourceOnlyRelease(artifact);
            const api = this.apiFactory(connection);
            const project = await api.project();
            if (settingsHash(project) !== release.settingsHash || await api.environmentBindings([]) !== release.environmentHash) throw new Error('Vercel settings or environment values changed. Review again.');
            const routing = await api.routing();
            await this.assertReviewedRouting({ directory, record, refreshAccess }, routing);
            if (destinationHash(routing) !== release.destinationHash) throw new Error('The destination domains changed. Review again.');
            await this.validateSnapshot(binding.root, release.copyId, release.planToken);
            const target = production ? 'production' : 'preview';
            if (release[target]) throw new Error('This version already has a build. Check its status.');
            await refreshAccess();
            record.state.pending = { kind: 'build', releaseId: release.id, target, requestId: randomUUID(), startedAt: this.now() };
            await this.store.saveState(directory, record.state, record.bytes);
            // Persist intent first. An ambiguous response is never retried blindly.
            let created;
            const beforePost = async () => {
                const currentRouting = await api.routing();
                await this.assertReviewedRouting({ directory, record, refreshAccess }, currentRouting);
                if (settingsHash(await api.project()) !== release.settingsHash || await api.environmentBindings([]) !== release.environmentHash ||
                    destinationHash(currentRouting) !== release.destinationHash) throw new Error('The reviewed publication settings changed. Review again.');
                await this.validateSnapshot(binding.root, release.copyId, release.planToken);
                await refreshAccess();
            };
            try { created = await api.create({ release: artifact, releaseId: release.id, production, beforePost }); }
            catch (error) {
                if (error.uncertain === false) {
                    await this.clearRefusedIntent(directory, record.state.pending);
                }
                throw error;
            }
            await refreshAccess();
            const latest = await this.store.state(directory);
            const row = latest.state.releases.find((item) => item.id === release.id);
            row[target] = created;
            latest.state.pending = null;
            await this.store.saveState(directory, latest.state, latest.bytes);
            return publicState(latest.state);
        }, { sourcePublication: true, productionSwitch: input.production === true });
    }

    async status(input) {
        return this.withProject(input, async ({ directory, connection, record, refreshAccess }) => {
            if (!connection) return { connected: false, ...publicState(record.state) };
            const api = this.apiFactory(connection);
            const project = await api.project();
            let routing = await api.routing();
            const priorDomains = record.state.target?.domains ?? [];
            record.state.target = { projectId: connection.projectId, teamId: connection.teamId ?? null,
                name: project.name, domains: routing.aliases.map((alias) => alias.name) };
            if (record.state.pending?.kind === 'build') {
                const pending = record.state.pending;
                const release = record.state.releases.find((item) => item.id === pending.releaseId);
                if (!release) throw new Error('Pending release is missing.');
                const found = await api.findBuild({ releaseId: release.id, sourceHash: release.sourceHash,
                    production: pending.target === 'production', since: pending.startedAt - 5000 });
                if (found) {
                    release[pending.target] = found;
                    record.state.pending = null;
                }
            }
            for (const release of record.state.releases) {
                for (const target of ['preview', 'production']) {
                    if (!release[target]) continue;
                    const deployment = await api.deployment(release[target].id);
                    if (deployment.meta?.weblabReleaseId !== release.id || deployment.meta?.weblabSourceHash !== release.sourceHash ||
                        (target === 'production' ? deployment.target !== 'production' : deployment.target === 'production')) throw new Error('The saved deployment binding changed.');
                    release[target] = { id: deployment.id, readyState: deployment.readyState, url: deployment.url };
                }
            }
            if (record.state.pending?.kind === 'switch') {
                const pending = record.state.pending;
                const result = await api.confirmSwitch(pending.deploymentId, pending.startedAt - 5000);
                routing = await api.routing();
                if (result.confirmed && routing.current === pending.deploymentId && destinationHash(routing) === pending.destinationHash) {
                    record.state.live = { deploymentId: pending.deploymentId, previousDeploymentId: pending.previousDeploymentId, releaseId: pending.releaseId };
                    const release = record.state.releases.find((item) => item.id === pending.releaseId);
                    if (release) release.publishedAt = this.now();
                    record.state.pending = null;
                } else if (result.failed) {
                    const routing = await api.routing();
                    if (routing.current === pending.previousDeploymentId) record.state.pending = null;
                }
            }
            record.state.observedRouting = { deploymentId: routing.current, domains: routing.aliases.map((alias) => alias.name) };
            const switchPending = record.state.pending?.kind === 'switch' ? record.state.pending : null;
            const matchesExpected = routing.current === record.state.live?.deploymentId || (switchPending && routing.current === switchPending.deploymentId);
            record.state.routingChanged = record.state.routingChanged === true || !matchesExpected ||
                destinationHash(routing) !== (switchPending?.destinationHash ?? destinationHash({ aliases: priorDomains.map((name) => ({ name })) }));
            await refreshAccess();
            await this.store.saveState(directory, record.state, record.bytes);
            return { connected: true, ...publicState(record.state) };
        });
    }

    async publish(input, rollback = false) {
        return this.withProject(input, async ({ directory, binding, connection, record, refreshAccess }) => {
            if (!connection || !record.state.live) throw new Error('Connect Vercel first.');
            if (record.state.pending) throw new Error('A Vercel request is pending. Check its status first.');
            if (record.state.routingChanged) throw new Error('The live website changed outside Weblab. Review its connection again.');
            if (rollback && (input.expectedLiveDeploymentId !== record.state.live.deploymentId ||
                input.expectedPreviousDeploymentId !== record.state.live.previousDeploymentId)) throw new Error('The version to restore changed. Review rollback again.');
            const release = record.state.releases.find((item) => item.id === input.releaseId);
            const deploymentId = rollback ? record.state.live.previousDeploymentId : release?.production?.id;
            if (!deploymentId || (!rollback && release.production.readyState !== 'READY')) throw new Error('A ready saved production version is required.');
            if (!rollback) {
                const artifact = freezeFiles((await this.store.artifact(directory, release.id, release.artifactHash)).files);
                if (artifact.hash !== release.sourceHash) throw new Error('The reviewed version changed.');
                assertSourceOnlyRelease(artifact);
            }
            const api = this.apiFactory(connection);
            const routing = await api.routing();
            await this.assertReviewedRouting({ directory, record, refreshAccess }, routing);
            if (rollback && destinationHash(routing) !== destinationHash({ aliases: (input.expectedDomains ?? []).map((name) => ({ name })) })) throw new Error('The rollback destination changed. Review rollback again.');
            if (!rollback && destinationHash(routing) !== release.destinationHash) throw new Error('The destination domains changed. Review again.');
            if (!rollback && (settingsHash(await api.project()) !== release.settingsHash || await api.environmentBindings([]) !== release.environmentHash)) throw new Error('The reviewed publication settings changed. Review again.');
            if (!rollback) await this.validateSnapshot(binding.root, release.copyId, release.planToken);
            await refreshAccess();
            record.state.pending = { kind: 'switch', deploymentId, previousDeploymentId: routing.current, releaseId: rollback ? null : release.id, destinationHash: destinationHash(routing), requestId: randomUUID(), startedAt: this.now() };
            await this.store.saveState(directory, record.state, record.bytes);
            const beforePost = async () => {
                const currentRouting = await api.routing();
                await this.assertReviewedRouting({ directory, record, refreshAccess }, currentRouting);
                if (!rollback) {
                    if (settingsHash(await api.project()) !== release.settingsHash || await api.environmentBindings([]) !== release.environmentHash) {
                        throw new Error('The reviewed publication settings changed. Review again.');
                    }
                    await this.validateSnapshot(binding.root, release.copyId, release.planToken);
                }
                await refreshAccess();
            };
            try { await api.switchProduction(deploymentId, { rollback, beforePost }); }
            catch (error) {
                if (error.uncertain === false) {
                    await this.clearRefusedIntent(directory, record.state.pending);
                }
                throw error;
            }
            await refreshAccess();
            // Status reconciliation verifies all aliases, not just an accepted API request.
            return publicState(record.state);
        }, { sourcePublication: !rollback, productionSwitch: true });
    }
}

module.exports = { PublishingService, settingsHash, destinationHash, publicState, publicDeployment };
