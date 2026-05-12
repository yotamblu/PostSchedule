# PostSchedule

> Schedule X (Twitter) posts that never look pre-planned.

PostSchedule generates organic-looking posting times — think `03:07`, `05:49`, `08:33` — so your scheduled content reads like you just happened to pick up your phone. No clean round numbers, no detectable patterns.

![PostSchedule UI](public/logo.png)

---

## Features

- **Natural schedule generation** — first post between 3–5 AM at a non-round minute; each subsequent gap is 2–4 hours with irregular minutes. Never a `:00` or `:30`.
- **Playwright automation** — opens X's compose UI in a real browser, pre-fills each post's text and scheduled time. You review, then click Schedule.
- **24h / 12h locale aware** — auto-detects whether your X account uses AM/PM or 24-hour format.
- **Live schedule cards** — each post shown with its amber time display, character count bar, and a copy button.
- **Regenerate** — re-randomize all times without reopening tabs.
- **Session reuse** — reads an existing Playwright session file (no login required each run).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, custom CSS (Syne + DM Mono + Lora fonts) |
| Backend | Express.js, Server-Sent Events for live progress |
| Automation | Playwright (Chromium) |
| Desktop | Electron (optional — see below) |

---

## Prerequisites

- Node.js 18+
- An X session file (see Setup)

---

## Setup

### 1. Install dependencies

```bash
npm install
node node_modules/playwright/cli.js install chromium
```

> If you're behind a corporate proxy with SSL issues, prefix with `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### 2. Authenticate with X

Run the auth helper once to save your X session:

```bash
node auth.js
```

A browser opens to x.com/login. Log in, then press Enter. Your session is saved to `x-session.json`.

> If you already have a Playwright session file elsewhere, update the `SESSION_FILE` path in `server.js`.

---

## Running

### Web version (browser)

```bash
npm run dev
```

Opens the app at `http://localhost:5173`. The Express + Playwright backend runs on port 3001.

### Electron version (desktop app)

```bash
npm run electron-dev
```

Launches a native desktop window with the same UI. No browser needed.

---

## Usage

1. Paste your posts into the textarea, separated by `---` on its own line
2. Click **Open All Composers**
3. A Playwright Chromium window opens — one tab per post, each with:
   - Post text pre-filled
   - Scheduled time already set in X's scheduler
4. Review each tab, make any edits, click **Schedule**

---

## Project structure

```
PostSchedule/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js
├── public/
│   └── logo.png
├── src/
│   ├── App.jsx          # React UI
│   ├── App.css
│   └── main.jsx
├── auth.js              # One-time X session setup
├── server.js            # Express API + Playwright automation
├── vite.config.js
└── package.json
```

---

## Schedule algorithm

```
first_post  = random minute in [03:00–05:00], never a multiple of 5
each_gap    = random in [2h–4h] + random non-round minutes
cutoff      = 23:30
```

Result looks like: `03:07 → 05:49 → 08:33 → 11:12 → 14:02 → ...`

---

## License

MIT
