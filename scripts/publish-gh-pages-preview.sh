#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preview_worktree="$(cd "${repo_root}/.." && pwd)/site-gh-pages-preview"
worker_report="${repo_root}/WORKER-REPORT.md"
worker_report_tmp=""
cleanup() {
  if [[ -n "${worker_report_tmp}" && -f "${worker_report_tmp}" ]]; then
    mv "${worker_report_tmp}" "${worker_report}"
  fi
}
trap cleanup EXIT

cd "${repo_root}"

if [[ -f "${worker_report}" ]]; then
  worker_report_tmp="$(mktemp "${TMPDIR:-/tmp}/worker-report.XXXXXX")"
  mv "${worker_report}" "${worker_report_tmp}"
fi

rm -rf _site
SITE_BASE_PATH=/archivos_nuestros npx eleventy

if [[ -d "${preview_worktree}" ]]; then
  if git -C "${preview_worktree}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    :
  else
    echo "Existing path is not a git worktree: ${preview_worktree}" >&2
    exit 1
  fi
else
  git worktree add "${preview_worktree}" gh-pages
fi

rsync -a --delete --exclude .git/ --exclude .git _site/ "${preview_worktree}/"

if git -C "${preview_worktree}" status --short | grep -q .; then
  git -C "${preview_worktree}" add -A
  commit_message="${1:-Publish Archivos Nuestros preview}"
  git -C "${preview_worktree}" commit -m "${commit_message}"
  git -C "${preview_worktree}" push origin gh-pages
fi

preview_url="https://dtubb.github.io/archivos_nuestros/"
echo "${preview_url}"
