#!/usr/bin/env python3
"""Validate static asset references for cross-platform deployments.

This catches the most common issue when projects work on Windows/Chromium but fail
on Linux/iOS/AWS: path separators, case mismatches, and missing files.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ASSET_PATTERN = re.compile(r"(?:src|href)=['\"]([^'\"]+)['\"]", re.IGNORECASE)
WEB_LINK_PREFIXES = ("http://", "https://", "//", "data:", "mailto:", "tel:", "#")
SCAN_EXTENSIONS = {".html", ".htm"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check HTML asset links for Linux-safe paths")
    parser.add_argument("root", nargs="?", default=".", help="Project root folder")
    return parser.parse_args()


def is_local_asset(link: str) -> bool:
    return not link.startswith(WEB_LINK_PREFIXES)


def resolve_reference(html_file: Path, link: str, root: Path) -> Path:
    normalized = link.split("?", 1)[0].split("#", 1)[0]
    if normalized.startswith("/"):
        return root / normalized.lstrip("/")
    return (html_file.parent / normalized).resolve()


def detect_case_mismatch(path: Path) -> bool:
    """Return True if path exists case-insensitively but not with exact case."""
    current = path.anchor or "/"
    candidate = Path(current)
    for part in path.parts[1:] if path.is_absolute() else path.parts:
        if not candidate.exists():
            return False
        entries = {p.name: p for p in candidate.iterdir()}
        if part in entries:
            candidate = entries[part]
            continue
        for name, entry in entries.items():
            if name.lower() == part.lower():
                return True
        return False
    return False


def check_file(html_file: Path, root: Path) -> list[str]:
    errors: list[str] = []
    text = html_file.read_text(encoding="utf-8", errors="ignore")
    for match in ASSET_PATTERN.finditer(text):
        link = match.group(1).strip()
        if not is_local_asset(link):
            continue
        if "\\" in link:
            errors.append(f"{html_file}: uses Windows-style backslashes in link '{link}'")
            continue

        target = resolve_reference(html_file, link, root)
        if not target.exists():
            absolute_path = target if target.is_absolute() else (root / target)
            mismatch = detect_case_mismatch(absolute_path)
            if mismatch:
                errors.append(
                    f"{html_file}: case mismatch in link '{link}' (Linux/iOS are case-sensitive)"
                )
            else:
                errors.append(f"{html_file}: missing asset for link '{link}'")
    return errors


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    html_files = [p for p in root.rglob("*") if p.suffix.lower() in SCAN_EXTENSIONS]

    if not html_files:
        print("No HTML files found.")
        return 0

    all_errors: list[str] = []
    for html_file in html_files:
        all_errors.extend(check_file(html_file, root))

    if all_errors:
        print("Found static asset issues:\n")
        for err in all_errors:
            print(f"- {err}")
        return 1

    print("No static asset path issues found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
