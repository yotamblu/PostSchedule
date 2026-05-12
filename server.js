const express  = require('express');
const { chromium } = require('playwright');
const path  = require('path');
const fs    = require('fs');

const app          = express();
// Path set by electron/main.js via env var; falls back to legacy dev path
const SESSION_FILE = process.env.SESSION_FILE || 'C:\\Users\\yotam\\Desktop\\Auto-X\\session.json';
const DIST_DIR     = path.join(__dirname, 'dist');

app.use(express.json({ limit: '10mb' }));

if (fs.existsSync(DIST_DIR)) app.use(express.static(DIST_DIR));

// Keep a reference so a second click closes the old browser first
let activeBrowser = null;

// ── Health / session check ───────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasSession: fs.existsSync(SESSION_FILE) });
});

// ── Schedule endpoint (SSE) ──────────────────────────────────
app.post('/api/schedule', async (req, res) => {
  const { posts, times, autoSchedule = false, scheduleDate } = req.body;

  if (!Array.isArray(posts) || !Array.isArray(times) || posts.length === 0) {
    return res.status(400).json({ error: 'Invalid payload.' });
  }
  if (!fs.existsSync(SESSION_FILE)) {
    return res.status(401).json({ error: 'Not authenticated — run: node auth.js' });
  }

  // Close any browser left open from a previous run
  if (activeBrowser) {
    try { await activeBrowser.close(); } catch { /* ignore */ }
    activeBrowser = null;
  }

  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const browser = await chromium.launch({ headless: false });
  activeBrowser = browser;

  try {
    const ctx = await browser.newContext({ storageState: SESSION_FILE });

    // ── Verify session is valid ────────────────────────────────
    const probe = await ctx.newPage();
    await probe.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });

    const loggedIn = await probe.locator('[data-testid="SideNav_NewTweet_Button"]')
      .waitFor({ timeout: 12000 })
      .then(() => true)
      .catch(() => false);

    await probe.close(); // close the probe tab

    if (!loggedIn) {
      send({ type: 'error', message: 'Session expired or invalid. Please run: node auth.js' });
      res.end();
      await browser.close();
      activeBrowser = null;
      return;
    }

    // ── Process each post ──────────────────────────────────────
    const count = Math.min(posts.length, times.length);

    for (let i = 0; i < count; i++) {
      send({ type: 'progress', index: i, status: 'scheduling' });

      try {
        await openAndPrefill(ctx, posts[i], times[i], autoSchedule, scheduleDate);
        send({ type: 'progress', index: i, status: 'done' });
      } catch (err) {
        console.error(`[Post ${i + 1}] ${err.message}`);

        let screenshot = null;
        // grab a screenshot from the most recent page for debugging
        const pages = ctx.pages();
        const last  = pages[pages.length - 1];
        if (last) {
          try { screenshot = (await last.screenshot({ type: 'jpeg', quality: 60 })).toString('base64'); }
          catch { /* ignore */ }
        }
        send({ type: 'progress', index: i, status: 'error', message: err.message, screenshot });
      }
    }

    // ── Done — leave browser open for user review ──────────────
    // The user goes through each tab, reviews the post + prefilled time,
    // then manually clicks "Schedule" to confirm.
    send({ type: 'complete' });
    res.end();
    // DO NOT close the browser here — tabs stay open for review

  } catch (err) {
    send({ type: 'error', message: err.message });
    res.end();
    try { await browser.close(); } catch { /* ignore */ }
    activeBrowser = null;
  }
});

