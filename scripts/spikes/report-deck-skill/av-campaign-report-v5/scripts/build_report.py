#!/usr/bin/env python3
"""Build a v5 campaign report from content.json. Numbers come from report-data.json keys.

usage: build_report.py content.json report-data.json template.potx out.pptx photo1 photo2 photo3
"""
import json
import os
import re
import sys

from pptx.enum.text import MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from am_rebrand import (  # noqa: E402
    BODY, HEAD, K, Deck, I, Run,
    arch, btn, card, journey, line, numdot, pill, table, tag, tb, trio,
)

KEY_RE = re.compile(r"[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+")
SERIF_RE = re.compile(r"\{i:\"([^\"]*)\"\}")


class BuildError(Exception):
    pass


def fail(path, message):
    raise BuildError(f"{path}: {message}")


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")


def matches(item, part):
    group = str(item.get("group") or "")
    label = slug(item.get("label") or "")
    return part in (group, label, label.split("-")[0], group.split("_")[0])


def resolve(data, key, at):
    if not isinstance(key, str) or not key.strip():
        fail(at, f"missing key {key!r}")
    current = data
    for part in key.split("."):
        if isinstance(current, list):
            if part.isdigit():
                index = int(part)
                if index < 0 or index >= len(current):
                    fail(at, f"missing key {key}")
                current = current[index]
                continue
            found = next((item for item in current if isinstance(item, dict) and matches(item, part)), None)
            if found is None:
                fail(at, f"missing key {key}")
            current = found
            continue
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        fail(at, f"missing key {key}")
    if not isinstance(current, str):
        fail(at, f"missing key {key}")
    return current


def digits(text):
    return re.search(r"\d", text) is not None


def text_of(node, path, limit=None, words=None):
    if isinstance(node, str) and KEY_RE.fullmatch(node):
        out = resolve(DATA, node, path)
    elif isinstance(node, str):
        if digits(node):
            fail(path, "digits in copy; use a value key")
        out = node
    elif isinstance(node, list):
        bits = []
        for index, part in enumerate(node):
            at = f"{path}.{index}"
            if isinstance(part, str):
                if digits(part):
                    fail(at, "digits in copy; use a value key")
                bits.append(part)
            elif isinstance(part, dict) and isinstance(part.get("k"), str) and len(part) == 1:
                bits.append(resolve(DATA, part["k"], f"{at}.k"))
            else:
                fail(at, 'expected copy or {"k": path}')
        out = "".join(bits)
    else:
        fail(path, "expected copy or a value key")
    if limit is not None and len(out) > limit:
        fail(path, f"{len(out)} characters, limit {limit}")
    if words is not None and len(re.findall(r"\S+", out)) > words:
        fail(path, f"over {words} words")
    return out


def key_of(node, path):
    if not isinstance(node, str):
        fail(path, "expected a value key")
    return resolve(DATA, node, path)


def parse_title(title, path):
    if not isinstance(title, str):
        fail(path, "title must be a string")
    if len(SERIF_RE.findall(title)) > 1:
        fail(path, "one serif phrase")
    visible = SERIF_RE.sub(lambda match: match.group(1), title)
    if digits(visible):
        fail(path, "digits in copy; use a value key")
    if len(visible) > 60:
        fail(path, f"{len(visible)} characters, limit 60")
    if not visible.endswith("."):
        fail(path, "title must end with a full stop")
    parts = []
    cursor = 0
    for match in SERIF_RE.finditer(title):
        if match.start() > cursor:
            parts.append(title[cursor:match.start()])
        parts.append(I(match.group(1)))
        cursor = match.end()
    if cursor < len(title):
        parts.append(title[cursor:])
    parts = [part for part in parts if part != ""]
    return visible, parts or [visible]


def no_autofit(frame):
    frame.word_wrap = True
    body = frame._txBody.find(qn("a:bodyPr"))
    if body is None:
        return
    for tag in ("a:normAutofit", "a:spAutoFit"):
        for node in body.findall(qn(tag)):
            body.remove(node)
    if body.find(qn("a:noAutofit")) is None:
        etree.SubElement(body, qn("a:noAutofit"))


def put_title(deck, slide, index, spec, path, size=None, anchor="t"):
    visible, runs = parse_title(spec["title"], path)
    if size is None:
        size = 32 if len(visible) > 36 else 36
    color = K["white"] if slide._am_dark else K["ink"]
    shape = deck.fill(slide, index, runs, base=dict(size=size, color=color, font=HEAD), align="l")
    no_autofit(shape.text_frame)
    shape.text_frame.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    shape.name = path
    return shape


