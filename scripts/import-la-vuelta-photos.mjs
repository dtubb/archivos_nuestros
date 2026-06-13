#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const manifestPath = process.argv[2] || process.env.LA_VUELTA_MANIFEST;
const outputDir = join(repoRoot, 'assets/media/la-vuelta-current');
const dataPath = join(repoRoot, '_data/la_vuelta_photos.json');
const thumbnailTimeoutMs = Number.parseInt(process.env.THUMBNAIL_TIMEOUT_MS || '8000', 10);

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

const records = [];

for (const row of rows) {
  const key = row.proposed_object_key;
  const sourcePath = row.source_path;
  const thumbnailPath = `/assets/media/la-vuelta-current/${key}.jpg`;
  const outputPath = join(outputDir, `${key}.jpg`);

  if (existsSync(outputPath)) {
    records.push({
      key,
      sequence: row.sequence,
      thumbnail: thumbnailPath,
      source_status: 'thumbnail_generated',
    });
    continue;
  }

  if (!existsSync(sourcePath)) {
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
    records.push({
      key,
      sequence: row.sequence,
      thumbnail: existsSync(outputPath) ? thumbnailPath : '',
      source_status: existsSync(outputPath)
        ? 'thumbnail_generated'
        : result.error?.code === 'ETIMEDOUT' ? 'thumbnail_pending_cloud_download' : 'thumbnail_failed',
    });
    continue;
  }

  records.push({
    key,
    sequence: row.sequence,
    thumbnail: thumbnailPath,
    source_status: 'thumbnail_generated',
  });
}

writeFileSync(dataPath, `${JSON.stringify(records, null, 2)}\n`);
console.log(`Wrote ${records.length} records to ${dataPath}`);
console.log(`Thumbnails in ${outputDir}`);
