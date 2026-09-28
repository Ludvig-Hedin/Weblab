const api = window.weblab;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let currentSite = null;

// Screens and top bar

function show(name) {
  for (const screen of $$(".screen")) {
    screen.hidden = screen.dataset.screen !== name;
  }
  const inSite = ["loading", "editor", "error", "settings"].includes(name);
  $("#back").hidden = !inSite;
  const title = $("#title");
  title.textContent = inSite && currentSite ? currentSite.name : "Weblab";
  title.classList.toggle("quiet", !inSite);
  if (!inSite) {
    setStatus("");
  }
  const canEditSettings = Boolean(currentSite?.hasSettings);
  $("#topbar-settings").hidden = !(name === "editor" && canEditSettings);
  $("#mode").hidden = name !== "editor";
  $("#topbar-tools").hidden = name !== "editor";
  // Settings sits over a live editor that keeps its mode, so only leaving the
  // site resets the buttons. A new editor reports its own mode on load.
  if (!inSite) {
    setMode("edit");
  }
  $("#error-settings").hidden = !(name === "error" && canEditSettings);
}

// Edit and Preview. The editor owns the mode; these buttons ask for one and
// show what the editor reports back, so a shortcut inside it stays in sync.
function setMode(mode) {
  for (const button of $$("#mode button")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
}

for (const button of $$("#mode button")) {
  button.addEventListener("click", () => {
    setMode(button.dataset.mode);
    api.editor.setMode(button.dataset.mode);
  });
}
api.editor.onMode(setMode);

// The command palette and the shortcuts sheet live in the editor; these
// buttons ask it to open them.
for (const button of $$("#topbar-tools button")) {
  button.addEventListener("click", () => {
    api.editor.command(button.dataset.command);
  });
}

function setStatus(text, state) {
  const status = $("#status");
  status.textContent = text;
  status.dataset.state = state || "";
}

// Connect Claude

function connectStep(step) {
  for (const el of $$("[data-connect]")) {
    el.hidden = el.dataset.connect !== step;
  }
  $("#connect-error").hidden = true;
}

function connectError(message) {
  const el = $("#connect-error");
  el.textContent = message;
  el.hidden = !message;
}

$("#signin").addEventListener("click", () => {
  connectStep("waiting");
  $("#code-form").hidden = true;
  $("#show-code").hidden = false;
  $("#reopen").hidden = true;
  api.auth.login();
});

$("#show-code").addEventListener("click", () => {
  $("#show-code").hidden = true;
  $("#code-form").hidden = false;
  $("#reopen").hidden = !signInUrl;
  $("#code-input").focus();
});

$("#code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = $("#code-input").value.trim();
  if (code) {
    api.auth.submitCode(code);
  }
});

$("#reopen").addEventListener(
  "click",
  () => signInUrl && api.auth.openLink(signInUrl)
);

$("#cancel-signin").addEventListener("click", () => {
  api.auth.cancel();
  connectStep("start");
});

$("#use-key").addEventListener("click", () => {
  connectStep("key");
  $("#key-input").focus();
});

$("#key-back").addEventListener("click", () => connectStep("start"));

$("#key-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api.auth.saveApiKey($("#key-input").value);
  if (result.ok) {
    $("#key-input").value = "";
    goDashboard();
  } else {
    connectError(result.message);
  }
});

let signInUrl = null;
api.auth.onEvent((event) => {
  if (event.type === "url") {
    signInUrl = event.url;
  }
  if (event.type === "done") {
    if (event.ok) {
      if (!$('[data-screen="connect"]').hidden) {
        goDashboard();
      }
    } else {
      connectStep("start");
      connectError(event.message);
    }
  }
});

// Dashboard

function relativeTime(ms) {
  if (!ms) {
    return "Never opened";
  }
  const days = Math.floor(
    (startOfDay(Date.now()) - startOfDay(ms)) / 86_400_000
  );
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const HOME_PREFIX = /^\/Users\/[^/]+/;

function prettyPath(path) {
  return path.replace(HOME_PREFIX, "~");
}

// Cards or list, remembered on this Mac. Storage can be blocked, so it is
// only a convenience.
const VIEW_KEY = "weblab.sitesView";
let sitesView = "grid";
try {
  if (localStorage.getItem(VIEW_KEY) === "list") {
    sitesView = "list";
  }
} catch {
  // Keep the default.
}

function setSitesView(view) {
  sitesView = view;
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Still works for this session.
  }
  renderSites();
}

for (const button of $$("#view-toggle button")) {
  button.addEventListener("click", () => setSitesView(button.dataset.view));
}