def say(slide, x, y, w, h, content, path, size=13, color=None, font=None, align=None, anchor="t"):
    shape = tb(
        slide, x, y, w, h, content, size=size, color=color or K["ink"],
        font=font or BODY, align=align, valign=anchor,
    )
    shape.name = path
    no_autofit(shape.text_frame)
    return shape


def fill_named(deck, slide, index, content, path, size, color, font=None):
    shape = deck.fill(slide, index, content, base=dict(size=size, color=color, font=font or BODY), align="l")
    no_autofit(shape.text_frame)
    shape.name = path
    return shape


def require(spec, field, path):
    if field not in spec:
        fail(path, f"missing {field}")
    return spec[field]


def variant(spec, path, allowed):
    name = spec.get("variant")
    if name not in allowed:
        fail(path, f"variant must be {' or '.join(allowed)}")
    return name


def with_pace(label):
    stripped = label.strip()
    if stripped.lower().rstrip(".") == "spend pace":
        return stripped.rstrip(".") + " of expected to date"
    return label


def insight_card(slide, path, spec, table_top, row_h, row_count):
    insight = text_of(require(spec, "insight", f"{path}.insight"), f"{path}.insight", 160)
    top = table_top + row_h * row_count + 0.18
    height = 6.7 - top
    if height < 1.2:
        height = 1.2
        top = 6.7 - height
    card(slide, 0.6, top, 12.13, height, K["sand"])
    tag(slide, 0.82, top + (height / 2) - 0.16, "Insight", K["sky"], K["ink"])
    say(slide, 2.35, top + 0.12, 10.1, height - 0.24, insight, f"{path}.insight", size=15, color=K["ink"], anchor="m")


def fg(slide):
    return K["white"] if slide._am_dark else K["ink"]


def muted(slide):
    return K["mutedB"] if slide._am_dark else K["muted"]


def magnitude(text):
    raw = text.replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        return abs(float(raw))
    except ValueError:
        return 0.0


def photo_at(photos, index, path):
    if not isinstance(index, int) or isinstance(index, bool) or index < 0 or index >= len(photos):
        fail(path, "photo index out of range")
    return photos[index]


def build_cover(deck, spec, index, photos):
    path = f"slides.{index}"
    kind = variant(spec, path, ("sand", "black"))
    slide = deck.clone(3 if kind == "sand" else 2)
    color = K["white"] if kind == "black" else K["ink"]
    visible, runs = parse_title(require(spec, "title", f"{path}.title"), f"{path}.title")
    size = 32 if len(visible) > 28 else 36
    shape = deck.fill(slide, 103, runs, base=dict(size=size, color=color, font=HEAD), align="l")
    no_autofit(shape.text_frame)
    shape.text_frame.vertical_anchor = MSO_ANCHOR.BOTTOM
    shape.name = f"{path}.title"
    subtitle = key_of(require(spec, "subtitle", f"{path}.subtitle"), f"{path}.subtitle")
    sub = deck.fill(slide, 104, subtitle, base=dict(size=16, color=muted(slide), font=BODY), align="l")
    no_autofit(sub.text_frame)
    sub.name = f"{path}.subtitle"
    for slot, photo in zip((105, 106, 107), photos):
        deck.photo(slide, slot, photo, kind="arch")
    client = DATA.get("clientName") if isinstance(DATA.get("clientName"), str) else "client"
    deck.drop(slide, 101)
    deck.photo_slot(slide, 102, client + " logo", kind="round")
    return slide


def build_summary(deck, spec, index):
    path = f"slides.{index}"
    kind = variant(spec, path, ("stat-row", "statement"))
    if kind == "statement":
        slide = deck.add("Statement - Black")
        put_title(deck, slide, 100, spec, f"{path}.title", size=32, anchor="m")
        support = text_of(require(spec, "support", f"{path}.support"), f"{path}.support", 140)
        fill_named(deck, slide, 101, support, f"{path}.support", 16, K["white"])
        arch(slide, 11.15, 5.2, 0.62, 1.35, K["lime"])
        arch(slide, 11.9, 4.55, 0.55, 2.0, K["sky"])
        return slide
    slide = deck.add("Title Only - White")
    put_title(deck, slide, 100, spec, f"{path}.title")
    stats = require(spec, "stats", f"{path}.stats")
    if not isinstance(stats, list) or not stats or len(stats) > 4:
        fail(f"{path}.stats", "1 to 4 stats")
    gap = 0.16
    width = (12.13 - gap * (len(stats) - 1)) / len(stats)
    for stat_index, stat in enumerate(stats):
        at = f"{path}.stats.{stat_index}"
        if not isinstance(stat, dict):
            fail(at, "expected an object")
        label = with_pace(text_of(require(stat, "label", f"{at}.label"), f"{at}.label", 24))
        value = key_of(require(stat, "key", f"{at}.key"), f"{at}.key")
        x = 0.6 + stat_index * (width + gap)
        card(slide, x, 2.0, width, 2.22, K["sand"])
        numdot(slide, x + 0.14, 2.14, stat_index + 1, K["forest"], K["white"], 0.36)
        say(slide, x + 0.14, 2.58, width - 0.28, 0.7, value, f"{at}.key", size=22 if len(value) > 12 else 26, color=K["forest"], font=HEAD)
        tall = len(label) > 18
        say(slide, x + 0.14, 3.28, width - 0.28, 0.48 if tall else 0.32, label, f"{at}.label", size=11 if tall else 12, color=K["ink"])
        if stat.get("note") is not None:
            note = text_of(stat["note"], f"{at}.note", 48)
            say(slide, x + 0.14, 3.78 if tall else 3.6, width - 0.28, 0.38, note, f"{at}.note", size=11, color=K["muted"])
    outcome = text_of(require(spec, "outcome", f"{path}.outcome"), f"{path}.outcome", 160)
    card(slide, 0.6, 4.35, 12.13, 2.15, K["sand"])
    tag(slide, 0.82, 4.55, "Outcome", K["lime"], K["ink"])
    say(slide, 0.82, 5.1, 11.7, 1.15, outcome, f"{path}.outcome", size=16, color=K["ink"])
    return slide


