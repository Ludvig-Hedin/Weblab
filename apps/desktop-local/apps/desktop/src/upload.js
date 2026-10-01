// Upload: the site's changes, its branches, and sending them to GitHub.
//
// Everything runs /usr/bin/git in the site folder. Pushes carry the GitHub
// sign-in through GIT_CONFIG_* variables (see github.gitAuthEnv), so the token
// is never on a command line and never saved in the repository.

const { execFile } = require("node:child_process");
const { basename, dirname } = require("node:path");
const { canUseGit, childEnv } = require("./runtime");
const github = require("./github");
const sites = require("./sites");

const GIT = "/usr/bin/git";
const SECRET = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|\.npmrc)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i;
const LOCKFILES = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package.json",
]);
const ORIGIN_PREFIX = /^origin\//;
const GITHUB_REMOTE = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/;

/** Runs git and resolves { code, stdout, stderr }. Never rejects. */
function git(cwd, args, { auth = false, timeout = 60_000 } = {}) {
  sites.checkVerifiedPath(cwd);
  // Optional locks off, so the count refreshing in the background never holds
  // index.lock while an upload is adding files.
  const extra = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };
  if (process.env.SSH_AUTH_SOCK) {
    extra.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;
  }
  if (auth) {
    Object.assign(extra, github.gitAuthEnv(github.readToken()));
  }
  return new Promise((resolve) => {
    // Authenticated runs carry the token in the environment, so the
    // repository's own hook scripts must not run and see it.
    const full = auth ? ["-c", "core.hooksPath=/dev/null", ...args] : args;
    sites.checkVerifiedPath(cwd);
    execFile(
      GIT,
      full,
      { cwd, env: childEnv(extra), maxBuffer: 16 * 1024 * 1024, timeout },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          code = typeof error.code === "number" ? error.code : 1;
        }
        resolve({
          code,
          stderr: String(stderr || ""),
          stdout: String(stdout || ""),
        });
      }
    );
  });
}

async function gitText(cwd, args) {
  const result = await git(cwd, args, { timeout: 20_000 });
  return result.code === 0 ? result.stdout.trim() : "";
}

function parseRemote(url) {
  const match = GITHUB_REMOTE.exec(url || "");
  if (!match) {
    return url ? { github: false, url } : null;
  }
  return { github: true, name: match[2], owner: match[1], url };
}

function fileKind(xy) {
  if (xy.includes("D")) {
    return "removed";
  }
  if (xy.includes("A")) {
    return "new";
  }
  if (xy.includes("R")) {
    return "renamed";
  }
  return "edited";
}

function describeFile(path, kind, from = "") {
  const dir = dirname(path);
  return {
    dir: dir === "." ? "" : dir,
    from,
    image: IMAGE.test(path),
    kind,
    name: basename(path),
    path,
    // Secret files are listed but never picked by default, and never read.
    secret: SECRET.test(path),
  };
}

/** One header line of `git status --porcelain=2 --branch` into `head`. */
function readHeader(entry, head) {
  if (entry.startsWith("# branch.head ")) {
    head.branch = entry.slice(14);
  } else if (entry.startsWith("# branch.upstream ")) {
    head.upstream = entry.slice(18);
  } else if (entry.startsWith("# branch.ab ")) {
    const [ahead, behind] = entry.slice(12).split(" ");
    head.ahead = Math.abs(Number(ahead)) || 0;
    head.behind = Math.abs(Number(behind)) || 0;
  }
}

/** One file entry, or null. Field counts are fixed by the porcelain v2 format. */
function readEntry(entry) {
  const parts = entry.split(" ");
  switch (parts[0]) {
    case "1":
      return describeFile(parts.slice(8).join(" "), fileKind(parts[1]));
    case "2":
      return describeFile(parts.slice(9).join(" "), "renamed");
    case "u":
      return describeFile(parts.slice(10).join(" "), "edited");
    case "?":
      return describeFile(entry.slice(2), "new");
    default:
      return null;
  }
}

