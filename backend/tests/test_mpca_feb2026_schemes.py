"""MPCA-Feb2026 · Season-versioned schemes + Host/Visitor scheme split fix.

Covers:
  1. Season list endpoint
  2. Per-season GET filter (18 vs 33)
  3. Per-season compute (rates differ 2025-26 vs 2026-27)
  4. Host (2-D) vs Visitor (2-C) scheme heads must not overlap
  5. Tournament auto-split (Inter-Div → 2-D/2-D/2-C, Inter-Dist → 2-B/2-B/2-C)
  6. Mid-year PUT edit + revision history audit trail
  7. Non-MPCA (Division) cannot PUT — expect 403
  8. Season clone → duplicate 409 → mongo cleanup
"""
import os
import json
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

MPCA_HEADERS = {
    "Content-Type": "application/json",
    "X-Persona-Id": "secretary",
    "X-Persona-Name": "Sanjeev Dua",
    "X-Body-Code": "MPCA",
    "X-Body-Type": "State",
}
DIV_HEADERS = {
    "Content-Type": "application/json",
    "X-Persona-Id": "division-secretary",
    "X-Persona-Name": "Devashish Nilosey",
    "X-Body-Code": "DIV-IND",
    "X-Body-Type": "Division",
}


# ── 1. Season list ────────────────────────────────────────────────────────
def test_list_scheme_seasons():
    r = requests.get(f"{API}/reimbursement-schemes/seasons", headers=MPCA_HEADERS)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["current"] == "2026-27"
    cycles = {s["fiscal_cycle"]: s["scheme_count"] for s in data["seasons"]}
    assert cycles.get("2026-27") == 33, f"Expected 33 for 2026-27, got {cycles}"
    assert cycles.get("2025-26") == 18, f"Expected 18 for 2025-26, got {cycles}"


# ── 2. Per-season GET filter ──────────────────────────────────────────────
def test_per_season_scheme_counts():
    r25 = requests.get(f"{API}/reimbursement-schemes?fiscal_cycle=2025-26&active_only=false", headers=MPCA_HEADERS)
    r26 = requests.get(f"{API}/reimbursement-schemes?fiscal_cycle=2026-27&active_only=false", headers=MPCA_HEADERS)
    assert r25.status_code == 200 and r26.status_code == 200
    schemes_25 = r25.json()
    schemes_26 = r26.json()
    assert len(schemes_25) == 18, f"2025-26 count={len(schemes_25)}"
    assert len(schemes_26) == 33, f"2026-27 count={len(schemes_26)}"
    # 2-A exists in both, likely with different heads
    codes_25 = {s["scheme_code"] for s in schemes_25}
    codes_26 = {s["scheme_code"] for s in schemes_26}
    assert "2-A" in codes_25 and "2-A" in codes_26


# ── 3. Per-season compute proves season isolation ─────────────────────────
def test_compute_2A_differs_across_seasons():
    inputs = {"match_days": 6, "umpires_per_day": 2, "scorers_per_day": 1, "matches": 12, "non_match_days": 0}
    r25 = requests.post(f"{API}/schemes/2-A/compute-budget?fiscal_cycle=2025-26",
                        headers=MPCA_HEADERS, json={"inputs": inputs})
    r26 = requests.post(f"{API}/schemes/2-A/compute-budget?fiscal_cycle=2026-27",
                        headers=MPCA_HEADERS, json={"inputs": inputs})
    assert r25.status_code == 200, r25.text
    assert r26.status_code == 200, r26.text
    t25 = r25.json()["total_ceiling_inr"]
    t26 = r26.json()["total_ceiling_inr"]
    assert t25 != t26, f"Season isolation broken: {t25} == {t26}"
    # Expected ballpark ~41,400 vs ~46,500 (allow ±10%)
    assert 37000 <= t25 <= 46000, f"2025-26 total unexpected: {t25}"
    assert 42000 <= t26 <= 51000, f"2026-27 total unexpected: {t26}"


