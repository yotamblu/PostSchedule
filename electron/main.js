'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

// ── Start the Express + Playwright backend ───────────────────
// Only start the server if port 3001 isn't already occupied
// (guards against running electron-dev while npm run dev is still up).
const net = require('net');
function startServerIfNeeded() {
  return new Promise((resolve) => {
    const tester = net.createConnection({ port: 3001, host: '127.0.0.1' });
    tester.once('connect', () => {
      tester.destroy();
      console.log('[Electron] Port 3001 already in use — skipping server start.');
      resolve();
    });
    tester.once('error', () => {
      tester.destroy();
      require('../server.js');
      resolve();
    });
  });
}
startServerIfNeeded();

// ── Create the main window ───────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:    1160,
    height:   860,
    minWidth: 860,
    minHeight: 620,
    title: 'PostSchedule',
    icon: path.join(__dirname, '../public/logo.png'),
    backgroundColor: '#050509',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // Remove default menu bar
    autoHideMenuBar: true,
  });

  if (isDev) {
    // In dev: load Vite dev server (which proxies /api → localhost:3001)
    win.loadURL('http://localhost:5173');
  } else {
    // In production: load the built index.html
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open all <a target="_blank"> links in the system browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS apps stay active until Cmd+Q
  if (process.platform !== 'darwin') app.quit();
});
