#!/usr/bin/env python3
"""Promote the breadcrumb buried in `titleEng` into a structured `fondo` field
and clean `titleEng` down to the thin item title.

Rule (no guessing): only touch records whose `titleEng` literally starts with
"Fondo <X> - <section> - ". From that we take fondo=<X> verbatim and strip the
"Fondo <X> - <section> - " prefix off titleEng. If the cleaned titleEng then
equals `title`, it's a redundant duplicate -> drop it. Everything else is left
untouched and listed as a flag for Daniel to decide. Edits are surgical (we
rewrite only the titleEng block and insert one fondo line) so the rest of the
front matter — bibtex blocks, quoting, key order — is preserved byte-for-byte.

ponytail: no `section` field — `type` already encodes it. One new field only.
"""
import re, sys, pathlib, yaml

ARCHIVES = pathlib.Path(__file__).resolve().parent.parent / "archives"
# "Fondo Chocó - Entrevistas - real title here"  ->  fondo, section, rest
BREADCRUMB = re.compile(r"^Fondo\s+(.+?)\s+-\s+(.+?)\s+-\s+(.+)$", re.DOTALL)
# a "title" segment that is just a date/decade is not a real title -> flag, skip
JUNK_TITLE = re.compile(r"^\d{3,4}s?$")

def front_matter(text):
    m = re.match(r"^---\n(.*?\n)---\n", text, re.DOTALL)
    return m

changed, flagged = [], []

for path in sorted(ARCHIVES.glob("*.md")):
    text = path.read_text()
    m = front_matter(text)
    if not m:
        flagged.append((path.name, "no front matter")); continue
    data = yaml.safe_load(m.group(1)) or {}
    te = data.get("titleEng")
    if not te:
        flagged.append((path.name, "no titleEng (fondo unknown)")); continue
    bc = BREADCRUMB.match(" ".join(te.split()))  # collapse YAML folding
    if not bc:
        flagged.append((path.name, f"titleEng not a 'Fondo X - …' breadcrumb")); continue
    fondo, section, rest = (s.strip() for s in bc.groups())
    if JUNK_TITLE.match(rest):
        flagged.append((path.name, f"breadcrumb title segment is junk ({rest!r})")); continue

    drop = rest == (data.get("title") or "").strip()
    fm = m.group(1)
    # replace the whole titleEng block (key line + folded continuations)
    block = re.compile(r"^titleEng:.*?(?=^\S|\Z)", re.DOTALL | re.MULTILINE)
    if drop:
        new_fm = block.sub(f"fondo: {fondo}\n", fm, count=1)
        note = f"fondo={fondo}; dropped titleEng (== title)"
    else:
        # quote if the cleaned title has yaml-significant leading chars
        safe = rest.replace('"', '\\"')
        line = f'titleEng: "{safe}"' if re.match(r'^[\'">\[\]{}#&*!|%@`-]', rest) or ": " in rest else f"titleEng: {rest}"
        new_fm = block.sub(f"fondo: {fondo}\n{line}\n", fm, count=1)
        note = f"fondo={fondo}; titleEng -> {rest!r}"
    path.write_text(text[:m.start(1)] + new_fm + text[m.end(1):])
    changed.append((path.name, note))

print(f"\n== CHANGED ({len(changed)}) ==")
for n, note in changed: print(f"  {n}\n      {note}")
print(f"\n== FLAGGED — needs Daniel ({len(flagged)}) ==")
for n, why in flagged: print(f"  {n}\n      {why}")
