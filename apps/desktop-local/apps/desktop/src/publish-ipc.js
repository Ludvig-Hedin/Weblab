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
 * `ctx` resolves each IPC sender to its own window and runner.
 */
function register(ctx) {
  const jobs = new WeakMap();
  const queues = new WeakMap();
  let deployOwner = null;
  let loginOwner = null;
  const site = (session) => {
    const id = session?.openSiteId;
    return id ? sites.get(id) : null;
  };
  const fromWindow = (event) => {
    const session = ctx.sessionFor(event);
    return event.sender === session?.win.webContents ? session : null;
  };
  /**
   * Wraps a handler: only the window may call, only with a site open, and a
   * failure comes back as { ok: false } instead of a rejected promise, so no
   * panel is ever left spinning.
   */
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      const session = fromWindow(event);
      const raw = site(session);
      if (!(session && raw)) {
        return { message: "Open a site first.", ok: false };
      }
      try {
        const open = await sites.verified(raw.id);
        return await sites.withVerified(open, () => fn(session, open, ...args));
      } catch (error) {
        return {
          message:
            error.code === "source-unavailable"
              ? error.message
              : "Something went wrong. Try again.",
          ok: false,
        };
      }
    });
  };
  // One git change at a time: a branch switch can never land in the middle
  // of an upload's checkout and commit.
  const serial =
    (fn) =>
    (session, ...args) => {
      const run = (queues.get(session) || Promise.resolve()).then(async () => {
        const [open] = args;
        if (session.openSiteId !== open.id) {
          throw new Error("The open site changed.");
        }
        await sites.assertVerified(open);
        return fn(session, ...args);
      });
      queues.set(
        session,
        run.catch(() => undefined)
      );
      return run;
    };
  /** Refuses git work while the AI is still writing files, and queues it. */
  const whenIdle = (fn) =>
    serial((session, open, ...args) =>
      jobs.get(session)
        ? { code: "busy", message: "The AI is still working.", ok: false }
        : fn(session, open, ...args)
    );

  handle("publish:status", async (session, open) => ({
    ...(await upload.status(open.path)),
    aiBusy: Boolean(jobs.get(session)),
  }));
  handle("publish:note", async (_session, open, paths) => {
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
    whenIdle((_session, open, options) =>
      upload.upload(open.path, {
        newBranch: Boolean(options?.newBranch),
        note: String(options?.note || ""),
        paths: Array.isArray(options?.paths) ? options.paths.map(String) : [],
      })
    )
  );
  handle(
    "publish:retry",
    whenIdle((_session, open) => upload.retry(open.path))
  );
  handle(
    "publish:createRepo",
    whenIdle((_session, open, name) =>
      upload.createRepo(open.path, { name: String(name || open.name) })
    )
  );
  handle("publish:pullRequest", (_session, open, title) =>
    upload.pullRequest(open.path, { title: String(title || "") })
  );
  handle(
    "publish:branches",
    serial((_session, open) => upload.branches(open.path))
  );
  handle(
    "publish:switch",
    whenIdle(async (session, open, name) => {
      const result = await upload.switchBranch(open.path, String(name));
      if (result.ok && result.needsInstall) {
        await reinstall(session.runner, open);
      }
      return result;
    })
  );
  handle(
    "publish:createBranch",
    whenIdle((_session, open, name) =>
      upload.createBranch(open.path, String(name))
    )
  );

  handle("deploy:status", (_session, open) => deploy.status(open.path));
  handle("deploy:prepare", async (_session, open) => {
    const status = await upload.status(open.path);
    return deploy.prepare(open.path, {
      name: open.name,
      repo: status.remote,
    });
  });
  handle("deploy:sendKeys", (_session, open, names) =>
    deploy.sendKeys(open.path, Array.isArray(names) ? names.map(String) : [])
  );
  handle("deploy:skipKeys", (_session, open) => deploy.skipKeys(open.path));
  handle(
    "deploy:start",
    whenIdle(async (session, open, target) => {
      if (deployOwner) {
        return {
          message:
            "Another site is being deployed. Try again when it finishes.",
          ok: false,
        };
      }
      deployOwner = session;
      try {
        return await deploy.deploy(
          open.path,
          target === "production" ? "production" : "preview",
          (progress) => ctx.send(session, "deploy:progress", progress)
        );
      } finally {
        deployOwner = null;
      }
    })
  );
  ipcMain.handle("deploy:cancel", (event) => {
    if (fromWindow(event) === deployOwner) {
      deploy.cancelDeploy();
    }
  });
  ipcMain.handle("deploy:login", (event) => {
    const session = fromWindow(event);
    if (!session || (loginOwner && loginOwner !== session)) {
      return { ok: false };
    }
    loginOwner = session;
    return deploy
      .login((payload) => ctx.send(session, "deploy:login", payload))
      .finally(() => {
        if (loginOwner === session) {
          loginOwner = null;
        }
      });
  });
  ipcMain.handle("deploy:cancelLogin", (event) => {
    if (fromWindow(event) === loginOwner) {
      deploy.cancelLogin();
      loginOwner = null;
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
    const session = fromWindow(event);
    const view = session?.editorView;
    if (!view) {
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
    const session = ctx.sessionFor(event);
    if (event.sender !== session?.editorView?.webContents) {
      return;
    }
    jobs.set(session, Boolean(running));
    ctx.send(session, "editor:job", Boolean(running));
  });
  // "Ask AI to fix it": hands text to the editor's chat.
  ipcMain.handle("editor:ask", (event, text) => {
    const view = fromWindow(event)?.editorView;
    if (view && typeof text === "string") {
      view.webContents.send("editor:ask", text.slice(0, 8000));
    }
  });

  return {
    close: (session) => {
      if (deployOwner === session) {
        deploy.cancelDeploy();
      }
      if (loginOwner === session) {
        deploy.cancelLogin();
        loginOwner = null;
      }
      jobs.delete(session);
      queues.delete(session);
    },
    /** A new editor starts with no job running. */
    reset: (session) => {
      jobs.set(session, false);
    },
  };
}

/** After switching to a branch with other packages: install, then restart. */
async function reinstall(runner, open) {
  await runner.stop();
  try {
    await sites.assertVerified(open);
    await runner.runInstall(open.path);
  } finally {
    runner.open(open);
  }
}

module.exports = { register };
