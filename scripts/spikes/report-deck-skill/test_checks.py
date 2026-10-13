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


def main():
    os.makedirs(OUT, exist_ok=True)
    test_missing_key()
    test_overflow_title()
    test_palette()
    test_validate()
    test_pace_and_fallback()
    test_number_exemptions()
    print("tests OK")


if __name__ == "__main__":
    main()
