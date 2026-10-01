// Opening a site: install if needed, then start the Airship CLI (which starts
// the site's own dev command and the editor proxy) and hand back its URL.
// Each window owns one runner, and each runner opens one site at a time.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const { join } = require("node:path");
const { cliEntry, bunBinary, childEnv } = require("./runtime");
const { snapshotTree, stopGroups, stopTree } = require("./procs");
const auth = require("./auth");
const { createStaticSite } = require("./static-site");
const sites = require("./sites");

const LOG_LIMIT = 400;
const reservedPorts = new Set();
let portQueue = Promise.resolve();
const LINE_BREAK = /\r?\n/;
// Built from a char code so no control character sits in a regex literal.
const CSI_SEQUENCE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`,
  "g"
);

class SiteRunner {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.child = null;
    // Process groups seen under the running site, so nothing it started
    // (even a detached background job) outlives it.
    this.groups = new Set();
    this.watch = null;
    this.install = null;
    this.log = [];
    this.token = 0;
    this.port = null;
    this.staticServer = null;
    this.locationWatch = null;
  }

  appendLog(text) {
    for (const line of String(text).split(LINE_BREAK)) {
      if (line.trim()) {
        this.log.push(line.replace(CSI_SEQUENCE, ""));
      }
    }
    if (this.log.length > LOG_LIMIT) {
      this.log.splice(0, this.log.length - LOG_LIMIT);
    }
  }

  logTail(lines = 80) {
    return this.log.slice(-lines).join("\n");
  }

  get running() {
    return Boolean(this.child || this.install || this.staticServer);
  }

  /** `fresh` clears the site's build cache first, which a crashed start can leave broken. */
  async open(requestedSite, { fresh = false } = {}) {
    await this.stop();
    this.token += 1;
    const { token } = this;
    const current = () => token === this.token;
    this.log = [];
    this.appendLog(`Opening ${requestedSite.path}`);
    try {
      const site = await this.prepareRoot(requestedSite, fresh, current);
      if (!site) {
        return;
      }
      this.watchRoot(site, current);
      if (!fs.existsSync(site.path)) {
        throw new Friendly(
          "We can’t find this site’s folder. It may have been moved or deleted."
        );
      }
      if (site.entry && !fs.existsSync(join(site.path, site.entry))) {
        throw new Friendly(
          "We can’t find this HTML file. It may have been moved or deleted."
        );
      }
      if (!(site.entry || fs.existsSync(join(site.path, "node_modules")))) {
        this.onEvent({
          step: "Setting up for the first time. This can take a minute.",
          type: "progress",
        });
        await this.runInstall(site.path);
        if (!current()) {
          return;
        }
      }
      this.onEvent({ step: "Starting your site…", type: "progress" });
      await sites.assertVerified(site);
      if (!current()) {
        return;
      }
      const url = await this.startCli(site.path, current, site.entry, site);
      if (!current()) {
        return;
      }
      this.onEvent({ step: "Opening the editor…", type: "progress" });
      this.onEvent({ siteUrl: this.siteUrl, type: "ready", url });
    } catch (err) {
      if (!current()) {
        return;
      }
      if (!(err instanceof Friendly)) {
        this.appendLog(err?.stack ? err.stack : String(err));
      }
      await this.stop();
      this.onEvent({
        details: this.logTail(),
        message: startupMessage(err),
        type: "error",
      });
    }
  }

  async prepareRoot(requestedSite, fresh, current) {
    const site = await sites.verified(requestedSite.id, { resolve: true });
    if (!current()) {
      return null;
    }
    this.boundSite = site;
    if (fresh && !site.entry) {
      await sites.assertVerified(site);
      if (!current()) {
        return null;
      }
      sites.checkVerifiedSite(site);
      const cache = join(site.path, ".next");
      if (fs.existsSync(cache) && fs.lstatSync(cache).isSymbolicLink()) {
        throw new Friendly(
          "The site’s build cache needs checking before a fresh start."
        );
      }
      fs.rmSync(cache, { force: true, recursive: true });
    }
    return site;
  }

  watchRoot(site, current) {
    this.locationWatch = setInterval(() => {
      if (!current() || sites.currentRootMatches(site)) {
        return;
      }
      this.stop().then(() =>
        this.onEvent({
          message:
            "The site’s folder moved or changed. Close this site, then use Show details to reconnect it.",
          type: "error",
        })
      );
    }, 500);
  }

  runInstall(cwd) {
    if (this.boundSite?.path === cwd) {
      sites.checkVerifiedSite(this.boundSite);
    } else {
      sites.checkVerifiedPath(cwd);
    }
    return new Promise((resolve, reject) => {
      const child = spawn(bunBinary(), ["install", "--no-progress"], {
        cwd,
        detached: true,
        env: childEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.install = child;
      let packages = 0;
      const onData = (chunk) => {
        const text = chunk.toString();
        this.appendLog(text);
        const added = text.match(/^\s*\+ /gm);
        if (added) {
          packages += added.length;
          this.onEvent({
            step: `Setting up for the first time. ${packages} pieces added.`,
            type: "progress",
          });
        }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("error", (err) => {
        this.install = null;
        reject(err);
      });
      child.on("exit", (code) => {
        this.install = null;
        if (code === 0) {
          resolve();
        } else {
          reject(new Friendly("Weblab couldn’t install what your site needs."));
        }
      });
    });
  }

  async startCli(cwd, current, entry, site) {
    const port = await reservePort();
    if (!current()) {
      releasePort(port);
      return null;
    }
    this.port = port;
    if (site) {
      await sites.assertVerified(site);
    }
    if (!current()) {
      releasePort(port);
      return null;
    }
    let staticServer = null;
    if (entry) {
      staticServer = createStaticSite(cwd, entry);
      this.staticServer = staticServer;
      await new Promise((resolve, reject) => {
        staticServer.once("error", reject);
        staticServer.listen(port, "127.0.0.1", resolve);
      });
    }
    // The site's own dev server, without the editor on top.
    this.siteUrl = `http://localhost:${port}/`;
    const env = childEnv({
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
    });
    const key = auth.readApiKey();
    if (key) {
      env.ANTHROPIC_API_KEY = key;
    }

    const args = [
      cliEntry(),
      "--cwd",
      cwd,
      ...(entry ? [] : ["--exec", "bun run dev"]),
      "--target",
      String(port),
      "--agent",
      "claude",
      "--json",
    ];
    this.appendLog(`Starting editor on site port ${port}`);
    if (site) {
      sites.checkVerifiedSite(site);
    }
    const child = spawn(process.execPath, args, {
      cwd,
      detached: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.groups = new Set();
    const remember = () => {
      for (const group of snapshotTree(child.pid).groups) {
        this.groups.add(group);
      }
    };
    clearInterval(this.watch);
    this.watch = setInterval(remember, 1000);

    return new Promise((resolve, reject) => {
      let stdout = "";
      let settled = false;
      const finish = (fn, value) => {
        if (settled) {
          return;
        }
        settled = true;
        fn(value);
      };
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        const start = stdout.indexOf("{");
        const end = stdout.lastIndexOf("}");
        if (start === -1 || end <= start) {
          return;
        }
        try {
          const info = JSON.parse(stdout.slice(start, end + 1));
          if (info.url) {
            this.appendLog(`Editor ready at ${info.url}`);
            finish(resolve, info.url);
          }
        } catch {
          // Not complete yet.
        }
      });
      child.stderr.on("data", (chunk) => this.appendLog(chunk.toString()));
      child.on("error", (err) => finish(reject, err));
      child.on("exit", (code, signal) => {
        if (this.staticServer === staticServer && staticServer) {
          staticServer.stopStaticSite();
          this.staticServer = null;
        }
        releasePort(port);
        if (this.port === port) {
          this.port = null;
        }
        this.appendLog(`Editor stopped (${signal || `code ${code}`})`);
        if (this.child === child) {
          this.child = null;
        }
        if (!settled) {
          finish(
            reject,
            new Friendly("Something in the site stopped it from starting.")
          );
        } else if (current()) {
          clearInterval(this.watch);
          clearInterval(this.locationWatch);
          this.locationWatch = null;
          stopGroups(this.groups);
          this.onEvent({
            details: this.logTail(),
            message: "Your site stopped unexpectedly.",
            type: "error",
          });
        }
      });
    });
  }

  async stop() {
    this.token += 1;
    const { install, child, groups, staticServer } = this;
    this.staticServer = null;
    clearInterval(this.watch);
    clearInterval(this.locationWatch);
    this.locationWatch = null;
    if (child?.pid && child.exitCode === null) {
      for (const group of snapshotTree(child.pid).groups) {
        groups.add(group);
      }
    }
    this.install = null;
    this.child = null;
    this.groups = new Set();
    await Promise.all([stopTree(install, 3000), stopTree(child, 6000)]);
    if (staticServer) {
      await staticServer.stopStaticSite();
    }
    await stopGroups(groups);
    releasePort(this.port);
    this.port = null;
  }
}

