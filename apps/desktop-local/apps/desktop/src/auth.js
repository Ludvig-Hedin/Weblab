// Connecting Claude without a terminal. Uses the Claude Code binary bundled in
// the Agent SDK: `claude auth status --json` to check, `claude auth login` to
// sign in. Login opens the browser with a localhost callback; if that cannot
// complete, the page shows a code the user pastes, which we write to stdin.
// We never read credential files ourselves.

const { app, safeStorage } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const { join } = require("node:path");
const { claudeBinary, childEnv } = require("./runtime");

const API_KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

const keyPath = () => join(app.getPath("userData"), "anthropic-key.bin");

function readApiKey() {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }
    return safeStorage.decryptString(fs.readFileSync(keyPath())) || null;
  } catch {
    return null;
  }
}

function saveApiKey(key) {
  const value = String(key || "").trim();
  if (!API_KEY_SHAPE.test(value)) {
    throw new Error("That doesn’t look like an Anthropic API key.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Your Mac’s keychain isn’t available.");
  }
  fs.writeFileSync(keyPath(), safeStorage.encryptString(value), {
    mode: 0o600,
  });
}

function clearApiKey() {
  fs.rmSync(keyPath(), { force: true });
}

function status() {
  return new Promise((resolve) => {
    execFile(
      claudeBinary(),
      ["auth", "status", "--json"],
      { env: childEnv(), timeout: 20_000 },
      (_err, stdout) => {
        try {
          const data = JSON.parse(stdout);
          resolve({
            method: data.authMethod || "none",
            signedIn: Boolean(data.loggedIn),
          });
        } catch {
          resolve({ method: "none", signedIn: false });
        }
      }
    );
  });
}

async function state() {
  if (readApiKey()) {
    return { connected: true, via: "apiKey" };
  }
  const result = await status();
  return { connected: result.signedIn, via: result.signedIn ? "claude" : null };
}

// Terminal escape bytes, built from char codes so no control character sits in a regex literal.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const OSC_LINK = new RegExp(
  `${ESC}\\]8;;[^${BEL}${ESC}]*(${BEL}|${ESC}\\\\)`,
  "g"
);
const CSI_SEQUENCE = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");
const SIGN_IN_URL = /https:\/\/\S+oauth\/authorize\S+/;

let login = null;

const stripAnsi = (text) =>
  text.replace(OSC_LINK, "").replace(CSI_SEQUENCE, "");

/**
 * Starts `claude auth login`. `onEvent` gets { type: 'url', url } once the
 * browser link is known, then { type: 'done', ok, message? }.
 */
function startLogin(onEvent) {
  cancelLogin();
  const child = spawn(claudeBinary(), ["auth", "login", "--claudeai"], {
    env: childEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  login = child;
  let output = "";
  let sentUrl = false;
  const onData = (chunk) => {
    output = (output + stripAnsi(chunk.toString())).slice(-20_000);
    const match = output.match(SIGN_IN_URL);
    if (match && !sentUrl) {
      sentUrl = true;
      onEvent({ type: "url", url: match[0] });
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", () => {
    if (login === child) {
      login = null;
    }
    onEvent({
      message: "Weblab couldn’t start the sign-in.",
      ok: false,
      type: "done",
    });
  });
  child.on("exit", async (code) => {
    if (login !== child) {
      return; // cancelled or replaced
    }
    login = null;
    const result = await status();
    onEvent(
      result.signedIn
        ? { ok: true, type: "done" }
        : {
            message:
              code === 0
                ? "Sign-in didn’t finish."
                : "Sign-in didn’t work. Try again.",
            ok: false,
            type: "done",
          }
    );
  });
}

function submitCode(code) {
  const value = String(code || "").trim();
  if (!(login && value)) {
    return false;
  }
  login.stdin.write(`${value}\n`);
  return true;
}

function cancelLogin() {
  if (!login) {
    return;
  }
  const child = login;
  login = null;
  child.kill("SIGTERM");
}

module.exports = {
  cancelLogin,
  clearApiKey,
  readApiKey,
  saveApiKey,
  startLogin,
  state,
  submitCode,
};
