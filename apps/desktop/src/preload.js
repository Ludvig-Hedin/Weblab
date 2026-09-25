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
  nav: {
    onDashboard: on("nav:dashboard"),
    onNew: on("nav:new"),
    onOpen: on("nav:open"),
  },
  site: {
    close: () => ipcRenderer.invoke("site:close"),
    onEvent: on("site:event"),
    open: (id) => ipcRenderer.invoke("site:open", id),
  },
  sites: {
    create: (name) => ipcRenderer.invoke("sites:create", name),
    list: () => ipcRenderer.invoke("sites:list"),
    menu: (id) => ipcRenderer.invoke("sites:menu", id),
    pickFolder: () => ipcRenderer.invoke("sites:pickFolder"),
  },
});
