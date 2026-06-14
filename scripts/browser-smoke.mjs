#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium, devices } from 'playwright';

const repoRoot = process.cwd();
const siteRoot = join(repoRoot, '_site');
const screenshotRoot = mkdtempSync(join(tmpdir(), 'site-shell-browser-smoke-'));
const buildEnv = {
  ...process.env,
  SITE_BASE_PATH: '',
};
const decapDistDir = join(repoRoot, 'node_modules/decap-cms-app/dist');
const decapBundlePath = join(decapDistDir, 'decap-cms-app.js');
const decapAssets = new Map(
  readdirSync(decapDistDir)
    .filter((entry) => /\.(woff2?|js)$/i.test(entry))
    .map((entry) => [entry, join(decapDistDir, entry)])
);

const visibleCopyGuards = [
  'Secciones públicas actuales',
  '1 colección publicada',
  '1 collection published',
  'coming soon',
  'próximamente',
  'theme-ribbon',
  'Primer prototipo',
  'First prototype',
  'This is the first working collection',
  'source review',
  '145 image files',
  'Los originales en alta resolución',
  'Full-resolution originals',
  'Muntú Bantú',
  'Acknowledgements',
  'Agradecimientos',
];

function runEleventy() {
  rmSync(siteRoot, { recursive: true, force: true });

  const result = spawnSync('npx', ['eleventy'], {
    cwd: repoRoot,
    env: buildEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error('Eleventy build failed for browser smoke');
  }
}

function contentTypeFor(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function serveStatic(rootDir) {
  const root = resolve(rootDir);

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith('/')) pathname = `/${pathname}`;
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const candidates = [];

    if (safePath === '/' || safePath === '/.') {
      candidates.push(join(root, 'index.html'));
    } else if (safePath.endsWith('/')) {
      candidates.push(join(root, `.${safePath}`, 'index.html'));
    } else {
      candidates.push(join(root, `.${safePath}`));
      candidates.push(join(root, `.${safePath}.html`));
      candidates.push(join(root, `.${safePath}`, 'index.html'));
    }

    const filePath = candidates.find((candidate) => {
      const resolved = resolve(candidate);
      return resolved === root || resolved.startsWith(`${root}${sep}`) ? existsSync(resolved) && statSync(resolved).isFile() : false;
    });

    if (!filePath) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(filePath));
    res.end(readFileSync(filePath));
  });

  return server;
}

async function startServer(server) {
  server.listen(0, '127.0.0.1');
  await new Promise((resolvePromise) => server.once('listening', resolvePromise));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Browser smoke server failed to bind');
  }
  return address.port;
}

function ensureNoVisibleScaffold(pageText, label) {
  const normalized = pageText.toLowerCase();
  for (const guard of visibleCopyGuards) {
    assert.ok(!normalized.includes(guard.toLowerCase()), `${label}: should not show old scaffold copy "${guard}"`);
  }
}

async function assertStyledPage(page, label) {
  const styles = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const firstHeading = document.querySelector('h1, h2');
    return {
      backgroundColor: body.backgroundColor,
      fontFamily: body.fontFamily,
      headingFontFamily: firstHeading ? getComputedStyle(firstHeading).fontFamily : '',
    };
  });

  assert.ok(
    /source serif 4|georgia/i.test(styles.fontFamily),
    `${label}: body typography should be driven by the site stylesheet`
  );
  assert.ok(
    styles.backgroundColor.includes('249, 246, 240'),
    `${label}: body background should use the parchment site color`
  );
}

function capturePageIssues(page, label) {
  const issues = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    issues.push(error.stack || error.message);
  });
  return () => {
    assert.deepEqual(issues, [], `${label}: console/page errors should stay clean`);
  };
}

async function smokePage(page, baseUrl, path, label, screenshotName) {
  const assertIssues = capturePageIssues(page, label);
  await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'load' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({ path: join(screenshotRoot, screenshotName), fullPage: true });
  assertIssues();
  await assertStyledPage(page, label);
  ensureNoVisibleScaffold(await page.locator('body').innerText(), label);
}

