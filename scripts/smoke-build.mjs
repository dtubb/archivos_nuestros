#!/usr/bin/env node

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const repoRoot = process.cwd();
const siteRoot = join(repoRoot, '_site');
const workerReport = join(repoRoot, 'WORKER-REPORT.md');
const photoDataPath = join(repoRoot, '_data/la_vuelta_photos.json');
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

function runMainJsSmoke() {
  const source = readFileSync(join(repoRoot, 'assets/js/main.js'), 'utf8');
  const fired = [];

  const documentStub = {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(eventName, callback) {
      if (['DOMContentLoaded', 'load', 'scroll'].includes(eventName)) {
        fired.push(`document:${eventName}`);
        callback();
      }
    },
  };

  const windowStub = {
    document: documentStub,
    scrollY: 0,
    pageYOffset: 0,
    addEventListener(eventName, callback) {
      if (['DOMContentLoaded', 'load', 'scroll'].includes(eventName)) {
        fired.push(`window:${eventName}`);
        callback();
      }
    },
    scrollTo() {},
  };

  const context = {
    window: windowStub,
    document: documentStub,
    console,
    JSON,
    Math,
    Date,
    Error,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(source, context, { filename: 'assets/js/main.js' });
  assert.ok(fired.includes('window:load'), 'main.js smoke: window load listeners should run');
  assert.ok(fired.includes('document:scroll') || fired.includes('window:scroll'), 'main.js smoke: scroll listeners should run');
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
    search: readFileSync(join(siteRoot, 'buscar', 'index.html'), 'utf8'),
    enSearch: readFileSync(join(siteRoot, 'en', 'search', 'index.html'), 'utf8'),
  };
}

function assertCommon(html, label) {
  assert.ok(!html.includes('id="preloader"'), `${label}: preloader should not be present`);
  assert.ok(html.includes('vault-zone'), `${label}: vault-zone should still be present`);
  assert.ok(html.includes('assets/css/archivos.css'), `${label}: archivos stylesheet should be linked`);
  assert.ok(!html.includes('Secciones públicas actuales'), `${label}: old marker should not be present`);
  assert.ok(!html.includes('1 colección publicada'), `${label}: hero stat text should not be present`);
  assert.ok(!html.includes('1 collection published'), `${label}: hero stat text should not be present`);
  assert.ok(!html.includes('coming soon'), `${label}: inactive coming-soon copy should not be present`);
  assert.ok(!html.includes('próximamente'), `${label}: inactive coming-soon copy should not be present`);
  assert.ok(!html.includes('theme-ribbon'), `${label}: inactive thematic ribbon should not be present`);
  assert.ok(!html.includes('Primer prototipo'), `${label}: prototype scaffold copy should not be present`);
  assert.ok(!html.includes('First prototype'), `${label}: prototype scaffold copy should not be present`);
  assert.ok(!html.includes('This is the first working collection'), `${label}: workflow scaffold copy should not be present`);
  assert.ok(!html.includes('source review'), `${label}: workflow scaffold copy should not be present`);
  assert.ok(!html.includes('145 image files'), `${label}: inventory workflow copy should not be present`);
  assert.ok(!html.includes('Los originales en alta resolución'), `${label}: storage workflow note should not be present`);
  assert.ok(!html.includes('Full-resolution originals'), `${label}: storage workflow note should not be present`);
  assert.ok(!html.includes('Muntú Bantú'), `${label}: old project framing should not be present`);
  assert.ok(!html.includes('Acknowledgements'), `${label}: credits block should not be on the material-first homepage`);
  assert.ok(!html.includes('Agradecimientos'), `${label}: credits block should not be on the material-first homepage`);
  assert.ok(!html.includes('id="footer"'), `${label}: footer should not be on the material-first homepage`);
  assert.ok(!html.includes('doc-frame__meta'), `${label}: homepage cards should not render metadata pills`);
  assert.ok(!html.includes('doc-frame__date'), `${label}: homepage cards should not foreground record dates`);
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
  assert.ok(indexHtml.includes('href="/buscar/'), 'local / index: expected Spanish search link');
  assert.ok(enIndexHtml.includes('href="/en/personas/'), 'local / en/index: expected English people link');
  assert.ok(enIndexHtml.includes('href="/en/search/'), 'local / en/index: expected English search link');
  assert.ok(indexHtml.includes('href="/archives/tubb-hidroelectrica-la-vuelta-actualidad/'), 'local / index: expected local archive link');
  assert.ok(enIndexHtml.includes('href="/archives/tubb-hidroelectrica-la-vuelta-actualidad/'), 'local / en/index: expected local archive link');
  assert.ok(!indexHtml.includes('https://upenn.box.com/v/AndaguedaPresente'), 'local / index: source link belongs on record page');
  assert.ok(!enIndexHtml.includes('https://upenn.box.com/v/AndaguedaPresente'), 'local / en/index: source link belongs on record page');
}

