#!/usr/bin/env python3
"""Read content JSON from stdin, validate it, and write content.json.

Prints OK, or one error per line. Does not write the file when validation fails.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_report import validate_content  # noqa: E402


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        sys.stdout.write("error: empty input\n")
        return 1
    try:
        content = json.loads(raw)
    except json.JSONDecodeError as error:
        sys.stdout.write(f"error: invalid JSON ({error})\n")
        return 1
    data = None
    if len(sys.argv) == 2:
        try:
            with open(sys.argv[1], encoding="utf-8") as handle:
                data = json.load(handle)
        except OSError as error:
            sys.stdout.write(f"error: {error}\n")
            return 1
        if not isinstance(data, dict):
            sys.stdout.write("error: report-data.json must be an object\n")
            return 1
    elif len(sys.argv) > 2:
        sys.stdout.write("usage: write_content.py [report-data.json]\n")
        return 2
    errors = validate_content(content, data)
    if errors:
        for error in errors:
            sys.stdout.write(f"error: {error}\n")
        return 1
    out = os.path.join(os.getcwd(), "content.json")
    with open(out, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(content, handle, indent=2)
        handle.write("\n")
    sys.stdout.write("OK\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