def bars(slide, x, y, width, label, value, path, max_value):
    say(slide, x, y, width * 0.62, 0.28, label, path + ".label", size=12, color=K["ink"])
    say(slide, x + width * 0.62, y, width * 0.38, 0.28, value, path + ".value", size=12, color=K["forest"], font=HEAD, align="r")
    pill(slide, x, y + 0.32, width, 0.18, K["white"])
    ratio = 0 if max_value <= 0 else min(1, magnitude(value) / max_value)
    pill(slide, x, y + 0.32, max(0.18, width * ratio), 0.18, K["forest"])


def build_channel(deck, spec, index, photos):
    path = f"slides.{index}"
    kind = variant(spec, path, ("bars", "cards", "photo"))
    if kind == "bars":
        slide = deck.add("Title Only - Sand")
        put_title(deck, slide, 100, spec, f"{path}.title")
        spend = key_of(require(spec, "spend", f"{path}.spend"), f"{path}.spend")
        expected = key_of(require(spec, "expected", f"{path}.expected"), f"{path}.expected")
        spend_label = text_of(spec.get("spendLabel") or "Spend", f"{path}.spendLabel", 24)
        expected_label = text_of(spec.get("expectedLabel") or "Expected", f"{path}.expectedLabel", 24)
        cap = max(magnitude(spend), magnitude(expected), 1)
        bars(slide, 0.6, 1.95, 12.13, spend_label, spend, f"{path}.spend", cap)
        bars(slide, 0.6, 2.62, 12.13, expected_label, expected, f"{path}.expected", cap)
        delivery = require(spec, "delivery", f"{path}.delivery")
        if not isinstance(delivery, list) or not delivery or len(delivery) > 4:
            fail(f"{path}.delivery", "1 to 4 delivery figures")
        gap = 0.14
        card_w = (12.13 - gap * (len(delivery) - 1)) / len(delivery)
        for item_index, item in enumerate(delivery):
            at = f"{path}.delivery.{item_index}"
            if not isinstance(item, dict):
                fail(at, "expected an object")
            label = with_pace(text_of(require(item, "label", f"{at}.label"), f"{at}.label", 24))
            value = key_of(require(item, "key", f"{at}.key"), f"{at}.key")
            x = 0.6 + item_index * (card_w + gap)
            card(slide, x, 3.5, card_w, 1.28, K["white"])
            say(slide, x + 0.12, 3.58, card_w - 0.24, 0.55, value, f"{at}.key", size=14 if len(value) > 14 else 18, color=K["forest"], font=HEAD)
            say(slide, x + 0.12, 4.16, card_w - 0.24, 0.42, label, f"{at}.label", size=12, color=K["muted"])
        insight = text_of(require(spec, "insight", f"{path}.insight"), f"{path}.insight", 160)
        card(slide, 0.6, 4.98, 12.13, 1.52, K["white"])
        tag(slide, 0.82, 5.16, "Insight", K["sky"], K["ink"])
        say(slide, 2.35, 5.12, 10.1, 1.2, insight, f"{path}.insight", size=14, color=K["ink"], anchor="m")
        return slide
    if kind == "cards":
        slide = deck.add("Three Cards")
        put_title(deck, slide, 100, spec, f"{path}.title")
        cards = require(spec, "cards", f"{path}.cards")
        if not isinstance(cards, list) or len(cards) != 3:
            fail(f"{path}.cards", "exactly 3 cards")
        slots = ((103, 104), (107, 108), (111, 112))
        for item_index, (item, (head, body)) in enumerate(zip(cards, slots)):
            at = f"{path}.cards.{item_index}"
            if not isinstance(item, dict):
                fail(at, "expected an object")
            heading = with_pace(text_of(require(item, "title", f"{at}.title"), f"{at}.title", 32))
            value = key_of(require(item, "key", f"{at}.key"), f"{at}.key")
            copy = text_of(require(item, "body", f"{at}.body"), f"{at}.body", 120)
            fill_named(deck, slide, head, heading, f"{at}.title", 13 if len(heading) > 18 else 16, K["ink"], HEAD)
            fill_named(
                deck, slide, body,
                [[Run(value, font=HEAD, color=K["forest"], size=26)], [copy]],
                f"{at}.body", 14, K["body"],
            )
        return slide
    slide = deck.add("Photo and Text")
    put_title(deck, slide, 100, spec, f"{path}.title", size=32)
    value = key_of(require(spec, "value", f"{path}.value"), f"{path}.value")
    body = text_of(require(spec, "body", f"{path}.body"), f"{path}.body", 200)
    fill_named(
        deck, slide, 101,
        [[Run(value, font=HEAD, color=K["forest"], size=32)], [body]],
        f"{path}.body", 16, K["ink"],
    )
    photo = photo_at(photos, spec.get("photo", 0), f"{path}.photo")
    deck.photo(slide, 102, photo, kind="arch")
    return slide


