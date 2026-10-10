#!/usr/bin/env python3
"""Claim linter (spec §9.4): fail on medical or skin-lightening language in UI strings,
prompts and message files. Legitimate uses go in scripts/claim_lint_allow.txt as
`relative/path:line-substring` entries.

Usage: python scripts/claim_lint.py   (exit 1 on any hit)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN = [
    ("frontend/src", {".ts", ".tsx", ".json"}),
    ("backend/app/agent/prompts", {".md", ".txt", ".json"}),
    ("seed", {".json"}),
]
BANNED = [
    # medical / treatment
    r"\bcures?\b", r"\btreat(s|ment|ing)?\b", r"\bdiagnos(e|is|es|ing)\b", r"\bheal(s|ing)?\b",
    r"\bdermatolog(ist|ical)\b", r"\bclinical(ly)?\b", r"\bdisease\b", r"\bprescri(be|ption)\b",
    r"\bacne treatment\b", r"\bmedical\b",
    # skin lightening / colourism
    r"\bfair(ness|er)?\b", r"\bwhiten(ing|s)?\b", r"\blighten(ing)? (your |the )?skin\b",
    r"\blighter skin\b", r"\bskin lightening\b", r"\bbrighten(ing)? (your |the )?complexion\b",
    # hi / bn equivalents
    r"गोरा", r"गोरी", r"गोरापन", r"इलाज", r"फर्सा", r"ফর্সা", r"চিকিৎসা", r"রোগ",
]
PATTERN = re.compile("|".join(BANNED), re.IGNORECASE)


def load_allow() -> list[str]:
    f = ROOT / "scripts" / "claim_lint_allow.txt"
    if not f.exists():
        return []
    return [l.strip() for l in f.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#")]


def main() -> int:
    allow = load_allow()
    hits = []
    for rel, exts in SCAN:
        base = ROOT / rel
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in exts or "node_modules" in path.parts or path.name.endswith(".test.ts"):
                continue
            for n, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                m = PATTERN.search(line)
                if not m:
                    continue
                r = str(path.relative_to(ROOT))
                if any(a.split(":", 1)[0] == r and a.split(":", 1)[1] in line for a in allow if ":" in a):
                    continue
                hits.append(f"{r}:{n}: '{m.group(0)}' -> {line.strip()[:120]}")
    for h in hits:
        print(h)
    print(f"claim-lint: {len(hits)} hit(s)")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
