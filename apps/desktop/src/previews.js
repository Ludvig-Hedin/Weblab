// A small picture of each site for the dashboard cards. Taken from the site's
// own dev server (not the editor), so it shows the page without editor chrome.

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const { join } = require("node:path");

const WIDTH = 1280;
const HEIGHT = 800;
const THUMB_WIDTH = 640;
// Time for fonts and first animations to land after the page loads.
const SETTLE_MS = 1200;
const TIMEOUT_MS = 12_000;
const SAFE_ID = /^[a-zA-Z0-9-]+$/;
const captureVersions = new Map();

const dir = () => join(app.getPath("userData"), "previews");
const fileFor = (id) =>
  SAFE_ID.test(String(id)) ? join(dir(), `${id}.jpg`) : null;

/** The saved picture as a data URL, or null when there is none yet. */
async function read(id) {
  const file = fileFor(id);
  if (!file) {
    return null;
  }
  try {
    return `data:image/jpeg;base64,${(await fs.promises.readFile(file)).toString("base64")}`;
  } catch {
    return null;
  }
}

function remove(id) {
  const file = fileFor(id);
  if (file) {
    fs.rmSync(file, { force: true });
  }
}

/**
 * Loads `url` in a hidden window and saves a picture of it for `id`.
 * Never throws: a missing picture only means the card shows a placeholder.
 */
function capture(id, url, timeoutMs = TIMEOUT_MS) {
  const file = fileFor(id);
  if (!file) {
    return Promise.resolve(false);
  }
  const version = (captureVersions.get(id) || 0) + 1;
  captureVersions.set(id, version);
  const shot = new BrowserWindow({
    height: HEIGHT,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: WIDTH,
  });
  shot.webContents.setAudioMuted(true);
  shot.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const { origin } = new URL(url);
  shot.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
    }
  });

  let timer = null;
  const work = new Promise((resolve) => {
    shot.webContents.once("did-fail-load", () => resolve(false));
    shot.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const image = await shot.webContents.capturePage();
          if (image.isEmpty() || captureVersions.get(id) !== version) {
            resolve(false);
            return;
          }
          const jpeg = image.resize({ width: THUMB_WIDTH }).toJPEG(80);
          fs.mkdirSync(dir(), { recursive: true });
          fs.writeFileSync(`${file}.tmp`, jpeg);
          fs.renameSync(`${file}.tmp`, file);
          resolve(true);
        } catch {
          resolve(false);
        }
      }, SETTLE_MS);
    });
    shot.loadURL(url).catch(() => resolve(false));
  });
  const limit = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  return Promise.race([work, limit]).finally(() => {
    clearTimeout(timer);
    if (!shot.isDestroyed()) {
      shot.destroy();
    }
  });
}

module.exports = { capture, read, remove };
