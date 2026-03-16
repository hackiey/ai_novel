const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

// In dev, load from Vite dev server; in prod, load from built files
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "AI Novel",
    titleBarStyle: "hiddenInset", // macOS native look
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../web-dist/index.html"));
  }

  // Build a custom menu with File > Export
  const template = [
    {
      label: "AI Novel",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "Export Chapter as Markdown",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => win.webContents.send("export-markdown"),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { label: "Edit", submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
    ]},
    { label: "View", submenu: [
      { role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" },
      { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" }, { role: "togglefullscreen" },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