function assertArchivePage(archiveHtml, label) {
  assert.ok(!archiveHtml.includes('id="preloader"'), `${label}: preloader should not be present`);
  assert.ok(archiveHtml.includes('record-layout'), `${label}: record layout should be present`);
  assert.ok(archiveHtml.includes('record-rail--right'), `${label}: right metadata rail should be present`);
  assert.ok(
    archiveHtml.indexOf('record-main') < archiveHtml.indexOf('record-rail--right'),
    `${label}: media should appear before metadata in the archive page source`
  );
  assert.ok(!archiveHtml.includes('id="footer"'), `${label}: archive page should not include the footer block`);
  assert.ok(!archiveHtml.includes('hosted externally in Box'), `${label}: Box-hosting wording should not be present`);
  assert.ok(!archiveHtml.includes('alojados externamente en Box'), `${label}: Box-hosting wording should not be present`);
  assert.ok(!archiveHtml.includes('Primer prototipo'), `${label}: prototype scaffold copy should not be present`);
  assert.ok(!archiveHtml.includes('First prototype'), `${label}: prototype scaffold copy should not be present`);
  assert.ok(!archiveHtml.includes('This is the first working collection'), `${label}: workflow scaffold copy should not be present`);
  assert.ok(!archiveHtml.includes('source review'), `${label}: workflow scaffold copy should not be present`);
  assert.ok(!archiveHtml.includes('pendientes de revisión'), `${label}: workflow note should not be present`);
  assert.ok(!archiveHtml.includes('pending review'), `${label}: workflow note should not be present`);
  assert.ok(archiveHtml.includes('photo-grid'), `${label}: photo grid should be present`);
  assert.ok(archiveHtml.includes('data-photo-viewer'), `${label}: in-page photo viewer should be present`);
  assert.ok(archiveHtml.includes('data-photo-open'), `${label}: large photograph should open the lightbox`);
  assert.ok(archiveHtml.includes('data-photo-thumb'), `${label}: thumbnails should update the large photograph`);
  assert.ok(archiveHtml.includes('data-photo-lightbox-link'), `${label}: lightbox links should be available for full-screen viewing`);
  assert.ok(archiveHtml.includes('data-photo-prev'), `${label}: previous control should be present`);
  assert.ok(archiveHtml.includes('data-photo-next'), `${label}: next control should be present`);
  assert.ok(archiveHtml.includes('data-photo-jump'), `${label}: jump control should be present`);
  assert.ok(archiveHtml.includes('data-photo-status'), `${label}: active position status should be present`);
  assert.ok(archiveHtml.includes('data-photo-active-sequence="1"'), `${label}: active image should expose the current sequence`);
  assert.ok(archiveHtml.includes('data-photo-active-position="1"'), `${label}: active image should expose the current position`);
  assert.ok(archiveHtml.includes('data-photo-active-total="'), `${label}: active image should expose the gallery size`);
  assert.ok(archiveHtml.includes('photo-viewer__controls'), `${label}: viewer controls wrapper should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__nav'), `${label}: compact nav buttons should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__select'), `${label}: sequence jump select should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__caption visually-hidden'), `${label}: active sequence caption should stay visually hidden`);
  assert.ok(archiveHtml.includes('data-gallery="la-vuelta-photos"'), `${label}: photo grid should be one navigable gallery`);
  assert.ok(archiveHtml.includes('data-description="Daniel Tubb, con apoyo de la SSHRC'), `${label}: lightbox should include compact citation metadata`);
  assert.ok(archiveHtml.includes("const page = viewer.closest('article.record-layout');"), `${label}: script should scope lookups to the archive page`);
  assert.ok(archiveHtml.includes("Array.from(page.querySelectorAll('[data-photo-thumb]'))"), `${label}: script should reach thumbnails outside the viewer section`);
  assert.ok(archiveHtml.includes("Array.from(page.querySelectorAll('[data-photo-lightbox-link]'))"), `${label}: script should reach lightbox links outside the viewer section`);
  assert.ok(!archiveHtml.includes("viewer.querySelectorAll('[data-photo-thumb]')"), `${label}: script should not scope thumbnails to the viewer section`);
  assert.ok(!archiveHtml.includes("viewer.querySelectorAll('[data-photo-lightbox-link]')"), `${label}: script should not scope lightbox links to the viewer section`);
  assert.ok(archiveHtml.includes('lightboxLinks[activeIndex]?.click();'), `${label}: main image should open the active lightbox item`);
  assert.ok(archiveHtml.includes('prevButton.addEventListener(\'click\''), `${label}: previous control should be wired`);
  assert.ok(archiveHtml.includes('nextButton.addEventListener(\'click\''), `${label}: next control should be wired`);
  assert.ok(archiveHtml.includes('jumpSelect.addEventListener(\'change\''), `${label}: jump control should be wired`);
  assert.ok(archiveHtml.includes('/assets/media/la-vuelta-current/'), `${label}: photo grid thumbnails should be present`);
  assert.ok(
    archiveHtml.includes('https://upenn.box.com/v/AndaguedaPresente'),
    `${label}: source link should be rendered when metadata provides it`
  );
  assert.ok(!archiveHtml.includes('previous photo viewer'), `${label}: scaffold viewer copy should not be present`);
  assert.ok(!archiveHtml.includes('jump to image sequence'), `${label}: scaffold jump copy should not be present`);
}