def build_not_live(deck, spec, index):
    path = f"slides.{index}"
    kind = variant(spec, path, ("cards", "list"))
    slide = deck.add("Title Only - White")
    put_title(deck, slide, 100, spec, f"{path}.title")
    cards = None
    from_list = False
    if kind == "list":
        rows = require(spec, "rows", f"{path}.rows")
        if not isinstance(rows, list) or not rows or len(rows) > 5:
            fail(f"{path}.rows", "1 to 5 rows")
        if len(rows) <= 2:
            cards = rows
            from_list = True
            kind = "cards"
    if kind == "cards":
        if cards is None:
            cards = require(spec, "cards", f"{path}.cards")
        if not isinstance(cards, list) or not cards or len(cards) > 4:
            fail(f"{path}.cards", "1 to 4 cards")
        gap = 0.18
        width = 6.4 if len(cards) == 1 else (12.13 - gap * (len(cards) - 1)) / len(cards)
        if len(cards) == 1:
            arch(slide, 8.15, 3.55, 1.05, 1.9, K["sky"])
            arch(slide, 9.4, 2.85, 1.1, 2.6, K["forest"])
            arch(slide, 10.7, 2.15, 1.15, 3.3, K["lime"])
        for item_index, item in enumerate(cards):
            at = f"{path}.cards.{item_index}"
            if not isinstance(item, dict):
                fail(at, "expected an object")
            label = text_of(require(item, "label", f"{at}.label"), f"{at}.label", 32)
            budget = key_of(require(item, "budget", f"{at}.budget"), f"{at}.budget")
            status = text_of(item["status"], f"{at}.status", 48) if item.get("status") is not None else None
            note = text_of(item["note"], f"{at}.note", 80) if item.get("note") is not None else None
            if from_list and note is None:
                fail(at, "missing note")
            if not from_list and status is None:
                fail(at, "missing status")
            x = 0.6 + item_index * (width + gap)
            card(slide, x, 2.15, width, 3.55, K["sand"])
            tag(slide, x + 0.2, 2.32, "Planned", K["lime"], K["ink"])
            say(slide, x + 0.2, 2.82, width - 0.4, 0.36, label, f"{at}.label", size=16, color=K["ink"], font=HEAD)
            say(slide, x + 0.2, 3.24, width - 0.4, 0.55, budget, f"{at}.budget", size=22 if len(budget) > 12 else 28, color=K["forest"], font=HEAD)
            y = 3.9
            if status is not None:
                say(slide, x + 0.2, y, width - 0.4, 0.55, status, f"{at}.status", size=14, color=K["body"])
                y += 0.6
            if note is not None:
                say(slide, x + 0.2, y, width - 0.4, 0.7, note, f"{at}.note", size=14, color=K["body"])
        return slide
    rows = require(spec, "rows", f"{path}.rows")
    if not isinstance(rows, list) or not rows or len(rows) > 5:
        fail(f"{path}.rows", "1 to 5 rows")
    for item_index, item in enumerate(rows):
        at = f"{path}.rows.{item_index}"
        if not isinstance(item, dict):
            fail(at, "expected an object")
        label = text_of(require(item, "label", f"{at}.label"), f"{at}.label", 32)
        budget = key_of(require(item, "budget", f"{at}.budget"), f"{at}.budget")
        note = text_of(require(item, "note", f"{at}.note"), f"{at}.note", 80)
        y = 2.15 + item_index * 0.85
        numdot(slide, 0.6, y, item_index + 1, K["forest"], K["white"], 0.42)
        say(slide, 1.25, y, 4.2, 0.42, label, f"{at}.label", size=16, color=K["ink"], font=HEAD, anchor="m")
        say(slide, 5.6, y, 3.2, 0.42, budget, f"{at}.budget", size=16, color=K["forest"], font=HEAD, anchor="m")
        say(slide, 8.9, y, 3.8, 0.42, note, f"{at}.note", size=14, color=K["body"], anchor="m")
        line(slide, 1.25, y + 0.62, 11.4, K["line"], 1.25)
    return slide


