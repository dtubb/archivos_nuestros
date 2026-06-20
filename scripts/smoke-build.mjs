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
const marshallPhotoDataPath = join(repoRoot, '_data/marshall_photos.json');
const agnPhotoDataPath = join(repoRoot, '_data/agn_photos.json');
const houghtonPhotoDataPath = join(repoRoot, '_data/houghton_photos.json');
const platinumPhotoDataPath = join(repoRoot, '_data/platinum_photos.json');
const riversGoldPhotoDataPath = join(repoRoot, '_data/rivers_gold_photos.json');
const adminConfigPath = join(repoRoot, 'admin/config.yml');
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

  assert.ok(source.includes('zoomable: true'), 'main.js smoke: GLightbox zoom should stay enabled');
  assert.ok(source.includes('draggable: true'), 'main.js smoke: GLightbox drag/pan should stay enabled');
  assert.ok(source.includes('touchNavigation: true'), 'main.js smoke: GLightbox touch navigation should stay enabled');

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

function assertAdminConfigSchema() {
  const config = readFileSync(adminConfigPath, 'utf8');
  const oldTypeValues = [
    'collections',
    'documents',
    'photographs',
    'maps',
    'field_notes',
    'finding_aids',
    'catalogues',
    'search_tools',
  ];
  const expectedTypeValues = ['fotos', 'documentos', 'mapas', 'entrevistas', 'audiovisuales', 'other'];
  const archiveCollection = config.match(/- name: "archive"[\s\S]*?(?=\n\s*- name: "exhibit"|$)/)?.[0] || '';
  const typeField = archiveCollection.match(/name: "type"[\s\S]*?\]/)?.[0] || '';

  assert.ok(archiveCollection, 'admin config: archive collection should be present');
  assert.ok(archiveCollection.includes('label: "Primary Sources"'), 'admin config: archive collection label should be Primary Sources');
  assert.ok(
    !archiveCollection.includes('Archival and Primary Materials'),
    'admin config: old archive collection label should not return'
  );

  for (const value of expectedTypeValues) {
    assert.ok(typeField.includes(`"${value}"`), `admin config: archive type option ${value} should be present`);
  }

  for (const field of ['citationKey', 'cite_type', 'photoGrid']) {
    assert.ok(archiveCollection.includes(`name: "${field}"`), `admin config: ${field} field should be present`);
  }

  for (const value of oldTypeValues) {
    assert.ok(!typeField.includes(`"${value}"`), `admin config: old archive type option ${value} should not return`);
  }
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
    archives: readFileSync(join(siteRoot, 'archives', 'index.html'), 'utf8'),
    enArchives: readFileSync(join(siteRoot, 'en', 'archives', 'index.html'), 'utf8'),
    archive: readFileSync(join(siteRoot, 'archives', 'tubb-hidroelectrica-la-vuelta-actualidad', 'index.html'), 'utf8'),
    marshallArchive: readFileSync(join(siteRoot, 'archives', 'album-de-n-c-marshall-fotografías-tomadas-en-colombia-1910s-1950s-colección-de-la-familia-marshall-sun-prairie-wisconsin', 'index.html'), 'utf8'),
    agnArchive: readFileSync(join(siteRoot, 'archives', 'fotografías-en-el-archivo-general-de-la-nación', 'index.html'), 'utf8'),
    houghtonArchive: readFileSync(join(siteRoot, 'archives', 'colección-houghton-para-el-permiso-de-acceder-al-enlace-escriba-por-favor-a-farnswor-upenn-edu', 'index.html'), 'utf8'),
    platinumArchive: readFileSync(join(siteRoot, 'archives', 'platino-folleto-1920-una-publicación-de-la-cmcp', 'index.html'), 'utf8'),
    riversGoldArchive: readFileSync(join(siteRoot, 'archives', 'ríos-del-oro-folleto-1945-publicado-por-la-cmcp-con-el-apoyo-de-la-revista-forbes', 'index.html'), 'utf8'),
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
  assert.ok(!html.includes('doc-frame__meta'), `${label}: homepage cards should not render metadata pills`);
  assert.ok(!html.includes('doc-frame__date'), `${label}: homepage cards should not foreground record dates`);
}

