#!/bin/bash
# Deploy to Netlify with ZERO build minutes (uploads a locally-built _site).
# Excludes the local-only AV (Ocoró audio / O'Neill video) — those live on Reclaim, not Netlify.
# Requires: Netlify account under its usage limit (deploys 403 if over), and `netlify link` already done.
set -e
cd "$(dirname "$0")/.."

echo "1/4 building (root base path)…"
rm -rf _site
SITE_BASE_PATH= npm run build

echo "2/4 search index…"
npx pagefind --site _site

echo "3/4 stripping local-only AV (assets/media/av — kept on Reclaim, not deployed)…"
rm -rf _site/assets/media/av
du -sh _site | awk '{print "   deploy size:", $1}'

echo "4/4 deploying to Netlify (prod, 0 build minutes)…"
netlify deploy --prod --dir _site
