// biome-ignore-all lint/correctness/noUndeclaredVariables: app.js declares currentSite, show and startGitHubSignIn; both files are classic scripts sharing one global scope.
// Upload, Deploy and the branch chip in the top bar.
//
// Upload saves picked files to GitHub. Deploy puts the folder as it is on
// Vercel and never touches git. The chip shows and switches the branch.
// Each opens a panel under the top bar; while one is open the live editor
// steps aside for a still picture of itself, because the editor is a native
// view drawn above this page.
//
// Loaded after app.js and uses its `show`, `currentSite` and
// `startGitHubSignIn`. Wrapped so its names never meet app.js's.

(() => {
  const host = window.weblab;
  const byId = (id) => document.getElementById(id);

  const ICON = {
    branch:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.2 5.7c.2-.1.5-.1.7.1l2.1 2.1c.2.2.2.5 0 .7-.2.2-.5.2-.7 0l-1.2-1.2V11c0 4.1-3.3 7.5-7.5 7.5h-.5c-.3 0-.5-.2-.5-.5V7.4L6.4 8.6c-.2.2-.5.2-.7 0-.2-.2-.2-.5 0-.7l2.1-2.1c.2-.2.5-.2.7 0l2.1 2.1c.2.2.2.5 0 .7-.2.2-.5.2-.7 0L8.7 7.4v10c3.5-.1 6.3-3 6.3-6.5V7.4l-1.2 1.2c-.2.2-.5.2-.7 0-.2-.2-.2-.5 0-.7l2.1-2.2Z"/></svg>',
    check:
      '<svg viewBox="0 0 16 16" aria-hidden="true" class="sm"><path d="M3.5 8.2 6.6 11.2 12.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chev: '<svg viewBox="0 0 16 16" aria-hidden="true" class="sm"><path d="M5 6.5 8 9.5 11 6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gh: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>',
    open: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3.5h3.5V7M12.5 3.5 7.5 8.5M11 9.5v3H3.5V5h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 16 16" aria-hidden="true" class="sm"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    refresh:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2M12.5 3v2.4h-2.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m10 10 3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    sliders:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h5M11 5h2M3 11h2M8 11h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="9.5" cy="5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="6.5" cy="11" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.13 6.5a1 1 0 0 1 1.74 0l5.6 9.75a1 1 0 0 1-.87 1.5H6.4a1 1 0 0 1-.87-1.5l5.6-9.75z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10.25v3M12 15.6v.05" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };

  const ESCAPES = {
    "'": "&#39;",
    '"': "&quot;",
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  };
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function ago(value) {
    const ms = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(ms)) {
      return "";
    }
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) {
      return "just now";
    }
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return plural(hours, "hour", "hours").concat(" ago");
    }
    return plural(Math.round(hours / 24), "day", "days").concat(" ago");
  }

  // ---- State ---------------------------------------------------------------

  const state = {
    aiBusy: false,
    branch: { busy: "", error: "", filter: "", list: null },
    deploy: {
      code: "",
      error: null,
      keys: [],
      phase: "loading",
      result: null,
      status: null,
      step: "upload",
      target: "",
    },
    deployDot: "",
    open: "",
    status: null,
    upload: {
      error: null,
      newBranch: false,
      note: "",
      noteBy: "",
      noteLoading: false,
      noteTouched: false,
      phase: "review",
      picked: new Set(),
      repoName: "",
      result: null,
    },
  };

  // ---- Top bar -------------------------------------------------------------

  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "pub-chip";
  chip.hidden = true;
  chip.setAttribute("aria-haspopup", "dialog");
  chip.setAttribute("aria-label", "Branch");
  chip.dataset.panel = "branch";

  const tools = document.createElement("div");
  tools.className = "pub-tools";
  tools.hidden = true;
  tools.innerHTML = `<span class="pub-sep"></span>
    <button type="button" class="pub-btn solid" data-panel="upload" aria-haspopup="dialog">Upload<span class="pub-count" hidden></span></button>
    <button type="button" class="pub-btn primary" data-panel="deploy" aria-haspopup="dialog">Deploy<span class="pub-dot" hidden></span></button>`;
  const uploadButton = tools.querySelector('[data-panel="upload"]');
  const deployButton = tools.querySelector('[data-panel="deploy"]');

  function mountTopBar() {
    const title = byId("title");
    const center = document.createElement("div");
    center.className = "pub-center";
    title.replaceWith(center);
    center.append(title, chip);
    document.querySelector(".topbar-right")?.append(tools);
    // "Site settings" as an icon, so the bar fits a small window.
    const settings = byId("topbar-settings");
    if (settings) {
      settings.classList.add("pub-btn", "icon");
      settings.setAttribute("aria-label", "Site settings");
      settings.title = "Site settings";
      settings.innerHTML = ICON.sliders;
    }
  }

  function inEditor() {
    const screen = document.querySelector('[data-screen="editor"]');
    return Boolean(screen && !screen.hidden && currentSite);
  }

  function paintTopBar() {
    const on = inEditor();
    tools.hidden = !on;
    const { status } = state;
    const hasBranch = on && status?.repo && status.branch;
    chip.hidden = !hasBranch;
    if (hasBranch) {
      chip.innerHTML = `${ICON.branch}<span>${esc(status.branch)}</span>${ICON.chev}`;
    }
    const count = uploadCount();
    const badge = uploadButton.querySelector(".pub-count");
    badge.hidden = count === 0;
    badge.textContent = String(count);
    const dot = deployButton.querySelector(".pub-dot");
    dot.hidden = !state.deployDot;
    dot.dataset.state = state.deployDot;
    for (const button of [chip, uploadButton, deployButton]) {
      button.setAttribute(
        "aria-expanded",
        String(state.open === button.dataset.panel)
      );
    }
    if (!on && state.open) {
      closePanel();
    }
  }

  function uploadCount() {
    const { status } = state;
    if (!status?.repo) {
      return 0;
    }
    return status.files.length || status.ahead || 0;
  }

  let refreshing = null;
  async function refresh() {
    if (!inEditor()) {
      return;
    }
    if (!refreshing) {
      refreshing = host.publish
        .status()
        .then((status) => {
          if (status && status.ok !== false) {
            state.status = status;
            state.aiBusy = Boolean(status.aiBusy);
          }
        })
        .finally(() => {
          refreshing = null;
        });
    }
    await refreshing;
    paintTopBar();
  }

  // ---- Panel frame ---------------------------------------------------------

  const layer = document.createElement("div");
  layer.className = "pub-layer";
  layer.hidden = true;
  layer.innerHTML =
    '<img class="pub-still" alt=""><div class="pub-scrim"></div>';
  const still = layer.querySelector(".pub-still");

  const panel = document.createElement("section");
  panel.className = "pub-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");

  let frozen = false;

  async function openPanel(name) {
    if (state.open === name) {
      closePanel();
      return;
    }
    const wasOpen = Boolean(state.open);
    state.open = name;
    if (!wasOpen) {
      // Frozen before the await: a close during the capture then unfreezes.
      frozen = true;
      const picture = await host.publish.freeze(true);
      if (!state.open) {
        // Closed while the picture was being taken.
        unfreeze();
        return;
      }
      still.hidden = !picture;
      if (picture) {
        still.src = picture;
      }
      layer.hidden = false;
      if (state.open !== name) {
        // Another panel was picked meanwhile; its own call draws it.
        return;
      }
    }
    panel.hidden = false;
    panel.classList.toggle("narrow", name === "branch");
    panel.setAttribute(
      "aria-label",
      { branch: "Branches", deploy: "Deploy", upload: "Upload" }[name]
    );
    placePanel();
    paintTopBar();
    OPENERS[name]();
  }

  function placePanel() {
    const anchor =
      { branch: chip, deploy: deployButton }[state.open] || uploadButton;
    const box = anchor.getBoundingClientRect();
    const width = state.open === "branch" ? 340 : 420;
    const left = Math.min(
      Math.max(8, state.open === "branch" ? box.left : box.right - width),
      window.innerWidth - width - 8
    );
    panel.style.left = `${left}px`;
  }

  function closePanel() {
    if (!state.open) {
      return;
    }
    state.open = "";
    panel.hidden = true;
    panel.innerHTML = "";
    layer.hidden = true;
    still.removeAttribute("src");
    if (!byIdVisible("gh-dialog")) {
      unfreeze();
    }
    paintTopBar();
  }

  /** Brings the live editor back, unless another screen (settings) hid it. */
  function unfreeze() {
    if (!frozen) {
      return;
    }
    frozen = false;
    if (inEditor()) {
      host.publish.freeze(false);
    }
  }

  function byIdVisible(id) {
    const el = byId(id);
    return Boolean(el && !el.hidden);
  }

  function render(html) {
    if (!state.open) {
      return;
    }
    const focused = document.activeElement?.dataset?.focusKey;
    panel.innerHTML = html;
    placePanel();
    const again = focused
      ? panel.querySelector(`[data-focus-key="${CSS.escape(focused)}"]`)
      : null;
    (again || panel.querySelector("[autofocus]"))?.focus();
  }

  const button = (act, label, kind = "", extra = "") =>
    `<button type="button" class="pub-btn ${kind}" data-act="${act}" ${extra}>${label}</button>`;
  const callout = (html, danger = false, actions = "") =>
    `<div class="pub-callout${danger ? " danger" : ""}">${ICON.warn}<div><p>${html}</p>${actions ? `<div class="pub-actions">${actions}</div>` : ""}</div></div>`;
  const head = (title, sub = "") =>
    `<div class="pub-head"><h2>${title}</h2>${sub ? `<span class="pub-muted">${sub}</span>` : ""}</div>`;
  const steps = (list, now) => {
    const at = list.findIndex(([key]) => key === now);
    return `<div class="pub-steps">${list
      .map(([, label], i) => {
        let cls = "";
        if (i < at) {
          cls = "done";
        } else if (i === at) {
          cls = "now";
        }
        return `<div class="pub-step ${cls}"><span class="pub-mark">${i < at ? ICON.check : ""}</span>${label}</div>`;
      })
      .join("")}</div>`;
  };

  // ---- Upload --------------------------------------------------------------

  function openUpload({ keepError = false } = {}) {
    const up = state.upload;
    if (up.phase !== "busy") {
      up.phase = "review";
      up.result = null;
      if (!keepError) {
        up.error = null;
      }
    }
    render(
      `<div class="pub-body first"><span class="pub-faint">Looking at your changes…</span></div>`
    );
    refresh().then(() => {
      const files = state.status?.files || [];
      // Secret files (.env, keys) are listed but left unticked.
      up.picked = new Set(
        files.filter((file) => !file.secret).map((file) => file.path)
      );
      up.newBranch = false;
      up.noteTouched = false;
      paintUpload();
      if (files.length > 0) {
        writeNote();
      }
    });
  }

  async function writeNote() {
    const up = state.upload;
    up.noteLoading = true;
    paintUpload();
    const paths = [...up.picked];
    const result = await host.publish.note(paths);
    up.noteLoading = false;
    if (!up.noteTouched) {
      up.note = result?.text || "";
      up.noteBy = result?.byAi ? "ai" : "plain";
    }
    paintUpload();
  }

  function paintUpload() {
    if (state.open !== "upload") {
      return;
    }
    render(uploadHtml());
    const note = panel.querySelector("textarea");
    if (note) {
      note.value = state.upload.note;
    }
  }

  const LOOKING = `<div class="pub-body first"><span class="pub-faint">Looking at your changes…</span></div>`;
  const okOnly = (title, sub) =>
    `${head(title, sub)}<div class="pub-foot">${button("close", "OK", "solid")}</div>`;

  /** The first screen that applies, in order. Review is the fallback. */
  const UPLOAD_SCREENS = [
    [(s) => !s, () => LOOKING],
    [
      (s) => !s.git,
      () =>
        okOnly(
          "Uploading needs Apple’s developer tools",
          "Install Apple’s free Command Line Tools, then open Weblab again. They let Weblab keep versions of your site."
        ),
    ],
    [
      (s) => !s.repo,
      () =>
        okOnly(
          "This folder has no version history",
          "Weblab can only upload sites that keep versions with git."
        ),
    ],
    [(_s, up) => up.phase === "busy", (_s, up) => uploadBusyHtml(up)],
    [(_s, up) => up.phase === "done", () => uploadDoneHtml()],
    [(_s, up) => up.phase === "error", () => uploadErrorHtml()],
    [
      (s) => !s.signedIn && (!s.remote || s.remote.github),
      () =>
        `${head("Sign in to GitHub to upload", "Weblab saves a copy of your work to your GitHub account.")}<div class="pub-foot">${button("close", "Not now")}${button("gh-signin", `${ICON.gh}Sign in to GitHub`, "primary")}</div>`,
    ],
    [(s) => !s.remote, () => repoHtml()],
    [
      () => state.aiBusy,
      () =>
        okOnly(
          "The AI is still working",
          "Uploading now could save half-finished changes. Try again when it is done."
        ),
    ],
    [
      (s) => s.files.length === 0 && s.ahead === 0,
      (s) =>
        `${head("Everything is uploaded", `Nothing new since your last upload to ${esc(s.branch)}.`)}<div class="pub-foot">${s.remote.github ? button("view-branch", `${ICON.gh}View on GitHub`) : ""}${button("close", "Done", "solid")}</div>`,
    ],
  ];

  function uploadHtml() {
    const s = state.status;
    const up = state.upload;
    const screen = UPLOAD_SCREENS.find(([applies]) => applies(s, up));
    return screen ? screen[1](s, up) : reviewHtml();
  }

  function uploadBusyHtml(up) {
    return `${head("Uploading")}<div class="pub-body">${steps(
      [
        ["save", "Saving your changes on this Mac"],
        ["send", "Sending to GitHub"],
      ],
      up.step || "save"
    )}</div>`;
  }

  function repoHtml() {
    const up = state.upload;
    const name = up.repoName || slugFor(currentSite?.name);
    const error = up.error
      ? `<p class="pub-error">${esc(up.error.message)}</p>`
      : "";
    return `${head("This site is not on GitHub yet", "Put it on GitHub to keep a safe copy online and work on it with others.")}
      <div class="pub-body">
        <label class="pub-note"><span class="pub-label">Name on GitHub</span>
          <span class="pub-where">${ICON.gh}<span class="pub-faint">${esc(state.status.login)} /</span><input type="text" data-field="repo" data-focus-key="repo" value="${esc(name)}" spellcheck="false" autofocus></span>
        </label>
        <span class="pub-faint">Private. Only you and people you invite can see it.</span>
        ${error}
      </div>
      <div class="pub-foot">${button("close", "Not now")}${button("create-repo", `${ICON.gh}Put it on GitHub`, "primary")}</div>`;
  }

  function slugFor(name) {
    return (
      String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "website"
    );
  }

  const KIND_LABEL = {
    edited: "Edited",
    new: "New",
    removed: "Removed",
    renamed: "Moved",
  };

  function whereHtml(s, up) {
    const repo = s.remote.github
      ? `${ICON.gh}<span>${esc(`${s.remote.owner}/${s.remote.name}`)}</span><span class="pub-faint">·</span>`
      : "";
    const name = up.newBranch ? "a new branch" : esc(s.branch);
    const hint = up.newBranch
      ? '<span class="pub-faint">Named from your note</span>'
      : "";
    return `<div class="pub-where">${repo}${ICON.branch}<b>${name}</b>${hint}</div>`;
  }

  function fileTag(file) {
    if (file.secret) {
      return "Secret, left out";
    }
    if (file.image && file.kind === "new") {
      return "New image";
    }
    return KIND_LABEL[file.kind] || "Edited";
  }

  function fileListHtml(s, up, picked) {
    if (s.files.length === 0) {
      return "";
    }
    let all = "mixed";
    if (picked === s.files.length) {
      all = "true";
    } else if (picked === 0) {
      all = "false";
    }
    const rows = s.files
      .map(
        (file) =>
          `<button type="button" class="pub-file" role="checkbox" aria-checked="${up.picked.has(file.path)}" data-act="toggle" data-path="${esc(file.path)}" data-focus-key="f:${esc(file.path)}" title="${esc(file.path)}"><span class="pub-box">${ICON.check}</span><span class="pub-file-name">${esc(file.name)}</span><span class="pub-file-dir">${esc(file.dir)}</span><span class="pub-tag">${fileTag(file)}</span></button>`
      )
      .join("");
    return `<div class="pub-files"><button type="button" class="pub-files-all" role="checkbox" aria-checked="${all}" data-act="toggle-all" data-focus-key="all"><span class="pub-box">${ICON.check}</span><span class="pub-muted">${picked} of ${plural(s.files.length, "file", "files")}</span></button>${rows}</div>`;
  }

  function noteHint(up) {
    if (up.noteLoading) {
      return "Claude is writing a short note about your changes…";
    }
    if (up.noteBy === "ai" && !up.noteTouched) {
      return "Written by Claude. Change it if you like.";
    }
    return "A short note about what changed.";
  }

  function noteHtml(s, up) {
    if (s.files.length === 0) {
      return "";
    }
    return `<label class="pub-note"><span class="pub-label">Note</span>
          <span class="pub-note-box"><textarea data-field="note" data-focus-key="note" rows="2" maxlength="200" placeholder="What changed?"></textarea>
          <span class="pub-shimmer"${up.noteLoading ? "" : " hidden"}><i></i><i></i></span>
          ${button("rewrite", ICON.refresh, "icon", 'aria-label="Write again" title="Write again"')}</span>
          <span class="pub-faint">${noteHint(up)}</span>
        </label>`;
  }

  function uploadLabel(s, picked) {
    if (picked > 0) {
      return `Upload ${plural(picked, "file", "files")}`;
    }
    return s.files.length === 0 ? "Upload" : "Pick a file";
  }

  function reviewHtml() {
    const s = state.status;
    const up = state.upload;
    const onDefault = s.branch === s.defaultBranch && !up.newBranch;
    const warn = onDefault
      ? callout(
          `You are on <b>${esc(s.branch)}</b>, the main version of the site.`,
          false,
          button("new-branch", "Use a new branch", "solid")
        )
      : "";
    const picked = s.files.filter((file) => up.picked.has(file.path)).length;
    const earlier = s.ahead
      ? `<span class="pub-faint">Also sends ${plural(s.ahead, "earlier save", "earlier saves")} from this Mac.</span>`
      : "";
    const count = picked || (s.files.length === 0 ? s.ahead : 0);
    const ready = count > 0 && !(picked > 0 && !up.note.trim());
    return `${head("Upload changes", "Saves your work to GitHub for your team. Your live site does not change from here.")}
      <div class="pub-body">${whereHtml(s, up)}${warn}${fileListHtml(s, up, picked)}${earlier}${noteHtml(s, up)}</div>
      <div class="pub-foot">${button("close", "Cancel")}${button("upload", uploadLabel(s, picked), "primary", ready ? "" : "disabled")}</div>`;
  }

  function uploadDoneHtml() {
    const s = state.status;
    const { result } = state.upload;
    const branch = result?.branch || s?.branch || "";
    const onDefault = branch === s?.defaultBranch;
    const where = onDefault
      ? `Your changes are on GitHub, in ${esc(branch)}.`
      : `Your changes are on GitHub, in their own branch <b>${esc(branch)}</b>. ${esc(s?.defaultBranch || "main")} is untouched.`;
    const pr =
      !onDefault && s?.remote?.github
        ? button(
            "pull-request",
            `Ask to add to ${esc(s.defaultBranch)}`,
            "solid"
          )
        : "";
    const error = state.upload.error
      ? `<p class="pub-error">${esc(state.upload.error.message)}</p>`
      : "";
    const warning = result?.warning ? callout(esc(result.warning)) : "";
    return `<div class="pub-body first pub-result"><span class="pub-okmark">${ICON.check}</span><h2>Uploaded</h2><span class="pub-muted">${where}</span>${warning}${error}</div>
      <div class="pub-foot">${result?.url ? button("view", `${ICON.gh}View on GitHub`) : ""}${pr}${button("close", "Done", pr ? "" : "primary")}</div>`;
  }

  function uploadErrorHtml() {
    const error = state.upload.error || {};
    const details = error.details
      ? `<pre class="pub-details">${esc(error.details)}</pre>`
      : "";
    let actions = button("close", "Later");
    if (error.code === "clash") {
      actions = `${button("new-branch-push", "Use a new branch instead")}${button("retry", "Get theirs and try again", "primary")}`;
    } else if (error.code === "overlap") {
      actions = `${button("close", "Later")}${button("new-branch-push", "Use a new branch", "primary")}`;
    } else if (error.code === "offline" || error.code === "unknown") {
      actions = `${button("close", "Later")}${button("push-again", "Try again", "primary")}`;
    } else if (error.code === "auth") {
      actions = `${button("close", "Later")}${button("gh-signin", `${ICON.gh}Sign in to GitHub`, "primary")}`;
    }
    const message =
      error.code === "clash"
        ? "Someone else uploaded to this branch while you worked. Your changes are safe on this Mac."
        : esc(error.message || "Something went wrong.");
    return `${head("Not uploaded yet")}<div class="pub-body">${callout(message, true)}${details}</div><div class="pub-foot">${actions}</div>`;
  }

  async function runUpload(options) {
    const up = state.upload;
    up.phase = "busy";
    up.step = "save";
    paintUpload();
    // The first step is local and quick; show it before GitHub answers.
    setTimeout(() => {
      if (up.phase === "busy") {
        up.step = "send";
        paintUpload();
      }
    }, 600);
    const result = await host.publish.upload(options);
    finishUpload(result);
  }

  async function finishUpload(result) {
    const up = state.upload;
    up.result = result?.ok ? result : null;
    up.error = result?.ok ? null : result;
    up.phase = result?.ok ? "done" : "error";
    if (!result?.ok && result?.code === "nothing") {
      up.phase = "review";
    }
    await refresh();
    paintUpload();
  }

  const UPLOAD_ACTIONS = {
    "create-repo": async () => {
      const up = state.upload;
      const field = panel.querySelector('[data-field="repo"]');
      up.repoName = field?.value.trim() || "";
      up.phase = "busy";
      up.step = "send";
      paintUpload();
      const result = await host.publish.createRepo(
        up.repoName || slugFor(currentSite?.name)
      );
      up.phase = "review";
      up.error = result?.ok ? null : result;
      await refresh();
      openUpload({ keepError: true });
    },
    "new-branch": () => {
      state.upload.newBranch = true;
      paintUpload();
    },
    "new-branch-push": () =>
      runUpload({ newBranch: true, note: "", paths: [] }),
    "pull-request": async () => {
      const result = await host.publish.pullRequest(state.upload.note);
      if (result?.ok) {
        host.publish.openLink(result.url);
      } else {
        state.upload.error = result;
        paintUpload();
      }
    },
    "push-again": () => runUpload({ newBranch: false, note: "", paths: [] }),
    retry: async () => {
      const up = state.upload;
      up.phase = "busy";
      up.step = "send";
      paintUpload();
      finishUpload(await host.publish.retry());
    },
    rewrite: () => {
      state.upload.noteTouched = false;
      writeNote();
    },
    toggle: (target) => {
      const { picked } = state.upload;
      const { path } = target.dataset;
      if (picked.has(path)) {
        picked.delete(path);
      } else {
        picked.add(path);
      }
      paintUpload();
    },
    "toggle-all": () => {
      const up = state.upload;
      const files = state.status?.files || [];
      up.picked =
        up.picked.size === files.length
          ? new Set()
          : new Set(files.map((file) => file.path));
      paintUpload();
    },
    upload: () => {
      const up = state.upload;
      runUpload({
        newBranch: up.newBranch,
        note: up.note,
        paths: [...up.picked],
      });
    },
    view: () => host.publish.openLink(state.upload.result?.url),
    "view-branch": () => {
      const s = state.status;
      if (s?.remote?.github) {
        host.publish.openLink(
          `https://github.com/${s.remote.owner}/${s.remote.name}/tree/${encodeURIComponent(s.branch)}`
        );
      }
    },
  };

  // ---- Deploy --------------------------------------------------------------

  async function openDeploy() {
    const d = state.deploy;
    if (!["busy", "preparing"].includes(d.phase)) {
      d.phase = "loading";
      d.target = "";
      d.error = null;
      paintDeploy();
      d.status = await host.deploy.status();
      d.phase = d.status?.connected ? "pick" : "connect";
      refresh();
    }
    paintDeploy();
  }

  function paintDeploy() {
    if (state.open === "deploy") {
      render(deployHtml());
    }
  }

  const DEPLOY_STEPS = [
    ["upload", "Sending your site to Vercel"],
    ["build", "Getting it ready. Usually under a minute."],
    ["online", "Going online"],
  ];

  function deployHtml() {
    const d = state.deploy;
    switch (d.phase) {
      case "loading":
        return `<div class="pub-body first"><span class="pub-faint">Checking Vercel…</span></div>`;
      case "connect":
        return `${head("Deploy with Vercel", "Deploy puts what you see here on the internet. Connect Vercel once and you are set.")}
          <div class="pub-body">${button("login", "Connect Vercel", "primary")}<span class="pub-faint">Opens your browser to sign in. Free for personal sites. Client and company sites need Vercel Pro.</span>${d.error ? `<p class="pub-error">${esc(d.error.message)}</p>` : ""}</div>`;
      case "waiting":
        return `${head("Finish signing in, in your browser")}
          <div class="pub-body">${d.code ? `<span class="pub-muted">Your code: <span class="pub-code">${esc(d.code)}</span></span>` : ""}${steps([["wait", "Waiting for Vercel"]], "wait")}</div>
          <div class="pub-foot">${button("cancel-login", "Cancel")}</div>`;
      case "preparing":
        return `${head("Setting up")}<div class="pub-body">${steps([["link", "Finding this site on Vercel"]], "link")}</div>`;
      case "keys":
        return keysHtml();
      case "busy":
        return `${head(d.target === "production" ? "Updating your live site" : "Making your test link")}
          <div class="pub-body">${steps(DEPLOY_STEPS, d.step)}<span class="pub-faint">You can close this and keep editing.</span></div>`;
      case "done":
        return deployDoneHtml();
      case "fail":
        return deployFailHtml();
      default:
        return pickHtml();
    }
  }

  function pickHtml() {
    const d = state.deploy;
    const s = state.status;
    const choice = (target, title, sub) =>
      `<button type="button" class="pub-choice" role="radio" aria-checked="${d.target === target}" data-act="target" data-target="${target}" data-focus-key="t:${target}"><span class="pub-radio"></span><span><b>${title}</b><span class="pub-muted">${sub}</span></span></button>`;
    const live = d.status?.lastLive;
    const liveName = live?.address
      ? esc(live.address.replace("https://", ""))
      : "";
    const changes =
      uploadCount() && s?.files?.length
        ? `<span class="pub-faint">Includes your ${plural(s.files.length, "change", "changes")}, even the ones not uploaded. GitHub is not touched.</span>`
        : `<span class="pub-faint">Sends the site exactly as it is on this Mac. GitHub is not touched.</span>`;
    const ACTIONS = {
      preview: button("deploy", "Make test link", "primary"),
      production: button("deploy", "Update live site", "primary"),
    };
    const action =
      ACTIONS[d.target] || button("noop", "Pick one", "", "disabled");
    const last = live?.at
      ? `<span class="pub-faint">Live site updated ${esc(ago(live.at))}</span>`
      : "";
    return `${head("Deploy what you see", "Puts this site online with Vercel.")}
      <div class="pub-body"><div class="pub-choices" role="radiogroup" aria-label="Where to deploy">
        ${choice("preview", "Test link", "A private link to check and share.")}
        ${choice("production", "Live site", `${liveName || "Your public address"}. Every visitor sees it.`)}
      </div>${changes}</div>
      <div class="pub-foot">${last}${action}</div>`;
  }

  function keysHtml() {
    const { keys } = state.deploy;
    return `${head(`This site needs ${plural(keys.length, "secret key", "secret keys")}`, "They are on this Mac. Vercel needs them too, or the site may not start.")}
      <div class="pub-body"><span class="pub-faint">${keys.map(esc).join(", ")}</span><span class="pub-faint">Sent once and stored by Vercel. The key files themselves never leave this Mac.</span></div>
      <div class="pub-foot">${button("skip-keys", "Skip")}${button("send-keys", "Copy keys to Vercel", "primary")}</div>`;
  }

  function deployDoneHtml() {
    const d = state.deploy;
    const url = d.result?.url || "";
    const live = d.target === "production";
    return `<div class="pub-body first pub-result"><span class="pub-okmark">${ICON.check}</span>
        <h2>${live ? "Your live site is updated" : "Your test link is ready"}</h2>
        <div class="pub-url"><span>${esc(url.replace("https://", ""))}</span>${button("copy", "Copy")}</div></div>
      <div class="pub-foot">${button("again", "Deploy again")}${button("open-url", `${ICON.open}Open`, "primary")}</div>`;
  }

  function deployFailHtml() {
    const d = state.deploy;
    const said = d.error?.message
      ? ` Vercel said: <b>${esc(d.error.message)}</b>`
      : "";
    const log = d.error?.log
      ? `<pre class="pub-details">${esc(d.error.log.split("\n").slice(-12).join("\n"))}</pre>`
      : "";
    const canAsk = Boolean(d.error?.log) && inEditor();
    return `${head("That did not work")}<div class="pub-body">${callout(`Nothing changed online.${said}`, true)}${log}</div>
      <div class="pub-foot">${button("again", "Back")}${canAsk ? button("ask-ai", "Ask AI to fix it", "primary") : ""}</div>`;
  }

  async function startDeploy() {
    const d = state.deploy;
    d.phase = "busy";
    d.step = "upload";
    state.deployDot = "busy";
    paintDeploy();
    paintTopBar();
    const result = await host.deploy.start(d.target);
    d.result = result?.ok ? result : null;
    d.error = result?.ok ? null : result;
    d.phase = result?.ok ? "done" : "fail";
    state.deployDot = result?.ok ? "ok" : "fail";
    if (result?.ok) {
      d.status = await host.deploy.status();
    }
    paintDeploy();
    paintTopBar();
  }

  const DEPLOY_ACTIONS = {
    again: () => {
      state.deploy.phase = "pick";
      state.deploy.target = "";
      paintDeploy();
    },
    "ask-ai": () => {
      const log = state.deploy.error?.log || "";
      host.publish.ask(
        `The site failed to build on Vercel. Find the cause in this build log and fix it:\n\n${log}`
      );
      state.deploy.phase = "pick";
      closePanel();
    },
    "cancel-login": () => {
      host.deploy.cancelLogin();
      state.deploy.phase = "connect";
      paintDeploy();
    },
    copy: () => {
      navigator.clipboard?.writeText(state.deploy.result?.url || "");
      const copied = panel.querySelector('[data-act="copy"]');
      if (copied) {
        copied.textContent = "Copied";
      }
    },
    deploy: async () => {
      const d = state.deploy;
      d.phase = "preparing";
      paintDeploy();
      const prepared = await host.deploy.prepare();
      if (!prepared?.ok) {
        d.error = prepared;
        d.phase = "fail";
        paintDeploy();
        return;
      }
      if (prepared.missingKeys?.length) {
        d.keys = prepared.missingKeys;
        d.phase = "keys";
        paintDeploy();
        return;
      }
      startDeploy();
    },
    login: async () => {
      const d = state.deploy;
      d.phase = "waiting";
      d.code = "";
      d.error = null;
      paintDeploy();
      const result = await host.deploy.login();
      if (d.phase !== "waiting") {
        return;
      }
      if (result?.ok) {
        openDeploy();
      } else {
        d.error = result;
        d.phase = "connect";
        paintDeploy();
      }
    },
    "open-url": () => host.publish.openLink(state.deploy.result?.url),
    "send-keys": async () => {
      const d = state.deploy;
      d.phase = "preparing";
      paintDeploy();
      const sent = await host.deploy.sendKeys(d.keys);
      if (!sent?.ok) {
        d.error = sent;
        d.phase = "fail";
        paintDeploy();
        return;
      }
      startDeploy();
    },
    "skip-keys": async () => {
      await host.deploy.skipKeys();
      startDeploy();
    },
    target: (target) => {
      state.deploy.target = target.dataset.target;
      paintDeploy();
    },
  };

  host.deploy.onProgress((progress) => {
    const d = state.deploy;
    if (d.phase !== "busy" || !progress?.step) {
      return;
    }
    const order = DEPLOY_STEPS.map(([key]) => key);
    if (order.indexOf(progress.step) > order.indexOf(d.step)) {
      d.step = progress.step;
      paintDeploy();
    }
  });
  host.deploy.onLogin((event) => {
    if (event?.code) {
      state.deploy.code = event.code;
      paintDeploy();
    }
  });

  // ---- Branches ------------------------------------------------------------

  async function openBranches() {
    const b = state.branch;
    b.filter = "";
    b.error = "";
    b.list = null;
    paintBranches();
    const found = await host.publish.branches();
    b.list = found?.list || [];
    b.defaultBranch = found?.defaultBranch || "";
    paintBranches();
  }

  function paintBranches() {
    if (state.open !== "branch") {
      return;
    }
    const input = panel.querySelector('[data-field="filter"]');
    const caret = input?.selectionStart;
    render(branchesHtml());
    const again = panel.querySelector('[data-field="filter"]');
    if (
      again &&
      document.activeElement === again &&
      caret !== null &&
      caret !== undefined
    ) {
      again.setSelectionRange(caret, caret);
    }
  }

  function branchesHtml() {
    const b = state.branch;
    const search = `<label class="pub-search">${ICON.search}<input type="text" data-field="filter" data-focus-key="filter" placeholder="Find or make a branch" value="${esc(b.filter)}" spellcheck="false" autofocus aria-label="Find or make a branch"></label>`;
    if (b.busy) {
      return `${search}<div class="pub-body">${steps([["go", esc(b.busy)]], "go")}</div>`;
    }
    if (!b.list) {
      return `${search}<div class="pub-body"><span class="pub-faint">Getting branches…</span></div>`;
    }
    const query = b.filter.trim().toLowerCase();
    const shown = b.list.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
    const rows = shown
      .map((item) => {
        const who = [item.author, item.when ? ago(item.when) : ""]
          .filter(Boolean)
          .join(" · ");
        const sub = item.name === b.defaultBranch ? "Main version" : who;
        return `<button type="button" class="pub-mi" data-act="switch" data-name="${esc(item.name)}" data-focus-key="b:${esc(item.name)}"><span class="pub-mi-check">${item.current ? ICON.check : ""}</span><span class="pub-mi-main"><b>${esc(item.name)}</b><span class="pub-faint">${esc(sub)}</span></span></button>`;
      })
      .join("");
    const exact = b.list.some((item) => item.name === b.filter.trim());
    const create =
      b.filter.trim() && !exact
        ? `<div class="pub-menusep"></div><div class="pub-menu"><button type="button" class="pub-mi" data-act="create-branch" data-focus-key="create"><span class="pub-mi-check">${ICON.plus}</span><span class="pub-mi-main">Make branch “${esc(b.filter.trim())}”</span></button></div>`
        : "";
    const empty =
      shown.length === 0 && !create
        ? `<div class="pub-body"><span class="pub-faint">No branches yet.</span></div>`
        : "";
    const changes = state.status?.files?.length || 0;
    const foot = changes
      ? `Your ${plural(changes, "change", "changes")} come with you when you switch.`
      : "Type a name to make a new branch.";
    const error = b.error
      ? `<div class="pub-body"><p class="pub-error">${esc(b.error)}</p></div>`
      : "";
    return `${search}<div class="pub-menu">${rows}</div>${empty}${create}${error}<div class="pub-foot"><span class="pub-faint">${foot}</span></div>`;
  }

  async function afterBranchChange(result, name) {
    const b = state.branch;
    b.busy = "";
    if (!result?.ok) {
      b.error = result?.message || "Weblab couldn’t switch branch.";
      paintBranches();
      return;
    }
    closePanel();
    if (result.needsInstall) {
      // The site restarts with this branch's packages; app.js shows progress.
      show("loading");
    }
    state.status = { ...state.status, branch: name };
    await refresh();
  }

  const BRANCH_ACTIONS = {
    "create-branch": async () => {
      const b = state.branch;
      const name = b.filter.trim();
      b.busy = `Making ${name}`;
      paintBranches();
      afterBranchChange(await host.publish.createBranch(name), name);
    },
    switch: async (target) => {
      const b = state.branch;
      const { name } = target.dataset;
      if (name === state.status?.branch) {
        closePanel();
        return;
      }
      if (state.aiBusy) {
        b.error = "The AI is still working. Switch when it is done.";
        paintBranches();
        return;
      }
      b.busy = `Switching to ${name}`;
      paintBranches();
      afterBranchChange(await host.publish.switchBranch(name), name);
    },
  };

  // ---- Events --------------------------------------------------------------

  const OPENERS = {
    branch: openBranches,
    deploy: openDeploy,
    upload: openUpload,
  };

  const SHARED = {
    close: () => closePanel(),
    "gh-signin": () => {
      closePanel();
      // Keep the editor stepped aside while GitHub's dialog is up.
      frozen = true;
      host.publish.freeze(true);
      startGitHubSignIn();
    },
    noop: () => undefined,
  };

  panel.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act]");
    if (!(target && panel.contains(target)) || target.disabled) {
      return;
    }
    const { act } = target.dataset;
    const table = {
      branch: BRANCH_ACTIONS,
      deploy: DEPLOY_ACTIONS,
      upload: UPLOAD_ACTIONS,
    }[state.open];
    (table?.[act] || SHARED[act])?.(target);
  });

  panel.addEventListener("input", (event) => {
    const field = event.target.dataset?.field;
    if (field === "note") {
      state.upload.note = event.target.value;
      state.upload.noteTouched = true;
      const go = panel.querySelector('[data-act="upload"]');
      if (go) {
        go.disabled = !(event.target.value.trim() && state.upload.picked.size);
      }
    } else if (field === "filter") {
      state.branch.filter = event.target.value;
      paintBranches();
    } else if (field === "repo") {
      state.upload.repoName = event.target.value;
    }
  });

  panel.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      event.target.dataset?.field === "filter" &&
      state.branch.filter.trim()
    ) {
      const exact = state.branch.list?.find(
        (item) => item.name === state.branch.filter.trim()
      );
      if (exact) {
        BRANCH_ACTIONS.switch({ dataset: { name: exact.name } });
      } else {
        BRANCH_ACTIONS["create-branch"]();
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) {
      closePanel();
    }
  });
  layer.addEventListener("click", () => closePanel());
  window.addEventListener("resize", () => state.open && placePanel());

  for (const trigger of [chip, uploadButton, deployButton]) {
    trigger.addEventListener("click", () => openPanel(trigger.dataset.panel));
  }

  // GitHub's sign-in dialog closes: bring the editor back, or reopen Upload.
  const ghDialog = byId("gh-dialog");
  if (ghDialog) {
    new MutationObserver(() => {
      if (ghDialog.hidden && frozen && !state.open) {
        frozen = false;
        host.publish.freeze(false);
        refresh().then(() => {
          if (state.status?.signedIn && inEditor()) {
            openPanel("upload");
          }
        });
      }
    }).observe(ghDialog, { attributeFilter: ["hidden"], attributes: true });
  }

  host.publish.onJob((running) => {
    state.aiBusy = Boolean(running);
    if (!running) {
      refresh();
    }
    if (state.open === "upload" && state.upload.phase === "review") {
      paintUpload();
    }
  });

  // Show the controls with the editor, and keep the count fresh.
  const editorScreen = document.querySelector('[data-screen="editor"]');
  if (editorScreen) {
    new MutationObserver(() => {
      if (inEditor()) {
        refresh();
      } else {
        state.status = null;
        state.deployDot = "";
        paintTopBar();
      }
    }).observe(editorScreen, { attributeFilter: ["hidden"], attributes: true });
  }
  window.addEventListener("focus", () => refresh());
  setInterval(() => {
    if (!state.open && document.visibilityState === "visible") {
      refresh();
    }
  }, 10_000);

  mountTopBar();
  document.body.append(layer, panel);
  paintTopBar();
})();
