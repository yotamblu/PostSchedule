/**
 * Run once: node auth.js
 * Opens X in a real browser so you can log in,
 * then saves your session to x-session.json for future automation.
 */
const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

const SESSION_FILE = path.join(__dirname, 'x-session.json');

(async () => {
  console.log('\n🔐 PostSchedule — X Authentication\n');

  const browser = await chromium.launch({ headless: false });
  const ctx     = await browser.newContext();
  const page    = await ctx.newPage();

  await page.goto('https://x.com/login');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('A browser window just opened to x.com/login.');
  console.log('Log in normally, then come back here and press ENTER.\n');

  await new Promise(resolve => rl.question('Press ENTER when logged in > ', resolve));
  rl.close();

  await ctx.storageState({ path: SESSION_FILE });
  console.log(`\n✅ Session saved to x-session.json`);
  console.log('You can now run: npm run dev\n');

  await browser.close();
  process.exit(0);
})();
