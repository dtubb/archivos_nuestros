#!/usr/bin/env node

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const siteRoot = join(repoRoot, '_site');
const workerReport = join(repoRoot, 'WORKER-REPORT.md');
const workerReportTmpDir = mkdtempSync(join(tmpdir(), 'site-shell-worker-report-'));
const workerReportTmp = join(workerReportTmpDir, 'WORKER-REPORT.md');

let movedWorkerReport = false;

function restoreWorkerReport() {
  if (movedWorkerReport && existsSync(workerReportTmp)) {
    try {
      renameSync(workerReportTmp, workerReport);
    } catch {
      copyFileSync(workerReportTmp, workerReport);
      unlinkSync(workerReportTmp);
    }
  }
  try {
    rmSync(workerReportTmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures; the report has already been restored if present.
  }
}

process.on('exit', restoreWorkerReport);
process.on('SIGINT', () => {
  restoreWorkerReport();
  process.exit(130);
});
process.on('SIGTERM', () => {
  restoreWorkerReport();
  process.exit(143);
});

if (existsSync(workerReport)) {
  try {
    renameSync(workerReport, workerReportTmp);
  } catch {
    copyFileSync(workerReport, workerReportTmp);
    unlinkSync(workerReport);
  }
  movedWorkerReport = true;
}

function runEleventy(siteBasePath) {
  rmSync(siteRoot, { recursive: true, force: true });

  const env = {
    ...process.env,
    SITE_BASE_PATH: siteBasePath,
  };

  const result = spawnSync('npx', ['eleventy'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Eleventy build failed for SITE_BASE_PATH=${siteBasePath || '(empty)'}`);
  }

  return {
    index: readFileSync(join(siteRoot, 'index.html'), 'utf8'),
    enIndex: readFileSync(join(siteRoot, 'en', 'index.html'), 'utf8'),
    archive: readFileSync(join(siteRoot, 'archives', 'tubb-hidroelectrica-la-vuelta-actualidad', 'index.html'), 'utf8'),
  };
}

function assertCommon(html, label) {
  assert.ok(!html.includes('id="preloader"'), `${label}: preloader should not be present`);
  assert.ok(html.includes('vault-zone'), `${label}: vault-zone should still be present`);
  assert.ok(html.includes('assets/css/archivos.css'), `${label}: archivos stylesheet should be linked`);
  assert.ok(!html.includes('Secciones públicas actuales'), `${label}: old marker should not be present`);
  assert.ok(!html.includes('1 colección publicada'), `${label}: hero stat text should not be present`);
  assert.ok(!html.includes('1 collection published'), `${label}: hero stat text should not be present`);
}

function assertLocalBuild(indexHtml, enIndexHtml) {
  assertCommon(indexHtml, 'local / index');
  assertCommon(enIndexHtml, 'local / en/index');
  assert.ok(indexHtml.includes('href="/assets'), 'local / index: expected bare /assets links');
  assert.ok(enIndexHtml.includes('href="/assets'), 'local / en/index: expected bare /assets links');
  assert.ok(!indexHtml.includes('/archivos_nuestros/'), 'local / index: should not include /archivos_nuestros prefix');
  assert.ok(!enIndexHtml.includes('/archivos_nuestros/'), 'local / en/index: should not include /archivos_nuestros prefix');
  assert.ok(indexHtml.includes('Fuentes primarias'), 'local / index: Spanish homepage heading should be present');
  assert.ok(enIndexHtml.includes('Primary Sources'), 'local / en/index: English homepage heading should be present');
  assert.ok(indexHtml.includes('href="/personas/'), 'local / index: expected Spanish people link');
  assert.ok(enIndexHtml.includes('href="/en/personas/'), 'local / en/index: expected English people link');
}

function assertArchivePage(archiveHtml, label) {
  assert.ok(!archiveHtml.includes('id="preloader"'), `${label}: preloader should not be present`);
  assert.ok(archiveHtml.includes('record-layout'), `${label}: record layout should be present`);
  assert.ok(archiveHtml.includes('record-rail'), `${label}: left rail should be present`);
  assert.ok(!archiveHtml.includes('id="footer"'), `${label}: archive page should not include the footer block`);
  assert.ok(!archiveHtml.includes('hosted externally in Box'), `${label}: Box-hosting wording should not be present`);
  assert.ok(!archiveHtml.includes('alojados externamente en Box'), `${label}: Box-hosting wording should not be present`);
}

function assertPrefixedBuild(indexHtml, enIndexHtml) {
  assertCommon(indexHtml, 'prefixed / index');
  assertCommon(enIndexHtml, 'prefixed / en/index');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/assets'), 'prefixed / index: expected prefixed assets links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/personas'), 'prefixed / index: expected prefixed personas links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/en'), 'prefixed / index: expected prefixed en links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/archives'), 'prefixed / index: expected prefixed archives links');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/assets'), 'prefixed / en/index: expected prefixed assets links');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en/personas/'), 'prefixed / en/index: expected prefixed English people link');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en'), 'prefixed / en/index: expected prefixed en links');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/archives'), 'prefixed / en/index: expected prefixed archives links');
  assert.ok(!/href="\/(assets|personas|en|archives)/.test(indexHtml), 'prefixed / index: no bare internal hrefs');
  assert.ok(!/src="\/(assets|personas|en|archives)/.test(indexHtml), 'prefixed / index: no bare internal srcs');
  assert.ok(!/href="\/(assets|personas|en|archives)/.test(enIndexHtml), 'prefixed / en/index: no bare internal hrefs');
  assert.ok(!/src="\/(assets|personas|en|archives)/.test(enIndexHtml), 'prefixed / en/index: no bare internal srcs');
  assert.ok(indexHtml.includes('Fuentes primarias'), 'prefixed / index: Spanish homepage heading should be present');
  assert.ok(enIndexHtml.includes('Primary Sources'), 'prefixed / en/index: English homepage heading should be present');
}

try {
  const localBuild = runEleventy('');
  assertLocalBuild(localBuild.index, localBuild.enIndex);
  assertArchivePage(localBuild.archive, 'local / archive');

  const prefixedBuild = runEleventy('/archivos_nuestros');
  assertPrefixedBuild(prefixedBuild.index, prefixedBuild.enIndex);
  assertArchivePage(prefixedBuild.archive, 'prefixed / archive');

  console.log('Smoke tests passed.');
} finally {
  restoreWorkerReport();
}
