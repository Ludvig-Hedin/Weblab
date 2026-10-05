'use strict';

const fs = require('node:fs');
const path = require('node:path');

// The whole-site engine pins one customer's approved source files, so it stays
// out of the repository. Builds made without it ship with content preparation off.
const ENGINE_ROOT = path.join(__dirname, 'sanity-site');
const MODULES = new Set(['index', 'contract', 'runtime']);

function hasSiteEngine() {
    return fs.existsSync(path.join(ENGINE_ROOT, 'index.js'));
}

function requireSiteEngine(name = 'index') {
    if (!MODULES.has(name)) throw new Error('Unknown website engine module.');
    if (!hasSiteEngine()) throw new Error('Whole-site content preparation is unavailable in this build.');
    return require(path.join(ENGINE_ROOT, `${name}.js`));
}

module.exports = { hasSiteEngine, requireSiteEngine };
