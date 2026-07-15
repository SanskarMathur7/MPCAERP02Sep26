"""Sprint M9 · Retest of body_id ← owner_body_id mirror bug (iteration_22).

Bug context: POST/PATCH /api/venues used to leave body_id='MPCA' (Pydantic default)
even when the client sent owner_body_id='DIV-IND', because the old
_normalise_venue_payload only filled MISSING keys. Fix: owner_body_id is now
authoritative; body_id is force-synced. Also bcci_calendar_eligible flips both
ways with bcci_approval.
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Helper — collect ids of every M9-prefixed venue we create, cleaned up at end.
_CREATED_IDS: list[str] = []


# ─────────── The bug: body_id must mirror owner_body_id on create ───────────

class TestBodyIdMirrorOnCreate:
    def test_owner_only_div_ind(self, api):
        """The exact repro from iteration_22 — body_id must be DIV-IND, not MPCA."""
        payload = {
            "name": "M9 owner-only DIV-IND",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "DIV-IND",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        _CREATED_IDS.append(d["id"])
        assert d["owner_body_id"] == "DIV-IND"
        assert d["body_id"] == "DIV-IND", (
            f"BUG NOT FIXED: expected body_id=='DIV-IND' but got {d['body_id']!r}"
        )

        # Persistence check
        g = api.get(f"{BASE_URL}/api/venues/{d['id']}")
        assert g.status_code == 200
        gd = g.json()
        assert gd["owner_body_id"] == "DIV-IND"
        assert gd["body_id"] == "DIV-IND"

    def test_owner_div_bpl_with_domestic_bcci(self, api):
        payload = {
            "name": "M9 owner DIV-BPL domestic",
            "category": "MPCA_State",
            "city": "Bhopal",
            "owner_body_id": "DIV-BPL",
            "bcci_approval": "Domestic",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        _CREATED_IDS.append(d["id"])
        assert d["owner_body_id"] == "DIV-BPL"
        assert d["body_id"] == "DIV-BPL"
        assert d["bcci_approval"] == "Domestic"
        assert d["bcci_calendar_eligible"] is True

    def test_legacy_body_id_only_div_gwl(self, api):
        """Legacy shape: only body_id sent. owner_body_id must be filled from it."""
        payload = {
            "name": "M9 legacy body_id DIV-GWL",
            "category": "MPCA_State",
            "city": "Gwalior",
            "body_id": "DIV-GWL",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        _CREATED_IDS.append(d["id"])
        assert d["owner_body_id"] == "DIV-GWL", (
            f"Legacy body_id should back-fill owner_body_id; got owner={d['owner_body_id']!r}"
        )
        assert d["body_id"] == "DIV-GWL"

    def test_bcci_none_flips_calendar_eligible_false(self, api):
        payload = {
            "name": "M9 owner MPCA bcci None",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "MPCA",
            "bcci_approval": "None",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        _CREATED_IDS.append(d["id"])
        assert d["bcci_approval"] == "None"
        assert d["bcci_calendar_eligible"] is False, (
            f"bcci_approval='None' must set bcci_calendar_eligible=False; got {d['bcci_calendar_eligible']!r}"
        )


# ─────────── PATCH mirror + bcci flip ───────────

class TestBodyIdMirrorOnPatch:
    _vid: str = ""

    def test_setup_create_domestic_venue(self, api):
        payload = {
            "name": "M9 patch target",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "MPCA",
            "managed_by_body_id": "MPCA",
            "bcci_approval": "Domestic",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        TestBodyIdMirrorOnPatch._vid = d["id"]
        _CREATED_IDS.append(d["id"])
        assert d["bcci_calendar_eligible"] is True

    def test_patch_owner_updates_body_id(self, api):
        vid = TestBodyIdMirrorOnPatch._vid
        assert vid, "setup must have run"
        payload = {
            "name": "M9 patch target",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "DIV-JBP",
            "managed_by_body_id": "DIV-JBP",
            "bcci_approval": "Domestic",
        }
        r = api.patch(f"{BASE_URL}/api/venues/{vid}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["owner_body_id"] == "DIV-JBP"
        assert d["body_id"] == "DIV-JBP", (
            f"BUG: PATCH must force-sync body_id ← owner_body_id; got {d['body_id']!r}"
        )

        # Verify persisted
        g = api.get(f"{BASE_URL}/api/venues/{vid}")
        assert g.json()["body_id"] == "DIV-JBP"

    def test_patch_bcci_none_flips_calendar_false(self, api):
        vid = TestBodyIdMirrorOnPatch._vid
        payload = {
            "name": "M9 patch target",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "DIV-JBP",
            "managed_by_body_id": "DIV-JBP",
            "bcci_approval": "None",
        }
        r = api.patch(f"{BASE_URL}/api/venues/{vid}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["bcci_approval"] == "None"
        assert d["bcci_calendar_eligible"] is False, (
            f"PATCH bcci_approval='None' must flip eligible to False; got {d['bcci_calendar_eligible']!r}"
        )


# ─────────── Regression: seeded venues unchanged ───────────

SEEDED = {
    "Holkar Cricket Stadium":       ("MPCA", "MPCA",    "International"),
    "Jabalpur Division Ground":     ("DIV-JBP", "DIV-JBP", "None"),
    "Aishbagh Stadium":             ("MPCA", "DIV-BPL", "Domestic"),
    "Captain Roop Singh Stadium":   ("MPCA", "DIV-GWL", "International"),
    "MPCA Indore Academy Ground":   ("MPCA", "DIV-IND", "None"),
}


class TestSeededRegression:
    @pytest.fixture(scope="class")
    def all_venues(self, api):
        r = api.get(f"{BASE_URL}/api/venues")
        assert r.status_code == 200
        return r.json()

    @pytest.mark.parametrize("name,expected", list(SEEDED.items()))
    def test_seeded_venue_unchanged(self, all_venues, name, expected):
        v = next((x for x in all_venues if x["name"] == name), None)
        assert v is not None, f"Seeded venue {name!r} missing"
        owner, mgr, bcci = expected
        assert v["owner_body_id"] == owner
        assert v["managed_by_body_id"] == mgr
        assert v["bcci_approval"] == bcci
        # After the fix, body_id must equal owner_body_id for the seeded rows too.
        # (Migration guarantees this — regression check.)
        assert v["body_id"] == owner, (
            f"Seeded {name!r} has drifted body_id={v['body_id']!r} vs owner={owner!r}"
        )


# ─────────── Regression: filters ───────────

class TestFilterRegression:
    def test_owner_mpca_returns_four_seeded(self, api):
        r = api.get(f"{BASE_URL}/api/venues", params={"owner_body_id": "MPCA"})
        assert r.status_code == 200
        rows = r.json()
        # Only assert on the 4 MPCA-owned seeded ones (other test venues may exist).
        expected = {n for n, (o, _, _) in SEEDED.items() if o == "MPCA"}
        got = {v["name"] for v in rows if v["name"] in expected}
        assert got == expected, f"Missing MPCA-owned seeded venues: {expected - got}"
        assert all(v["owner_body_id"] == "MPCA" for v in rows)

    def test_bcci_international_returns_two_seeded(self, api):
        r = api.get(f"{BASE_URL}/api/venues", params={"bcci_approval": "International"})
        assert r.status_code == 200
        rows = r.json()
        intl_seeded = {n for n, (_, _, b) in SEEDED.items() if b == "International"}
        got = {v["name"] for v in rows if v["name"] in intl_seeded}
        assert got == intl_seeded, f"Missing intl seeded venues: {intl_seeded - got}"
        assert all(v["bcci_approval"] == "International" for v in rows)


# ─────────── Regression: 400 on unknown body ───────────

class TestUnknownBodyRejection:
    def test_unknown_owner_body(self, api):
        payload = {
            "name": "M9 bad owner XYZ",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "XYZ-999",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code == 400, r.text
        assert "XYZ-999" in r.text

    def test_unknown_manager_body(self, api):
        payload = {
            "name": "M9 bad mgr XYZ",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "MPCA",
            "managed_by_body_id": "XYZ-999",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code == 400, r.text
        assert "XYZ-999" in r.text


# ─────────── Cleanup: delete every venue whose name starts with 'M9 ' ───────────

def test_zzz_cleanup_m9_venues(api):
    r = api.get(f"{BASE_URL}/api/venues")
    assert r.status_code == 200
    deleted = 0
    for v in r.json():
        if (v.get("name") or "").startswith("M9 "):
            d = api.delete(f"{BASE_URL}/api/venues/{v['id']}")
            if d.status_code in (200, 204):
                deleted += 1
    print(f"[cleanup] deleted {deleted} M9-prefixed venues")
    # Verify no M9-prefixed venues remain
    r2 = api.get(f"{BASE_URL}/api/venues")
    remaining = [v["name"] for v in r2.json() if (v.get("name") or "").startswith("M9 ")]
    assert not remaining, f"M9 venues left behind: {remaining}"