const MORE_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor"/></svg>';

/** The site's picture, or its first letter until it has been opened once. */
function thumb(site) {
  const box = document.createElement("div");
  box.className = "site-thumb";
  if (site.preview && !site.missing) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = site.preview;
    img.draggable = false;
    box.append(img);
  } else {
    box.textContent = (site.name.trim()[0] || "?").toUpperCase();
  }
  return box;
}

function siteStatus(site, siteLocation) {
  if (!site.missing) {
    return prettyPath(siteLocation);
  }
  return site.entry ? "File not found" : "Folder not found";
}

function siteItem(site) {
  const li = document.createElement("li");
  li.className = `site${site.missing ? " missing" : ""}`;
  li.tabIndex = 0;
  const siteLocation = site.entry ? `${site.path}/${site.entry}` : site.path;
  li.title = site.missing ? "" : prettyPath(siteLocation);
  li.innerHTML = `
    <div class="site-identity"><div class="site-icon"></div><div class="site-text"><div class="site-name"></div><div class="site-path"></div><div class="site-when"></div></div></div>
    <button class="more" aria-label="More">${MORE_ICON}</button>`;
  li.prepend(thumb(site));
  const icon = li.querySelector(".site-icon");
  if (site.favicon) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = site.favicon;
    img.addEventListener("error", () => {
      img.remove();
      icon.textContent = (site.name.trim()[0] || "?").toUpperCase();
    });
    icon.append(img);
  } else {
    icon.textContent = (site.name.trim()[0] || "?").toUpperCase();
  }
  li.querySelector(".site-name").textContent = site.name;
  li.querySelector(".site-path").textContent = siteStatus(site, siteLocation);
  li.querySelector(".site-when").textContent = relativeTime(site.lastOpened);
  li.addEventListener("click", (event) => {
    if (event.target.closest(".more")) {
      return;
    }
    if (event.metaKey) {
      api.sites.openNewWindow(site.id);
    } else {
      openSite(site);
    }
  });
  li.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      openSite(site);
    }
  });
  const menu = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const result = await api.sites.menu(site.id);
    if (result === "open") {
      openSite(site);
    }
    if (result === "new-window") {
      api.sites.openNewWindow(site.id);
    }
    if (result === "settings") {
      currentSite = { ...site, hasSettings: true };
      showSettings("edit");
    }
    if (result === "removed") {
      renderSites();
    }
  };
  li.addEventListener("contextmenu", menu);
  li.querySelector(".more").addEventListener("click", menu);
  return li;
}

let sitesRender = 0;

function showSitesLoading() {
  const ul = $("#sites");
  ul.classList.toggle("grid", sitesView === "grid");
  ul.setAttribute("aria-busy", "true");
  ul.innerHTML = `<li class="site site-skeleton" aria-hidden="true"><div class="skeleton-thumb"></div><div class="skeleton-icon"></div><div class="skeleton-copy"><span></span><span></span></div></li><li class="site site-skeleton" aria-hidden="true"><div class="skeleton-thumb"></div><div class="skeleton-icon"></div><div class="skeleton-copy"><span></span><span></span></div></li>`;
  $(".dash").hidden = false;
  $("#empty").hidden = true;
}

async function renderSites() {
  sitesRender += 1;
  const render = sitesRender;
  showSitesLoading();
  let list;
  try {
    list = await api.sites.list();
  } catch {
    if (render === sitesRender) {
      const ul = $("#sites");
      ul.removeAttribute("aria-busy");
      ul.innerHTML =
        '<li class="sites-failed">Couldn’t load sites. <button class="link" type="button">Try again</button></li>';
      ul.querySelector("button").addEventListener("click", renderSites);
    }
    return;
  }
  if (render !== sitesRender) {
    return;
  }
  const ul = $("#sites");
  ul.textContent = "";
  ul.removeAttribute("aria-busy");
  ul.classList.toggle("grid", sitesView === "grid");
  for (const button of $$("#view-toggle button")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.view === sitesView)
    );
  }
  $(".dash").hidden = list.length === 0;
  $("#empty").hidden = list.length > 0;
  for (const site of list) {
    ul.append(siteItem(site));
  }
}

// A new picture arrives after a site opens or closes.
api.sites.onChanged(() => {
  if (!$('[data-screen="dashboard"]').hidden) {
    renderSites();
  }
});

function dashError(message) {
  for (const el of [$("#dash-error"), $("#empty-error")]) {
    el.textContent = message || "";
    el.hidden = !message;
  }
}

