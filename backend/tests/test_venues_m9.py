"""Sprint M9 · Venues & Grounds ownership/management + BCCI approval."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def venues(api):
    r = api.get(f"{BASE_URL}/api/venues")
    assert r.status_code == 200
    return r.json()


# ─────────── M9 · Migration verification ───────────

class TestMigration:
    def test_five_venues_present(self, venues):
        # There may now be more if a prior test suite added some; assert at least 5 seeded.
        seeded = [v for v in venues if v["name"] in (
            "Holkar Cricket Stadium", "Aishbagh Stadium", "Jabalpur Division Ground",
            "MPCA Indore Academy Ground", "Captain Roop Singh Stadium",
        )]
        assert len(seeded) == 5, f"Expected 5 seeded venues; found {len(seeded)}"

    def test_holkar(self, venues):
        v = next(x for x in venues if x["name"] == "Holkar Cricket Stadium")
        assert v["owner_body_id"] == "MPCA"
        assert v["managed_by_body_id"] == "MPCA"
        assert v["bcci_approval"] == "International"

    def test_aishbagh(self, venues):
        v = next(x for x in venues if x["name"] == "Aishbagh Stadium")
        assert v["owner_body_id"] == "MPCA"
        assert v["managed_by_body_id"] == "DIV-BPL"
        assert v["bcci_approval"] == "Domestic"

    def test_jabalpur(self, venues):
        v = next(x for x in venues if x["name"] == "Jabalpur Division Ground")
        assert v["owner_body_id"] == "DIV-JBP"
        assert v["managed_by_body_id"] == "DIV-JBP"
        assert v["bcci_approval"] == "None"

    def test_mpca_indore_academy(self, venues):
        v = next(x for x in venues if x["name"] == "MPCA Indore Academy Ground")
        assert v["owner_body_id"] == "MPCA"
        assert v["managed_by_body_id"] == "DIV-IND"
        assert v["bcci_approval"] == "None"

    def test_captain_roop_singh(self, venues):
        v = next(x for x in venues if x["name"] == "Captain Roop Singh Stadium")
        assert v["owner_body_id"] == "MPCA"
        assert v["managed_by_body_id"] == "DIV-GWL"
        assert v["bcci_approval"] == "International"


# ─────────── M9 · Filters ───────────

class TestVenueFilters:
    def test_filter_by_owner_mpca(self, api):
        # 4 seeded venues have owner MPCA (all except Jabalpur). Test venues from other suites
        # may also have owner MPCA, so use >= 4.
        r = api.get(f"{BASE_URL}/api/venues", params={"owner_body_id": "MPCA"})
        assert r.status_code == 200
        rows = r.json()
        assert all(v["owner_body_id"] == "MPCA" for v in rows)
        seeded_names = {"Holkar Cricket Stadium", "Aishbagh Stadium", "MPCA Indore Academy Ground", "Captain Roop Singh Stadium"}
        matched = {v["name"] for v in rows if v["name"] in seeded_names}
        assert matched == seeded_names, f"Missing MPCA-owned seeded venues: {seeded_names - matched}"

    def test_filter_by_manager_div_bpl(self, api):
        r = api.get(f"{BASE_URL}/api/venues", params={"managed_by_body_id": "DIV-BPL"})
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert all(v["managed_by_body_id"] == "DIV-BPL" for v in rows)
        assert any(v["name"] == "Aishbagh Stadium" for v in rows)

    def test_filter_by_bcci_international(self, api):
        r = api.get(f"{BASE_URL}/api/venues", params={"bcci_approval": "International"})
        assert r.status_code == 200
        rows = r.json()
        names = {v["name"] for v in rows}
        assert {"Holkar Cricket Stadium", "Captain Roop Singh Stadium"}.issubset(names)
        assert all(v["bcci_approval"] == "International" for v in rows)


# ─────────── M9 · Create/Update validation ───────────

class TestVenueCreateUpdate:
    created_id = None

    def test_create_venue_with_new_fields(self, api):
        payload = {
            "name": "TEST_M9 Test Venue",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "DIV-IND",
            "managed_by_body_id": "DIV-IND",
            "bcci_approval": "Domestic",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["owner_body_id"] == "DIV-IND"
        assert data["managed_by_body_id"] == "DIV-IND"
        assert data["bcci_approval"] == "Domestic"
        # body_id should mirror owner_body_id
        assert data["body_id"] == "DIV-IND"
        # bcci_calendar_eligible True because bcci_approval != None
        assert data["bcci_calendar_eligible"] is True
        TestVenueCreateUpdate.created_id = data["id"]

        # GET verify persistence
        g = api.get(f"{BASE_URL}/api/venues/{data['id']}")
        assert g.status_code == 200
        assert g.json()["owner_body_id"] == "DIV-IND"

    def test_create_invalid_owner_body(self, api):
        payload = {
            "name": "TEST_M9 Bad Owner",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "XYZ-999",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code == 400
        assert "XYZ-999" in r.text
        assert "Owner body" in r.text or "owner" in r.text.lower()

    def test_create_invalid_manager_body(self, api):
        payload = {
            "name": "TEST_M9 Bad Manager",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "MPCA",
            "managed_by_body_id": "XYZ-999",
        }
        r = api.post(f"{BASE_URL}/api/venues", json=payload)
        assert r.status_code == 400
        assert "XYZ-999" in r.text
        assert "Managing" in r.text or "manag" in r.text.lower()

    def test_patch_updates_fields_and_validates(self, api):
        vid = TestVenueCreateUpdate.created_id
        assert vid, "prior create test must have run"
        # Valid patch
        payload = {
            "name": "TEST_M9 Test Venue",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "MPCA",
            "managed_by_body_id": "DIV-IND",
            "bcci_approval": "International",
        }
        r = api.patch(f"{BASE_URL}/api/venues/{vid}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["owner_body_id"] == "MPCA"
        assert d["managed_by_body_id"] == "DIV-IND"
        assert d["bcci_approval"] == "International"
        assert d["bcci_calendar_eligible"] is True

        # Invalid owner in PATCH
        payload["owner_body_id"] = "XYZ-999"
        r = api.patch(f"{BASE_URL}/api/venues/{vid}", json=payload)
        assert r.status_code == 400

        # Invalid manager in PATCH
        payload["owner_body_id"] = "MPCA"
        payload["managed_by_body_id"] = "XYZ-999"
        r = api.patch(f"{BASE_URL}/api/venues/{vid}", json=payload)
        assert r.status_code == 400


# ─────────── M9 · Grounds ───────────

class TestGrounds:
    created_venue_id = None
    created_ground_id = None

    def test_list_grounds_has_new_fields(self, api):
        r = api.get(f"{BASE_URL}/api/grounds")
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        for g in rows:
            assert "bcci_approval" in g
            assert "managed_by_body_id" in g

    def test_create_ground_with_new_fields(self, api):
        # Create a test venue first
        vp = {
            "name": "TEST_M9 Ground Parent",
            "category": "MPCA_State",
            "city": "Indore",
            "owner_body_id": "MPCA",
            "managed_by_body_id": "DIV-IND",
            "bcci_approval": "None",
        }
        vr = api.post(f"{BASE_URL}/api/venues", json=vp)
        assert vr.status_code in (200, 201)
        vid = vr.json()["id"]
        TestGrounds.created_venue_id = vid

        gp = {
            "venue_id": vid,
            "name": "TEST_M9 Practice A",
            "type": "Practice_A",
            "bcci_approval": "Domestic",
            "managed_by_body_id": "DIV-IND",
        }
        gr = api.post(f"{BASE_URL}/api/grounds", json=gp)
        assert gr.status_code in (200, 201), gr.text
        gd = gr.json()
        assert gd["bcci_approval"] == "Domestic"
        assert gd["managed_by_body_id"] == "DIV-IND"
        TestGrounds.created_ground_id = gd["id"]

        # GET verify
        got = api.get(f"{BASE_URL}/api/grounds/{gd['id']}")
        assert got.status_code == 200
        assert got.json()["bcci_approval"] == "Domestic"


# ─────────── Cleanup ───────────

def test_zz_cleanup(api):
    """Clean up any TEST_ prefixed venues/grounds we created."""
    # Delete test grounds first
    gr = api.get(f"{BASE_URL}/api/grounds")
    if gr.status_code == 200:
        for g in gr.json():
            if (g.get("name") or "").startswith("TEST_"):
                api.delete(f"{BASE_URL}/api/grounds/{g['id']}")
    # Delete test venues
    vr = api.get(f"{BASE_URL}/api/venues")
    if vr.status_code == 200:
        for v in vr.json():
            if (v.get("name") or "").startswith("TEST_"):
                api.delete(f"{BASE_URL}/api/venues/{v['id']}")