def build_kpi(deck, spec, index):
    path = f"slides.{index}"
    kind = variant(spec, path, ("four-cards", "table"))
    if kind == "table":
        slide = deck.add("Title Only - White")
        put_title(deck, slide, 100, spec, f"{path}.title")
        rows = require(spec, "rows", f"{path}.rows")
        if not isinstance(rows, list) or not rows:
            fail(f"{path}.rows", "at least one row")
        table_rows = [["KPI", "Target", "Actual"]]
        for item_index, item in enumerate(rows):
            at = f"{path}.rows.{item_index}"
            if not isinstance(item, dict):
                fail(at, "expected an object")
            table_rows.append([
                key_of(require(item, "label", f"{at}.label"), f"{at}.label"),
                key_of(require(item, "target", f"{at}.target"), f"{at}.target"),
                key_of(require(item, "actual", f"{at}.actual"), f"{at}.actual"),
            ])
        grid = table(slide, 0.6, 2.15, 12.13, table_rows, widths=[3, 4, 4], size=13, head=True, first_bold=True, row_h=0.42)
        grid.name = f"{path}.table"
        line(slide, 0.6, 2.05, 2.2, K["forest"], 2.5)
        insight_card(slide, path, spec, 2.15, 0.42, len(table_rows))
        return slide
    slide = deck.add("Four Cards")
    put_title(deck, slide, 100, spec, f"{path}.title")
    cards = require(spec, "cards", f"{path}.cards")
    if not isinstance(cards, list) or not cards or len(cards) > 4:
        fail(f"{path}.cards", "1 to 4 cards")
    slots = ((103, 104), (107, 108), (111, 112), (115, 116))
    for item_index, (head, body) in enumerate(slots):
        if item_index >= len(cards):
            deck.drop(slide, head, body)
            continue
        item = cards[item_index]
        at = f"{path}.cards.{item_index}"
        if not isinstance(item, dict):
            fail(at, "expected an object")
        label = key_of(require(item, "label", f"{at}.label"), f"{at}.label")
        actual = key_of(require(item, "actual", f"{at}.actual"), f"{at}.actual")
        target = key_of(require(item, "target", f"{at}.target"), f"{at}.target")
        fill_named(deck, slide, head, label, f"{at}.label", 14, K["ink"], HEAD)
        fill_named(
            deck, slide, body,
            [[Run(actual, font=HEAD, color=K["forest"], size=20)], [f"Target {target}"]],
            f"{at}.actual", 12, K["muted"],
        )
    return slide


def build_iao(deck, spec, index):
    path = f"slides.{index}"
    kind = variant(spec, path, ("rows", "journey"))
    if kind == "journey":
        slide = deck.add("Title Only - White")
        put_title(deck, slide, 100, spec, f"{path}.title")
        steps = require(spec, "steps", f"{path}.steps")
        if not isinstance(steps, list) or len(steps) != 3:
            fail(f"{path}.steps", "exactly 3 steps")
        colours = (K["sky"], K["forest"], K["lime"])
        tags = ("Insight", "Action", "Outcome")
        journey(slide, 0.9, 2.25, 11.5, colours, d=0.46, lc=K["ink"])
        for item_index, item in enumerate(steps):
            at = f"{path}.steps.{item_index}"
            if not isinstance(item, dict):
                fail(at, "expected an object")
            label = text_of(require(item, "label", f"{at}.label"), f"{at}.label", 24)
            copy = text_of(require(item, "text", f"{at}.text"), f"{at}.text", words=35)
            x = 0.6 + item_index * 4.15
            tag(slide, x, 3.0, tags[item_index], colours[item_index], K["ink"] if item_index != 1 else K["white"])
            say(slide, x, 3.5, 3.8, 0.4, label, f"{at}.label", size=16, color=K["ink"], font=HEAD)
            say(slide, x, 4.0, 3.8, 1.6, copy, f"{at}.text", size=14, color=K["body"])
        return slide
    slide = deck.add("Title Only - Black")
    put_title(deck, slide, 100, spec, f"{path}.title")
    rows = require(spec, "rows", f"{path}.rows")
    if not isinstance(rows, list) or not rows or len(rows) > 4:
        fail(f"{path}.rows", "1 to 4 rows")
    colours = {"insight": (K["sky"], K["ink"], "Insight"), "action": (K["forest"], K["white"], "Action"), "outcome": (K["lime"], K["ink"], "Outcome")}
    for item_index, item in enumerate(rows):
        at = f"{path}.rows.{item_index}"
        if not isinstance(item, dict):
            fail(at, "expected an object")
        tag_name = item.get("tag")
        if tag_name not in colours:
            fail(f"{at}.tag", "insight, action or outcome")
        copy = text_of(require(item, "text", f"{at}.text"), f"{at}.text", words=35)
        fill, ink, label = colours[tag_name]
        y = 2.05 + item_index * 1.1
        tag(slide, 0.6, y, label, fill, ink)
        say(slide, 2.35, y, 10.2, 0.85, copy, f"{at}.text", size=15, color=K["white"], anchor="m")
    return slide


