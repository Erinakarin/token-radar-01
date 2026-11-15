// Token launch radar: entrypoint.
//
// Reads the sealed DefiLlama snapshot, ranks the pre-token protocols with
// the launch-value model in lib/model.ts, and writes everything the gate
// checks into the output directory:
//   board.json      the ranked board (rows)
//   data.js         the same board, plus the live-token list, for the page
//   dashboard/      the static page (index.html, app.css, app.js)
//   screenshots/    the three screenshots of the page
//   dossier.json    what buildDossier writes from dashboard/ + screenshots/
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
//
// The grader runs it with /input/snapshot.json and /output. It takes no
// network, no clock and no randomness: two runs write identical bytes.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  if (at === -1 || at + 1 >= argv.length) return null;
  return argv[at + 1];
}

function fail(message: string): never {
  console.error(`token-radar: ${message}`);
  process.exit(1);
}

function copyTree(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  const entries = readdirSync(sourceDir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const from = join(sourceDir, entry.name);
    const to = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      cpSync(from, to);
    }
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputPath = flagValue(argv, '--input') ?? '/input/snapshot.json';
  const outputDir = resolve(
    process.env.MAKEFUN_OUTPUT_DIR ?? '/output',
  );

  const snapshot = JSON.parse(
    readFileSync(inputPath, 'utf-8'),
  ) as Snapshot;
  const board = buildBoard(snapshot);

  const shotsDir = join(REPO_ROOT, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir)
        .filter((name) => !name.startsWith('.'))
        .filter((name) => /\.(png|jpe?g)$/i.test(name))
        .sort()
    : [];
  if (shots.length === 0) {
    fail('screenshots/ holds no screenshots; refusing to write an output the gate cannot grade.');
  }
  if (shots.length > 4) {
    fail(`screenshots/ holds ${shots.length} images; the gate allows at most 4.`);
  }

  mkdirSync(outputDir, { recursive: true });

  // The board: ranks 1..N, implied values non-increasing, watchlist covered.
  writeFileSync(
    join(outputDir, 'board.json'),
    JSON.stringify({ rows: board.rows }, null, 2) + '\n',
    'utf-8',
  );

  // The page's data, beside the page: board rows plus the live-token list.
  writeFileSync(
    join(outputDir, 'data.js'),
    `window.RADAR = ${JSON.stringify(board)};\n`,
    'utf-8',
  );

  copyTree(join(REPO_ROOT, 'dashboard'), join(outputDir, 'dashboard'));
  copyTree(shotsDir, join(outputDir, 'screenshots'));

  // The dossier is written last, from an output directory that does not
  // already hold one, so a rebuild matches what the scorer recomputes.
  const dossierPath = join(outputDir, 'dossier.json');
  if (existsSync(dossierPath)) rmSync(dossierPath);
  const dossier = buildDossier(outputDir, { text_max_bytes: 65536 });
  writeFileSync(dossierPath, dossier);

  const dashboardBytes = readdirSync(join(outputDir, 'dashboard')).reduce(
    (sum, name) => sum + statSync(join(outputDir, 'dashboard', name)).size,
    0,
  );
  console.log(
    `token-radar: ${board.rows.length} rows, ${board.live.length} live-token protocols, ` +
      `${shots.length} screenshots, dashboard ${dashboardBytes} bytes, ` +
      `dossier ${dossier.length} bytes -> ${outputDir}`,
  );
}

main();