async function smokeArchivePage(page, baseUrl, label, screenshotName) {
  const assertIssues = capturePageIssues(page, label);
  await smokePage(page, baseUrl, '/archives/tubb-hidroelectrica-la-vuelta-actualidad/', label, screenshotName);

  const activeImage = page.locator('[data-photo-active-image]');
  const activeStatus = page.locator('[data-photo-status]');
  const jumpSelect = page.locator('[data-photo-jump]');
  const openButton = page.locator('[data-photo-open]');
  const thumbs = page.locator('[data-photo-thumb]');
  const lightbox = page.locator('#glightbox-body');

  const initialSrc = await activeImage.getAttribute('src');
  const initialStatus = await activeStatus.textContent();

  await thumbs.nth(1).click();
  await page.waitForFunction(
    ([selector, previousSrc]) => document.querySelector(selector)?.getAttribute('src') !== previousSrc,
    ['[data-photo-active-image]', initialSrc]
  );
  await assert.match(await activeStatus.textContent(), /^\s*2\s*\/\s*\d+\s*$/);
  assert.notStrictEqual(await activeImage.getAttribute('src'), initialSrc);

  await jumpSelect.selectOption('0');
  await page.waitForFunction(
    ([selector, previousSrc]) => document.querySelector(selector)?.getAttribute('src') === previousSrc,
    ['[data-photo-active-image]', initialSrc]
  );
  assert.equal(await activeStatus.textContent(), initialStatus);
  assert.equal(await activeImage.getAttribute('src'), initialSrc);

  await openButton.click();
  await lightbox.waitFor({ state: 'visible', timeout: 10000 });
  await page.keyboard.press('Escape');
  await lightbox.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  assertIssues();
}

async function smokeAdminPage(page, baseUrl, label, screenshotName) {
  await page.route('https://unpkg.com/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.includes('/decap-cms@')) {
      if (requestUrl.pathname.endsWith('/decap-cms.js')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          body: readFileSync(decapBundlePath, 'utf8'),
        });
        return;
      }

      const assetName = requestUrl.pathname.split('/').pop() || '';
      const assetPath = decapAssets.get(assetName);
      if (assetPath) {
        await route.fulfill({
          status: 200,
          contentType: contentTypeFor(assetPath),
          body: readFileSync(assetPath),
        });
        return;
      }
    }

    await route.continue();
  });
  await page.route('https://identity.netlify.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: 'window.netlifyIdentity = window.netlifyIdentity || { init() {}, on() {}, open() {}, close() {}, logout() {}, currentUser: null };',
    });
  });
  await page.goto(new URL('/admin/', baseUrl).toString(), { waitUntil: 'load' });
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: join(screenshotRoot, screenshotName), fullPage: true });

  const title = await page.title();
  assert.equal(title, 'Content Manager', `${label}: admin title should remain the Decap CMS title`);
  assert.ok(
    await page.locator('script[src*="decap-cms"]').count(),
    `${label}: admin page should keep the Decap CMS bootstrap script`
  );
}

async function main() {
  mkdirSync(screenshotRoot, { recursive: true });
  runEleventy();

  const server = serveStatic(siteRoot);
  const port = await startServer(server);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch();

  try {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1600 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    const mobile = await browser.newContext({
      ...devices['Pixel 5'],
      colorScheme: 'light',
    });

    try {
      const desktopPage = await desktop.newPage();
      const mobilePage = await mobile.newPage();

      await smokePage(desktopPage, baseUrl, '/', 'desktop /', 'desktop-home.png');
      await smokePage(desktopPage, baseUrl, '/archives/', 'desktop /archives', 'desktop-archives.png');
      await smokeArchivePage(desktopPage, baseUrl, 'desktop /archive', 'desktop-archive.png');
      await smokePage(desktopPage, baseUrl, '/buscar/', 'desktop /buscar', 'desktop-search.png');
      await smokeAdminPage(desktopPage, baseUrl, 'desktop /admin', 'desktop-admin.png');

      await smokeArchivePage(mobilePage, baseUrl, 'mobile /archive', 'mobile-archive.png');
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }

  console.log(`Browser smoke passed. Screenshots: ${screenshotRoot}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
