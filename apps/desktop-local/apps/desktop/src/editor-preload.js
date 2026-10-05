const { contextBridge, ipcRenderer, webUtils } = require("electron");

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

// The editor page runs the user's site, so it gets one narrow door: which
// mode the editor is in. The window's top bar holds the Edit and Preview
// buttons; this carries the choice both ways.
contextBridge.exposeInMainWorld("weblabHost", {
  // Upload in the top bar replaces the chat's own commit and push rows.
  hostsGit: true,
  // The top bar's Upload and branch buttons wait while an AI job writes files.
  jobState: (running) => ipcRenderer.send("editor:job", Boolean(running)),
  // "Ask AI to fix it" from the Deploy panel: text for the chat to send.
  onAsk: (callback) => {
    const listener = (_event, text) => callback(text);
    ipcRenderer.on("editor:ask", listener);
    return () => ipcRenderer.removeListener("editor:ask", listener);
  },
  // The top bar's palette and shortcuts buttons.
  onCommand: (callback) => {
    const listener = (_event, name) => callback(name);
    ipcRenderer.on("editor:command", listener);
    return () => ipcRenderer.removeListener("editor:command", listener);
  },
  onMode: (callback) => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on("editor:setMode", listener);
    return () => ipcRenderer.removeListener("editor:setMode", listener);
  },
  setMode: (mode) => ipcRenderer.send("editor:modeChanged", mode),
});