/** Parses `git status --porcelain=2 --branch -z`. */
function parseStatus(raw) {
  const head = { ahead: 0, behind: 0, branch: "", upstream: "" };
  const files = [];
  const fields = raw.split("\0")[Symbol.iterator]();
  for (const entry of fields) {
    if (entry.startsWith("# ")) {
      readHeader(entry, head);
      continue;
    }
    const file = readEntry(entry);
    if (file) {
      files.push(file);
    }
    if (file && entry.startsWith("2 ")) {
      // A rename's original path follows as its own field.
      file.from = fields.next().value || "";
    }
  }
  return { files, head };
}

async function defaultBranch(cwd, current) {
  const ref = await gitText(cwd, [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (ref) {
    return ref.replace(ORIGIN_PREFIX, "");
  }
  for (const name of ["main", "master"]) {
    // biome-ignore lint/performance/noAwaitInLoops: two cheap lookups, in order
    const found = await git(cwd, ["rev-parse", "--verify", "-q", name]);
    if (found.code === 0) {
      return name;
    }
  }
  return current;
}

/** Commits on this branch that are on no remote yet (auto-commits, earlier saves). */
async function unsentCommits(cwd, head, remote) {
  if (!remote) {
    return 0;
  }
  if (head.upstream) {
    return head.ahead;
  }
  const count = await gitText(cwd, [
    "rev-list",
    "--count",
    "HEAD",
    "--not",
    "--remotes=origin",
  ]);
  return Number(count) || 0;
}

/**
 * Everything the Upload button and panel show. `git: false` means Apple's
 * developer tools are missing, `repo: false` that the folder has no history.
 */
async function status(cwd) {
  const signedIn = Boolean(github.readToken());
  const login = github.account()?.login || "";
  if (!canUseGit()) {
    return { git: false, login, signedIn };
  }
  const inside = await gitText(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") {
    return { git: true, login, repo: false, signedIn };
  }
  const raw = await git(cwd, [
    "status",
    "--porcelain=2",
    "--branch",
    "-z",
    "--untracked-files=all",
  ]);
  const { files, head } = parseStatus(raw.stdout);
  const remote = parseRemote(
    await gitText(cwd, ["remote", "get-url", "origin"])
  );
  const detached = head.branch === "(detached)";
  return {
    ahead: await unsentCommits(cwd, head, remote),
    behind: head.behind,
    branch: detached ? "" : head.branch,
    defaultBranch: await defaultBranch(cwd, head.branch),
    detached,
    files,
    git: true,
    login,
    remote,
    repo: true,
    signedIn,
  };
}

/** A few lines of each change, for the note writer. */
async function changeSummary(cwd, paths) {
  const parts = [];
  let budget = 4000;
  for (const path of paths.slice(0, 12)) {
    // biome-ignore lint/performance/noAwaitInLoops: bounded, and the budget is shared
    const diff = await git(cwd, [
      "--literal-pathspecs",
      "diff",
      "HEAD",
      "--no-color",
      "--",
      path,
    ]);
    // Untracked files have no diff against HEAD; show them as all new lines.
    const raw =
      diff.stdout ||
      (IMAGE.test(path)
        ? ""
        : (
            await git(cwd, [
              "diff",
              "--no-index",
              "--no-color",
              "--",
              "/dev/null",
              path,
            ])
          ).stdout);
    const body = raw.split("\n").slice(0, 60).join("\n");
    const text = `File: ${path}\n${body || "(new file)"}\n`;
    parts.push(text.slice(0, budget));
    budget -= text.length;
    if (budget <= 0) {
      break;
    }
  }
  return parts.join("\n");
}

const BRANCH_SLUG = /[^a-z0-9]+/g;

function branchSlug(text) {
  const words = String(text || "")
    .toLowerCase()
    .replace(BRANCH_SLUG, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 5)
    .join("-");
  const day = new Date().toISOString().slice(0, 10);
  return words || `update-${day}`;
}

async function freeBranchName(cwd, base) {
  let name = base;
  for (let n = 2; n < 50; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: stops at the first free name
    const [local, remote] = await Promise.all([
      git(cwd, ["rev-parse", "--verify", "-q", `refs/heads/${name}`]),
      git(cwd, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${name}`]),
    ]);
    if (local.code !== 0 && remote.code !== 0) {
      return name;
    }
    name = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

/** Name and noreply email from GitHub, used only when git has no identity. */
async function identityArgs(cwd) {
  const email = await gitText(cwd, ["config", "user.email"]);
  if (email) {
    return [];
  }
  const profile = await github.profile();
  if (!profile) {
    return ["-c", "user.name=Weblab", "-c", "user.email=weblab@localhost"];
  }
  return [
    "-c",
    `user.name=${profile.name || profile.login}`,
    "-c",
    `user.email=${profile.id}+${profile.login}@users.noreply.github.com`,
  ];
}

const FAILURES = [
  {
    code: "clash",
    test: /non-fast-forward|fetch first|\[rejected\]|updates were rejected/i,
  },
  {
    code: "workflow",
    message:
      "GitHub refused a change to its automation files (.github/workflows). Leave that file out and try again.",
    test: /workflow/i,
  },
  {
    code: "auth",
    message: "GitHub didn’t accept your sign-in. Sign in to GitHub again.",
    test: /authentication failed|invalid username or password|401/i,
  },
  {
    code: "forbidden",
    message:
      "Your GitHub account can’t upload to this repository. Ask its owner for access.",
    test: /permission to .* denied|403|protected branch|not allowed/i,
  },
  {
    code: "offline",
    message:
      "Weblab couldn’t reach GitHub. Check your internet connection. Your changes are safe on this Mac.",
    test: /could not resolve host|unable to access|timed out|network/i,
  },
];

function pushFailure(stderr) {
  const hit = FAILURES.find((failure) => failure.test.test(stderr));
  if (!hit) {
    return {
      code: "unknown",
      details: stderr.trim().slice(-600),
      message: "GitHub didn’t take the upload.",
      ok: false,
    };
  }
  return { code: hit.code, message: hit.message || "", ok: false };
}

function branchUrl(remote, branch) {
  return remote?.github
    ? `https://github.com/${remote.owner}/${remote.name}/tree/${encodeURIComponent(branch)}`
    : "";
}

async function push(cwd, branch, remote) {
  const result = await git(
    cwd,
    ["push", "-u", "origin", `HEAD:refs/heads/${branch}`],
    { auth: remote?.github, timeout: 180_000 }
  );
  if (result.code !== 0) {
    return pushFailure(result.stderr);
  }
  return { branch, ok: true, url: branchUrl(remote, branch) };
}

async function commitFiles(cwd, paths, note) {
  // Unstage by path, which keeps a merge in progress intact.
  await git(cwd, ["reset", "-q", "--", "."]);
  const add = await git(cwd, [
    "--literal-pathspecs",
    "add",
    "-A",
    "--",
    ...paths,
  ]);
  if (add.code !== 0) {
    return { message: "Weblab couldn’t gather those files.", ok: false };
  }
  const identity = await identityArgs(cwd);
  const commit = await git(cwd, [
    ...identity,
    "commit",
    "-q",
    "-m",
    note.trim() || "Update site",
  ]);
  if (commit.code !== 0) {
    return {
      details: (commit.stderr || commit.stdout).trim().slice(-600),
      message: "Weblab couldn’t save the changes.",
      ok: false,
    };
  }
  return { ok: true };
}

/**
 * Saves the picked files as one commit and pushes the branch. With
 * `newBranch`, first moves to a fresh branch named after the note.
 */
async function upload(cwd, { paths = [], note = "", newBranch = false } = {}) {
  const now = await status(cwd);
  if (!(now.git && now.repo && now.remote)) {
    return {
      code: "no-remote",
      message: "This site isn’t on GitHub yet.",
      ok: false,
    };
  }
  if (now.remote.github && !now.signedIn) {
    return { code: "auth", message: "Sign in to GitHub first.", ok: false };
  }
  let { branch } = now;
  const leaving = branch;
  if (!branch) {
    return {
      code: "detached",
      message: "Pick a branch first, then upload.",
      ok: false,
    };
  }
  if (newBranch) {
    const base = `${now.login || "weblab"}/${branchSlug(note)}`;
    branch = await freeBranchName(cwd, base);
    const moved = await git(cwd, ["checkout", "-q", "-b", branch]);
    if (moved.code !== 0) {
      return { message: "Weblab couldn’t make a new branch.", ok: false };
    }
  }
  const byPath = new Map(now.files.map((file) => [file.path, file]));
  const chosen = paths.filter((path) => byPath.has(path));
  // A moved file is two paths: the new one and the one it left.
  const picked = chosen.flatMap((path) => {
    const { from } = byPath.get(path);
    return from ? [path, from] : [path];
  });
  if (picked.length > 0) {
    const saved = await commitFiles(cwd, picked, note);
    if (!saved.ok) {
      return saved;
    }
  } else if (now.ahead === 0 && !newBranch) {
    return { code: "nothing", message: "Nothing to upload.", ok: false };
  }
  const sent = await push(cwd, branch, now.remote);
  if (sent.ok && newBranch && picked.length === 0) {
    await rewindToUpstream(cwd, leaving);
  }
  return sent;
}

/**
 * After unsent saves moved to their own branch, the branch they came from goes
 * back to what GitHub has, so the next upload there does not clash again. The
 * saves are safe: they were just pushed on the new branch.
 */
async function rewindToUpstream(cwd, name) {
  const upstream = await gitText(cwd, [
    "rev-parse",
    "--abbrev-ref",
    `${name}@{upstream}`,
  ]);
  if (upstream) {
    await git(cwd, ["branch", "-f", name, upstream]);
  }
}

/** After a clash: take the other upload, put ours on top, and push again. */
async function retry(cwd) {
  const now = await status(cwd);
  if (!(now.remote && now.branch)) {
    return { message: "Nothing to retry.", ok: false };
  }
  const auth = { auth: now.remote.github, timeout: 180_000 };
  const shallow = await gitText(cwd, ["rev-parse", "--is-shallow-repository"]);
  if (shallow === "true") {
    await git(cwd, ["fetch", "-q", "--unshallow", "origin"], auth);
  }
  const fetched = await git(cwd, ["fetch", "-q", "origin", now.branch], auth);
  if (fetched.code !== 0) {
    return pushFailure(fetched.stderr);
  }
  const stashesBefore = await stashCount(cwd);
  // FETCH_HEAD, not origin/<branch>: single-branch clones never update that ref.
  const rebased = await git(cwd, ["rebase", "--autostash", "FETCH_HEAD"]);
  const setAside = (await stashCount(cwd)) > stashesBefore;
  if (rebased.code !== 0) {
    await git(cwd, ["rebase", "--abort"]);
    return {
      code: "overlap",
      message:
        "Your change and theirs touch the same lines. Upload yours to a new branch instead.",
      ok: false,
    };
  }
  const sent = await push(cwd, now.branch, now.remote);
  if (sent.ok && setAside) {
    sent.warning =
      "Some changes you did not upload clashed with theirs, so Weblab set them aside in git’s stash. Nothing is lost.";
  }
  return sent;
}

async function stashCount(cwd) {
  const list = await gitText(cwd, ["stash", "list"]);
  return list ? list.split("\n").length : 0;
}

/** First upload for a site with no GitHub copy: a private repository. */
async function createRepo(cwd, { name } = {}) {
  const now = await status(cwd);
  if (!(now.git && now.repo)) {
    return { message: "This folder has no version history yet.", ok: false };
  }
  if (now.remote) {
    // Made earlier, but the first push may have failed. Pushing again is safe.
    const again = await push(cwd, now.branch || "main", now.remote);
    return again.ok ? { ok: true, remote: now.remote } : again;
  }
  const made = await github.createRepo(name);
  if (!made.ok) {
    return made;
  }
  const added = await git(cwd, ["remote", "add", "origin", made.cloneUrl]);
  if (added.code !== 0) {
    return {
      message: "Weblab couldn’t connect the folder to GitHub.",
      ok: false,
    };
  }
  const remote = parseRemote(made.cloneUrl);
  const sent = await push(cwd, now.branch || "main", remote);
  if (!sent.ok) {
    return sent;
  }
  await git(cwd, ["remote", "set-head", "origin", now.branch || "main"]);
  return { fullName: made.fullName, ok: true, remote, url: made.htmlUrl };
}

async function pullRequest(cwd, { title = "" } = {}) {
  const now = await status(cwd);
  if (!now.remote?.github) {
    return { message: "This site isn’t on GitHub.", ok: false };
  }
  return github.openPullRequest({
    base: now.defaultBranch,
    head: now.branch,
    name: now.remote.name,
    owner: now.remote.owner,
    title: title.trim() || `Changes from ${now.branch}`,
  });
}

/** Local and GitHub branches, newest first, with who changed them last. */
async function branches(cwd) {
  const now = await status(cwd);
  if (!(now.git && now.repo)) {
    return { current: "", defaultBranch: "", list: [] };
  }
  if (now.remote) {
    await refreshRemote(cwd, now.remote);
  }
  const raw = await gitText(cwd, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname)%00%(authorname)%00%(committerdate:iso-strict)",
    "refs/heads",
    "refs/remotes/origin",
  ]);
  const seen = new Map();
  for (const line of raw.split("\n").filter(Boolean)) {
    const [ref, author, when] = line.split("\0");
    const local = ref.startsWith("refs/heads/");
    const name = local
      ? ref.slice(11)
      : ref.replace("refs/remotes/origin/", "");
    if (name === "HEAD" || (seen.has(name) && !local)) {
      continue;
    }
    seen.set(name, {
      author,
      current: name === now.branch,
      name,
      onlyOnGitHub: !local,
      when,
    });
  }
  return {
    current: now.branch,
    defaultBranch: now.defaultBranch,
    list: [...seen.values()],
  };
}

/** Clones are shallow and single-branch; widen them once so every branch shows. */
async function refreshRemote(cwd, remote) {
  const auth = { auth: remote.github, timeout: 60_000 };
  const spec = await gitText(cwd, [
    "config",
    "--get-all",
    "remote.origin.fetch",
  ]);
  if (!spec.includes("refs/heads/*")) {
    await git(cwd, [
      "config",
      "remote.origin.fetch",
      "+refs/heads/*:refs/remotes/origin/*",
    ]);
  }
  const shallow = await gitText(cwd, ["rev-parse", "--is-shallow-repository"]);
  const args =
    shallow === "true"
      ? ["fetch", "-q", "--prune", "--unshallow", "origin"]
      : ["fetch", "-q", "--prune", "origin"];
  await git(cwd, args, auth);
}

async function changedBetween(cwd, target) {
  const names = await gitText(cwd, ["diff", "--name-only", "HEAD", target]);
  return names
    .split("\n")
    .some((path) => LOCKFILES.has(basename(path)) && dirname(path) === ".");
}

const DIRTY = /would be overwritten|commit your changes or stash/i;

async function switchBranch(cwd, name) {
  const list = await branches(cwd);
  const entry = list.list.find((branch) => branch.name === name);
  if (!entry) {
    return { message: "That branch doesn’t exist any more.", ok: false };
  }
  const target = entry.onlyOnGitHub ? `origin/${name}` : name;
  const needsInstall = await changedBetween(cwd, target);
  const args = entry.onlyOnGitHub
    ? ["checkout", "-q", "--track", `origin/${name}`]
    : ["checkout", "-q", name];
  const result = await git(cwd, args);
  if (result.code !== 0) {
    return DIRTY.test(result.stderr)
      ? {
          code: "dirty",
          message:
            "Some of your changes would be lost. Upload them or leave them out first.",
          ok: false,
        }
      : { message: "Weblab couldn’t switch branch.", ok: false };
  }
  return { needsInstall, ok: true };
}

async function createBranch(cwd, rawName) {
  const name = String(rawName || "").trim();
  const valid = await git(cwd, ["check-ref-format", "--branch", name]);
  if (!name || valid.code !== 0) {
    return {
      message: "Branch names can’t have spaces or odd symbols.",
      ok: false,
    };
  }
  const result = await git(cwd, ["checkout", "-q", "-b", name]);
  if (result.code !== 0) {
    return { message: "A branch with that name already exists.", ok: false };
  }
  return { ok: true };
}

module.exports = {
  branches,
  branchSlug,
  changeSummary,
  createBranch,
  createRepo,
  isSecret: (path) => SECRET.test(path),
  parseRemote,
  parseStatus,
  pullRequest,
  retry,
  status,
  switchBranch,
  upload,
};
