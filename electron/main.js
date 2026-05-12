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

  const appURL = isDev ? 'http://localhost:5173' : null;

  if (isDev) {
    try {
      await waitForVite(appURL);
    } catch (e) {
      console.error('[Electron] Vite did not start in time:', e.message);
    }
    win.loadURL(appURL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // ── Block any navigation away from the app ────────────────
  // Vite's HMR WebSocket can drop when Playwright's Chromium
  // launches alongside Electron, causing a blank reconnect screen.
  // Intercept and reload instead.
  win.webContents.on('will-navigate', (event, url) => {
    const isAppURL = isDev
      ? url.startsWith('http://localhost:5173')
      : url.startsWith('file://');
    if (!isAppURL) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // If the page fails to load (e.g. HMR dropped), reload after 1s
  win.webContents.on('did-fail-load', (_e, code, _desc, url) => {
    if (code === -3) return; // -3 = aborted, harmless
    console.log(`[Electron] Page failed to load (${code}), reloading…`);
    setTimeout(() => {
      if (!win.isDestroyed()) {
        isDev ? win.loadURL(appURL) : win.loadFile(path.join(__dirname, '../dist/index.html'));
      }
    }, 1000);
  });

  // If the renderer crashes, reload
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Electron] Renderer gone:', details.reason);
    if (!win.isDestroyed()) {
      setTimeout(() => {
        isDev ? win.loadURL(appURL) : win.loadFile(path.join(__dirname, '../dist/index.html'));
      }, 500);
    }
  });

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
