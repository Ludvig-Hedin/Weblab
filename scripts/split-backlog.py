#!/usr/bin/env python3
"""One-off script: split BACKLOG.md into backlog/open/*.md and backlog/resolved/*.md,
one file per top-level entry, plus a generated backlog/README.md index.

Not meant to be run again after the split — kept in scripts/ for provenance only.
"""
import re
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "BACKLOG.md")
OUT_DIR = os.path.join(ROOT, "backlog")

with open(SRC, encoding="utf-8") as f:
    lines = f.readlines()


def find_line(prefix, start=0):
    for i in range(start, len(lines)):
        if lines[i].startswith(prefix):
            return i
    raise ValueError(f"not found: {prefix!r}")


protocol_start = find_line("## Protocol")
open_start = find_line("## Open")
resolved_start = find_line("## Resolved")

protocol_lines = lines[protocol_start:open_start]
open_lines = lines[open_start + 1 : resolved_start]  # skip the "## Open" header line itself
resolved_lines = lines[resolved_start + 1 :]  # skip "## Resolved" header


def split_items(section_lines):
    """Split on any line starting with '## ' or '### ' (item boundaries).
    Deeper headings (#### etc.) stay nested inside the current item."""
    items = []
    current_heading = None
    current_body = []
    for line in section_lines:
        if re.match(r"^(## |### )", line):
            if current_heading is not None:
                items.append((current_heading, current_body))
            current_heading = line.rstrip("\n")
            current_body = []
        else:
            current_body.append(line)
    if current_heading is not None:
        items.append((current_heading, current_body))
    return items


def slugify(heading_text):
    # Pull any F-### tokens from before the em-dash (if present) for a
    # stable, greppable filename prefix, e.g. "F-491 / F-472 — TOCTOU..."
    # -> "f-491-f-472-", and slugify only the remainder after the dash so
    # the ID isn't duplicated in both the prefix and the description.
    if "—" in heading_text:
        head, rest = heading_text.split("—", 1)
    else:
        head, rest = "", heading_text
    fid_matches = re.findall(r"F-\d+", head)
    prefix = ("-".join(dict.fromkeys(fid_matches)) + "-").lower() if fid_matches else ""
    description = rest if fid_matches else heading_text

    clean = re.sub(r"[`*~]", "", description)
    clean = clean.lower()
    clean = re.sub(r"[^a-z0-9]+", "-", clean)
    clean = re.sub(r"-+", "-", clean).strip("-")

    slug = prefix + clean
    slug = re.sub(r"-+", "-", slug).strip("-")

    # Truncate at a dash boundary (not mid-word) within the limit.
    limit = 70
    if len(slug) > limit:
        truncated = slug[:limit]
        cut = truncated.rfind("-")
        slug = truncated[:cut] if cut > 10 else truncated
    return slug or "entry"


def write_items(items, out_subdir):
    seen = {}
    index = []
    os.makedirs(os.path.join(OUT_DIR, out_subdir), exist_ok=True)
    for n, (heading_line, body) in enumerate(items, start=1):
        heading_text = re.sub(r"^#+\s*", "", heading_line)
        slug = slugify(heading_text)
        if slug in seen:
            seen[slug] += 1
            slug = f"{slug}-{seen[slug]}"
        else:
            seen[slug] = 1
        fname = f"{n:03d}-{slug}.md"
        path = os.path.join(OUT_DIR, out_subdir, fname)
        content = "# " + heading_text + "\n\n" + "".join(body).strip("\n") + "\n"
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        index.append((fname, heading_text))
    return index


open_items = split_items(open_lines)
resolved_items = split_items(resolved_lines)

open_index = write_items(open_items, "open")
resolved_index = write_items(resolved_items, "resolved")

# --- README ---
protocol_body = "".join(protocol_lines[1:]).strip("\n")  # drop the "## Protocol" heading line

readme = []
readme.append("# Backlog\n")
readme.append(
    "\nLiving list of known bugs, follow-ups, and deferred TODOs that did not block the "
    "work that surfaced them. Every entry is its own file so it can be linked, greped, and "
    "updated independently. Split from the original single `BACKLOG.md` on 2026-07-09 — see "
    "`scripts/split-backlog.py` for provenance.\n"
)
readme.append("\n## Protocol — read this before editing\n")
readme.append("\n" + protocol_body + "\n")
readme.append(
    "\n- **New structure:** each entry lives in its own file under `backlog/open/` or "
    "`backlog/resolved/`. To log a new deferred bug/TODO, add a new file to `backlog/open/` "
    "named `NNN-short-slug.md` (NNN = next sequence number) following the entry template "
    "below, then add a line to the **Open** index in this README. To close one out, move the "
    "file to `backlog/resolved/`, add a `**Resolved:**` line, and move its README index line "
    "to **Resolved**.\n"
)

readme.append(f"\n## Open ({len(open_index)})\n\n")
for fname, heading in open_index:
    readme.append(f"- [{heading}](open/{fname})\n")

readme.append(f"\n## Resolved ({len(resolved_index)})\n\n")
for fname, heading in resolved_index:
    readme.append(f"- [{heading}](resolved/{fname})\n")

with open(os.path.join(OUT_DIR, "README.md"), "w", encoding="utf-8") as f:
    f.write("".join(readme))

print(f"Open items: {len(open_index)}")
print(f"Resolved items: {len(resolved_index)}")
