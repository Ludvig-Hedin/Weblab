'use strict';

const CREDENTIAL_DIRS = new Set(['.codex', '.claude', '.ssh', '.aws', '.azure', '.gcloud', '.docker', '.vercel', '.netlify']);
const CREDENTIAL_FILE = /^(?:\.npmrc|\.yarnrc(?:\.yml)?|\.pypirc|\.netrc|\.authinfo|\.git-credentials|(?:credentials|secrets?)(?:\.(?:[a-z0-9_-]+\.)*(?:json|ya?ml|toml|ini|conf|txt))?|.*(?:service-account|firebase-adminsdk).*\.json|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|keystore))$/i;

function privateCredentialPath(file) {
    const parts = file.replaceAll('\\', '/').split('/').map((part) => part.toLowerCase());
    return parts.some((part, index) => part.startsWith('.env') || CREDENTIAL_DIRS.has(part) || CREDENTIAL_FILE.test(part) ||
        (index > 0 && parts[index - 1] === '.config' && ['gcloud', 'aws', 'azure', 'gh', 'op', 'sops'].includes(part)));
}

function privateCopyExclusion(file) {
    if (privateCredentialPath(file)) return 'credentials';
    const parts = file.replaceAll('\\', '/').split('/');
    if (parts.includes('node_modules')) return 'dependencies';
    if (parts.includes('.next')) return 'generated';
    return null;
}

module.exports = { privateCredentialPath, privateCopyExclusion };
