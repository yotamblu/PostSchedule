# PostSchedule

> A desktop app that schedules X (Twitter) posts so they never look pre-planned.

PostSchedule generates organic-looking posting times — `03:07`, `05:49`, `08:33` — so your scheduled content reads like you just happened to pick up your phone. No clean round numbers, no detectable patterns. Built as a native desktop app with Electron.

![PostSchedule logo](public/logo.png)

---

## How it works

1. Paste your posts, separated by `---`
2. Click **Open All Composers**
3. A Chromium window opens — one tab per post, each with:
   - Post text pre-filled
   - Scheduled time already set in X's scheduler
4. Review each tab, make any edits, click **Schedule**

---

## Schedule algorithm

```
first_post = random minute between 03:00–05:00, never a multiple of 5
each_gap   = 2–4 hours + random non-round minutes
cutoff     = 23:30
```

Result: `03:07 → 05:49 → 08:33 → 11:12 → 14:02 → ...`

Times that look like you just picked up your phone, every time.

---

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron |
| UI | React 18 + Vite |
| Backend | Express.js (runs inside Electron) |
| Automation | Playwright (Chromium) |

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

> On networks with SSL inspection, prefix with `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### 2. Authenticate with X

```bash
npm run auth
```

A browser opens to x.com/login. Log in normally, come back and press Enter. Your session is saved to `x-session.json` and reused on every run.

> If you already have a Playwright session file elsewhere, update the `SESSION_FILE` path in `server.js`.

---

## Running

```bash
npm start
```

That's it. Electron opens, the UI loads, the backend starts automatically.

---

## Project structure

```
PostSchedule/
├── electron/
│   ├── main.js        # Electron main process — starts Express, creates window
│   └── preload.js
├── public/
│   └── logo.png
├── src/
│   ├── App.jsx        # React UI
│   ├── App.css
│   └── main.jsx
├── auth.js            # One-time X session setup
├── server.js          # Express API + Playwright scheduling automation
├── index.html         # Vite entry point
└── vite.config.js
```

---

## Notes

- The app detects whether your X account uses 12h or 24h time format and sets the scheduler accordingly.
- A second click on **Open All Composers** closes any previously opened Playwright browser before starting fresh.
- Posts that would fall after 11:30 PM are flagged and skipped.

---

## License

MIT
