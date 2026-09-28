// Deploy: puts the site folder, exactly as it is, on Vercel. Never touches git.
//
// Runs Vercel's own command line tool through the Bun that ships with the app
// (`bun x`, pinned), so sign-in, framework detection and uploads behave the way
// Vercel documents them. Sign-in is Vercel's device flow in the browser; the
// token stays in Vercel's own config, never with Weblab.
//
// The site's link lives where Vercel keeps it, in `.vercel/project.json`. A new
// link is only ever made to a project found by this site's GitHub repository,
// or to a brand-new project under a name we checked is free. Never to an
// existing project that merely shares the name.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { join } = require("node:path");
const { shell } = require("electron");
const { bunBinary, childEnv } = require("./runtime");

const VERCEL = "vercel@60.1.3";
const LOG_LINES = 80;
const DEVICE_URL = /https:\/\/vercel\.com\/oauth\/device\S*/;
const DEVICE_CODE = /user_code=([A-Z0-9-]+)/;
const DEPLOY_URL = /https:\/\/[^\s]+\.vercel\.app/;
const QUOTED = /^(["'])(.*)\1$/;
const TRAILING_COMMENT = /\s+#.*$/;
const STEP_UPLOAD = /upload|inspect/i;
const STEP_BUILD = /build|install|compil|running "/i;
const STEP_ONLINE = /complet|ready|alias|production:|preview:/i;
const FAILURE_HINT = /error|failed|cannot|not found/i;
const ERROR_PREFIX = /^Error:\s*/i;
const NOT_FOUND = /\b404\b|not[_ ]found/i;
const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

/** Runs the Vercel CLI. Resolves { code, stdout, stderr }; never rejects. */
function vercel(cwd, args, { input, onLine, timeout = 120_000, track } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(bunBinary(), ["x", VERCEL, ...args, "--no-color"], {
        cwd,
        detached: true,
        env: childEnv({ VERCEL_TELEMETRY_DISABLED: "1" }),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ code: 1, stderr: String(error), stdout: "" });
      return;
    }
    track?.(child);
    const timer = setTimeout(() => stopGroup(child), timeout);
    const lines = (chunk, sink) => {
      const text = String(chunk);
      for (const line of text.split("\n")) {
        if (line.trim()) {
          onLine?.(line.trim());
        }
      }
      return sink + text;
    };
    child.stdout.on("data", (chunk) => {
      stdout = lines(chunk, stdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr = lines(chunk, stderr);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stderr: String(error), stdout });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr, stdout });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input ?? "");
  });
}

