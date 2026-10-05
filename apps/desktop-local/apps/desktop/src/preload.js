const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Finder files enter here. Only local folder paths reach main, where Weblab
// checks that the folder is a website before opening it.
document.addEventListener(
  "dragover",
  (event) => {
    if (
      [...(event.dataTransfer?.items || [])].some(
        (item) => item.kind === "file" && item.type === ""
      )
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  },
  true
);
document.addEventListener(
  "drop",
  (event) => {
    const item = [...(event.dataTransfer?.items || [])].find(
      (candidate) =>
        candidate.kind === "file" &&
        (candidate.webkitGetAsEntry?.()?.isDirectory ||
          (!candidate.webkitGetAsEntry?.() && candidate.type === ""))
    );
    const file = item?.getAsFile();
    const path = file && webUtils.getPathForFile(file);
    if (path) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ipcRenderer.invoke("sites:dropFolder", path);
    }
  },
  true
);

const on = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("weblab", {
  auth: {
    cancel: () => ipcRenderer.invoke("auth:cancel"),
    login: () => ipcRenderer.invoke("auth:login"),
    onEvent: on("auth:event"),
    openLink: (url) => ipcRenderer.invoke("auth:openLink", url),
    saveApiKey: (key) => ipcRenderer.invoke("auth:apiKey", key),
    state: () => ipcRenderer.invoke("auth:state"),
    submitCode: (code) => ipcRenderer.invoke("auth:code", code),
  },
  clone: {
    cancel: () => ipcRenderer.invoke("clone:cancel"),
    onProgress: on("clone:progress"),
    parse: (link) => ipcRenderer.invoke("clone:parse", link),
    start: (link, name) => ipcRenderer.invoke("clone:start", link, name),
  },
  deploy: {
    cancel: () => ipcRenderer.invoke("deploy:cancel"),
    cancelLogin: () => ipcRenderer.invoke("deploy:cancelLogin"),
    login: () => ipcRenderer.invoke("deploy:login"),
    onLogin: on("deploy:login"),
    onProgress: on("deploy:progress"),
    prepare: () => ipcRenderer.invoke("deploy:prepare"),
    sendKeys: (names) => ipcRenderer.invoke("deploy:sendKeys", names),
    skipKeys: () => ipcRenderer.invoke("deploy:skipKeys"),
    start: (target) => ipcRenderer.invoke("deploy:start", target),
    status: () => ipcRenderer.invoke("deploy:status"),
  },
  editor: {
    command: (name) => ipcRenderer.invoke("editor:command", name),
    onMode: on("editor:mode"),
    setMode: (mode) => ipcRenderer.invoke("editor:setMode", mode),
    setVisible: (visible) => ipcRenderer.invoke("editor:visible", visible),
  },
  github: {
    account: () => ipcRenderer.invoke("github:account"),
    cancel: () => ipcRenderer.invoke("github:cancel"),
    copy: (text) => ipcRenderer.invoke("github:copy", text),
    onChanged: on("github:changed"),
    onEvent: on("github:event"),
    repos: () => ipcRenderer.invoke("github:repos"),
    signIn: () => ipcRenderer.invoke("github:signIn"),
    signOut: () => ipcRenderer.invoke("github:signOut"),
  },
  nav: {
    onDashboard: on("nav:dashboard"),
    onNew: on("nav:new"),
    onOpen: on("nav:open"),
    onSite: on("nav:site"),
    onSiteError: on("nav:siteError"),
    ready: () => ipcRenderer.invoke("nav:ready"),
  },
  publish: {
    ask: (text) => ipcRenderer.invoke("editor:ask", text),
    branches: () => ipcRenderer.invoke("publish:branches"),
    createBranch: (name) => ipcRenderer.invoke("publish:createBranch", name),
    createRepo: (name) => ipcRenderer.invoke("publish:createRepo", name),
    freeze: (frozen) => ipcRenderer.invoke("editor:freeze", frozen),
    note: (paths) => ipcRenderer.invoke("publish:note", paths),
    onJob: on("editor:job"),
    openLink: (url) => ipcRenderer.invoke("publish:openLink", url),
    pullRequest: (title) => ipcRenderer.invoke("publish:pullRequest", title),
    retry: () => ipcRenderer.invoke("publish:retry"),
    status: () => ipcRenderer.invoke("publish:status"),
    switchBranch: (name) => ipcRenderer.invoke("publish:switch", name),
    upload: (options) => ipcRenderer.invoke("publish:upload", options),
  },
  settings: {
    get: (id) => ipcRenderer.invoke("settings:get", id),
    needed: (id) => ipcRenderer.invoke("settings:needed", id),
    save: (id, answers) => ipcRenderer.invoke("settings:save", id, answers),
    skip: (id) => ipcRenderer.invoke("settings:skip", id),
  },
  site: {
    close: () => ipcRenderer.invoke("site:close"),
    onEvent: on("site:event"),
    open: (id, options) => ipcRenderer.invoke("site:open", id, options),
  },
  sites: {
    create: (name) => ipcRenderer.invoke("sites:create", name),
    list: () => ipcRenderer.invoke("sites:list"),
    menu: (id) => ipcRenderer.invoke("sites:menu", id),
    onChanged: on("sites:changed"),
    openNewWindow: (id) => ipcRenderer.invoke("sites:openNewWindow", id),
    pickFolder: () => ipcRenderer.invoke("sites:pickFolder"),
  },
  updates: {
    download: () => ipcRenderer.invoke("updates:download"),
    onAvailable: on("updates:available"),
    status: () => ipcRenderer.invoke("updates:status"),
  },
});