// ── Core automation ──────────────────────────────────────────
// Opens a new tab, navigates directly to x.com/compose/post (so there is
// only ONE compose textarea on the page — no home-feed inline composer),
// fills the text, opens the schedule dialog, sets the date/time from the DOM
// (SELECTOR_1 … SELECTOR_6), and clicks Confirm.  The tab stays open so
// the user can review the post and click Schedule themselves.
async function openAndPrefill(ctx, text, totalMins, autoSchedule = false, scheduleDate = null) {
  // ── Time math ────────────────────────────────────────────
  const h24  = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  // Parse scheduleDate ('YYYY-MM-DD') or fall back to tomorrow
  let dateObj;
  if (scheduleDate) {
    const [y, m, d] = scheduleDate.split('-').map(Number);
    dateObj = new Date(y, m - 1, d);
  } else {
    dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + 1);
  }
  // DOM option values: "1"–"12" for month, "1"–"31" for day, "2026" etc. for year
  const month = String(dateObj.getMonth() + 1);
  const day   = String(dateObj.getDate());
  const year  = String(dateObj.getFullYear());

  // ── Open compose in a dedicated tab ──────────────────────
  // Navigating directly to /compose/post means there is only one textarea
  // and one scheduleOption button on the page (no home-feed inline composer),
  // which eliminates the strict-mode "2 elements" error.
  const page = await ctx.newPage();
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // ── Fill post text ────────────────────────────────────────
  const editor = page.locator('[data-testid="tweetTextarea_0"]').first();
  await editor.waitFor({ timeout: 12000 });
  // force:true bypasses the mask overlay that X renders behind the compose dialog
  await editor.click({ force: true });
  await page.keyboard.type(text, { delay: 0 });

  // ── Open schedule dialog ──────────────────────────────────
  const scheduleBtn = page.locator('[data-testid="scheduleOption"]').first();
  await scheduleBtn.waitFor({ timeout: 10000 });
  await scheduleBtn.click();

  // ── Wait for the schedule selects to appear ───────────────
  // Confirmed from live DOM: selects have id="SELECTOR_1" … id="SELECTOR_6"
  await page.locator('#SELECTOR_1').waitFor({ timeout: 8000 });

  // ── Set date ─────────────────────────────────────────────
  await page.locator('#SELECTOR_1').selectOption(month);  // Month: "1"–"12"
  await page.locator('#SELECTOR_2').selectOption(day);    // Day:   "1"–"31"
  await page.locator('#SELECTOR_3').selectOption(year);   // Year:  "2026"–"2028"

  // ── Detect 12h vs 24h format ─────────────────────────────
  // SELECTOR_6 is the AM/PM select — it only exists in 12-hour mode.
  // We check this BEFORE setting the hour so we know which range to use.
  const ampmCount = await page.locator('#SELECTOR_6').count();
  const is12h = ampmCount > 0;

  // ── Set hour ─────────────────────────────────────────────
  if (is12h) {
    // 12h: convert 0–23 → 1–12  (midnight=12, noon=12)
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    await page.locator('#SELECTOR_4').selectOption(String(h12));
  } else {
    // 24h: use raw value 0–23
    await page.locator('#SELECTOR_4').selectOption(String(h24));
  }

  await page.locator('#SELECTOR_5').selectOption(String(mins));  // Minute: "0"–"59"

  // ── Set AM/PM (12h accounts only) ────────────────────────
  if (is12h) {
    const ampm = h24 < 12 ? 'am' : 'pm';
    await page.locator('#SELECTOR_6').selectOption(ampm);
  }

  // ── Confirm the scheduled time ────────────────────────────
  await page.locator('[data-testid="scheduledConfirmationPrimaryAction"]').click();

  // Wait for the dialog to close and the compose view to update
  await page.waitForTimeout(600);

  // ── Optionally press the final Schedule button ────────────
  if (autoSchedule) {
    await page.locator('[data-testid="tweetButton"]').click();
    await page.waitForTimeout(500);
  }
  // Tab stays open — user can review (or see the confirmation)
}

const PORT = 3001;
app.listen(PORT, () => {
  const hasSession = fs.existsSync(SESSION_FILE);
  console.log(`\n🚀 PostSchedule API   http://localhost:${PORT}`);
  console.log(`   Session: ${hasSession ? '✅ found' : '❌ missing — run: node auth.js'}\n`);
});
