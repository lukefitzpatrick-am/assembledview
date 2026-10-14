"""Local checks for the v5 deck builder. No API calls."""
import importlib.util
import json
import os
import sys
import zipfile

from pptx.enum.shapes import MSO_SHAPE

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "av-campaign-report-v5", "scripts")
TEMPLATE = os.path.join(HERE, "kit", "assembled-brand-kit", "templates", "Assembled-Media-Template-v5.potx")
DATA = os.path.join(HERE, "out", "hema007-v5-report-data.json")
OUT = os.path.join(HERE, "out")


def load(name):
    path = os.path.join(SCRIPTS, name)
    spec = importlib.util.spec_from_file_location(name.replace(".py", ""), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fail(message):
    raise SystemExit(message)


def test_missing_key():
    build = load("build_report.py")
    try:
        build.resolve({"summary": {"spend": "$1.00"}}, "summary.missing", "slides.0.spend")
    except build.BuildError as error:
        if "missing key summary.missing" not in str(error):
            fail(f"missing key message was {error}")
        return
    fail("missing key did not fail")


def test_overflow_title():
    am = load("am_rebrand.py")
    check = load("check_deck.py")
    deck = am.Deck(TEMPLATE)
    slide = deck.add("Title Only - White")
    deck.fill(slide, 100, ("A" * 299) + ".")
    path = os.path.join(OUT, "overflow-title.pptx")
    deck.save(path)
    issues = check.check(path, DATA)
    if not any("overflow" in issue and "title" in issue or "overflow" in issue for issue in issues):
        fail(f"300-character title was not flagged: {issues}")


def test_palette():
    am = load("am_rebrand.py")
    check = load("check_deck.py")
    deck = am.Deck(TEMPLATE)
    slide = deck.add("Title Only - White")
    deck.fill(slide, 100, "A short title.")
    am.shape(slide, MSO_SHAPE.RECTANGLE, 1, 2, 1, 1, "00FFFF")
    path = os.path.join(OUT, "palette-flag.pptx")
    deck.save(path)
    issues = check.check(path, DATA)
    if not any("00FFFF" in issue for issue in issues):
        fail(f"00FFFF was not flagged: {issues}")


def test_validate():
    build = load("build_report.py")
    short_list = {
        "slides": [{
            "type": "not-live",
            "variant": "list",
            "title": "Search is {i:\"yet to launch\"}.",
            "rows": [{"label": "Search", "budget": "notLive.0.plannedBudget", "note": "Launch date to be confirmed."}],
        }],
    }
    errors = build.validate_content(short_list)
    if not any("use cards" in error for error in errors):
        fail(f"short list was allowed: {errors}")
    missing_insight = {
        "slides": [{
            "type": "kpi",
            "variant": "table",
            "title": "Rates {i:\"sit below\"} target.",
            "rows": [{"label": "kpis.0.label", "actual": "kpis.0.actualDisplay", "target": "kpis.0.targetDisplay"}],
        }],
    }
    errors = build.validate_content(missing_insight)
    if not any("insight" in error for error in errors):
        fail(f"missing insight was allowed: {errors}")
    bad_variant = {
        "slides": [{
            "type": "summary",
            "variant": "grid",
            "title": "Spend sits {i:\"behind pace\"}.",
        }],
    }
    errors = build.validate_content(bad_variant)
    if not any("variant" in error for error in errors):
        fail(f"bad variant was allowed: {errors}")
    typed = {
        "slides": [{
            "type": "summary",
            "variant": "stat-row",
            "title": "Spend sits {i:\"behind pace\"}.",
            "stats": [{"label": "Spend pace", "key": "35%"}],
            "outcome": "Search is still on the plan.",
        }],
    }
    errors = build.validate_content(typed)
    if not any("value key" in error for error in errors):
        fail(f"typed percent was allowed: {errors}")
    accepted = {
        "slides": [
            {
                "type": "breaker",
                "variant": "black",
                "title": "Where the month {i:\"stands\"}.",
            },
            {
                "type": "recommendations",
                "variant": "cards",
                "title": "What to {i:\"do\"} next.",
                "cards": [
                    {"heading": "Hold the Meta mix.", "body": "Keep the current mix and watch the rate."},
                    {"heading": "Bring Search forward.", "body": "Shift weight toward the terms that convert."},
                    {"heading": "Launch TikTok.", "body": "The planned flight is still waiting to start."},
                ],
            },
        ],
    }
    errors = build.validate_content(accepted)
    if errors:
        fail(f"new slide types were rejected: {errors}")
    long_title = {
        "slides": [{
            "type": "breaker",
            "variant": "black",
            "title": ("A" * 60) + ".",
        }],
    }
    errors = build.validate_content(long_title)
    if not any("limit 60" in error for error in errors):
        fail(f"long breaker title was allowed: {errors}")
    long_heading = {
        "slides": [{
            "type": "recommendations",
            "variant": "cards",
            "title": "What to {i:\"do\"} next.",
            "cards": [
                {"heading": "A" * 41, "body": "Keep the current mix."},
                {"heading": "Bring Search forward.", "body": "B" * 221},
            ],
        }],
    }
    errors = build.validate_content(long_heading)
    if not any("limit 40" in error for error in errors):
        fail(f"long heading was allowed: {errors}")
    if not any("limit 220" in error for error in errors):
        fail(f"long body was allowed: {errors}")
    four = {
        "slides": [{
            "type": "recommendations",
            "variant": "cards",
            "title": "What to {i:\"do\"} next.",
            "cards": [
                {"heading": "One.", "body": "First step."},
                {"heading": "Two.", "body": "Second step."},
                {"heading": "Three.", "body": "Third step."},
                {"heading": "Four.", "body": "Fourth step."},
            ],
        }],
    }
    errors = build.validate_content(four)
    if not any("2 to 3" in error for error in errors):
        fail(f"four recommendations were allowed: {errors}")


def slide_text(path):
    text = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if name.startswith("ppt/slides/slide") and name.endswith(".xml"):
                text.append(archive.read(name).decode("utf-8"))
    return "\n".join(text)


def test_pace_and_fallback():
    build = load("build_report.py")
    photos = [
        os.path.join(HERE, "kit", "assembled-brand-kit", "library", name)
        for name in ("pexels-6299928.jpg", "pexels-6786367.jpg", "pexels-13935909.jpg")
    ]
    content = {
        "slides": [
            {
                "type": "summary",
                "variant": "stat-row",
                "title": "Spend sits {i:\"behind pace\"}.",
                "stats": [{"label": "Spend pace", "key": "summary.metrics.spendPacePct"}],
                "outcome": "Search is still on the plan.",
            },
            {
                "type": "not-live",
                "variant": "list",
                "title": "Search is {i:\"yet to launch\"}.",
                "rows": [{
                    "label": "Search",
                    "budget": "notLive.0.plannedBudget",
                    "note": "Launch date to be confirmed.",
                }],
            },
        ],
    }
    with open(DATA, encoding="utf-8") as handle:
        data = json.load(handle)
    out = os.path.join(OUT, "pace-fallback.pptx")
    build.build(content, data, TEMPLATE, out, photos)
    text = slide_text(out)
    if "of expected to date" not in text:
        fail("spend pace label was not extended")
    if "Launch date to be confirmed." not in text:
        fail("short list note was dropped")
    if "Planned" not in text:
        fail("short list did not fall back to cards")


def number_raws(issues):
    return [issue.rsplit(" number ", 1)[-1] for issue in issues if " number " in issue]


def test_number_exemptions():
    """Number dots and the thank-you contact placeholder are the only skips."""
    am = load("am_rebrand.py")
    check = load("check_deck.py")
    deck = am.Deck(TEMPLATE)
    slide = deck.add("Title Only - White")
    deck.fill(slide, 100, "A short title.")
    deck.notes(slide, "CHECK slides.0 summary stat-row")
    box = am.card(slide, 0.8, 2.2, 3.2, 1.1, "FFFFFF")
    am.label_text(box, "$9,999", 18, am.K["ink"])
    am.numdot(slide, 0.8, 3.6, 4, am.K["forest"], am.K["white"], 0.36)
    thank = deck.clone(21)
    deck.notes(thank, "CHECK slides.1 close thank-you")
    deck.fill(thank, 101, "Call extension 42.", base=dict(size=32, color=am.K["white"], font=am.HEAD))
    path = os.path.join(OUT, "number-exemptions.pptx")
    deck.save(path)
    data = os.path.join(OUT, "number-exemptions.json")
    with open(data, "w", encoding="utf-8") as handle:
        json.dump({"summary": {"spend": "$1.00"}}, handle)
    raws = number_raws(check.check(path, data))
    if "$9,999" not in raws:
        fail(f"card $9,999 was not flagged: {raws}")
    if "42" not in raws:
        fail(f"thank-you title 42 was not flagged: {raws}")
    for exempt in ("4", "1", "2", "71", "3205", "97", "2008"):
        if exempt in raws:
            fail(f"{exempt} should be exempt: {raws}")
    report = check.number_issues(path, data)
    report_raws = [item["raw"] for item in report["stray"]]
    if "$9,999" not in report_raws:
        fail(f"shared number check missed $9,999: {report_raws}")
    if "42" not in report_raws:
        fail(f"shared number check missed 42: {report_raws}")
    for exempt in ("4", "1", "2", "71", "3205", "97", "2008"):
        if exempt in report_raws:
            fail(f"shared number check kept {exempt}: {report_raws}")


def test_breaker_and_recommendations_build():
    build = load("build_report.py")
    check = load("check_deck.py")
    photos = [
        os.path.join(HERE, "kit", "assembled-brand-kit", "library", name)
        for name in ("pexels-6299928.jpg", "pexels-6786367.jpg", "pexels-13935909.jpg")
    ]
    with open(DATA, encoding="utf-8") as handle:
        data = json.load(handle)
    shared = {
        "type": "breaker",
        "variant": "black",
        "title": "Where the month {i:\"stands\"}.",
    }
    close = {"type": "close", "variant": "thank-you", "title": "Thanks for {i:\"reading\"}."}

    def cards(count):
        rows = []
        for index in range(count):
            rows.append({
                "heading": f"Step {['one', 'two', 'three'][index]}.",
                "body": ("Keep the current mix. " * 16)[:220],
            })
        return {
            "type": "recommendations",
            "variant": "cards",
            "title": "What to {i:\"do\"} next.",
            "cards": rows,
        }

    for count, name in ((2, "recs-two.pptx"), (3, "recs-three.pptx")):
        content = {"slides": [shared, cards(count), close]}
        out = os.path.join(OUT, name)
        build.build(content, data, TEMPLATE, out, photos)
        issues = check.check(out, DATA)
        if issues:
            fail(f"{name} check failed: {issues}")


def run_text(part):
    return part.t if hasattr(part, "t") else part


def test_title_full_stop_sits_on_the_last_word():
    """The full stop is not its own run after the serif phrase."""
    build = load("build_report.py")
    cases = [
        ('Spend sits {i:"behind pace"}.', "behind pace."),
        ('Social (Meta) is {i:"on track"}.', "on track."),
        ('Where the month {i:"stands"}.', "stands."),
        ('Thanks for {i:"reading"}.', "reading."),
        ('Rates sit {i:"below target"}.', "below target."),
    ]
    for title, serif in cases:
        _visible, parts = build.parse_title(title, "title")
        texts = [run_text(part) for part in parts]
        if any(text.strip() == "." for text in texts):
            fail(f"full stop is its own run for {title!r}: {texts}")
        if serif not in texts:
            fail(f"serif run should be {serif!r}, got {texts}")
        if " ." in "".join(texts):
            fail(f"space before the full stop in {texts}")
    _visible, parts = build.parse_title('What to {i:"do"} next.', "title")
    texts = [run_text(part) for part in parts]
    if texts[-1] != " next.":
        fail(f"words after the serif phrase lost the stop: {texts}")
    _visible, parts = build.parse_title('The Curatif {i:"campaign"} report.', "title")
    texts = [run_text(part) for part in parts]
    joined = "".join(texts)
    if not joined.endswith("report."):
        fail(f"cover title stop moved: {texts}")
    if " ." in joined or any(text.strip() == "." for text in texts):
        fail(f"cover title has a loose stop: {texts}")


def test_not_live_channel_has_no_slide():
    build = load("build_report.py")
    data = {
        "channels": [
            {"group": "social_meta", "label": "Social (Meta)", "notLive": False},
            {"group": "social_tiktok", "label": "Social (TikTok)", "notLive": True},
        ],
        "notLive": [{"group": "social_tiktok", "label": "Social (TikTok)"}],
    }
    own_slide = {
        "slides": [{
            "type": "not-live",
            "variant": "cards",
            "title": "TikTok is {i:\"yet to launch\"}.",
            "cards": [{
                "label": "Social (TikTok)",
                "budget": "notLive.0.plannedBudget",
                "status": "Not yet live.",
            }],
        }],
    }
    errors = build.validate_content(own_slide, data)
    if not any("notLive" in error and "summary outcome" in error for error in errors):
        fail(f"not-live slide was allowed: {errors}")
    by_index = {
        "slides": [{
            "type": "channel",
            "variant": "photo",
            "title": "TikTok is {i:\"yet to launch\"}.",
            "value": "channels.1.spend",
            "body": "Waiting to start.",
            "photo": 0,
        }],
    }
    errors = build.validate_content(by_index, data)
    if not any("notLive" in error and "summary outcome" in error for error in errors):
        fail(f"not-live channel index was allowed: {errors}")
    by_group = {
        "slides": [{
            "type": "channel",
            "variant": "photo",
            "title": "TikTok is {i:\"yet to launch\"}.",
            "value": "channels.social_tiktok.spend",
            "body": "Waiting to start.",
            "photo": 0,
        }],
    }
    errors = build.validate_content(by_group, data)
    if not any("Social (TikTok)" in error for error in errors):
        fail(f"not-live group key was allowed: {errors}")
    live = {
        "slides": [{
            "type": "channel",
            "variant": "photo",
            "title": "Meta is {i:\"on track\"}.",
            "value": "channels.0.spend",
            "body": "Delivery is in.",
            "photo": 0,
        }],
    }
    errors = build.validate_content(live, data)
    if any("notLive" in error for error in errors):
        fail(f"live channel was rejected: {errors}")
    summary = {
        "slides": [{
            "type": "summary",
            "variant": "stat-row",
            "title": "Spend sits {i:\"behind pace\"}.",
            "stats": [{"label": "Spend", "key": "summary.spend"}],
            "outcome": "TikTok has not started.",
        }],
    }
    errors = build.validate_content(summary, data)
    if any("notLive" in error for error in errors):
        fail(f"summary outcome line was rejected: {errors}")


def test_kpi_value_drops_repeated_unit():
    build = load("build_report.py")
    photos = [
        os.path.join(HERE, "kit", "assembled-brand-kit", "library", name)
        for name in ("pexels-6299928.jpg", "pexels-6786367.jpg", "pexels-13935909.jpg")
    ]
    data = {
        "kpis": [
            {"label": "Frequency", "targetDisplay": "1.0 frequency", "actualDisplay": "Not yet reported"},
            {"label": "CTR", "targetDisplay": "4.00%", "actualDisplay": "2.16%"},
        ],
    }
    content = {
        "slides": [{
            "type": "kpi",
            "variant": "table",
            "title": "Rates sit {i:\"below target\"}.",
            "rows": [
                {"label": "kpis.0.label", "actual": "kpis.0.actualDisplay", "target": "kpis.0.targetDisplay"},
                {"label": "kpis.1.label", "actual": "kpis.1.actualDisplay", "target": "kpis.1.targetDisplay"},
            ],
            "insight": "Click through rate is behind its target.",
        }],
    }
    out = os.path.join(OUT, "kpi-units.pptx")
    build.build(content, data, TEMPLATE, out, photos)
    text = slide_text(out)
    if "1.0 frequency" in text:
        fail("frequency unit was repeated in the value column")
    if ">1.0<" not in text and "1.0" not in text:
        fail("frequency value was dropped")
    if "4.00%" not in text or "2.16%" not in text:
        fail(f"percent KPI values were changed: {text[:500]}")


A_RPR = "{http://schemas.openxmlformats.org/drawingml/2006/main}rPr"


def paint_runs(shape):
    rows = []
    if not getattr(shape, "has_text_frame", False):
        return rows
    for paragraph in shape.text_frame.paragraphs:
        for run in paragraph.runs:
            props = run._r.find(A_RPR)
            spc = props.get("spc") if props is not None else None
            rows.append((run.text or "", run.font.name, bool(run.font.italic), spc))
    return rows


def test_stop_attaches_on_sans_and_serif_runs():
    """A closing stop sits on the last run with no space, for a sans ending and a serif ending."""
    build = load("build_report.py")
    check = load("check_deck.py")
    deck = build.Deck(TEMPLATE)
    sans = deck.add("Title Only - White")
    _visible, runs = build.parse_title('What to {i:"do"} next .', "title")
    deck.fill(sans, 100, runs, base=dict(size=36, color=build.K["ink"], font=build.HEAD), align="l")
    build.tb(sans, 0.6, 2.2, 6, 0.6, "Hold the Meta mix.", size=14, color=build.K["ink"], font=build.HEAD)
    build.tb(sans, 0.6, 2.9, 6, 0.6, "Push Search harder.", size=14, color=build.K["ink"], font=build.HEAD)
    serif = deck.add("Title Only - White")
    _visible, runs = build.parse_title('Spend sits {i:"behind pace"}.', "title")
    deck.fill(serif, 100, runs, base=dict(size=36, color=build.K["ink"], font=build.HEAD), align="l")
    path = os.path.join(OUT, "stops.pptx")
    deck.save(path)
    loose = [issue for issue in check.check(path, DATA) if "loose stop" in issue]
    if loose:
        fail(f"attached stops were flagged: {loose}")

    sans_title = paint_runs(deck.ph(sans, 100))
    text, face, italic, spc = sans_title[-1]
    joined = "".join(part[0] for part in sans_title)
    if " ." in joined or text.strip() == "." or not text.endswith("."):
        fail(f"sans title stop is loose: {sans_title}")
    if face != build.HEAD or italic:
        fail(f"sans title stop left the sans run: {sans_title}")
    if spc is None or int(spc) >= 0:
        fail(f"sans title stop was not pulled in: {sans_title}")

    for shape in sans.shapes:
        if not getattr(shape, "has_text_frame", False):
            continue
        painted = paint_runs(shape)
        heading = "".join(part[0] for part in painted)
        if heading not in ("Hold the Meta mix.", "Push Search harder."):
            continue
        tail = painted[-1]
        if " ." in heading or tail[0].strip() == "." or not tail[0].endswith("."):
            fail(f"heading stop is loose: {painted}")
        if tail[1] != build.HEAD or tail[3] is None or int(tail[3]) >= 0:
            fail(f"heading stop was not pulled onto the sans run: {painted}")

    serif_title = paint_runs(deck.ph(serif, 100))
    text, face, italic, spc = serif_title[-1]
    joined = "".join(part[0] for part in serif_title)
    if " ." in joined or text != "behind pace." or not italic or face != "Instrument Serif":
        fail(f"serif title stop left the serif run: {serif_title}")
    if spc not in (None, "0"):
        fail(f"serif stop was retargeted: {serif_title}")

    bad = build.Deck(TEMPLATE)
    slide = bad.add("Title Only - White")
    frame = bad.ph(slide, 100).text_frame
    frame.clear()
    frame.paragraphs[0].text = "What to do next ."
    bad_path = os.path.join(OUT, "stops-loose.pptx")
    bad.save(bad_path)
    flagged = [issue for issue in check.check(bad_path, DATA) if "loose stop" in issue]
    if not flagged:
        fail("a space before the full stop was allowed")


def main():
    os.makedirs(OUT, exist_ok=True)
    test_missing_key()
    test_overflow_title()
    test_palette()
    test_validate()
    test_pace_and_fallback()
    test_number_exemptions()
    test_breaker_and_recommendations_build()
    test_title_full_stop_sits_on_the_last_word()
    test_not_live_channel_has_no_slide()
    test_kpi_value_drops_repeated_unit()
    test_stop_attaches_on_sans_and_serif_runs()
    print("tests OK")


if __name__ == "__main__":
    main()
