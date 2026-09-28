// Signing in with GitHub (OAuth device flow) so private sites can be cloned.
// The token lives only in userData, encrypted with safeStorage. It is never
// logged, never passed on a command line and never written into a repo.

const fs = require("node:fs");
const { join } = require("node:path");
const { app, safeStorage } = require("electron");

/** Weblab's GitHub OAuth App. A client ID is public; there is no secret. */
const GITHUB_CLIENT_ID = "Ov23liZqlLYtBMO2S5Dj";
const SCOPES = "repo read:user";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

const tokenPath = () => join(app.getPath("userData"), "github-token.bin");
const accountPath = () => join(app.getPath("userData"), "github-account.json");

function readToken() {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }
    return safeStorage.decryptString(fs.readFileSync(tokenPath())) || null;
  } catch {
    return null;
  }
}

function saveToken(token) {
  fs.writeFileSync(tokenPath(), safeStorage.encryptString(token), {
    mode: 0o600,
  });
}

/** The signed-in account ({ login, avatarUrl }), or null. */
function account() {
  if (!readToken()) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(accountPath(), "utf8"));
  } catch {
    return null;
  }
}

function signOut() {
  cancelSignIn();
  fs.rmSync(tokenPath(), { force: true });
  fs.rmSync(accountPath(), { force: true });
}

/**
 * The HTTP header git sends to github.com when cloning a private repository.
 * Passed through GIT_CONFIG_* environment variables, so it is never on a
 * command line and never saved in the clone's .git/config.
 */
