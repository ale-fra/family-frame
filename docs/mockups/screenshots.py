# Renders the mockup screenshots (needs Python Playwright with Chromium). Run from docs/mockups/.
import pathlib
from playwright.sync_api import sync_playwright
url = pathlib.Path("schedule-ui.html").resolve().as_uri()
shots = [("styles-it", "?view=board&lang=it", None), ("stage-one-it", "?view=stage&scene=one&lang=it", 800),
         ("stage-two-en", "?view=stage&scene=two&lang=en", 800), ("stage-mix-it", "?view=stage&scene=mix&lang=it", 800),
         ("stage-overflow-en", "?view=stage&scene=overflow&lang=en", 800)]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, query, h in shots:
        pg = b.new_page(viewport={"width": 1280, "height": h or 800})
        errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(url + query); pg.wait_for_timeout(200)
        overflow = pg.evaluate("() => [...document.querySelectorAll('.card')].filter(c => c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2).length")
        pg.screenshot(path=f"{name}.png", full_page=h is None)
        print(f"{name}: errors={errors or 'none'} overflowing cards={overflow}")
    b.close()
