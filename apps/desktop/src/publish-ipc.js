// The top bar's Upload, Deploy and branch panels talk to the Mac through here.
//
// Every handler takes the open site from main, never a path from the page, so
// the renderer cannot point git or Vercel at an arbitrary folder.

const { ipcMain, shell } = require("electron");
const sites = require("./sites");
const upload = require("./upload");
const note = require("./note");
const deploy = require("./deploy");

const WEB_LINK = /^https:\/\//;

/**
 * `ctx` gives the live pieces of main: { win, editorView, openSiteId, runner,
 * send }, each a function so it reads the current value.
 */
function register(ctx) {
  let jobRunning = false;
  const site = () => {
    const id = ctx.openSiteId();
    return id ? sites.get(id) : null;
  };
  const fromWindow = (event) => event.sender === ctx.win()?.webContents;
  /**
   * Wraps a handler: only the window may call, only with a site open, and a
   * failure comes back as { ok: false } instead of a rejected promise, so no
   * panel is ever left spinning.
   */
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      const open = site();
      if (!(fromWindow(event) && open)) {
        return { message: "Open a site first.", ok: false };
      }
      try {
        return await fn(open, ...args);
      } catch {
        return { message: "Something went wrong. Try again.", ok: false };
      }
    });
  };
  // One git change at a time: a branch switch can never land in the middle
  // of an upload's checkout and commit.
  let queue = Promise.resolve();
  const serial =
    (fn) =>
    (...args) => {
      const run = queue.then(() => fn(...args));
      queue = run.catch(() => undefined);
      return run;
    };
  /** Refuses git work while the AI is still writing files, and queues it. */
  const whenIdle = (fn) =>
    serial((open, ...args) =>
      jobRunning
        ? { code: "busy", message: "The AI is still working.", ok: false }
        : fn(open, ...args)
    );

  handle("publish:status", async (open) => ({
    ...(await upload.status(open.path)),
    aiBusy: jobRunning,
  }));
  handle("publish:note", async (open, paths) => {
    const wanted = new Set(Array.isArray(paths) ? paths.map(String) : []);
    // Only changed files git reported, and never secret ones, reach Claude.
    const { files = [] } = await upload.status(open.path);
    const list = files
      .filter((file) => wanted.has(file.path) && !file.secret)
      .map((file) => file.path);
    const summary = await upload.changeSummary(open.path, list);
    return note.write(summary, list);
  });
  handle(
    "publish:upload",
    whenIdle((open, options) =>
      upload.upload(open.path, {
        newBranch: Boolean(options?.newBranch),
        note: String(options?.note || ""),
        paths: Array.isArray(options?.paths) ? options.paths.map(String) : [],
      })
    )
  );
  handle(
    "publish:retry",
    whenIdle((open) => upload.retry(open.path))
  );
  handle(
    "publish:createRepo",
    whenIdle((open, name) =>
      upload.createRepo(open.path, { name: String(name || open.name) })
    )
  );
  handle("publish:pullRequest", (open, title) =>
    upload.pullRequest(open.path, { title: String(title || "") })
  );
  handle(
    "publish:branches",
    serial((open) => upload.branches(open.path))
  );
  handle(
    "publish:switch",
    whenIdle(async (open, name) => {
      const result = await upload.switchBranch(open.path, String(name));
      if (result.ok && result.needsInstall) {
        await reinstall(ctx.runner(), open);
      }
      return result;
    })
  );
  handle(
    "publish:createBranch",
    whenIdle((open, name) => upload.createBranch(open.path, String(name)))
  );

  handle("deploy:status", (open) => deploy.status(open.path));
  handle("deploy:prepare", async (open) => {
    const status = await upload.status(open.path);
    return deploy.prepare(open.path, {
      name: open.name,
      repo: status.remote,
    });
  });
  handle("deploy:sendKeys", (open, names) =>
    deploy.sendKeys(open.path, Array.isArray(names) ? names.map(String) : [])
  );
  handle("deploy:skipKeys", (open) => deploy.skipKeys(open.path));
  handle(
    "deploy:start",
    whenIdle((open, target) =>
      deploy.deploy(
        open.path,
        target === "production" ? "production" : "preview",
        (progress) => ctx.send("deploy:progress", progress)
      )
    )
  );
  ipcMain.handle("deploy:cancel", (event) => {
    if (fromWindow(event)) {
      deploy.cancelDeploy();
    }
  });
  ipcMain.handle("deploy:login", (event) => {
    if (!fromWindow(event)) {
      return { ok: false };
    }
    return deploy.login((payload) => ctx.send("deploy:login", payload));
  });
  ipcMain.handle("deploy:cancelLogin", (event) => {
    if (fromWindow(event)) {
      deploy.cancelLogin();
    }
  });

  ipcMain.handle("publish:openLink", (event, url) => {
    if (fromWindow(event) && WEB_LINK.test(String(url))) {
      shell.openExternal(String(url));
    }
  });

  // The editor is a native view drawn above the window's own page, so a panel
  // from the top bar would open underneath it. While one is open, the page
  // shows a still picture of the editor and the live view steps aside.
  ipcMain.handle("editor:freeze", async (event, frozen) => {
    const view = ctx.editorView();
    if (!(fromWindow(event) && view)) {
      return null;
    }
    if (!frozen) {
      view.setVisible(true);
      return null;
    }
    try {
      const image = await view.webContents.capturePage();
      view.setVisible(false);
      return image.toDataURL();
    } catch {
      view.setVisible(false);
      return null;
    }
  });

  // The editor says when an AI job starts and ends.
  ipcMain.on("editor:job", (event, running) => {
    if (event.sender !== ctx.editorView()?.webContents) {
      return;
    }
    jobRunning = Boolean(running);
    ctx.send("editor:job", jobRunning);
  });
  // "Ask AI to fix it": hands text to the editor's chat.
  ipcMain.handle("editor:ask", (event, text) => {
    const view = ctx.editorView();
    if (fromWindow(event) && view && typeof text === "string") {
      view.webContents.send("editor:ask", text.slice(0, 8000));
    }
  });

  return {
    /** A new editor starts with no job running. */
    reset: () => {
      jobRunning = false;
    },
  };
}

/** After switching to a branch with other packages: install, then restart. */
async function reinstall(runner, open) {
  await runner.stop();
  try {
    await runner.runInstall(open.path);
  } finally {
    runner.open(open);
  }
}

module.exports = { register };
