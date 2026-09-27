const { contextBridge, ipcRenderer } = require("electron");

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
  editor: {
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
    pickFolder: () => ipcRenderer.invoke("sites:pickFolder"),
  },
});
