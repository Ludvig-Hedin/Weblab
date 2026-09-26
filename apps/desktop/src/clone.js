// Cloning a public GitHub repository into ~/Documents/Weblab. Uses git when it
// runs without Apple's developer tools prompt; otherwise downloads the tarball
// from codeload.github.com and unpacks it with the system tar.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { join } = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { app } = require("electron");
const { canUseGit, childEnv } = require("./runtime");
const sites = require("./sites");

const NAME_PART = /^[A-Za-z0-9_.-]+$/;
const GITHUB_URL =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i;
const SHORTHAND = /^([^/\s]+)\/([^/\s]+)$/;
const GIT_SUFFIX = /\.git$/i;
const TRAILING_SLASHES = /\/+$/;
const GIT_PERCENT = /(Receiving objects|Resolving deltas):\s+(\d+)%/g;
const NOT_FOUND =
  /not found|could not read username|authentication failed|terminal prompts disabled/i;

class CloneError extends Error {}

/** `https://github.com/o/r(.git)(/)`, `github.com/o/r`, or `o/r` → { owner, repo }. */
function parseRepo(input) {
  const text = String(input || "")
    .trim()
    .replace(TRAILING_SLASHES, "");
  const match = text.match(GITHUB_URL) || text.match(SHORTHAND);
  if (!match) {
    return null;
  }
  const [, owner, rawRepo] = match;
  const repo = rawRepo.replace(GIT_SUFFIX, "");
  if (!(NAME_PART.test(owner) && NAME_PART.test(repo))) {
    return null;
  }
  return { owner, repo };
}

let active = null;

function cancel() {
  active?.abort();
}

/**
 * Clones `link` into a new folder named `name`. `onProgress(text)` gets short
 * plain updates. Resolves to the new site entry.
 */
async function clone(link, name, onProgress) {
  const parsed = parseRepo(link);
  if (!parsed) {
    throw new CloneError("Paste a GitHub link, like github.com/owner/name.");
  }
  const { dir, folderName } = sites.reserveDir(name || parsed.repo);
  const controller = new AbortController();
  active = controller;
  try {
    const useGit = process.env.WEBLAB_FORCE_TARBALL !== "1" && canUseGit();
    if (useGit) {
      await gitClone(parsed, dir, controller.signal, onProgress);
    } else {
      await downloadTarball(parsed, dir, controller.signal, onProgress);
      onProgress("Finishing up…");
      sites.initGit(
        dir,
        `Copied from github.com/${parsed.owner}/${parsed.repo}`
      );
    }
    if (!sites.looksLikeSite(dir)) {
      throw new CloneError(
        "That repository doesn’t look like a website Weblab can open."
      );
    }
    return sites.add(dir, folderName);
  } catch (err) {
    fs.rmSync(dir, { force: true, recursive: true });
    if (controller.signal.aborted) {
      throw new CloneError("Cancelled.", { cause: err });
    }
    throw err instanceof CloneError
      ? err
      : new CloneError(
          "Copying the site didn’t work. Check your internet connection and try again.",
          { cause: err }
        );
  } finally {
    if (active === controller) {
      active = null;
    }
  }
}

function gitClone({ owner, repo }, dir, signal, onProgress) {
  onProgress("Connecting to GitHub…");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "/usr/bin/git",
      [
        "clone",
        "--depth",
        "1",
        "--progress",
        `https://github.com/${owner}/${repo}.git`,
        dir,
      ],
      {
        // Never prompt for a password: a private or missing repo must fail fast.
        env: childEnv({
          GIT_ASKPASS: "/usr/bin/false",
          GIT_TERMINAL_PROMPT: "0",
        }),
        signal,
        stdio: ["ignore", "ignore", "pipe"],
      }
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-4000);
      let last = null;
      for (const match of text.matchAll(GIT_PERCENT)) {
        last = match;
      }
      if (last) {
        const step =
          last[1] === "Receiving objects" ? "Downloading" : "Unpacking";
        onProgress(`${step}… ${last[2]}%`);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else if (NOT_FOUND.test(stderr)) {
        reject(
          new CloneError("We couldn’t find that repository. Is it public?")
        );
      } else {
        reject(new Error("git clone failed"));
      }
    });
  });
}

async function downloadTarball({ owner, repo }, dir, signal, onProgress) {
  onProgress("Connecting to GitHub…");
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/HEAD`;
  const response = await fetch(url, { redirect: "follow", signal });
  if (response.status === 404) {
    throw new CloneError("We couldn’t find that repository. Is it public?");
  }
  if (!(response.ok && response.body)) {
    throw new Error(`GitHub answered ${response.status}`);
  }
  const archive = join(
    app.getPath("temp"),
    `weblab-${process.pid}-${Date.now()}.tar.gz`
  );
  let received = 0;
  let lastShown = 0;
  const counted = Readable.fromWeb(response.body);
  counted.on("data", (chunk) => {
    received += chunk.length;
    if (received - lastShown > 256 * 1024) {
      lastShown = received;
      onProgress(`Downloading… ${(received / 1_048_576).toFixed(1)} MB`);
    }
  });
  try {
    await pipeline(counted, fs.createWriteStream(archive), { signal });
    onProgress("Unpacking…");
    fs.mkdirSync(dir, { recursive: true });
    await new Promise((resolve, reject) => {
      const tar = spawn(
        "/usr/bin/tar",
        ["-xzf", archive, "--strip-components=1", "-C", dir],
        { signal, stdio: "ignore" }
      );
      tar.on("error", reject);
      tar.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("tar failed"))
      );
    });
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

module.exports = { cancel, clone, parseRepo };
