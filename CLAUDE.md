# PostSchedule — Claude Code Guide

## What this project is
Desktop Electron app that schedules X (Twitter) posts with organic-looking times (e.g. 03:07, 05:49, 08:33) so they never look pre-planned. Built with React + Vite (UI), Express (backend API), and Playwright (browser automation).

## Stack
| Layer | Tech |
|---|---|
| Desktop shell | Electron 42 |
| UI | React 18 + Vite 5 |
| Backend | Express (runs inside Electron main process) |
| Automation | Playwright Chromium |
| Build | electron-builder (NSIS for Windows, DMG for macOS) |

## Running in development
```bash
npm start   # starts Vite (port 5173) + Electron concurrently
```

## Building the installer
```bash
npm run dist        # Windows .exe (run on Windows)
npm run dist:mac    # macOS .dmg (run on macOS)
```
CI builds both via GitHub Actions on every `v*` tag push.

## Key files
| File | Purpose |
|---|---|
| `electron/main.js` | Electron main process — starts Express, creates window, handles auth IPC |
| `electron/preload.js` | Exposes `window.electronAPI` (startAuth, signOut, authStatus) |
| `server.js` | Express API on port 3001 — `/api/health`, `/api/schedule` (SSE) |
| `src/App.jsx` | React UI — all components and state |
| `src/App.css` | Styles |
| `vite.config.js` | Vite config — `base: './'` is required for packaged app |

## Architecture notes

### API calls in the packaged app
The React app loads from `file://` in production. All `fetch()` calls must use the full URL:
```js
const API = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';
fetch(`${API}/api/health`);
```
Never use bare `/api/...` paths — they resolve to `file:///api/...` and silently fail.

### Static assets
Always use relative paths (`./logo.png`) not absolute (`/logo.png`). Absolute paths break under `file://`.

### Session file
Stored at `{userData}/x-session.json` (e.g. `AppData\Roaming\PostSchedule\x-session.json` on Windows).
Path is set as `process.env.SESSION_FILE` in `main.js` before `server.js` is required.
In dev it falls back to `C:\Users\yotam\Desktop\Auto-X\session.json` if it exists.

### Auth flow
Uses an Electron `BrowserWindow` (not Playwright) so Google/Apple OAuth passes bot detection.
Polls for `auth_token` cookie, then extracts all x.com/twitter.com cookies and writes them
as a Playwright `storageState` JSON file.

### Playwright browsers in packaged app
Bundled into `resources/playwright-browsers/` via electron-builder `extraResources`.
`process.env.PLAYWRIGHT_BROWSERS_PATH` is set to `process.resourcesPath/playwright-browsers`
in `main.js` before the server starts.

### Time format detection
X shows either a 12h or 24h hour selector depending on account locale.
`server.js` detects this by checking if `#SELECTOR_6` (AM/PM select) exists before setting the hour.

## Schedule algorithm
```
winStart + random non-round-minute offset
gaps = proportional weights normalized to fill winStart→winEnd
each time += random non-multiple-of-5 nudge
```
All posts always fit within the window — no skipping.

## CI/CD
`.github/workflows/build.yml` — triggers on `v*` tags or manual dispatch.
Three parallel jobs: Windows (windows-latest), macOS arm64 (macos-latest), macOS x64 (macos-13).
Artifacts available for 30 days in the Actions run.
Use `--publish never` to prevent electron-builder from trying to create GitHub Releases.
