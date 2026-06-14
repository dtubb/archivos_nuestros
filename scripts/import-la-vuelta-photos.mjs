#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const { manifestPath, onlyMissing, limit, timeoutMs } = parseArgs(process.argv.slice(2));
const outputDir = join(repoRoot, 'assets/media/la-vuelta-current');
const dataPath = join(repoRoot, '_data/la_vuelta_photos.json');
const thumbnailTimeoutMs = timeoutMs ?? Number.parseInt(process.env.THUMBNAIL_TIMEOUT_MS || '8000', 10);

if (!manifestPath) {
  throw new Error('Pass a manifest path: npm run import:la-vuelta -- /path/to/manifest.jsonl');
}

if (!existsSync(manifestPath)) {
  throw new Error(`Manifest not found: ${manifestPath}`);
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(join(repoRoot, '_data'), { recursive: true });

const rows = readFileSync(manifestPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const existingRecords = existsSync(dataPath)
  ? JSON.parse(readFileSync(dataPath, 'utf8'))
  : [];
const existingByKey = new Map(existingRecords.map((record) => [record.key, record]));
const records = [];

const candidateRows = rows.filter((row) => {
  const outputPath = join(outputDir, `${row.proposed_object_key}.jpg`);
  return !onlyMissing || !existsSync(outputPath);
});
const cappedCandidateRows = typeof limit === 'number'
  ? candidateRows.slice(0, Math.max(limit, 0))
  : candidateRows;
const candidateKeys = new Set(cappedCandidateRows.map((row) => row.proposed_object_key));

console.log(
  `Importing ${rows.length} manifest rows from ${basename(manifestPath)} ` +
  `(attempting ${cappedCandidateRows.length}${onlyMissing ? ' missing' : ''} thumbnails ` +
  `with ${thumbnailTimeoutMs}ms timeout)`,
);

let attempted = 0;
let generated = 0;
let pending = 0;
let failed = 0;
let missing = 0;
let skipped = 0;

for (const row of rows) {
  const key = row.proposed_object_key;
  const sourcePath = row.source_path;
  const thumbnailPath = `/assets/media/la-vuelta-current/${key}.jpg`;
  const outputPath = join(outputDir, `${key}.jpg`);
  const isCandidate = candidateKeys.has(key);
  const existingRecord = existingByKey.get(key);

  if (!isCandidate) {
    skipped += 1;
    records.push(
      existingRecord || buildExistingRecord({
        key,
        sequence: row.sequence,
        sourcePath,
        outputPath,
        thumbnailPath,
      }),
    );
    continue;
  }

  attempted += 1;
  console.log(`[${attempted}/${cappedCandidateRows.length}] ${key}`);

  if (existsSync(outputPath)) {
    generated += 1;
    records.push({
      key,
      sequence: row.sequence,
      thumbnail: thumbnailPath,
      source_status: 'thumbnail_generated',
    });
    continue;
  }

  if (!existsSync(sourcePath)) {
    missing += 1;
    records.push({
      key,
      sequence: row.sequence,
      thumbnail: '',
      source_status: 'missing',
    });
    continue;
  }

  const result = spawnSync('sips', ['-Z', '900', sourcePath, '--out', outputPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: thumbnailTimeoutMs,
  });

  if (result.status !== 0) {
    const status = existsSync(outputPath)
      ? 'thumbnail_generated'
      : result.error?.code === 'ETIMEDOUT' ? 'thumbnail_pending_cloud_download' : 'thumbnail_failed';
    if (status === 'thumbnail_generated') {
      generated += 1;
    } else if (status === 'thumbnail_pending_cloud_download') {
      pending += 1;
    } else {
      failed += 1;
    }
    records.push({
      key,
      sequence: row.sequence,
      thumbnail: existsSync(outputPath) ? thumbnailPath : '',
      source_status: status,
    });
    continue;
  }

  generated += 1;
  records.push({
    key,
    sequence: row.sequence,
    thumbnail: thumbnailPath,
    source_status: 'thumbnail_generated',
  });
}

const recordsByKey = new Map(records.map((record) => [record.key, record]));
const orderedRecords = rows.map((row) => recordsByKey.get(row.proposed_object_key));
writeFileSync(dataPath, `${JSON.stringify(orderedRecords, null, 2)}\n`);
const summary = orderedRecords.reduce((counts, record) => {
  const status = record?.source_status || 'unknown';
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});
console.log(`Wrote ${orderedRecords.length} records to ${dataPath}`);
console.log(`Thumbnails in ${outputDir}`);
console.log(
  `Summary: attempted=${attempted}, skipped=${skipped}, generated=${generated}, ` +
  `pending=${pending}, failed=${failed}, missing=${missing}`,
);
console.log(`Status counts: ${Object.entries(summary).map(([status, count]) => `${status}=${count}`).join(', ')}`);

function parseArgs(argv) {
  let manifestPath = process.env.LA_VUELTA_MANIFEST || null;
  let onlyMissing = false;
  let limit = null;
  let timeoutMs = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--only-missing') {
      onlyMissing = true;
      continue;
    }
    if (arg === '--limit') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error('--limit requires a number');
      }
      limit = Number.parseInt(value, 10);
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error('--timeout-ms requires a number');
      }
      timeoutMs = Number.parseInt(value, 10);
      index += 1;
      continue;
    }
    if (arg === '--manifest') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error('--manifest requires a path');
      }
      manifestPath = value;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (!arg.startsWith('--') && !manifestPath) {
      manifestPath = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (Number.isNaN(limit)) {
    throw new Error('--limit must be a number');
  }
  if (Number.isNaN(timeoutMs)) {
    throw new Error('--timeout-ms must be a number');
  }

  return { manifestPath, onlyMissing, limit, timeoutMs };
}

function buildExistingRecord({ key, sequence, sourcePath, outputPath, thumbnailPath }) {
  if (existsSync(outputPath)) {
    return {
      key,
      sequence,
      thumbnail: thumbnailPath,
      source_status: 'thumbnail_generated',
    };
  }

  if (!existsSync(sourcePath)) {
    return {
      key,
      sequence,
      thumbnail: '',
      source_status: 'missing',
    };
  }

  return {
    key,
    sequence,
    thumbnail: '',
    source_status: 'thumbnail_pending_cloud_download',
  };
}

function printHelp() {
  console.log([
    'Usage: node scripts/import-la-vuelta-photos.mjs [manifest] [options]',
    '',
    'Options:',
    '  --manifest PATH     Manifest path (alternative to positional arg or LA_VUELTA_MANIFEST)',
    '  --only-missing      Only attempt rows whose thumbnails are not already present',
    '  --limit N           Limit the number of rows attempted in this run',
    '  --timeout-ms N      Per-thumbnail sips timeout in milliseconds',
  ].join('\n'));
}
