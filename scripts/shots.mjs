// Take the three entry screenshots from the built dashboard in out/.
//
// Uses Playwright (playwright-core, installed as a dev dependency) driving
// the Chromium binary from the Playwright browser cache, so the shots wait
// for the page to render instead of guessing a time budget:
//
//   npm install --no-save playwright-core
//   CHROME_PATH=/path/to/chrome node scripts/shots.mjs [out-dir]
//
// The shots are viewport-only, 1440x900:
//   1-board.png     the board
//   2-detail.png    the detail view of the rank-1 protocol
//   3-filtered.png  the watchlist-only filtered view

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ??
  '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const OUT_DIR = resolve(process.argv[2] ?? 'out');
const WORK_DIR = resolve(process.argv[3] ?? process.cwd());
const SHOTS_DIR = join(WORK_DIR, 'screenshots');

function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${path}: not a PNG`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const board = JSON.parse(readFileSync(join(OUT_DIR, 'board.json'), 'utf-8'));
const top = board.rows[0];
if (!top) throw new Error('board.json holds no rows');

mkdirSync(SHOTS_DIR, { recursive: true });
const pageUrl = `file://${join(OUT_DIR, 'dashboard', 'index.html')}`;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
});
try {
  // A fresh page per shot: navigating to a URL that differs only in its
  // hash does not reload, and the app reads the hash only at load.
  async function shoot(name, url, settle) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector('#boardBody tr');
      if (settle) await settle(page);
      await page.screenshot({ path: join(SHOTS_DIR, name) });
    } finally {
      await page.close();
    }
  }

  await shoot('1-board.png', pageUrl);
  await shoot(`2-detail.png`, `${pageUrl}#detail=${top.slug}`, async (page) => {
    await page.waitForSelector('#detail h2');
    await page.evaluate(() => {
      document.getElementById('detail').scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(400);
  });
  await shoot('3-filtered.png', `${pageUrl}#watchlist`, async (page) => {
    await page.waitForTimeout(200);
  });
} finally {
  await browser.close();
}

for (const name of ['1-board.png', '2-detail.png', '3-filtered.png']) {
  const target = join(SHOTS_DIR, name);
  const { width, height } = pngSize(target);
  const bytes = statSync(target).size;
  console.log(`${name}: ${width}x${height}, ${bytes} bytes`);
  if (width !== 1440 || height !== 900) {
    throw new Error(`${name}: expected 1440x900, got ${width}x${height}`);
  }
  if (bytes > 512 * 1024) {
    throw new Error(`${name}: ${bytes} bytes, over the 512 KiB cap`);
  }
}
console.log(`shots: rank-1 detail is ${top.slug} (${top.name})`);
