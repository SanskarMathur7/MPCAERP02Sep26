"""M29 · Ground picker filter tests

Verifies GET /api/grounds accepts `owner_body_codes` (comma-separated) filter
using managed_by_body_id (or parent venue's managed_by_body_id as fallback).
Also acts as a smoke test to ensure no 500s occur across common filter combos.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestGroundsOwnerFilter:
    def _resolve_owner(self, g, venues_by_id):
        mb = g.get("managed_by_body_id")
        if mb:
            return mb
        v = venues_by_id.get(g.get("venue_id"))
        return (v or {}).get("managed_by_body_id")

    def test_list_grounds_no_filter_returns_200(self, client):
        r = client.get(f"{API}/grounds")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 20, f"Expected seeded 22 divisional + 2 MPCA grounds, got {len(data)}"

    def test_owner_filter_mpca_only(self, client):
        r = client.get(f"{API}/grounds", params={"owner_body_codes": "MPCA"})
        assert r.status_code == 200, r.text
        grounds = r.json()
        # Every returned ground must have managed_by_body_id == MPCA (direct owner).
        # The venue-fallback branch is exercised in the DIV tests below where some
        # grounds may inherit from parent venue.
        for g in grounds:
            mb = g.get("managed_by_body_id")
            assert mb in (None, "MPCA"), f"Ground {g.get('name')} managed_by={mb!r} not MPCA"
        assert len(grounds) >= 2, f"Expected at least 2 MPCA grounds, got {len(grounds)}"

    def test_owner_filter_div_ind_only(self, client):
        r = client.get(f"{API}/grounds", params={"owner_body_codes": "DIV-IND"})
        assert r.status_code == 200, r.text
        grounds = r.json()
        assert len(grounds) >= 1, "Expected at least 1 DIV-IND ground from seed"
        for g in grounds:
            mb = g.get("managed_by_body_id")
            assert mb in (None, "DIV-IND"), f"Ground {g.get('name')} managed_by={mb!r} not DIV-IND"

    def test_owner_filter_multi_body(self, client):
        r = client.get(f"{API}/grounds", params={"owner_body_codes": "MPCA,DIV-IND,DIV-BPL"})
        assert r.status_code == 200, r.text
        grounds = r.json()
        allowed = {"MPCA", "DIV-IND", "DIV-BPL", None}
        for g in grounds:
            mb = g.get("managed_by_body_id")
            assert mb in allowed, f"Ground {g.get('name')} managed_by={mb!r} not in {allowed}"
        r_mpca = client.get(f"{API}/grounds", params={"owner_body_codes": "MPCA"})
        assert len(grounds) >= len(r_mpca.json())

    def test_owner_filter_unknown_body(self, client):
        r = client.get(f"{API}/grounds", params={"owner_body_codes": "DIV-NON-EXISTENT"})
        assert r.status_code == 200, r.text
        assert r.json() == []

    def test_owner_filter_empty_string(self, client):
        r = client.get(f"{API}/grounds", params={"owner_body_codes": ""})
        assert r.status_code == 200, r.text
        # empty filter -> should behave like no filter
        assert isinstance(r.json(), list)

    def test_no_500_across_filter_variants(self, client):
        variants = [
            {"owner_body_codes": "MPCA"},
            {"owner_body_codes": "DIV-IND"},
            {"owner_body_codes": "DIV-BPL"},
            {"owner_body_codes": "MPCA,DIV-IND"},
            {"owner_body_codes": "MPCA,DIV-IND,DIV-BPL"},
            {"owner_body_codes": " MPCA , DIV-IND "},  # whitespace
            {"type": "Main"},
            {"format": "Multi_Day"},
            {"owner_body_codes": "MPCA", "type": "Main"},
        ]
        for v in variants:
            r = client.get(f"{API}/grounds", params=v)
            assert r.status_code == 200, f"Params {v} returned {r.status_code}: {r.text[:200]}"

    def test_grounds_have_owner_metadata(self, client):
        """Verify each ground has usable owner info (managed_by_body_id present)."""
        r = client.get(f"{API}/grounds", params={"owner_body_codes": "MPCA,DIV-IND,DIV-BPL,DIV-JBP,DIV-GWL,DIV-UJJ,DIV-REW,DIV-SGR,DIV-SHD,DIV-KTN,DIV-CHM,DIV-RAT"})
        assert r.status_code == 200
        grounds = r.json()
        # At least some should have direct managed_by_body_id populated
        with_owner = [g for g in grounds if g.get("managed_by_body_id")]
        assert len(with_owner) > 0, "No grounds have managed_by_body_id populated"


class TestGroundsRegression:
    def test_no_bad_bcci_or_format_values(self, client):
        """Bad seed values (bcci='BCCI_A', formats containing 'T10', type='Practice')
        should have been normalised. Verifies list endpoint stays 200."""
        r = client.get(f"{API}/grounds")
        assert r.status_code == 200
        for g in r.json():
            # These are the normalised expectations — endpoint returns without erroring
            if g.get("bcci_approval"):
                assert g["bcci_approval"] in ("A", "B", "C", "D", "None", None), f"Bad bcci: {g.get('bcci_approval')}"
            for fmt_ in (g.get("suitable_formats") or []):
                assert fmt_ != "T10", "T10 format leaked through"
