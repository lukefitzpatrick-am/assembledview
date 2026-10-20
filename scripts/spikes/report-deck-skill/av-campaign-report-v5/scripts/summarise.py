#!/usr/bin/env python3
"""Print a compact key list for report-data.json. At most 1500 characters."""
import json
import sys


def leaf(value):
    return not isinstance(value, (dict, list)) and value is not None


def parts(obj):
    """Return (leaf keys, nested brace groups) for one object."""
    keys = []
    nests = []
    if not isinstance(obj, dict):
        return keys, nests
    for key, value in obj.items():
        if isinstance(value, dict):
            inner = [name for name, child in value.items() if leaf(child)]
            if inner:
                nests.append(key + "{" + ",".join(inner) + "}")
            for name, child in value.items():
                if isinstance(child, dict):
                    deeper = [n for n, c in child.items() if leaf(c)]
                    if deeper:
                        nests.append(key + "." + name + "{" + ",".join(deeper) + "}")
        elif isinstance(value, list) or value is None:
            continue
        else:
            keys.append(key)
    return keys, nests


def indexed(name, rows):
    lines = []
    sets = []
    for row in rows:
        keys, nests = parts(row)
        sets.append(set(keys + nests))
    common = set.intersection(*sets) if sets else set()
    shown = " ".join(sorted(common))
    lines.append(f"{name}.<i> {shown}".rstrip())
    for index, row in enumerate(rows):
        keys, nests = parts(row)
        extra = sorted(set(keys + nests) - common)
        group = row.get("group") if isinstance(row, dict) else None
        label = row.get("label") if isinstance(row, dict) else None
        bits = [f"i={index}"]
        if isinstance(group, str):
            bits.append(group)
        if isinstance(label, str):
            bits.append(json.dumps(label))
        if isinstance(row, dict) and "notLive" in row:
            bits.append("not-live" if row.get("notLive") else "live")
        if extra:
            bits.append("+" + " ".join(f"{name}.{index}.{item}" for item in extra))
        lines.append(" ".join(bits))
    return lines


def summarise(data):
    lines = [
        "name{a,b} means .name.a and .name.b. <i> is the index on the i= line.",
    ]
    named = []
    for key in ("mbaNumber", "clientName", "campaignName"):
        value = data.get(key)
        if isinstance(value, str):
            named.append(f"{key}={value}")
    if named:
        lines.append(" ".join(named))
    creatives = data.get("creatives")
    if isinstance(creatives, dict):
        campaign = creatives.get("campaign") if isinstance(creatives.get("campaign"), dict) else {}
        rows = campaign.get("rows") if isinstance(campaign.get("rows"), list) else []
        bits = [f"creatives.campaign rows={len(rows)} row keys name,platform,adSet,spend,impressions,clicks,ctr"]
        lines_list = creatives.get("lines") if isinstance(creatives.get("lines"), list) else []
        for index, entry in enumerate(lines_list):
            if isinstance(entry, dict):
                bits.append(f"creatives.lines.{index} {json.dumps(entry.get('label', ''))} rows={len(entry.get('rows') or [])}")
        lines.append("; ".join(bits))
    top = [key for key, value in data.items() if leaf(value) and key not in ("mbaNumber", "clientName", "campaignName")]
    if top:
        lines.append(" ".join(top))
    for key, value in data.items():
        if key == "creatives":
            continue
        if isinstance(value, dict):
            keys, nests = parts(value)
            bits = [f"{key}.{name}" for name in keys] + [f"{key}.{nest}" for nest in nests]
            if bits:
                lines.append(" ".join(bits))
        elif isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            lines.extend(indexed(key, value))
        elif value is None:
            lines.append(f"{key} null")
    text = "\n".join(lines)
    if len(text) > 1500:
        text = text[:1490].rstrip() + "\n…"
    return text


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: summarise.py report-data.json\n")
        return 2
    with open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        sys.stderr.write("report-data.json must be an object\n")
        return 1
    sys.stdout.write(summarise(data))
    if not summarise(data).endswith("\n"):
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
