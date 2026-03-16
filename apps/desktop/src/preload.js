const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onExportMarkdown: (callback) => ipcRenderer.on("export-markdown", callback),
  platform: process.platform,
});
