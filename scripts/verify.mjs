// Self-check the built output in out/ against the gate's shape.
//
//   node scripts/verify.mjs [out-dir] [snapshot-path]
//
// Exits 1 on the first failed check, printing what failed and why.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT_DIR = resolve(process.argv[2] ?? 'out');
const SNAPSHOT_PATH =
  process.argv[3] ??
  '/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json';

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8'));
const snapshotSlugs = new Set(snapshot.protocols.map((p) => p.slug));
const watchlist = snapshot.watchlist;

// --- board.json ---
const board = JSON.parse(readFileSync(join(OUT_DIR, 'board.json'), 'utf-8'));
const rows = board.rows;
check(Array.isArray(rows), 'board.json has a rows array');
check(rows.length >= 100 && rows.length <= 4000, 'board row count in range', `${rows.length} rows`);
const slugs = rows.map((r) => r.slug);
check(new Set(slugs).size === slugs.length, 'board slugs unique');
check(slugs.every((s) => snapshotSlugs.has(s)), 'every board slug is a snapshot protocol');
check(watchlist.every((s) => slugs.includes(s)), 'board covers the whole watchlist', `${watchlist.length} watchlist slugs`);
const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
check(ranks.every((r, i) => r === i + 1), 'ranks are exactly 1..N');
const byRank = [...rows].sort((a, b) => a.rank - b.rank);
check(
  byRank.every((r, i) => i === 0 || r.implied_value_usd <= byRank[i - 1].implied_value_usd),
  'implied values do not rise with rank',
);
check(
  byRank.some((r) => r.implied_value_usd !== byRank[0].implied_value_usd),
  'implied values are not all equal',
);
check(
  rows.every((r) => Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0),
  'implied values are positive whole dollars',
);
let stepsOk = true;
let stepsDetail = '';
for (const r of rows) {
  if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
    stepsOk = false;
    stepsDetail = `${r.slug}: ${r.farm_steps?.length} steps`;
    break;
  }
  for (const s of r.farm_steps) {
    const t = s.trim();
    if (t.length < 20 || t.length > 600) {
      stepsOk = false;
      stepsDetail = `${r.slug}: step of ${t.length} chars`;
      break;
    }
  }
  if (!stepsOk) break;
}
check(stepsOk, 'farm steps: 3-12 per row, 20-600 chars each', stepsDetail);
check(
  rows.every((r) => r.token_status === 'pre-token'),
  'every ranked row is pre-token',
);
check(
  statSync(join(OUT_DIR, 'board.json')).size <= 8 * 1024 * 1024,
  'board.json under 8 MiB',
);

// --- dashboard/ ---
const dashDir = join(OUT_DIR, 'dashboard');
const dashFiles = readdirSync(dashDir);
check(dashFiles.includes('index.html'), 'dashboard has index.html');
check(dashFiles.some((f) => f.endsWith('.css')), 'dashboard has a .css file');
check(dashFiles.some((f) => f.endsWith('.js')), 'dashboard has a .js file');
let dashBytes = 0;
let networkOk = true;
for (const f of dashFiles) {
  const p = join(dashDir, f);
  if (!statSync(p).isFile()) continue;
  const buf = readFileSync(p);
  dashBytes += buf.length;
  const text = buf.toString('utf-8');
  if (text.includes('http://') || text.includes('https://')) {
    networkOk = false;
    console.log(`FAIL  network address in dashboard/${f}`);
  }
}
check(networkOk, 'dashboard files name no network address');
check(dashBytes < 65536, 'dashboard source under 64 KB', `${dashBytes} bytes`);
check(existsSync(join(OUT_DIR, 'data.js')), 'output has data.js');

// --- screenshots/ ---
const shotsDir = join(OUT_DIR, 'screenshots');
const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort()
  : [];
check(shots.length >= 3 && shots.length <= 4, 'screenshots: 3-4 images', `${shots.length} found`);
for (const name of shots) {
  const p = join(shotsDir, name);
  const buf = readFileSync(p);
  const isPng = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  let dims = '';
  let dimsOk = false;
  if (isPng) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    dims = `${w}x${h}`;
    dimsOk = Math.max(w, h) <= 1440 && Math.min(w, h) >= 800;
  }
  check(isPng || isJpeg, `screenshot ${name} is a whole PNG or JPEG`, dims);
  check(dimsOk, `screenshot ${name} dimensions in range`, dims);
  check(buf.length <= 512 * 1024, `screenshot ${name} under 512 KiB`, `${buf.length} bytes`);
}

// --- dossier.json ---
const dossierPath = join(OUT_DIR, 'dossier.json');
check(existsSync(dossierPath), 'output has dossier.json');
if (existsSync(dossierPath)) {
  const dossier = JSON.parse(readFileSync(dossierPath, 'utf-8'));
  check(dossier.schema === 'makefun/dossier/v1', 'dossier schema is makefun/dossier/v1');
  check(
    typeof dossier.text === 'string' && Buffer.byteLength(dossier.text, 'utf-8') <= 65536,
    'dossier text within 65,536 bytes',
    `${Buffer.byteLength(dossier.text ?? '', 'utf-8')} bytes`,
  );
  check(
    statSync(dossierPath).size <= 1.5 * 1024 * 1024,
    'dossier.json under 1.5 MiB',
    `${statSync(dossierPath).size} bytes`,
  );
  check(
    Array.isArray(dossier.images) && dossier.images.length === shots.length,
    'dossier carries the screenshots',
    `${dossier.images?.length} images`,
  );
}

console.log(failures === 0 ? 'VERIFY: all checks passed' : `VERIFY: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