def build_appendix(deck, spec, index):
    path = f"slides.{index}"
    if spec.get("variant") not in (None, "table"):
        fail(path, "variant must be table")
    slide = deck.add("Title Only - White")
    put_title(deck, slide, 100, spec, f"{path}.title")
    columns = require(spec, "columns", f"{path}.columns")
    rows = require(spec, "rows", f"{path}.rows")
    if not isinstance(columns, list) or not columns:
        fail(f"{path}.columns", "at least one column")
    if not isinstance(rows, list) or not rows:
        fail(f"{path}.rows", "at least one row")
    header = []
    for col_index, column in enumerate(columns):
        header.append(text_of(column, f"{path}.columns.{col_index}", 18))
    table_rows = [header]
    width = len(header)
    for row_index, row in enumerate(rows):
        if not isinstance(row, list) or len(row) != width:
            fail(f"{path}.rows.{row_index}", f"{width} keys")
        table_rows.append([key_of(cell, f"{path}.rows.{row_index}.{cell_index}") for cell_index, cell in enumerate(row)])
    grid = table(slide, 0.6, 2.15, 12.13, table_rows, size=12, head=True, first_bold=True, row_h=0.42)
    grid.name = f"{path}.table"
    line(slide, 0.6, 2.05, 2.2, K["forest"], 2.5)
    insight_card(slide, path, spec, 2.15, 0.42, len(table_rows))
    return slide


def build_close(deck, spec, index, photos):
    path = f"slides.{index}"
    kind = variant(spec, path, ("thank-you", "cta"))
    if kind == "thank-you":
        slide = deck.clone(21)
        visible, runs = parse_title(require(spec, "title", f"{path}.title"), f"{path}.title")
        size = 32 if len(visible) > 28 else 36
        shape = deck.fill(slide, 101, runs, base=dict(size=size, color=K["white"], font=HEAD), align="l")
        no_autofit(shape.text_frame)
        shape.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
        shape.name = f"{path}.title"
        deck.photo(slide, 103, photos[0], kind="arch")
        return slide
    slide = deck.add("Title Only - Black")
    put_title(deck, slide, 100, spec, f"{path}.title")
    support = text_of(require(spec, "support", f"{path}.support"), f"{path}.support", 140)
    button = text_of(require(spec, "button", f"{path}.button"), f"{path}.button", 24)
    say(slide, 0.6, 2.3, 7.6, 1.4, support, f"{path}.support", size=18, color=K["white"])
    btn(slide, 0.6, 4.3, button, primary=True)
    trio(slide, 8.4, 6.55, 0.95, dark=True)
    return slide


BUILDERS = {
    "cover": build_cover,
    "summary": build_summary,
    "channel": build_channel,
    "not-live": build_not_live,
    "kpi": build_kpi,
    "iao": build_iao,
    "appendix": build_appendix,
    "close": build_close,
}