async function goDashboard() {
  currentSite = null;
  dashError("");
  show("dashboard");
  await renderSites();
  await api.nav.ready();
}

// New website

function openNewDialog() {
  if (!$('[data-screen="dashboard"]').hidden) {
    $("#new-dialog").hidden = false;
    $("#new-error").hidden = true;
    $("#new-name").value = "";
    $("#new-name").focus();
  }
}

function closeNewDialog() {
  $("#new-dialog").hidden = true;
}

$("#new-cancel").addEventListener("click", closeNewDialog);
$("#new-dialog").addEventListener("mousedown", (event) => {
  if (event.target.id === "new-dialog") {
    closeNewDialog();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#gh-dialog").hidden) {
    $("#gh-cancel").click();
    return;
  }
  if (event.key === "Escape" && !$("#clone-dialog").hidden) {
    $("#clone-cancel").click();
  }
  if (event.key === "Escape" && !$("#new-dialog").hidden) {
    closeNewDialog();
  }
});

$("#new-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.target.querySelector('[type="submit"]');
  submit.disabled = true;
  const result = await api.sites.create($("#new-name").value);
  submit.disabled = false;
  if (!result.ok) {
    $("#new-error").textContent = result.message;
    $("#new-error").hidden = false;
    return;
  }
  closeNewDialog();
  openSite(result.site);
});

async function openFolder() {
  if ($('[data-screen="dashboard"]').hidden) {
    return;
  }
  dashError("");
  const result = await api.sites.pickFolder();
  if (result.ok) {
    openSite(result.site);
  } else if (result.message) {
    dashError(result.message);
  }
}

for (const button of $$('[data-action="new"]')) {
  button.addEventListener("click", openNewDialog);
}
for (const button of $$('[data-action="clone"]')) {
  button.addEventListener("click", openCloneDialog);
}
for (const button of $$('[data-action="open-folder"]')) {
  button.addEventListener("click", openFolder);
}

// Opening a site

async function openSite(site) {
  if (site.missing) {
    dashError(
      `We can’t find the folder for “${site.name}”. It may have been moved.`
    );
    return;
  }
  currentSite = site;
  $("[data-screen=loading] h1").textContent = "Getting your site ready…";
  $("#loading-step").textContent = "";
  show("loading");
  try {
    const fields = await api.settings.get(site.id);
    currentSite = { ...site, hasSettings: fields.length > 0 };
    if (await api.settings.needed(site.id)) {
      showSettings("before-open");
      return;
    }
    startSite();
  } catch (error) {
    $("#error-message").textContent = error.message;
    $("#error-details").textContent = "";
    show("error");
  }
}

async function startSite(options) {
  $("[data-screen=loading] h1").textContent = "Getting your site ready…";
  $("#loading-step").textContent = "";
  show("loading");
  setStatus("Starting…");
  const result = await api.site.open(currentSite.id, options);
  if (!result.ok) {
    if (result.code === "already-open") {
      goDashboard();
    } else {
      $("#error-message").textContent =
        result.message || "Couldn’t open this site.";
      $("#error-details").textContent = "";
      show("error");
    }
  }
}

// Clone from GitHub

let nameEdited = false;
let cloning = false;

function openCloneDialog() {
  if ($('[data-screen="dashboard"]').hidden) {
    return;
  }
  nameEdited = false;
  $("#clone-link").value = "";
  $("#clone-name").value = "";
  cloneState({});
  $("#clone-dialog").hidden = false;
  $("#clone-link").focus();
  refreshGitHub();
}

// GitHub account and repositories

let repoList = [];
let ghUrl = null;

const LOCK_ICON =
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="none" stroke="currentColor"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor"/></svg>';

async function refreshGitHub() {
  const account = await api.github.account();
  $("#gh-account").hidden = !account;
  $("#repo-picker").hidden = !account;
  $("#clone-public-note").hidden = Boolean(account);
  if (!account) {
    repoList = [];
    return;
  }
  $("#gh-login").textContent = account.login;
  $("#gh-avatar").hidden = !account.avatarUrl;
  if (account.avatarUrl) {
    $("#gh-avatar").src = `${account.avatarUrl}&s=32`;
  }
  $("#repo-search").value = "";
  renderRepoMessage("Loading your repositories…");
  const result = await api.github.repos();
  if (!result.signedIn) {
    refreshGitHub();
    return;
  }
  repoList = result.repos;
  if (result.message) {
    renderRepoMessage(result.message);
  } else {
    renderRepos();
  }
}

