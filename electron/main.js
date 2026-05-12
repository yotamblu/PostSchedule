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

// ── Wait for Vite dev server then load ──────────────────────
function waitForVite(url, retries = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    const try_ = () => {
      http.get(url, () => resolve()).on('error', () => {
        if (++attempts >= retries) return reject(new Error('Vite never started'));
        setTimeout(try_, interval);
      });
    };
    try_();
  });
}

// ── Create the main window ───────────────────────────────────
async function createWindow() {
  const win = new BrowserWindow({
    width:     1160,
    height:    860,
    minWidth:  860,
    minHeight: 620,
    title: 'PostSchedule',
    icon: path.join(__dirname, '../public/logo.png'),
    backgroundColor: '#050509',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
    // Show window only once content is ready — prevents the blank flash
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    try {
      await waitForVite('http://localhost:5173');
    } catch (e) {
      console.error('[Electron] Vite did not start in time:', e.message);
    }
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open target="_blank" links in the system browser
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
