"""Feb 2026 · UX Audit screenshot capture
Logs in as 3 personas (President / Secretary / Treasurer) and captures a
full-page PNG of each route referenced by iteration_ux_audit.json.

Output: /app/frontend/public/ux-audit/<persona>/<slug>.png
This is served by CRA dev server at ${REACT_APP_BACKEND_URL}/ux-audit/...
"""
import asyncio, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("REACT_APP_BACKEND_URL_OVERRIDE") or "https://nice-aryabhata-4.preview.emergentagent.com"
REPORT = json.load(open("/app/test_reports/iteration_ux_audit.json"))
OUT = Path("/app/frontend/public/ux-audit")
OUT.mkdir(parents=True, exist_ok=True)

PERSONAS = [
    ("president",  "persona-chip-president"),
    ("secretary",  "persona-chip-secretary"),
    ("treasurer",  "persona-chip-treasurer"),
]

def collect_routes():
    routes = set()
    def walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("route", "page", "url") and isinstance(v, str):
                    routes.add(v)
                walk(v)
        elif isinstance(obj, list):
            for it in obj:
                walk(it)
    walk(REPORT)
    # keep only simple app routes (no :id, no composite mash-ups)
    cleaned = []
    for r in sorted(routes):
        if ":" in r or "+" in r or "(" in r or " " in r:
            continue
        if not r.startswith("/"):
            continue
        cleaned.append(r)
    return cleaned

def slug(route):
    s = route.strip("/").replace("/", "_") or "root"
    return re.sub(r"[^a-z0-9_-]", "-", s.lower())

async def capture_persona(browser, persona_key, chip_testid, routes):
    ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, ignore_https_errors=True)
    page = await ctx.new_page()
    persona_dir = OUT / persona_key
    persona_dir.mkdir(parents=True, exist_ok=True)

    print(f"[{persona_key}] logging in…")
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=45000)
    try:
        await page.wait_for_selector(f'[data-testid="{chip_testid}"]', timeout=15000)
        await page.click(f'[data-testid="{chip_testid}"]')
        await page.wait_for_timeout(800)
        # After persona chip, click Sign In submit
        try:
            await page.click('[data-testid="login-submit-btn"]', timeout=8000)
        except Exception:
            # try common alt selectors
            try:
                await page.get_by_role("button", name=re.compile(r"sign in|log in|enter", re.I)).click(timeout=5000)
            except Exception:
                pass
    except Exception as e:
        print(f"[{persona_key}] persona chip missing: {e}")
        await ctx.close()
        return
    await page.wait_for_load_state("networkidle", timeout=30000)
    await page.wait_for_timeout(2500)
    # Verify we left /login
    cur = page.url
    if "/login" in cur:
        print(f"[{persona_key}] STILL on /login after submit — aborting")
        await ctx.close()
        return
    print(f"[{persona_key}] logged in, now on {cur}")

    for i, route in enumerate(routes):
        out_path = persona_dir / f"{slug(route)}.png"
        if out_path.exists() and out_path.stat().st_size > 20_000:
            print(f"[{persona_key}] SKIP existing {route}")
            continue
        try:
            await page.goto(f"{BASE}{route}", wait_until="domcontentloaded", timeout=45000)
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            await page.wait_for_timeout(1200)
            await page.screenshot(path=str(out_path), full_page=True)
            print(f"[{persona_key}] {i+1}/{len(routes)} {route} → {out_path.name}")
        except Exception as e:
            print(f"[{persona_key}] ERR {route}: {e}")
    await ctx.close()

async def main():
    routes = collect_routes()
    print(f"Capturing {len(routes)} routes for {len(PERSONAS)} personas → {OUT}")
    (OUT / "_manifest.json").write_text(json.dumps({
        "routes": routes,
        "personas": [p[0] for p in PERSONAS],
        "slug_map": {r: slug(r) for r in routes},
    }, indent=2))
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        for persona_key, chip in PERSONAS:
            try:
                await capture_persona(browser, persona_key, chip, routes)
            except Exception as e:
                print(f"[{persona_key}] fatal: {e}")
        await browser.close()
    print("DONE")

if __name__ == "__main__":
    asyncio.run(main())