# ── 4. Host (2-D) vs Visitor (2-C) heads must not overlap ─────────────────
def test_host_vs_visitor_scheme_heads_disjoint():
    host_inputs = {
        "match_days": 20, "rooms_visiting": 8, "rooms_host": 8, "rooms_officials": 4,
        "daybefore_pax": 18, "matches_multiday": 1, "matches_ltdovers": 0, "local_convey_days": 6,
    }
    vis_inputs = {
        "team_strength": 18, "rail_fare_per_pax": 1500, "alt_mode_used": "No",
        "district_joining_pax": 0, "tatkal_charges": 0, "medical_estimate": 0,
    }
    rh = requests.post(f"{API}/schemes/2-D/compute-budget?fiscal_cycle=2026-27",
                       headers=MPCA_HEADERS, json={"inputs": host_inputs})
    rv = requests.post(f"{API}/schemes/2-C/compute-budget?fiscal_cycle=2026-27",
                       headers=MPCA_HEADERS, json={"inputs": vis_inputs})
    assert rh.status_code == 200 and rv.status_code == 200
    host_heads = {h["head"] for h in rh.json()["head_allocations"]}
    vis_heads = {h["head"] for h in rv.json()["head_allocations"]}
    overlap = host_heads & vis_heads
    assert not overlap, f"Host and Visitor heads overlap: {overlap}"
    # Sanity: Host should have Accommodation & Ground rent, Visitor should have rail fare
    assert any("Accommodation" in h for h in host_heads), f"Missing Accommodation in host: {host_heads}"
    assert any("Ground rent" in h for h in host_heads), f"Missing Ground rent in host: {host_heads}"
    assert any("Inter-city travel" in h or "travel" in h.lower() for h in vis_heads), f"Missing travel head in visitor: {vis_heads}"


# ── 5. Tournament auto-split ──────────────────────────────────────────────
def _ensure_season_activated():
    """Best-effort — activation may already exist. Ignore duplicate error."""
    try:
        requests.post(
            f"{API}/schemes/season-activation",
            headers=MPCA_HEADERS,
            json={"fiscal_cycle": "2026-27", "signed_pdf_url": "/api/uploads/dummy"},
        )
    except Exception:
        pass


@pytest.fixture(scope="module")
def created_tournament_ids():
    return []


def test_create_inter_div_auto_scheme_split(created_tournament_ids):
    _ensure_season_activated()
    payload = {
        "name": f"TEST_Feb2026_InterDiv_{uuid.uuid4().hex[:6]}",
        "tournament_type": "MPCA_InterDivisional",
        "tournament_type_code": "inter_div",
        "scope": "Inter_Divisional",
        "host_body_id": "MPCA",
        "fiscal_cycle": "2026-27",
        "format": "Multi_Day",
        "age_group": "Senior",
        "start_date": "2026-03-01",
        "end_date": "2026-03-10",
    }
    r = requests.post(f"{API}/tournaments", headers=MPCA_HEADERS, json=payload)
    assert r.status_code in (200, 201), r.text
    t = r.json()
    created_tournament_ids.append(t["id"])
    assert t.get("scheme_code") == "2-D", f"scheme_code={t.get('scheme_code')}"
    assert t.get("host_scheme_code") == "2-D", f"host_scheme_code={t.get('host_scheme_code')}"
    assert t.get("visiting_scheme_code") == "2-C", f"visiting_scheme_code={t.get('visiting_scheme_code')}"


def test_create_inter_district_auto_scheme_split(created_tournament_ids):
    _ensure_season_activated()
    payload = {
        "name": f"TEST_Feb2026_InterDist_{uuid.uuid4().hex[:6]}",
        "tournament_type": "Other",
        "tournament_type_code": "inter_district",
        "scope": "Inter_District",
        "host_body_id": "DIV-IND",
        "fiscal_cycle": "2026-27",
        "format": "Multi_Day",
        "age_group": "Senior",
        "start_date": "2026-03-01",
        "end_date": "2026-03-10",
    }
    r = requests.post(f"{API}/tournaments", headers=MPCA_HEADERS, json=payload)
    assert r.status_code in (200, 201), r.text
    t = r.json()
    created_tournament_ids.append(t["id"])
    assert t.get("scheme_code") == "2-B"
    assert t.get("host_scheme_code") == "2-B"
    assert t.get("visiting_scheme_code") == "2-C"