function releasePort(port) {
  if (port !== null) {
    reservedPorts.delete(port);
    reservedPorts.delete(port + 1);
  }
}

function reservePort() {
  const next = portQueue.then(async () => {
    const port = await freePort(4100);
    reservedPorts.add(port);
    reservedPorts.add(port + 1);
    return port;
  });
  portQueue = next.catch(() => undefined);
  return next;
}

class Friendly extends Error {}

function startupMessage(error) {
  return error instanceof Friendly || error.code === "source-unavailable"
    ? error.message
    : "Something went wrong while starting your site.";
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    // Only "taken" counts as taken; a missing IPv6 stack is not a clash.
    server.once("error", (err) =>
      resolve(!["EADDRINUSE", "EACCES"].includes(err.code))
    );
    server.listen({ exclusive: true, host, port }, () =>
      server.close(() => resolve(true))
    );
  });
}

/** First port from `start` that is free on IPv4 and IPv6, with the next one free too for the editor. */
async function freePort(start) {
  for (let port = start; port < start + 400; port += 1) {
    if (reservedPorts.has(port) || reservedPorts.has(port + 1)) {
      continue;
    }
    // Ports are probed one at a time on purpose: stop at the first free one.
    const free =
      // biome-ignore lint/performance/noAwaitInLoops: sequential probe by design
      (await portFree(port, "127.0.0.1")) &&
      (await portFree(port, "::1")) &&
      (await portFree(port, "::")) &&
      (await portFree(port + 1, "127.0.0.1"));
    if (free) {
      return port;
    }
  }
  throw new Friendly(
    "Your Mac has no free room to run the site. Restart it and try again."
  );
}

module.exports = { SiteRunner };