function renderRepoMessage(text) {
  const ul = $("#repos");
  ul.textContent = "";
  const li = document.createElement("li");
  li.className = "empty-row";
  li.textContent = text;
  ul.append(li);
}

function renderRepos() {
  const query = $("#repo-search").value.trim().toLowerCase();
  const matches = repoList.filter((repo) =>
    repo.fullName.toLowerCase().includes(query)
  );
  if (matches.length === 0) {
    renderRepoMessage(
      query ? "No matching repositories" : "No repositories yet"
    );
    return;
  }
  const ul = $("#repos");
  ul.textContent = "";
  for (const repo of matches) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "repo-name";
    name.textContent = repo.fullName;
    li.append(name);
    if (repo.private) {
      li.insertAdjacentHTML("beforeend", LOCK_ICON);
      li.title = "Private";
    }
    li.addEventListener("click", () => {
      for (const other of ul.children) {
        other.classList.remove("selected");
      }
      li.classList.add("selected");
      $("#clone-link").value = `https://github.com/${repo.fullName}`;
      if (!nameEdited) {
        $("#clone-name").value = repo.name;
      }
      cloneState({});
    });
    ul.append(li);
  }
}

$("#repo-search").addEventListener("input", renderRepos);
$("#gh-signout").addEventListener("click", async () => {
  await api.github.signOut();
  refreshGitHub();
});
api.github.onChanged(() => refreshGitHub());

function ghStep({ code = null, error = "" }) {
  $("#gh-waiting-code").hidden = Boolean(code || error);
  $("#gh-code-step").hidden = !code || Boolean(error);
  $("#gh-code").textContent = code || "";
  $("#gh-open").hidden = !code || Boolean(error);
  $("#gh-retry").hidden = !error;
  $("#gh-error").textContent = error;
  $("#gh-error").hidden = !error;
}

function startGitHubSignIn() {
  ghUrl = null;
  ghStep({});
  $("#gh-dialog").hidden = false;
  api.github.signIn();
}

api.github.onEvent((event) => {
  if ($("#gh-dialog").hidden) {
    return;
  }
  if (event.type === "code") {
    ghUrl = event.verificationUri;
    ghStep({ code: event.userCode });
  }
  if (event.type === "done") {
    if (event.ok) {
      $("#gh-dialog").hidden = true;
      refreshGitHub();
    } else {
      ghStep({ error: event.message });
    }
  }
});

$("#gh-signin").addEventListener("click", startGitHubSignIn);
$("#gh-retry").addEventListener("click", startGitHubSignIn);
$("#gh-open").addEventListener(
  "click",
  () => ghUrl && api.auth.openLink(ghUrl)
);
$("#gh-code").addEventListener("click", () =>
  api.github.copy($("#gh-code").textContent)
);
$("#gh-cancel").addEventListener("click", () => {
  api.github.cancel();
  $("#gh-dialog").hidden = true;
});

function cloneState({ busy = false, step = "", error = "" }) {
  cloning = busy;
  $("#clone-link").disabled = busy;
  $("#clone-name").disabled = busy;
  $("#clone-submit").disabled = busy;
  $("#clone-progress").hidden = !busy;
  $("#clone-step").textContent = step;
  $("#clone-error").textContent = error;
  $("#clone-error").hidden = !error;
}

$("#clone-link").addEventListener("input", async () => {
  if (nameEdited) {
    return;
  }
  const parsed = await api.clone.parse($("#clone-link").value);
  $("#clone-name").value = parsed ? parsed.repo : "";
});
$("#clone-name").addEventListener("input", () => {
  nameEdited = true;
});

$("#clone-cancel").addEventListener("click", () => {
  if (cloning) {
    api.clone.cancel();
  }
  $("#clone-dialog").hidden = true;
});

api.clone.onProgress((text) => {
  if (cloning) {
    $("#clone-step").textContent = text;
  }
});

// A double Enter or click must not start two clones: the link check below
// awaits before the form is disabled, so guard synchronously.
let cloneRunning = false;
$("#clone-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (cloneRunning) {
    return;
  }
  cloneRunning = true;
  try {
    await submitClone();
  } finally {
    cloneRunning = false;
  }
});

async function submitClone() {
  const link = $("#clone-link").value;
  if (!(await api.clone.parse(link))) {
    cloneState({ error: "Paste a GitHub link, like github.com/owner/name." });
    return;
  }
  cloneState({ busy: true, step: "Connecting to GitHub…" });
  const result = await api.clone.start(link, $("#clone-name").value);
  if (!result.ok) {
    cloneState({
      error: result.message === "Cancelled." ? "" : result.message,
    });
    return;
  }
  cloneState({});
  $("#clone-dialog").hidden = true;
  openSite(result.site);
}