/** Stops a CLI run and everything it started (it runs in its own group). */
function stopGroup(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

/** One Vercel API call through `vercel api`. Resolves { ok, data }. */
async function api(cwd, path, { method = "GET", body } = {}) {
  const args = ["api", path, "--raw", "--non-interactive", "-X", method];
  if (body !== undefined) {
    args.push("--input", "-");
  }
  const result = await vercel(cwd, args, {
    input: body === undefined ? "" : JSON.stringify(body),
    timeout: 60_000,
  });
  if (result.code !== 0) {
    const text = (result.stderr || result.stdout).slice(-400);
    return { notFound: NOT_FOUND.test(text), ok: false, text };
  }
  try {
    return { data: JSON.parse(result.stdout), ok: true };
  } catch {
    return { data: null, ok: true };
  }
}

let whoCache = null;

/** { connected, user }. Cached for a minute; `fresh` skips the cache. */
async function account({ fresh = false } = {}) {
  if (!fresh && whoCache && Date.now() - whoCache.at < 60_000) {
    return whoCache.value;
  }
  const result = await vercel(process.env.HOME || "/", ["whoami"], {
    timeout: 60_000,
  });
  const user = result.stdout.trim().split("\n").pop() || "";
  const value = { connected: result.code === 0 && Boolean(user), user };
  whoCache = { at: Date.now(), value };
  return value;
}

let loginChild = null;

function cancelLogin() {
  if (loginChild) {
    stopGroup(loginChild);
  }
  loginChild = null;
}

/**
 * Vercel's browser sign-in. Opens the device page for the person and resolves
 * { ok } when Vercel reports back. `onEvent` gets { type: 'url', url, code }.
 */
async function login(onEvent) {
  cancelLogin();
  let opened = false;
  let mine = null;
  const result = await vercel(process.env.HOME || "/", ["login"], {
    onLine: (line) => {
      const url = DEVICE_URL.exec(line)?.[0];
      if (url && !opened) {
        opened = true;
        shell.openExternal(url);
        onEvent({ code: DEVICE_CODE.exec(url)?.[1] || "", type: "url", url });
      }
    },
    timeout: 15 * 60_000,
    track: (child) => {
      mine = child;
      loginChild = child;
    },
  });
  if (loginChild === mine) {
    loginChild = null;
  }
  whoCache = null;
  return result.code === 0
    ? { ok: true }
    : { message: "Vercel sign-in didn’t finish.", ok: false };
}

function readLink(cwd) {
  try {
    const link = JSON.parse(
      fs.readFileSync(join(cwd, ".vercel/project.json"), "utf8")
    );
    return link.projectId && link.orgId ? link : null;
  } catch {
    return null;
  }
}

function writeLink(cwd, project, orgId) {
  fs.mkdirSync(join(cwd, ".vercel"), { recursive: true });
  fs.writeFileSync(
    join(cwd, ".vercel/project.json"),
    JSON.stringify({
      orgId: orgId || project.accountId,
      projectId: project.id,
      projectName: project.name,
    })
  );
}

/** Adds a line to an ignore file unless it is already there. */
function ensureIgnored(cwd, file, pattern) {
  const path = join(cwd, file);
  let text = "";
  try {
    text = fs.readFileSync(path, "utf8");
  } catch {
    // A new file.
  }
  if (text.split("\n").some((line) => line.trim() === pattern)) {
    return;
  }
  const lead = text && !text.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(path, `${text}${lead}${pattern}\n`);
}

const scope = (link) => `teamId=${encodeURIComponent(link.orgId)}`;

/**
 * The account new projects go in: the default team when the person has one,
 * else their personal account. Every call below names it explicitly, so a
 * lookup and a create can never land in two different teams.
 */
async function owner(cwd) {
  const me = await api(cwd, "/v2/user");
  const user = me.data?.user;
  if (!(me.ok && user)) {
    return null;
  }
  return {
    orgId: user.defaultTeamId || user.id,
    teamId: user.defaultTeamId || "",
  };
}

const teamQuery = (who, lead) =>
  who.teamId ? `${lead}teamId=${encodeURIComponent(who.teamId)}` : "";

async function projectForRepo(cwd, repo, who) {
  const query = `repoUrl=${encodeURIComponent(`https://github.com/${repo.owner}/${repo.name}`)}`;
  const found = await api(cwd, `/v9/projects?${query}${teamQuery(who, "&")}`);
  return found.data?.projects?.[0] || null;
}

/** A project name nobody uses yet. Only a clear "not found" counts as free. */
async function freeName(cwd, base, who) {
  for (let n = 1; n <= 20; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    // biome-ignore lint/performance/noAwaitInLoops: stops at the first free name
    const taken = await api(
      cwd,
      `/v9/projects/${encodeURIComponent(name)}${teamQuery(who, "?")}`
    );
    if (!taken.ok && taken.notFound) {
      return name;
    }
    if (!taken.ok) {
      return null;
    }
  }
  return null;
}

const FRAMEWORKS = [
  ["next", "nextjs"],
  ["astro", "astro"],
  ["nuxt", "nuxtjs"],
  ["@sveltejs/kit", "sveltekit-1"],
  ["@remix-run/react", "remix"],
  ["gatsby", "gatsby"],
  ["vite", "vite"],
];

/** Vercel's framework preset for the site, read from package.json. */
function framework(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(join(cwd, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return FRAMEWORKS.find(([dep]) => deps[dep])?.[1] || null;
  } catch {
    return null;
  }
}

const PROJECT_NAME_CHARS = /[^a-z0-9-]+/g;

function projectBase(name) {
  return (
    String(name || "")
      .toLowerCase()
      .replace(PROJECT_NAME_CHARS, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "website"
  );
}

const SETUP_FAILED = "Weblab couldn’t set up the site on Vercel. Try again.";

/**
 * Makes sure the folder is linked to the right Vercel project. Returns
 * { ok, link, created }. Never uses `vercel link`: with --yes it also connects
 * the GitHub repository, which would make every Upload a deploy.
 */
async function ensureLinked(cwd, { name, repo }) {
  const existing = readLink(cwd);
  if (existing) {
    return { created: false, link: existing, ok: true };
  }
  const who = await owner(cwd);
  if (!who) {
    return { message: SETUP_FAILED, ok: false };
  }
  const byRepo = repo?.github ? await projectForRepo(cwd, repo, who) : null;
  if (byRepo) {
    writeLink(cwd, byRepo, who.orgId);
  } else {
    const free = await freeName(cwd, projectBase(name), who);
    if (!free) {
      return { message: SETUP_FAILED, ok: false };
    }
    const made = await api(cwd, `/v11/projects${teamQuery(who, "?")}`, {
      body: { framework: framework(cwd), name: free },
      method: "POST",
    });
    if (!made.data?.id) {
      return { details: made.text, message: SETUP_FAILED, ok: false };
    }
    writeLink(cwd, made.data, who.orgId);
    // Test links from a project Weblab made open for anyone who has the link.
    await api(cwd, `/v9/projects/${made.data.id}?${scope(readLink(cwd))}`, {
      body: { ssoProtection: null },
      method: "PATCH",
    });
  }
  ensureIgnored(cwd, ".gitignore", ".vercel");
  return { created: !byRepo, link: readLink(cwd), ok: true };
}

function unquote(raw) {
  const value = raw.trim();
  const quoted = QUOTED.exec(value);
  if (quoted) {
    return quoted[2];
  }
  return value.replace(TRAILING_COMMENT, "");
}

/** Keys and values from the site's env files. Later files win. */
function localKeys(cwd) {
  const keys = new Map();
  for (const file of ENV_FILES) {
    let text = "";
    try {
      text = fs.readFileSync(join(cwd, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const match = ENV_LINE.exec(line);
      if (match && unquote(match[2])) {
        keys.set(match[1], unquote(match[2]));
      }
    }
  }
  return keys;
}

async function remoteKeyNames(cwd, link) {
  const found = await api(
    cwd,
    `/v10/projects/${link.projectId}/env?${scope(link)}`
  );
  return new Set((found.data?.envs || []).map((env) => env.key));
}

const markerPath = (cwd) => join(cwd, ".vercel/weblab.json");

function readMarker(cwd) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(cwd), "utf8"));
  } catch {
    return {};
  }
}

function writeMarker(cwd, patch) {
  fs.mkdirSync(join(cwd, ".vercel"), { recursive: true });
  fs.writeFileSync(
    markerPath(cwd),
    JSON.stringify({ ...readMarker(cwd), ...patch })
  );
}

/**
 * Before a deploy: link the folder, then list local keys Vercel lacks, once
 * per project. Returns { ok, missingKeys, projectName }.
 */
async function prepare(cwd, site) {
  // Secret files never leave the Mac as files; keys go through Vercel's
  // settings. Checked on every deploy, not only the first.
  ensureIgnored(cwd, ".vercelignore", ".env*");
  const linked = await ensureLinked(cwd, site);
  if (!linked.ok) {
    return linked;
  }
  const { link } = linked;
  let missingKeys = [];
  if (!readMarker(cwd).keysAsked) {
    const local = localKeys(cwd);
    if (local.size > 0) {
      const remote = await remoteKeyNames(cwd, link);
      missingKeys = [...local.keys()].filter((key) => !remote.has(key));
    }
  }
  return { missingKeys, ok: true, projectName: link.projectName || "" };
}

/** Copies the named keys to Vercel for test links and the live site. */
async function sendKeys(cwd, names) {
  const link = readLink(cwd);
  if (!link) {
    return { message: "The site isn’t set up on Vercel yet.", ok: false };
  }
  const local = localKeys(cwd);
  const body = names
    .filter((key) => local.has(key))
    .map((key) => ({
      key,
      target: ["production", "preview"],
      type: "encrypted",
      value: local.get(key),
    }));
  if (body.length > 0) {
    const sent = await api(
      cwd,
      `/v10/projects/${link.projectId}/env?upsert=true&${scope(link)}`,
      { body, method: "POST" }
    );
    if (!sent.ok) {
      return { message: "Vercel didn’t take the keys.", ok: false };
    }
  }
  writeMarker(cwd, { keysAsked: true });
  return { count: body.length, ok: true };
}

function skipKeys(cwd) {
  if (readLink(cwd)) {
    writeMarker(cwd, { keysAsked: true });
  }
  return { ok: true };
}

function stepFor(line) {
  if (STEP_UPLOAD.test(line)) {
    return "upload";
  }
  if (STEP_BUILD.test(line)) {
    return "build";
  }
  if (STEP_ONLINE.test(line)) {
    return "online";
  }
  return null;
}

/** The address visitors use: a custom domain if the project has one. */
async function liveAddress(cwd, url) {
  const { host } = new URL(url);
  const link = readLink(cwd);
  const found = await api(
    cwd,
    `/v13/deployments/${encodeURIComponent(host)}${link ? `?${scope(link)}` : ""}`
  );
  const aliases = found.data?.alias || [];
  const custom = aliases.find((alias) => !alias.endsWith(".vercel.app"));
  const pick = custom || aliases.sort((a, b) => a.length - b.length)[0];
  return pick ? `https://${pick}` : url;
}

function failureLine(log) {
  const line = [...log].reverse().find((entry) => FAILURE_HINT.test(entry));
  return line ? line.replace(ERROR_PREFIX, "").slice(0, 240) : "";
}

let deployChild = null;

/**
 * Deploys the folder. `target` is "preview" (test link) or "production"
 * (live site). `onProgress` gets { step, line }.
 */
async function deploy(cwd, target, onProgress) {
  ensureIgnored(cwd, ".vercelignore", ".env*");
  const log = [];
  const args = ["deploy", "--yes", "--logs", "--non-interactive"];
  if (target === "production") {
    args.push("--prod");
  }
  const result = await vercel(cwd, args, {
    onLine: (line) => {
      log.push(line);
      if (log.length > LOG_LINES) {
        log.shift();
      }
      onProgress({ line, step: stepFor(line) });
    },
    timeout: 30 * 60_000,
    track: (child) => {
      deployChild = child;
    },
  });
  deployChild = null;
  const url = DEPLOY_URL.exec(result.stdout)?.[0];
  if (result.code !== 0 || !url) {
    return {
      log: log.join("\n"),
      message: failureLine(log),
      ok: false,
    };
  }
  writeMarker(cwd, { [target]: { at: Date.now(), url } });
  const address = target === "production" ? await liveAddress(cwd, url) : url;
  if (target === "production") {
    writeMarker(cwd, { production: { address, at: Date.now(), url } });
  }
  return { ok: true, url: address };
}

function cancelDeploy() {
  if (deployChild) {
    stopGroup(deployChild);
  }
  deployChild = null;
}

/** What the Deploy panel shows before anything is pressed. */
async function status(cwd) {
  const who = await account();
  const link = readLink(cwd);
  const marker = readMarker(cwd);
  return {
    connected: who.connected,
    lastLive: marker.production || null,
    lastTest: marker.preview || null,
    linked: Boolean(link),
    projectName: link?.projectName || "",
    user: who.user,
  };
}

module.exports = {
  account,
  cancelDeploy,
  cancelLogin,
  deploy,
  localKeys,
  login,
  prepare,
  projectBase,
  sendKeys,
  skipKeys,
  status,
  stepFor,
};