def validate_content(content):
    """Schema checks that do not need report-data.json. Resolved string length is checked at build."""
    errors = []

    def bad(path, message):
        errors.append(f"{path}: {message}")

    def prose(node, path, limit=None, words=None):
        if node is None:
            bad(path, "missing")
            return
        if isinstance(node, str) and KEY_RE.fullmatch(node):
            return
        if isinstance(node, str):
            if digits(node):
                bad(path, "digits in copy; use a value key")
            elif limit is not None and len(node) > limit:
                bad(path, f"{len(node)} characters, limit {limit}")
            if words is not None and len(re.findall(r"\S+", node)) > words:
                bad(path, f"over {words} words")
            return
        if isinstance(node, list):
            length = 0
            count = 0
            for index, part in enumerate(node):
                at = f"{path}.{index}"
                if isinstance(part, str):
                    if digits(part):
                        bad(at, "digits in copy; use a value key")
                    length += len(part)
                    count += len(re.findall(r"\S+", part))
                elif isinstance(part, dict) and isinstance(part.get("k"), str) and len(part) == 1:
                    if not KEY_RE.fullmatch(part["k"]):
                        bad(f"{at}.k", "expected a value key")
                    count += 1
                else:
                    bad(at, 'expected copy or {"k": path}')
            if limit is not None and length > limit:
                bad(path, f"{length} characters, limit {limit}")
            if words is not None and count > words:
                bad(path, f"over {words} words")
            return
        bad(path, "expected copy or a value key")

    def key(node, path):
        if not isinstance(node, str) or not KEY_RE.fullmatch(node):
            bad(path, "expected a value key")

    def title(spec, path):
        if "title" not in spec:
            bad(f"{path}.title", "missing title")
            return
        try:
            parse_title(spec["title"], f"{path}.title")
        except BuildError as error:
            errors.append(str(error))

    def variant_name(spec, path, allowed):
        name = spec.get("variant")
        if name not in allowed:
            bad(path, f"variant must be {' or '.join(allowed)}")
            return None
        return name

    def items(node, path, low, high, noun):
        if not isinstance(node, list) or len(node) < low or (high is not None and len(node) > high):
            span = str(low) if low == high else (f"{low} to {high}" if high is not None else f"at least {low}")
            bad(path, f"{span} {noun}")
            return []
        return node

    if not isinstance(content, dict) or not isinstance(content.get("slides"), list) or not content["slides"]:
        return ["slides: expected a slide list"]

    for index, spec in enumerate(content["slides"]):
        path = f"slides.{index}"
        if not isinstance(spec, dict):
            bad(path, "expected an object")
            continue
        kind = spec.get("type")
        if kind not in BUILDERS:
            bad(path, "unknown slide type")
            continue
        title(spec, path)
        if kind == "cover":
            name = variant_name(spec, path, ("sand", "black"))
            if name is not None:
                key(spec.get("subtitle"), f"{path}.subtitle")
        elif kind == "summary":
            name = variant_name(spec, path, ("stat-row", "statement"))
            if name == "statement":
                prose(spec.get("support"), f"{path}.support", 140)
            elif name == "stat-row":
                for item_index, item in enumerate(items(spec.get("stats"), f"{path}.stats", 1, 4, "stats")):
                    at = f"{path}.stats.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    prose(item.get("label"), f"{at}.label", 24)
                    key(item.get("key"), f"{at}.key")
                    if item.get("note") is not None:
                        prose(item.get("note"), f"{at}.note", 48)
                prose(spec.get("outcome"), f"{path}.outcome", 160)
        elif kind == "channel":
            name = variant_name(spec, path, ("bars", "cards", "photo"))
            if name == "bars":
                key(spec.get("spend"), f"{path}.spend")
                key(spec.get("expected"), f"{path}.expected")
                if spec.get("spendLabel") is not None:
                    prose(spec.get("spendLabel"), f"{path}.spendLabel", 24)
                if spec.get("expectedLabel") is not None:
                    prose(spec.get("expectedLabel"), f"{path}.expectedLabel", 24)
                for item_index, item in enumerate(items(spec.get("delivery"), f"{path}.delivery", 1, 4, "delivery figures")):
                    at = f"{path}.delivery.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    prose(item.get("label"), f"{at}.label", 24)
                    key(item.get("key"), f"{at}.key")
                prose(spec.get("insight"), f"{path}.insight", 160)
            elif name == "cards":
                cards = items(spec.get("cards"), f"{path}.cards", 3, 3, "cards")
                for item_index, item in enumerate(cards):
                    at = f"{path}.cards.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    prose(item.get("title"), f"{at}.title", 32)
                    key(item.get("key"), f"{at}.key")
                    prose(item.get("body"), f"{at}.body", 120)
            elif name == "photo":
                key(spec.get("value"), f"{path}.value")
                prose(spec.get("body"), f"{path}.body", 200)
                photo = spec.get("photo", 0)
                if not isinstance(photo, int) or isinstance(photo, bool) or photo not in (0, 1, 2):
                    bad(f"{path}.photo", "photo index out of range")
        elif kind == "not-live":
            name = variant_name(spec, path, ("cards", "list"))
            if name == "cards":
                for item_index, item in enumerate(items(spec.get("cards"), f"{path}.cards", 1, 4, "cards")):
                    at = f"{path}.cards.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    prose(item.get("label"), f"{at}.label", 32)
                    key(item.get("budget"), f"{at}.budget")
                    prose(item.get("status"), f"{at}.status", 48)
                    if item.get("note") is not None:
                        prose(item.get("note"), f"{at}.note", 80)
            elif name == "list":
                rows = items(spec.get("rows"), f"{path}.rows", 1, 5, "rows")
                if rows and len(rows) <= 2:
                    bad(f"{path}.rows", "list is not allowed for 1 or 2 channels; use cards")
                for item_index, item in enumerate(rows):
                    at = f"{path}.rows.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    prose(item.get("label"), f"{at}.label", 32)
                    key(item.get("budget"), f"{at}.budget")
                    prose(item.get("note"), f"{at}.note", 80)
        elif kind == "kpi":
            name = variant_name(spec, path, ("four-cards", "table"))
            group = "cards" if name == "four-cards" else "rows"
            if name is not None:
                entries = items(spec.get(group), f"{path}.{group}", 1, 4 if name == "four-cards" else None, group)
                for item_index, item in enumerate(entries):
                    at = f"{path}.{group}.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    key(item.get("label"), f"{at}.label")
                    key(item.get("actual"), f"{at}.actual")
                    key(item.get("target"), f"{at}.target")
                if name == "table":
                    prose(spec.get("insight"), f"{path}.insight", 160)
        elif kind == "iao":
            name = variant_name(spec, path, ("rows", "journey"))
            if name == "journey":
                for item_index, item in enumerate(items(spec.get("steps"), f"{path}.steps", 3, 3, "steps")):
                    at = f"{path}.steps.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    prose(item.get("label"), f"{at}.label", 24)
                    prose(item.get("text"), f"{at}.text", words=35)
            elif name == "rows":
                for item_index, item in enumerate(items(spec.get("rows"), f"{path}.rows", 1, 4, "rows")):
                    at = f"{path}.rows.{item_index}"
                    if not isinstance(item, dict):
                        bad(at, "expected an object")
                        continue
                    if item.get("tag") not in ("insight", "action", "outcome"):
                        bad(f"{at}.tag", "insight, action or outcome")
                    prose(item.get("text"), f"{at}.text", words=35)
        elif kind == "appendix":
            if spec.get("variant") not in (None, "table"):
                bad(path, "variant must be table")
            columns = spec.get("columns")
            rows = spec.get("rows")
            if not isinstance(columns, list) or not columns:
                bad(f"{path}.columns", "at least one column")
                columns = []
            else:
                for col_index, column in enumerate(columns):
                    prose(column, f"{path}.columns.{col_index}", 18)
            if not isinstance(rows, list) or not rows:
                bad(f"{path}.rows", "at least one row")
            else:
                for row_index, row in enumerate(rows):
                    if not isinstance(row, list) or len(row) != len(columns):
                        bad(f"{path}.rows.{row_index}", f"{len(columns)} keys")
                        continue
                    for cell_index, cell in enumerate(row):
                        key(cell, f"{path}.rows.{row_index}.{cell_index}")
            prose(spec.get("insight"), f"{path}.insight", 160)
        elif kind == "close":
            name = variant_name(spec, path, ("thank-you", "cta"))
            if name == "cta":
                prose(spec.get("support"), f"{path}.support", 140)
                prose(spec.get("button"), f"{path}.button", 24)
    return errors


