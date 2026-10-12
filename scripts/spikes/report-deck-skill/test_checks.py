"""Local checks for the v5 deck builder. No API calls."""
import importlib.util
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


def main():
    os.makedirs(OUT, exist_ok=True)
    test_missing_key()
    test_overflow_title()
    test_palette()
    print("tests OK")


if __name__ == "__main__":
    main()