function assertLocalBuild(indexHtml, enIndexHtml) {
  assertCommon(indexHtml, 'local / index');
  assertCommon(enIndexHtml, 'local / en/index');
  assert.ok(indexHtml.includes('id="footer"'), 'local / index: footer should be on the homepage (#56)');
  assert.ok(enIndexHtml.includes('id="footer"'), 'local / en/index: footer should be on the homepage (#56)');
  assert.ok(indexHtml.includes('href="/assets'), 'local / index: expected bare /assets links');
  assert.ok(enIndexHtml.includes('href="/assets'), 'local / en/index: expected bare /assets links');
  assert.ok(!indexHtml.includes('/archivos_nuestros/'), 'local / index: should not include /archivos_nuestros prefix');
  assert.ok(!enIndexHtml.includes('/archivos_nuestros/'), 'local / en/index: should not include /archivos_nuestros prefix');
  assert.ok(indexHtml.includes('Colecciones'), 'local / index: Spanish homepage heading should be present');
  assert.ok(enIndexHtml.includes('Collections'), 'local / en/index: English homepage heading should be present');
  assert.ok(indexHtml.includes('href="/personas/'), 'local / index: expected Spanish people link');
  assert.ok(indexHtml.includes('href="/buscar/'), 'local / index: expected Spanish search link');
  assert.ok(indexHtml.includes('href="/archives/'), 'local / index: expected Spanish archives link');
  assert.ok(enIndexHtml.includes('href="/en/personas/'), 'local / en/index: expected English people link');
  assert.ok(enIndexHtml.includes('href="/en/archives/'), 'local / en/index: expected English archives link');
  assert.ok(enIndexHtml.includes('href="/en/search/'), 'local / en/index: expected English search link');
  assert.ok(indexHtml.includes('home-colecciones') && /href="\/colecciones\/[^"]+\//.test(indexHtml), 'local / index: expected collection link');
  assert.ok(enIndexHtml.includes('home-colecciones') && /href="\/colecciones\/[^"]+\//.test(enIndexHtml), 'local / en/index: expected collection link');
  assert.ok(!indexHtml.includes('https://upenn.box.com/v/AndaguedaPresente'), 'local / index: source link belongs on record page');
  assert.ok(!enIndexHtml.includes('https://upenn.box.com/v/AndaguedaPresente'), 'local / en/index: source link belongs on record page');
}

function assertArchiveBrowsePage(archivesHtml, label) {
  assert.ok(!archivesHtml.includes('id="preloader"'), `${label}: preloader should not be present`);
  assert.ok(archivesHtml.includes('vault-zone'), `${label}: vault-zone should still be present`);
  assert.ok(archivesHtml.includes('assets/css/archivos.css'), `${label}: archivos stylesheet should be linked`);
  assert.ok(!archivesHtml.includes('Secciones públicas actuales'), `${label}: old marker should not be present`);
  assert.ok(!archivesHtml.includes('1 colección publicada'), `${label}: hero stat text should not be present`);
  assert.ok(!archivesHtml.includes('1 collection published'), `${label}: hero stat text should not be present`);
  assert.ok(!archivesHtml.includes('theme-ribbon'), `${label}: inactive thematic ribbon should not be present`);
  assert.ok(!archivesHtml.includes('Is this thing on?'), `${label}: placeholder copy should not be present`);
  assert.ok(!archivesHtml.includes('Is anything here????'), `${label}: placeholder copy should not be present`);
  assert.ok(archivesHtml.includes('archive-card-link'), `${label}: browse cards should be present`);
  assert.ok(archivesHtml.includes('doc-frame__title'), `${label}: browse cards should include titles`);
  assert.ok(archivesHtml.includes('archives/tubb-hidroelectrica-la-vuelta-actualidad/'), `${label}: browse cards should link to local archive records`);
  assert.ok(archivesHtml.includes('data-archive-item'), `${label}: archive items should be annotated for filtering`);
  assert.ok(archivesHtml.includes('data-archive-filter'), `${label}: filter controls should be present when multiple types exist`);
  assert.ok(archivesHtml.includes('archive-filter'), `${label}: filter button class should be present`);
  assert.ok(archivesHtml.includes('data-archive-view="grid"'), `${label}: grid view control should be present`);
  assert.ok(archivesHtml.includes('data-archive-view="table"'), `${label}: table view control should be present`);
  assert.ok(archivesHtml.includes('data-archive-view-panel="table"'), `${label}: table panel should be present`);
  assert.ok(archivesHtml.includes('archive-table'), `${label}: table view should be present`);
  assert.ok(archivesHtml.includes('data-archive-source-link'), `${label}: source links should be represented in table view`);
  assert.ok(!archivesHtml.includes('/Users/'), `${label}: should not expose local filesystem paths`);
  assert.ok(!archivesHtml.includes('staged_source_path'), `${label}: should not expose staged provenance fields`);
  assert.ok(!archivesHtml.includes('original_source_path'), `${label}: should not expose original provenance fields`);
  assert.ok(!archivesHtml.includes('Box-Box'), `${label}: should not expose local Box paths`);
  assert.ok(!archivesHtml.includes('coming soon'), `${label}: coming-soon copy should not be present`);
  assert.ok(!archivesHtml.includes('próximamente'), `${label}: coming-soon copy should not be present`);
}