function gitAuthEnv(token) {
  if (!token) {
    return {};
  }
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

async function postForm(url, body, signal) {
  const response = await fetch(url, {
    body: new URLSearchParams(body),
    headers: { Accept: "application/json" },
    method: "POST",
    signal,
  });
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status}`);
  }
  return response.json();
}

function api(path, token, signal) {
  return fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal,
  });
}

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });

let flow = null;

function cancelSignIn() {
  flow?.abort();
  flow = null;
}

const POLL_FAILURES = {
  access_denied: "Sign-in was cancelled on GitHub.",
  expired_token: "The code expired. Try again.",
};

/** Polls until GitHub hands over a token. Resolves { token } or { message }. */
async function pollForToken(device, signal) {
  let interval = (device.interval || 5) * 1000;
  const deadline = Date.now() + (device.expires_in || 900) * 1000;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: GitHub sets the polling pace
    await wait(interval, signal);
    const result = await postForm(
      TOKEN_URL,
      {
        client_id: GITHUB_CLIENT_ID,
        device_code: device.device_code,
        grant_type: DEVICE_GRANT,
      },
      signal
    );
    if (result.access_token) {
      return { token: result.access_token };
    }
    if (result.error === "slow_down") {
      interval = (result.interval || interval / 1000 + 5) * 1000;
    } else if (result.error && result.error !== "authorization_pending") {
      return {
        message:
          POLL_FAILURES[result.error] ||
          "GitHub sign-in didn’t work. Try again.",
      };
    }
  }
  return { message: POLL_FAILURES.expired_token };
}

/**
 * Runs the device flow. `onEvent` gets { type: 'code', userCode,
 * verificationUri }, then { type: 'done', ok, account?, message? }.
 */
async function startSignIn(onEvent) {
  cancelSignIn();
  const controller = new AbortController();
  flow = controller;
  const { signal } = controller;
  const fail = (message) => onEvent({ message, ok: false, type: "done" });
  try {
    const device = await postForm(
      DEVICE_CODE_URL,
      { client_id: GITHUB_CLIENT_ID, scope: SCOPES },
      signal
    );
    if (!device.device_code) {
      fail("GitHub didn’t give us a code. Try again.");
      return;
    }
    onEvent({
      type: "code",
      userCode: device.user_code,
      verificationUri: device.verification_uri,
    });
    const outcome = await pollForToken(device, signal);
    if (!outcome.token) {
      fail(outcome.message);
      return;
    }
    saveToken(outcome.token);
    const who = await fetchAccount(outcome.token, signal);
    onEvent({ account: who, ok: true, type: "done" });
  } catch {
    if (!signal.aborted) {
      fail("Weblab couldn’t reach GitHub. Check your internet connection.");
    }
  } finally {
    if (flow === controller) {
      flow = null;
    }
  }
}

async function fetchAccount(token, signal) {
  const response = await api("/user", token, signal);
  const user = response.ok ? await response.json() : {};
  const who = { avatarUrl: user.avatar_url || "", login: user.login || "" };
  fs.writeFileSync(accountPath(), JSON.stringify(who));
  return who;
}

/** Repositories the signed-in user can see, most recently updated first. */
async function listRepos() {
  const token = readToken();
  if (!token) {
    return { signedIn: false };
  }
  try {
    const response = await api(
      "/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member",
      token
    );
    if (response.status === 401) {
      signOut();
      return { signedIn: false };
    }
    if (!response.ok) {
      return {
        message: "Weblab couldn’t load your repositories.",
        repos: [],
        signedIn: true,
      };
    }
    const repos = (await response.json()).map((repo) => ({
      fullName: repo.full_name,
      name: repo.name,
      private: Boolean(repo.private),
    }));
    return { repos, signedIn: true };
  } catch {
    return {
      message: "Weblab couldn’t reach GitHub.",
      repos: [],
      signedIn: true,
    };
  }
}

/** { id, login, name } for commit identity, or null when signed out or offline. */
async function profile() {
  const token = readToken();
  if (!token) {
    return null;
  }
  try {
    const response = await api("/user", token);
    if (!response.ok) {
      return null;
    }
    const user = await response.json();
    return { id: user.id, login: user.login, name: user.name || "" };
  } catch {
    return null;
  }
}

function send(path, token, body) {
  return fetch(`${API}${path}`, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    method: "POST",
  });
}

const REPO_NAME_CHARS = /[^A-Za-z0-9._-]+/g;

/**
 * A new private repository under the signed-in account. When the name is
 * taken, tries name-2, name-3… and says which one it used.
 */
async function createRepo(rawName) {
  const token = readToken();
  if (!token) {
    return { code: "auth", message: "Sign in to GitHub first.", ok: false };
  }
  const base =
    String(rawName || "")
      .trim()
      .replace(REPO_NAME_CHARS, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "website";
  try {
    for (let n = 1; n <= 20; n += 1) {
      const name = n === 1 ? base : `${base}-${n}`;
      // biome-ignore lint/performance/noAwaitInLoops: stops at the first free name
      const response = await send("/user/repos", token, {
        auto_init: false,
        name,
        private: true,
      });
      if (response.status === 401) {
        return {
          code: "auth",
          message: "Sign in to GitHub again.",
          ok: false,
        };
      }
      if (response.ok) {
        const repo = await response.json();
        return {
          cloneUrl: repo.clone_url,
          fullName: repo.full_name,
          htmlUrl: repo.html_url,
          ok: true,
        };
      }
      if (response.status !== 422) {
        return { message: "GitHub didn’t make the repository.", ok: false };
      }
    }
    return { message: "Pick another name for the repository.", ok: false };
  } catch {
    return {
      code: "offline",
      message: "Weblab couldn’t reach GitHub.",
      ok: false,
    };
  }
}

/** Opens a pull request, or returns the one already open for this branch. */
async function openPullRequest({ owner, name, head, base, title }) {
  const token = readToken();
  if (!token) {
    return { code: "auth", message: "Sign in to GitHub first.", ok: false };
  }
  try {
    const response = await send(`/repos/${owner}/${name}/pulls`, token, {
      base,
      head,
      title,
    });
    if (response.ok) {
      return { ok: true, url: (await response.json()).html_url };
    }
    const open = await api(
      `/repos/${owner}/${name}/pulls?state=open&head=${encodeURIComponent(`${owner}:${head}`)}`,
      token
    );
    const existing = open.ok ? (await open.json())[0] : null;
    if (existing) {
      return { ok: true, url: existing.html_url };
    }
    return {
      message:
        response.status === 403
          ? "GitHub didn’t let Weblab open the request. Your organisation may need to approve Weblab."
          : "GitHub didn’t open the request.",
      ok: false,
    };
  } catch {
    return {
      code: "offline",
      message: "Weblab couldn’t reach GitHub.",
      ok: false,
    };
  }
}

module.exports = {
  account,
  cancelSignIn,
  createRepo,
  GITHUB_CLIENT_ID,
  gitAuthEnv,
  listRepos,
  openPullRequest,
  profile,
  readToken,
  signOut,
  startSignIn,
};
