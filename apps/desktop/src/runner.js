// Opening a site: install if needed, then start the Airship CLI (which starts
// the site's own dev command and the editor proxy) and hand back its URL.
// One site at a time.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const { join } = require("node:path");
const { cliEntry, bunBinary, childEnv } = require("./runtime");
const { stopTree } = require("./procs");
const auth = require("./auth");

const LOG_LIMIT = 400;
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
    this.install = null;
    this.log = [];
    this.token = 0;
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
    return Boolean(this.child || this.install);
  }

  async open(site) {
    await this.stop();
    this.token += 1;
    const { token } = this;
    const current = () => token === this.token;
    this.log = [];
    this.appendLog(`Opening ${site.path}`);
    try {
      if (!fs.existsSync(site.path)) {
        throw new Friendly(
          "We can’t find this site’s folder. It may have been moved or deleted."
        );
      }
      if (!fs.existsSync(join(site.path, "node_modules"))) {
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
      const url = await this.startCli(site.path, current);
      if (!current()) {
        return;
      }
      this.onEvent({ step: "Opening the editor…", type: "progress" });
      this.onEvent({ type: "ready", url });
    } catch (err) {
      if (!current()) {
        return;
      }
      this.appendLog(err?.stack ? err.stack : String(err));
      await this.stop();
      this.onEvent({
        details: this.logTail(),
        message:
          err instanceof Friendly
            ? err.message
            : "Something went wrong while starting your site.",
        type: "error",
      });
    }
  }

  runInstall(cwd) {
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
          reject(
            new Friendly(
              "We couldn’t download what your site needs. Check your internet connection and try again."
            )
          );
        }
      });
    });
  }

  async startCli(cwd, current) {
    const port = await freePort(4100);
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
      "--exec",
      "bun run dev",
      "--target",
      String(port),
      "--agent",
      "claude",
      "--json",
    ];
    this.appendLog(`Starting editor on site port ${port}`);
    const child = spawn(process.execPath, args, {
      cwd,
      detached: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

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
    const { install, child } = this;
    this.install = null;
    this.child = null;
    await Promise.all([stopTree(install, 3000), stopTree(child, 6000)]);
  }
}

class Friendly extends Error {}

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
