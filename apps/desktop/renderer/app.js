const api = window.weblab;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let currentSite = null;

// Screens and top bar

function show(name) {
  for (const screen of $$(".screen")) {
    screen.hidden = screen.dataset.screen !== name;
  }
  const inSite = ["loading", "editor", "error"].includes(name);
  $("#back").hidden = !inSite;
  const title = $("#title");
  title.textContent = inSite && currentSite ? currentSite.name : "Weblab";
  title.classList.toggle("quiet", !inSite);
  if (!inSite) {
    setStatus("");
  }
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
      goDashboard();
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

async function renderSites() {
  const list = await api.sites.list();
  const ul = $("#sites");
  ul.textContent = "";
  $(".dash").hidden = list.length === 0;
  $("#empty").hidden = list.length > 0;
  for (const site of list) {
    const li = document.createElement("li");
    li.className = `site${site.missing ? " missing" : ""}`;
    li.tabIndex = 0;
    li.innerHTML = `
      <div class="site-text"><div class="site-name"></div><div class="site-path"></div></div>
      <div class="site-when"></div>
      <button class="more" aria-label="More">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor"/></svg>
      </button>`;
    li.querySelector(".site-name").textContent = site.name;
    li.querySelector(".site-path").textContent = site.missing
      ? "Folder not found"
      : prettyPath(site.path);
    li.querySelector(".site-when").textContent = relativeTime(site.lastOpened);
    li.addEventListener("click", (event) => {
      if (event.target.closest(".more")) {
        return;
      }
      openSite(site);
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
      if (result === "removed") {
        renderSites();
      }
    };
    li.addEventListener("contextmenu", menu);
    li.querySelector(".more").addEventListener("click", menu);
    ul.append(li);
  }
}

function dashError(message) {
  for (const el of [$("#dash-error"), $("#empty-error")]) {
    el.textContent = message || "";
    el.hidden = !message;
  }
}

async function goDashboard() {
  currentSite = null;
  dashError("");
  await renderSites();
  show("dashboard");
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
  $("#loading-step").textContent = "";
  show("loading");
  setStatus("Starting…");
  await api.site.open(site.id);
}

api.site.onEvent((event) => {
  if (!currentSite) {
    return;
  }
  if (event.type === "progress") {
    $("#loading-step").textContent = event.step;
  }
  if (event.type === "ready") {
    show("editor");
    setStatus("Running", "ready");
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
  await api.site.close();
  goDashboard();
}

$("#back").addEventListener("click", leaveSite);
$("#error-back").addEventListener("click", leaveSite);
$("#retry").addEventListener(
  "click",
  () => currentSite && openSite(currentSite)
);

api.nav.onDashboard(() => goDashboard());
api.nav.onNew(openNewDialog);
api.nav.onOpen(openFolder);

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