// Site settings

let settingsMode = "edit";
const URL_IN_TEXT = /(https?:\/\/[^\s)"']+)/g;

/** Plain text with any links made clickable (they open in the browser). */
function linkify(el, text) {
  el.textContent = "";
  for (const part of text.split(URL_IN_TEXT)) {
    if (URL_IN_TEXT.test(part)) {
      const a = document.createElement("a");
      a.textContent = part;
      a.addEventListener("click", () => api.auth.openLink(part));
      el.append(a);
    } else if (part) {
      el.append(part);
    }
    URL_IN_TEXT.lastIndex = 0;
  }
}

async function showSettings(mode) {
  settingsMode = mode;
  const all = await api.settings.get(currentSite.id);
  const fields = mode === "before-open" ? all.filter((f) => f.missing) : all;
  const first = mode === "before-open";
  $("#settings-title").textContent = first
    ? "This site needs a few settings"
    : "Site settings";
  $("#settings-skip").textContent = first ? "Skip for now" : "Cancel";
  $("#settings-error").hidden = true;
  const box = $("#settings-fields");
  box.textContent = "";
  for (const field of fields) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.className = "field-key";
    label.textContent = field.key;
    label.htmlFor = `setting-${field.key}`;
    const input = document.createElement("input");
    input.id = `setting-${field.key}`;
    input.name = field.key;
    input.type = field.secret ? "password" : "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = field.value || (field.secret ? "" : field.placeholder);
    input.placeholder = field.placeholder || "";
    wrap.append(label);
    if (field.hint) {
      const hint = document.createElement("p");
      hint.className = "field-hint";
      linkify(hint, field.hint);
      wrap.append(hint);
    }
    wrap.append(input);
    box.append(wrap);
  }
  show("settings");
  box.querySelector("input")?.focus();
}

function leaveSettings(saved) {
  if (settingsMode === "before-open") {
    startSite();
  } else if (settingsMode === "from-editor") {
    show("editor");
    setStatus("");
    api.editor.setVisible(true);
  } else if (settingsMode === "from-error") {
    if (saved) {
      startSite();
    } else {
      show("error");
    }
  } else {
    goDashboard();
  }
}

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const answers = {};
  for (const input of $$("#settings-fields input")) {
    answers[input.name] = input.value;
  }
  const result = await api.settings.save(currentSite.id, answers);
  if (!result.ok) {
    $("#settings-error").textContent = result.message || "";
    $("#settings-error").hidden = false;
    return;
  }
  leaveSettings(true);
});

$("#settings-skip").addEventListener("click", async () => {
  if (settingsMode === "before-open") {
    await api.settings.skip(currentSite.id);
  }
  leaveSettings(false);
});

$("#topbar-settings").addEventListener("click", () => {
  api.editor.setVisible(false);
  showSettings("from-editor");
});
$("#error-settings").addEventListener("click", () =>
  showSettings("from-error")
);

api.site.onEvent((event) => {
  if (!currentSite) {
    return;
  }
  if (event.type === "progress") {
    $("#loading-step").textContent = event.step;
  }
  if (event.type === "ready") {
    show("editor");
    setStatus("");
  }
  if (event.type === "error") {
    $("#error-message").textContent = event.message;
    $("#error-details").textContent = event.details || "";
    $(".details").open = false;
    show("error");
    setStatus("Stopped");
  }
});

async function leaveSite() {
  if (leavingSite) {
    return;
  }
  leavingSite = true;
  currentSite = null;
  show("dashboard");
  showSitesLoading();
  try {
    await api.site.close();
    await goDashboard();
  } catch (error) {
    dashError(error.message || "Couldn’t close the site. Try again.");
  } finally {
    leavingSite = false;
  }
}

let leavingSite = false;

$("#back").addEventListener("click", leaveSite);
$("#error-back").addEventListener("click", leaveSite);
$("#retry").addEventListener(
  "click",
  () => currentSite && startSite({ fresh: true })
);

api.nav.onDashboard(() => goDashboard());
api.nav.onNew(openNewDialog);
api.nav.onOpen(openFolder);
api.nav.onSite(openSite);
api.nav.onSiteError((message) => {
  if ($('[data-screen="dashboard"]').hidden) {
    setStatus(message, "error");
  } else {
    dashError(message);
  }
});

// Start

(async () => {
  const state = await api.auth.state();
  if (state.connected) {
    goDashboard();
  } else {
    connectStep("start");
    show("connect");
  }
})();