# ── 6. Mid-year edit + revision audit ─────────────────────────────────────
def test_mid_year_edit_records_revision():
    # Snapshot original heads first so we can restore
    orig = requests.get(f"{API}/reimbursement-schemes/2-A?fiscal_cycle=2026-27",
                        headers=MPCA_HEADERS).json()
    original_heads = orig["heads"]
    prior_history_len = len(orig.get("revision_history") or [])

    put_body = {
        "heads": [{
            "code": "GRANT_PER_DAY",
            "label": "Per-day Grant",
            "unit": "per_day",
            "rate_inr": 6000,
            "rate_display": "₹6,000 / day",
        }],
        "revision_note": "Test bump",
    }
    r = requests.put(f"{API}/reimbursement-schemes/2-A?fiscal_cycle=2026-27",
                     headers=MPCA_HEADERS, json=put_body)
    assert r.status_code == 200, r.text
    updated = r.json()

    # Verify new revision entry
    history = updated["revision_history"]
    assert len(history) == prior_history_len + 1
    latest = history[-1]
    assert latest["note"] == "Test bump"
    assert "heads" in latest["changed_fields"]
    assert latest["changed_by"] == "Sanjeev Dua"

    # GET back and confirm persistence
    r2 = requests.get(f"{API}/reimbursement-schemes/2-A?fiscal_cycle=2026-27",
                      headers=MPCA_HEADERS)
    got = r2.json()
    assert got["heads"][0]["rate_inr"] == 6000
    assert len(got["revision_history"]) == prior_history_len + 1

    # RESTORE — put original heads back
    restore_body = {"heads": original_heads, "revision_note": "Restore after test"}
    rr = requests.put(f"{API}/reimbursement-schemes/2-A?fiscal_cycle=2026-27",
                      headers=MPCA_HEADERS, json=restore_body)
    assert rr.status_code == 200, rr.text
    # Verify restore worked
    r3 = requests.get(f"{API}/reimbursement-schemes/2-A?fiscal_cycle=2026-27",
                      headers=MPCA_HEADERS).json()
    assert len(r3["heads"]) == len(original_heads), "Restore heads mismatch"


# ── 7. Non-MPCA cannot edit ───────────────────────────────────────────────
def test_non_mpca_cannot_edit_scheme():
    put_body = {"heads": [{"code": "X", "label": "X", "unit": "per_day",
                           "rate_inr": 1, "rate_display": "₹1"}],
                "revision_note": "should fail"}
    r = requests.put(f"{API}/reimbursement-schemes/2-A?fiscal_cycle=2026-27",
                     headers=DIV_HEADERS, json=put_body)
    assert r.status_code == 403, f"Expected 403 got {r.status_code}: {r.text}"


# ── 8. Season clone → duplicate 409 → cleanup ─────────────────────────────
def test_season_clone_and_cleanup():
    target = "TEST-99-00"
    # Attempt clone
    r = requests.post(f"{API}/reimbursement-schemes/clone-season",
                      headers=MPCA_HEADERS,
                      json={"from_cycle": "2026-27", "to_cycle": target})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cloned"] == 33
    assert body["to_cycle"] == target

    # Verify list
    r2 = requests.get(f"{API}/reimbursement-schemes?fiscal_cycle={target}&active_only=false",
                      headers=MPCA_HEADERS)
    assert r2.status_code == 200
    assert len(r2.json()) == 33

    # Duplicate clone → 409
    r3 = requests.post(f"{API}/reimbursement-schemes/clone-season",
                       headers=MPCA_HEADERS,
                       json={"from_cycle": "2026-27", "to_cycle": target})
    assert r3.status_code == 409, r3.text

    # Cleanup via Mongo
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = MongoClient(mongo_url)
    res = client[db_name].reimbursement_schemes.delete_many({"fiscal_cycle": target})
    assert res.deleted_count == 33
    client.close()


# ── Cleanup fixture — remove tournaments created during test ──────────────
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_tournaments():
    yield
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        return
    client = MongoClient(mongo_url)
    client[db_name].tournaments.delete_many({"name": {"$regex": "^TEST_Feb2026_"}})
    client.close()
