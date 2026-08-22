"""Iteration 125 backend tests:
- Eligibility Rules admin CRUD + tags endpoint
- Player compute writes eligibility_check_trace
- Signed override validation + clear-override
- Grant AI review covers extra_documents
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

PLAYER_ID = "a7b53856-1593-446e-bd5b-95dfd9fc8144"


@pytest.fixture(scope="session")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "sysadmin@mpca.in", "password": "mpca@2026"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# --- Eligibility Rules ---
class TestEligibilityRules:
    def test_tags_returns_8(self, h):
        r = requests.get(f"{BASE_URL}/api/eligibility-rules/tags", headers=h, timeout=15)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # tags may be list directly or wrapped
        tags = data if isinstance(data, list) else data.get("tags") or data.get("items")
        assert tags is not None, f"unexpected shape: {data}"
        assert len(tags) == 8, f"expected 8 tags got {len(tags)}: {tags}"
        assert all("code" in t and "order" in t for t in tags)
        # Local/Birth first, Ineligible last (by order)
        ordered = sorted(tags, key=lambda t: t["order"])
        assert "Birth" in ordered[0]["code"] or "birth" in ordered[0]["code"].lower()
        assert "ineligible" in ordered[-1]["code"].lower()

    def test_patch_and_get_config(self, h):
        r = requests.patch(
            f"{BASE_URL}/api/eligibility-rules/2026-27",
            headers=h,
            json={"residency_min_months": 4},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text[:300]
        r2 = requests.get(f"{BASE_URL}/api/eligibility-rules/2026-27", headers=h, timeout=15)
        assert r2.status_code == 200, r2.text[:300]
        assert r2.json().get("residency_min_months") == 4

    def test_duplicate_conflict(self, h):
        # Ensure source exists
        requests.patch(
            f"{BASE_URL}/api/eligibility-rules/2026-27",
            headers=h,
            json={"residency_min_months": 4},
            timeout=15,
        )
        # Clean up target if it already exists from a prior run
        requests.delete(f"{BASE_URL}/api/eligibility-rules/2028-29", headers=h, timeout=15)
        r = requests.post(
            f"{BASE_URL}/api/eligibility-rules/duplicate",
            headers=h,
            json={"source_season": "2026-27", "target_season": "2028-29"},
            timeout=15,
        )
        assert r.status_code in (200, 201), f"first dup failed: {r.status_code} {r.text[:300]}"
        r2 = requests.post(
            f"{BASE_URL}/api/eligibility-rules/duplicate",
            headers=h,
            json={"source_season": "2026-27", "target_season": "2028-29"},
            timeout=15,
        )
        assert r2.status_code == 409, f"expected 409 got {r2.status_code}: {r2.text[:300]}"


# --- Player eligibility trace + override ---
class TestPlayerEligibility:
    def test_compute_writes_trace(self, h):
        r = requests.post(
            f"{BASE_URL}/api/players/{PLAYER_ID}/eligibility-tag/compute",
            headers=h,
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        # Fetch player and inspect trace
        p = requests.get(f"{BASE_URL}/api/players/{PLAYER_ID}", headers=h, timeout=15)
        assert p.status_code == 200
        pdata = p.json()
        trace = pdata.get("eligibility_check_trace") or []
        assert len(trace) >= 5, f"expected >=5 trace entries got {len(trace)}: {trace}"
        for entry in trace:
            assert "tag" in entry and "passed" in entry and "why" in entry
            assert "source_field" in entry

    def test_override_short_reason_rejected(self, h):
        r = requests.post(
            f"{BASE_URL}/api/players/{PLAYER_ID}/eligibility-tag/override",
            headers=h,
            json={"eligibility_tag": "Local/Birth", "reason": "short"},
            timeout=15,
        )
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text[:300]}"

    def test_override_long_reason_accepted_and_clear(self, h):
        long_reason = "This is a properly justified override with clear reasoning."
        r = requests.post(
            f"{BASE_URL}/api/players/{PLAYER_ID}/eligibility-tag/override",
            headers=h,
            json={"eligibility_tag": "Local/Birth", "reason": long_reason},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text[:300]
        p = requests.get(f"{BASE_URL}/api/players/{PLAYER_ID}", headers=h, timeout=15).json()
        assert p.get("eligibility_override") is not None
        assert long_reason in (p["eligibility_override"].get("reason") or "")

        # Clear
        c = requests.post(
            f"{BASE_URL}/api/players/{PLAYER_ID}/eligibility-tag/clear-override",
            headers=h,
            timeout=15,
        )
        assert c.status_code in (200, 204), c.text[:300]
        p2 = requests.get(f"{BASE_URL}/api/players/{PLAYER_ID}", headers=h, timeout=15).json()
        assert not p2.get("eligibility_override"), f"override not cleared: {p2.get('eligibility_override')}"
        hist = p2.get("eligibility_override_history") or []
        assert len(hist) >= 1, "history should retain at least one entry"


# --- Grant AI review extras ---
class TestGrantAIExtras:
    def test_ai_review_includes_extras(self, h):
        # Discover a claim with extra_documents
        listr = requests.get(f"{BASE_URL}/api/grant-claims", headers=h, timeout=15)
        if listr.status_code != 200:
            pytest.skip(f"cannot list claims: {listr.status_code}")
        claims = listr.json()
        if isinstance(claims, dict):
            claims = claims.get("items") or claims.get("claims") or []
        target = None
        for c in claims:
            cid = c.get("claim_id") or c.get("id")
            if not cid:
                continue
            # Prefer GRC-2026-27-0003
            if cid == "GRC-2026-27-0003":
                target = cid
                break
        if not target:
            # fall back to any that has extras
            for c in claims:
                cid = c.get("claim_id") or c.get("id")
                detail = requests.get(f"{BASE_URL}/api/grant-claims/{cid}", headers=h, timeout=15)
                if detail.status_code == 200 and detail.json().get("extra_documents"):
                    target = cid
                    break
        if not target:
            pytest.skip("no claim with extra_documents found")

        r = requests.post(
            f"{BASE_URL}/api/grant-claims/{target}/ai-review", headers=h, timeout=120
        )
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        summary = body.get("ai_summary") or body
        assert "extras_verified" in summary, f"missing extras_verified: {summary}"
        assert "extras_total" in summary, f"missing extras_total: {summary}"

        # Verify extras carry AI fields
        detail = requests.get(f"{BASE_URL}/api/grant-claims/{target}", headers=h, timeout=15).json()
        extras = detail.get("extra_documents") or []
        assert extras, "expected extras on claim"
        first = extras[0]
        assert "ai_verified" in first or "ai_confidence" in first, f"extras missing AI fields: {first}"