function assertArchivePage(archiveHtml, label) {
  assert.ok(!archiveHtml.includes('id="preloader"'), `${label}: preloader should not be present`);
  assert.ok(archiveHtml.includes('data-pagefind-body'), `${label}: archive page should mark the searchable body`);
  assert.ok(archiveHtml.includes('data-pagefind-meta="title"'), `${label}: title metadata hook should be present`);
  assert.ok(archiveHtml.includes('data-pagefind-meta="type"'), `${label}: type metadata hook should be present`);
  assert.ok(archiveHtml.includes('data-pagefind-filter="type"'), `${label}: type filter hook should be present`);
  assert.ok(archiveHtml.includes('data-pagefind-meta="author"'), `${label}: author metadata hook should be present`);
  assert.ok(archiveHtml.includes('data-pagefind-filter="author"'), `${label}: author filter hook should be present`);
  assert.ok(archiveHtml.includes('data-pagefind-meta="topic"'), `${label}: topic metadata hook should be present`);
  assert.ok(archiveHtml.includes('data-pagefind-meta="source_link"'), `${label}: source link metadata hook should be present`);
  assert.ok(archiveHtml.includes('data-pagefind-meta="image"'), `${label}: image metadata hook should be present`);
  const topicFilterHooks = archiveHtml.match(/data-pagefind-filter="topic"/g) || [];
  assert.ok(topicFilterHooks.length >= 2, `${label}: topic filters should be split into multiple values`);
  assert.ok(archiveHtml.includes('record-layout'), `${label}: record layout should be present`);
  assert.ok(archiveHtml.includes('record-rail--right'), `${label}: right metadata rail should be present`);
  assert.ok(
    archiveHtml.indexOf('record-main') < archiveHtml.indexOf('record-rail--right'),
    `${label}: media should appear before metadata in the archive page source`
  );
  assert.ok(archiveHtml.includes('id="footer"'), `${label}: archive page should include the footer block (#56)`);
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
  assert.ok(archiveHtml.includes('photo-viewer__main'), `${label}: main Swiper container should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__thumbs'), `${label}: thumbnail Swiper should be present`);
  assert.ok(archiveHtml.includes('photo-grid__item'), `${label}: thumbnail slides should be present`);
  assert.ok(archiveHtml.includes('swiper-button-prev'), `${label}: previous control should be present`);
  assert.ok(archiveHtml.includes('swiper-button-next'), `${label}: next control should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__status'), `${label}: active position status should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__controls'), `${label}: viewer controls wrapper should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__nav'), `${label}: compact nav buttons should be present`);
  assert.ok(archiveHtml.includes('photo-viewer__caption visually-hidden'), `${label}: sequence caption should stay visually hidden`);
  assert.ok(archiveHtml.includes('data-gallery="la_vuelta_photos"'), `${label}: photo slides should be one navigable gallery`);
  assert.ok(archiveHtml.includes('record-citation-block'), `${label}: citation block should be present in the metadata rail`);
  assert.ok(archiveHtml.includes('download="tubb2026lavuelta-current.bib"'), `${label}: BibTeX download should be available`);
  assert.ok(archiveHtml.includes('data:text/plain;charset=utf-8,%40misc%7B'), `${label}: BibTeX download should be a static data link`);
  assert.ok(archiveHtml.includes('data-description="Daniel Tubb, con apoyo de la SSHRC'), `${label}: lightbox should include compact citation metadata`);
  assert.ok(archiveHtml.includes('secuencia 1'), `${label}: lightbox citation should include photo sequence`);
  assert.ok(archiveHtml.includes('new Swiper('), `${label}: Swiper should be initialized`);
  assert.ok(archiveHtml.includes('thumbs: {'), `${label}: Swiper thumbs module should be wired`);
  assert.ok(archiveHtml.includes('keyboard: {'), `${label}: Swiper keyboard navigation should be enabled`);
  assert.ok(archiveHtml.includes('navigation: {'), `${label}: Swiper navigation should be configured`);
  assert.ok(archiveHtml.includes('/assets/media/la-vuelta-current/'), `${label}: photo grid thumbnails should be present`);
  assert.ok(
    archiveHtml.includes('https://upenn.box.com/v/AndaguedaPresente'),
    `${label}: source link should be rendered when metadata provides it`
  );
  assert.ok(!archiveHtml.includes('previous photo viewer'), `${label}: scaffold viewer copy should not be present`);
  assert.ok(!archiveHtml.includes('jump to image sequence'), `${label}: scaffold jump copy should not be present`);
}

function assertCollectionPhotoData(path, expectedCount, keyPrefix, mediaPrefix, label) {
  const rows = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(rows.length, expectedCount, `${label}: expected one row per manifest item`);
  assert.ok(rows.every((row) => row.thumbnail), `${label}: expected generated thumbnails for every row`);
  for (const row of rows) {
    assert.ok(row.key?.startsWith(keyPrefix), `${label}: expected cite-key-style object key`);
    assert.ok(row.thumbnail?.startsWith(mediaPrefix), `${label}: expected thumbnail under ${mediaPrefix}`);
    assert.ok(!JSON.stringify(row).includes('/Users/'), `${label}: should not expose local source paths`);
    assert.ok(!JSON.stringify(row).includes('Box-Box'), `${label}: should not expose Box paths`);
    const thumbnailPath = join(repoRoot, row.thumbnail.replace(/^\//, ''));
    assert.ok(existsSync(thumbnailPath), `${label}: thumbnail file should exist: ${row.thumbnail}`);
  }
}

function assertPhotoData() {
  assertCollectionPhotoData(photoDataPath, 145, 'lavuelta_', '/assets/media/la-vuelta-current/', 'la vuelta photo data');
  assertCollectionPhotoData(marshallPhotoDataPath, 21, 'marshall_', '/assets/media/marshall-colombia/', 'marshall photo data');
  assertCollectionPhotoData(agnPhotoDataPath, 70, 'agn_', '/assets/media/archivo-general-nacion/', 'agn photo data');
  assertCollectionPhotoData(houghtonPhotoDataPath, 278, 'houghton_', '/assets/media/houghton/', 'houghton photo data');
  assertCollectionPhotoData(platinumPhotoDataPath, 11, 'platinum_', '/assets/media/platinum-pamphlet-1920/', 'platinum photo data');
  assertCollectionPhotoData(riversGoldPhotoDataPath, 10, 'rivers_', '/assets/media/rivers-gold/', 'rivers gold photo data');
}

function assertAdditionalPhotoArchive(archiveHtml, label, options) {
  assertArchivePageBasics(archiveHtml, label);
  assert.ok(archiveHtml.includes(options.mediaPrefix), `${label}: expected collection thumbnails`);
  assert.ok(archiveHtml.includes(`data-gallery="${options.galleryId}"`), `${label}: expected dynamic gallery id`);
  if (options.sourceLink) {
    assert.ok(archiveHtml.includes(options.sourceLink), `${label}: source link should be rendered from YAML`);
  }
}

function assertArchivePageBasics(archiveHtml, label) {
  assert.ok(!archiveHtml.includes('id="preloader"'), `${label}: preloader should not be present`);
  assert.ok(archiveHtml.includes('data-pagefind-body'), `${label}: archive page should mark the searchable body`);
  assert.ok(archiveHtml.includes('record-layout'), `${label}: record layout should be present`);
  assert.ok(archiveHtml.includes('record-rail--right'), `${label}: right metadata rail should be present`);
  assert.ok(archiveHtml.includes('photo-grid'), `${label}: photo grid should be present`);
  assert.ok(archiveHtml.includes('data-photo-viewer'), `${label}: in-page photo viewer should be present`);
  assert.ok(archiveHtml.includes('swiper-button-prev'), `${label}: Swiper previous control should be present`);
  assert.ok(archiveHtml.includes('swiper-button-next'), `${label}: Swiper next control should be present`);
  assert.ok(archiveHtml.includes('record-citation-block'), `${label}: citation block should be present`);
  assert.ok(archiveHtml.includes('record-citation-download'), `${label}: BibTeX download link should be present`);
  assert.ok(!archiveHtml.includes('/Users/'), `${label}: should not expose local source paths`);
  assert.ok(!archiveHtml.includes('Box-Box'), `${label}: should not expose local Box paths`);
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
  assert.ok(indexHtml.includes('id="footer"'), 'prefixed / index: footer should be on the homepage (#56)');
  assert.ok(enIndexHtml.includes('id="footer"'), 'prefixed / en/index: footer should be on the homepage (#56)');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/assets'), 'prefixed / index: expected prefixed assets links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/personas'), 'prefixed / index: expected prefixed personas links');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/buscar'), 'prefixed / index: expected prefixed search link');
  assert.ok(indexHtml.includes('href="/archivos_nuestros/en'), 'prefixed / index: expected prefixed en links');
  assert.ok(indexHtml.includes('home-colecciones') && /href="\/archivos_nuestros\/colecciones\/[^"]+\//.test(indexHtml), 'prefixed / index: expected featured collection link');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/assets'), 'prefixed / en/index: expected prefixed assets links');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en/personas/'), 'prefixed / en/index: expected prefixed English people link');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en/search/'), 'prefixed / en/index: expected prefixed English search link');
  assert.ok(enIndexHtml.includes('href="/archivos_nuestros/en'), 'prefixed / en/index: expected prefixed en links');
  assert.ok(enIndexHtml.includes('home-colecciones') && /href="\/archivos_nuestros\/colecciones\/[^"]+\//.test(enIndexHtml), 'prefixed / en/index: expected featured collection link');
  assert.ok(!/href="\/(assets|personas|buscar|en|archives|search)/.test(indexHtml), 'prefixed / index: no bare internal hrefs');
  assert.ok(!/src="\/(assets|personas|buscar|en|archives|search)/.test(indexHtml), 'prefixed / index: no bare internal srcs');
  assert.ok(!/href="\/(assets|personas|buscar|en|archives|search)/.test(enIndexHtml), 'prefixed / en/index: no bare internal hrefs');
  assert.ok(!/src="\/(assets|personas|buscar|en|archives|search)/.test(enIndexHtml), 'prefixed / en/index: no bare internal srcs');
  assert.ok(indexHtml.includes('Colecciones'), 'prefixed / index: Spanish homepage heading should be present');
  assert.ok(enIndexHtml.includes('Collections'), 'prefixed / en/index: English homepage heading should be present');
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

function assertPagefindFilters() {
  const result = spawnSync('npx', ['pagefind', '--site', '_site', '--glob', '**/*.html', '--verbose'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error('Pagefind verbose run failed');
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  assert.ok(/Indexed [1-9]\d* filters/.test(output), 'pagefind: expected nonzero filters after indexing');
  assert.ok(!output.includes('Indexed 0 filters'), 'pagefind: expected filters to be present');
}

try {
  runMainJsSmoke();
  assertAdminConfigSchema();
  assertPhotoData();

  const localBuild = runEleventy('');
  assertLocalBuild(localBuild.index, localBuild.enIndex);
  assertArchiveBrowsePage(localBuild.archives, 'local / archives');
  assertArchiveBrowsePage(localBuild.enArchives, 'local / en/archives');
  assertArchivePage(localBuild.archive, 'local / archive');
  assertAdditionalPhotoArchive(localBuild.marshallArchive, 'local / marshall archive', {
    mediaPrefix: '/assets/media/marshall-colombia/',
    galleryId: 'marshall_photos',
    sourceLink: 'https://upenn.box.com/v/ColeccionMarshall',
    citationKey: 'marshall-colombia-photos',
  });
  assertAdditionalPhotoArchive(localBuild.agnArchive, 'local / agn archive', {
    mediaPrefix: '/assets/media/archivo-general-nacion/',
    galleryId: 'agn_photos',
    sourceLink: 'https://upenn.box.com/s/kafp5sfpz66kts02a7mprjau3i98a248',
    citationKey: 'archivo-general-nacion-photos',
  });
  assertAdditionalPhotoArchive(localBuild.houghtonArchive, 'local / houghton archive', {
    mediaPrefix: '/assets/media/houghton/',
    galleryId: 'houghton_photos',
    sourceLink: 'https://upenn.box.com/s/8qkvpjyejqz4cdez7ivkyfmo74dlue5e',
    citationKey: 'houghton-photos',
  });
  assertAdditionalPhotoArchive(localBuild.platinumArchive, 'local / platinum archive', {
    mediaPrefix: '/assets/media/platinum-pamphlet-1920/',
    galleryId: 'platinum_photos',
    sourceLink: '',
    citationKey: 'platinum-pamphlet-1920',
  });
  assertAdditionalPhotoArchive(localBuild.riversGoldArchive, 'local / rivers gold archive', {
    mediaPrefix: '/assets/media/rivers-gold/',
    galleryId: 'rivers_gold_photos',
    sourceLink: 'https://upenn.box.com/v/RiversofGold',
    citationKey: 'rivers-gold-pamphlet-1940s',
  });
  assertSearchPage(localBuild.search, 'local / buscar', 'Buscar');
  assertSearchPage(localBuild.enSearch, 'local / en/search', 'Search');
  assertBuiltLinks('');
  assertPagefindOutput();
  assertPagefindFilters();

  const prefixedBuild = runEleventy('/archivos_nuestros');
  assertPrefixedBuild(prefixedBuild.index, prefixedBuild.enIndex);
  assertArchiveBrowsePage(prefixedBuild.archives, 'prefixed / archives');
  assertArchiveBrowsePage(prefixedBuild.enArchives, 'prefixed / en/archives');
  assertArchivePage(prefixedBuild.archive, 'prefixed / archive');
  assertAdditionalPhotoArchive(prefixedBuild.marshallArchive, 'prefixed / marshall archive', {
    mediaPrefix: '/archivos_nuestros/assets/media/marshall-colombia/',
    galleryId: 'marshall_photos',
    sourceLink: 'https://upenn.box.com/v/ColeccionMarshall',
    citationKey: 'marshall-colombia-photos',
  });
  assertAdditionalPhotoArchive(prefixedBuild.agnArchive, 'prefixed / agn archive', {
    mediaPrefix: '/archivos_nuestros/assets/media/archivo-general-nacion/',
    galleryId: 'agn_photos',
    sourceLink: 'https://upenn.box.com/s/kafp5sfpz66kts02a7mprjau3i98a248',
    citationKey: 'archivo-general-nacion-photos',
  });
  assertAdditionalPhotoArchive(prefixedBuild.houghtonArchive, 'prefixed / houghton archive', {
    mediaPrefix: '/archivos_nuestros/assets/media/houghton/',
    galleryId: 'houghton_photos',
    sourceLink: 'https://upenn.box.com/s/8qkvpjyejqz4cdez7ivkyfmo74dlue5e',
    citationKey: 'houghton-photos',
  });
  assertAdditionalPhotoArchive(prefixedBuild.platinumArchive, 'prefixed / platinum archive', {
    mediaPrefix: '/archivos_nuestros/assets/media/platinum-pamphlet-1920/',
    galleryId: 'platinum_photos',
    sourceLink: '',
    citationKey: 'platinum-pamphlet-1920',
  });
  assertAdditionalPhotoArchive(prefixedBuild.riversGoldArchive, 'prefixed / rivers gold archive', {
    mediaPrefix: '/archivos_nuestros/assets/media/rivers-gold/',
    galleryId: 'rivers_gold_photos',
    sourceLink: 'https://upenn.box.com/v/RiversofGold',
    citationKey: 'rivers-gold-pamphlet-1940s',
  });
  assertSearchPage(prefixedBuild.search, 'prefixed / buscar', 'Buscar');
  assertSearchPage(prefixedBuild.enSearch, 'prefixed / en/search', 'Search');
  assertBuiltLinks('/archivos_nuestros');
  assertPagefindOutput();
  assertPagefindFilters();

  console.log('Smoke tests passed.');
} finally {
  restoreWorkerReport();
}