function assertPhotoData() {
  const rows = JSON.parse(readFileSync(photoDataPath, 'utf8'));
  assert.equal(rows.length, 145, 'photo data: expected one row per manifest item');
  assert.ok(rows.some((row) => row.thumbnail), 'photo data: expected at least one generated thumbnail');
  for (const row of rows) {
    assert.ok(row.key?.startsWith('tubb2026lavuelta-current-'), 'photo data: expected cite-key-style object key');
    assert.ok(!JSON.stringify(row).includes('/Users/'), 'photo data: should not expose local source paths');
    assert.ok(!JSON.stringify(row).includes('Box-Box'), 'photo data: should not expose Box paths');
  }
}

function findHtmlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...findHtmlFiles(fullPath));
    } else if (entry.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveSitePath(rawUrl, siteBasePath) {
  let url = rawUrl.replace(/#.*/, '');
  if (!url || /^(https?:)?\/\//.test(url) || url.startsWith('mailto:')) return null;

  if (siteBasePath && url.startsWith(`${siteBasePath}/`)) {
    url = url.slice(siteBasePath.length);
  }

  if (!url.startsWith('/')) return null;
  return url;
}

function assertBuiltLinks(siteBasePath) {
  const missing = [];
  const localPathPattern = /\/Users\/|Box-Box/;

  for (const htmlFile of findHtmlFiles(siteRoot)) {
    const html = readFileSync(htmlFile, 'utf8');
    assert.ok(!localPathPattern.test(html), `${htmlFile}: should not expose local filesystem paths`);

    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const resolved = resolveSitePath(match[1], siteBasePath);
      if (!resolved) continue;

      const target = join(siteRoot, resolved);
      if (existsSync(target)) continue;
      if (existsSync(join(siteRoot, resolved, 'index.html'))) continue;
      missing.push(`${htmlFile}: ${match[1]}`);
    }
  }

  assert.deepEqual(missing, [], `broken internal links for SITE_BASE_PATH=${siteBasePath || '(empty)'}`);
}

function assertPrefixedBuild(indexHtml, enIndexHtml) {
  assertCommon(indexHtml, 'prefixed / index');
  assertCommon(enIndexHtml, 'prefixed / en/index');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/assets'), 'prefixed / index: expected prefixed assets links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/personas'), 'prefixed / index: expected prefixed personas links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/buscar'), 'prefixed / index: expected prefixed search link');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/en'), 'prefixed / index: expected prefixed en links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/archives/tubb-hidroelectrica-la-vuelta-actualidad/'), 'prefixed / index: expected prefixed archive link');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/assets'), 'prefixed / en/index: expected prefixed assets links');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en/personas/'), 'prefixed / en/index: expected prefixed English people link');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en/search/'), 'prefixed / en/index: expected prefixed English search link');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en'), 'prefixed / en/index: expected prefixed en links');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/archives/tubb-hidroelectrica-la-vuelta-actualidad/'), 'prefixed / en/index: expected prefixed archive link');
  assert.ok(!/href="\/(assets|personas|buscar|en|archives|search)/.test(indexHtml), 'prefixed / index: no bare internal hrefs');
  assert.ok(!/src="\/(assets|personas|buscar|en|archives|search)/.test(indexHtml), 'prefixed / index: no bare internal srcs');
  assert.ok(!/href="\/(assets|personas|buscar|en|archives|search)/.test(enIndexHtml), 'prefixed / en/index: no bare internal hrefs');
  assert.ok(!/src="\/(assets|personas|buscar|en|archives|search)/.test(enIndexHtml), 'prefixed / en/index: no bare internal srcs');
  assert.ok(indexHtml.includes('Fuentes primarias'), 'prefixed / index: Spanish homepage heading should be present');
  assert.ok(enIndexHtml.includes('Primary Sources'), 'prefixed / en/index: English homepage heading should be present');
  assert.ok(!indexHtml.includes('https://upenn.box.com/v/AndaguedaPresente'), 'prefixed / index: source link belongs on record page');
  assert.ok(!enIndexHtml.includes('https://upenn.box.com/v/AndaguedaPresente'), 'prefixed / en/index: source link belongs on record page');
}

function assertSearchPage(html, label, expectedHeading) {
  assertCommon(html, label);
  assert.ok(html.includes('id="search"'), `${label}: search mount point should be present`);
  assert.ok(html.includes(expectedHeading), `${label}: heading should be present`);
}

function assertPagefindOutput() {
  const pagefindDir = join(siteRoot, 'pagefind');
  assert.ok(existsSync(join(pagefindDir, 'pagefind-entry.json')), 'pagefind: entry manifest should exist');

  const pagefindFiles = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        pagefindFiles.push(relative(pagefindDir, fullPath));
      }
    }
  }

  walk(pagefindDir);

  assert.ok(
    pagefindFiles.some((file) => /(^|\/)index\/[^/]+\.pf_index$/.test(file) || /(^|\/)fragment\/[^/]+\.pf_fragment$/.test(file)),
    'pagefind: expected at least one index or fragment file'
  );
}

try {
  runMainJsSmoke();
  assertPhotoData();

  const localBuild = runEleventy('');
  assertLocalBuild(localBuild.index, localBuild.enIndex);
  assertArchivePage(localBuild.archive, 'local / archive');
  assertSearchPage(localBuild.search, 'local / buscar', 'Buscar');
  assertSearchPage(localBuild.enSearch, 'local / en/search', 'Search');
  assertBuiltLinks('');
  assertPagefindOutput();

  const prefixedBuild = runEleventy('/archivos_nuestros');
  assertPrefixedBuild(prefixedBuild.index, prefixedBuild.enIndex);
  assertArchivePage(prefixedBuild.archive, 'prefixed / archive');
  assertSearchPage(prefixedBuild.search, 'prefixed / buscar', 'Buscar');
  assertSearchPage(prefixedBuild.enSearch, 'prefixed / en/search', 'Search');
  assertBuiltLinks('/archivos_nuestros');
  assertPagefindOutput();

  console.log('Smoke tests passed.');
} finally {
  restoreWorkerReport();
}
