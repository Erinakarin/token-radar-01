#!/usr/bin/env python3
"""Take the three token-radar screenshots from the built dashboard in out/.

board: the full board. detail: rank 1's detail drawer. filtered: the board after
a search filter. Viewport 1440x900, PNG, into the work dir's screenshots/.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

WORK = Path(__file__).resolve().parent.parent
OUT = WORK / "out" / "dashboard" / "index.html"
SHOTS = WORK / "screenshots"
SHOTS.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.goto(OUT.as_uri())
    page.wait_for_selector("tbody tr")
    page.wait_for_timeout(400)
    page.screenshot(path=str(SHOTS / "1-board.png"))
    # Detail view: open rank 1.
    page.click("tbody tr:first-child")
    page.wait_for_selector("dialog.detail[open]")
    page.wait_for_timeout(400)
    page.screenshot(path=str(SHOTS / "2-detail.png"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    # Filtered view: search for a category that narrows the board.
    page.fill("input#q", "lending")
    page.wait_for_timeout(400)
    page.screenshot(path=str(SHOTS / "3-filtered.png"))
    b.close()

for f in sorted(SHOTS.glob("*.png")):
    print(f.name, f.stat().st_size, "bytes")