def build(content, data, template, out, photos):
    global DATA
    DATA = data
    if not isinstance(content, dict) or not isinstance(content.get("slides"), list) or not content["slides"]:
        fail("slides", "expected a slide list")
    if len(photos) != 3:
        fail("photos", "expected 3 photos")
    for photo in photos:
        if not os.path.isfile(photo):
            fail("photos", f"missing photo {photo}")
    deck = Deck(template)
    for index, spec in enumerate(content["slides"]):
        path = f"slides.{index}"
        if not isinstance(spec, dict):
            fail(path, "expected an object")
        kind = spec.get("type")
        if kind not in BUILDERS:
            fail(path, "unknown slide type")
        if kind in ("cover", "channel", "close"):
            slide = BUILDERS[kind](deck, spec, index, photos)
        else:
            slide = BUILDERS[kind](deck, spec, index)
        deck.notes(slide, f"CHECK slides.{index} {kind} {spec.get('variant', 'table')}")
    deck.save(out)
    return out


def main():
    if len(sys.argv) != 8:
        sys.stderr.write("usage: build_report.py content.json report-data.json template.potx out.pptx photo1 photo2 photo3\n")
        return 2
    content_path, data_path, template, out, *photos = sys.argv[1:]
    with open(content_path, encoding="utf-8") as handle:
        content = json.load(handle)
    with open(data_path, encoding="utf-8") as handle:
        data = json.load(handle)
    try:
        built = build(content, data, template, out, photos)
    except BuildError as error:
        sys.stderr.write(f"error: {error}\n")
        return 1
    sys.stdout.write(built + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
