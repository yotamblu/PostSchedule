'use strict';

const { app, BrowserWindow, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs   = require('fs');

const isDev = process.env.NODE_ENV === 'development';

// ── Session file path ─────────────────────────────────────────────────────────
// Saved in the OS app-data dir so it's user-scoped and not world-readable.
// In dev, fall back to the legacy path if it already exists there.
const LEGACY_SESSION = 'C:\\Users\\yotam\\Desktop\\Auto-X\\session.json';
const SESSION_FILE = (() => {
  if (isDev && fs.existsSync(LEGACY_SESSION)) return LEGACY_SESSION;
  return path.join(app.getPath('userData'), 'x-session.json');
})();
// Expose to server.js (required after this point)
process.env.SESSION_FILE = SESSION_FILE;

// ── Start the Express + Playwright backend ────────────────────────────────────
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

// ── Wait for Vite dev server ──────────────────────────────────────────────────
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

// ── Auth IPC handlers ─────────────────────────────────────────────────────────
function registerAuthHandlers() {
  ipcMain.handle('auth:status', () => ({
    hasSession: fs.existsSync(SESSION_FILE),
  }));

  ipcMain.handle('auth:signout', () => {
    try { fs.unlinkSync(SESSION_FILE); } catch { /* already gone */ }
    return { ok: true };
  });

  ipcMain.handle('auth:start', () => {
    return new Promise((resolve) => {
      // Isolated in-memory partition — we extract cookies ourselves and write them
      // to SESSION_FILE in Playwright storageState format.
      const authPartition = session.fromPartition('auth-flow', { cache: false });

      const authWin = new BrowserWindow({
        width:  1000,
        height: 780,
        title:  'Sign in to X — PostSchedule',
        autoHideMenuBar: true,
        webPreferences: {
          session: authPartition,
          nodeIntegration: false,
          contextIsolation: true,
          // No preload — this is a plain browser window for the user
        },
      });

      authWin.loadURL('https://x.com/i/flow/login');

      // Allow Google / Apple OAuth popups to open in the same partition
      authWin.webContents.setWindowOpenHandler(({ url }) => ({
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            session: authPartition,
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      }));

      let settled = false;

      const finish = async (loggedIn) => {
        if (settled) return;
        settled = true;

        if (loggedIn) {
          // Grab all cookies from the auth partition
          const all = await authPartition.cookies.get({});
          const relevant = all.filter(c =>
            c.domain.includes('x.com') || c.domain.includes('twitter.com')
          );

          // Electron sameSite → Playwright sameSite
          const sameSiteMap = { strict: 'Strict', lax: 'Lax', no_restriction: 'None' };

          const cookies = relevant.map(c => ({
            name:     c.name,
            value:    c.value,
            domain:   c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
            path:     c.path  || '/',
            expires:  c.expirationDate != null ? Math.floor(c.expirationDate) : -1,
            httpOnly: c.httpOnly || false,
            secure:   c.secure   || false,
            sameSite: sameSiteMap[c.sameSite] || 'None',
          }));

          // Write Playwright storageState
          const dir = path.dirname(SESSION_FILE);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(SESSION_FILE, JSON.stringify({ cookies, origins: [] }, null, 2), {
            mode: 0o600, // owner-read/write only
          });
        }

        if (!authWin.isDestroyed()) authWin.close();
        resolve({ ok: loggedIn });
      };

      // Poll for auth_token cookie — set by X after any login method (email, Google, Apple)
      const poll = setInterval(async () => {
        if (settled) { clearInterval(poll); return; }
        const found = await authPartition.cookies.get({ name: 'auth_token' });
        if (found.some(c => c.domain.includes('x.com') || c.domain.includes('twitter.com'))) {
          clearInterval(poll);
          // Small grace period so all post-login cookies are written
          setTimeout(() => finish(true), 1200);
        }
      }, 1500);

      authWin.on('closed', () => {
        clearInterval(poll);
        finish(false);
      });
    });
  });
}

// ── Create the main window ────────────────────────────────────────────────────
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
    show: false,
  });

  const appURL = isDev ? 'http://localhost:5173' : null;

  win.webContents.once('did-finish-load', () => win.show());

  if (isDev) {
    try { await waitForVite(appURL); }
    catch (e) { console.error('[Electron] Vite did not start in time:', e.message); }
    win.loadURL(appURL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.on('will-navigate', (event, url) => {
    const isAppURL = isDev
      ? url.startsWith('http://localhost:5173')
      : url.startsWith('file://');
    if (!isAppURL) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('did-fail-load', (_e, code) => {
    if (code === -3) return;
    console.log(`[Electron] Page failed to load (${code}), reloading…`);
    setTimeout(() => {
      if (!win.isDestroyed()) {
        isDev ? win.loadURL(appURL) : win.loadFile(path.join(__dirname, '../dist/index.html'));
      }
    }, 1000);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Electron] Renderer gone:', details.reason);
    if (!win.isDestroyed()) {
      setTimeout(() => {
        isDev ? win.loadURL(appURL) : win.loadFile(path.join(__dirname, '../dist/index.html'));
      }, 500);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  registerAuthHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
