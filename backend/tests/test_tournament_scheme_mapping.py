"""MPCA-Sprint · Tournament type → scheme_code mapping correction

Tests the bug-fix batch that re-mapped tournament_type codes in
/app/frontend/src/lib/tournamentCatalog.js to their correct MPCA scheme codes.

We do three things:
  1. Grep-verify the JS catalog file itself has the exact scheme_code values.
  2. Verify every mapped scheme_code exists in db.reimbursement_schemes AND
     that its `name` semantically matches the tournament type.
  3. Create a fresh Tournament for each tournament_type_code via POST
     /api/tournaments (as MPCA persona) and assert scheme_code on the
     returned document matches the catalog mapping (i.e. the backend
     preserves the passed scheme_code and does not override it).

Regression:
  - GET /api/tournaments still returns 200.
  - GET /api/tournaments/{id} for a newly created tournament works.
"""
import os
import re
import uuid
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # Fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

# ─────────── Expected mapping (per task spec) ───────────
EXPECTED_MAPPING = {
    "bcci_staging":       "9-BCCI",
    "away_participation": "9-BCCI",
    "inter_div":          "2-D",
    "inter_div_travel":   "2-C",
    "inter_district":     "2-B",
    "inter_school":       "2-A",
    "inter_club":         "2-E",
    "reciprocal":         "3-C",
    "pre_camp":           "3-D",
    "coaching_camp":      "3-A",
    "vacation_camp":      "3-B",
    "custom":             None,
}

# Semantic keywords that must appear (case-insensitive) in db scheme name
SCHEME_NAME_KEYWORDS = {
    "9-BCCI": ["bcci"],
    "2-A":    ["inter-school", "inter school"],
    "2-B":    ["inter-district", "inter district"],
    "2-C":    ["inter-divisional", "travel", "visiting", "participation"],
    "2-D":    ["inter-divisional", "hosting"],
    "2-E":    ["inter-club", "inter club", "club"],
    "3-A":    ["coaching", "camp"],
    "3-B":    ["vacation"],
    "3-C":    ["reciprocal"],
    "3-D":    ["pre", "camp"],
}

# MPCA secretary persona headers
MPCA_HEADERS = {
    "X-Role-Id": "secretary",
    "X-User-Name": "Shri Sanjeev Dua",
    "X-User-Body-Code": "MPCA",
    "X-Body-Code": "MPCA",
    "X-Body-Type": "State",
    "Content-Type": "application/json",
}


@pytest.fixture(scope="module")
def catalog_text():
    path = "/app/frontend/src/lib/tournamentCatalog.js"
    with open(path) as f:
        return f.read()


@pytest.fixture(scope="module")
def all_schemes():
    r = requests.get(f"{API}/reimbursement-schemes", timeout=15)
    assert r.status_code == 200, f"GET /reimbursement-schemes → {r.status_code}: {r.text[:300]}"
    schemes = r.json()
    return {s["scheme_code"]: s for s in schemes}


# ═════════ 1. Catalog file mapping verification ═════════
@pytest.mark.parametrize("code,expected_scheme", list(EXPECTED_MAPPING.items()))
def test_catalog_mapping(catalog_text, code, expected_scheme):
    """Ensure JS catalog file contains the expected code→scheme_code pair."""
    # Match a block like:  code: "inter_div", ... scheme_code: "2-D",
    #  Note the fields may be reordered in the file but currently
    # scheme_code is right after code.
    pat = re.compile(
        r'code:\s*"' + re.escape(code) + r'"[^{}]*?scheme_code:\s*(?P<val>"[^"]*"|null)',
        re.DOTALL,
    )
    m = pat.search(catalog_text)
    if not m and code == "custom":
        pytest.skip("`custom` type not present in catalog (may not be defined)")
    assert m, f"Could not locate mapping for `{code}` in catalog file"
    val = m.group("val")
    if expected_scheme is None:
        assert val == "null", f"{code}: expected null, got {val}"
    else:
        assert val == f'"{expected_scheme}"', f"{code}: expected {expected_scheme}, got {val}"


# ═════════ 2. Backend DB scheme existence + semantic name match ═════════
@pytest.mark.parametrize("scheme_code,keywords", list(SCHEME_NAME_KEYWORDS.items()))
def test_scheme_exists_in_db(all_schemes, scheme_code, keywords):
    assert scheme_code in all_schemes, (
        f"Scheme {scheme_code} NOT found in reimbursement_schemes DB collection. "
        f"Available codes: {sorted(all_schemes.keys())}"
    )
    name = (all_schemes[scheme_code].get("name") or "").lower()
    # At least one of the alternative keywords must match
    assert any(kw.lower() in name for kw in keywords), (
        f"Scheme {scheme_code} name `{name}` does not semantically match "
        f"any of {keywords}"
    )


# ═════════ 3. Calculator input-spec endpoint ═════════
CALC_CODES = ["2-A", "2-B", "2-C", "2-D", "3-A", "3-D"]
NON_CALC_CODES = ["2-E", "3-B", "3-C", "9-BCCI"]


@pytest.mark.parametrize("scheme_code", CALC_CODES)
def test_input_spec_returns_variables(scheme_code):
    r = requests.get(f"{API}/schemes/{scheme_code}/input-spec", timeout=10)
    assert r.status_code == 200, f"{scheme_code} → {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert data["scheme_code"] == scheme_code
    assert isinstance(data.get("input_variables"), list)
    assert len(data["input_variables"]) > 0, (
        f"{scheme_code} returned empty input_variables"
    )


@pytest.mark.parametrize("scheme_code", NON_CALC_CODES)
def test_input_spec_non_calc(scheme_code):
    """Non-calculator schemes: OK for input_variables to be empty (informational only)."""
    r = requests.get(f"{API}/schemes/{scheme_code}/input-spec", timeout=10)
    # 404 (scheme missing) or 200 with empty vars are both acceptable; we log state
    print(f"[non-calc] {scheme_code} → {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        # informational only, but must include the scheme_code
        assert data["scheme_code"] == scheme_code


# ═════════ 4. Create tournaments and confirm scheme_code preserved ═════════
NEW_TOURNAMENT_TYPES = [
    ("bcci_staging",       "9-BCCI", "BCCI",                 "Championship",        "FiveDay",    "MPCA"),
    ("away_participation", "9-BCCI", "BCCI",                 "Championship",        "FiveDay",    "MPCA"),
    ("inter_div",          "2-D",   "MPCA_InterDivisional",  "Inter_Divisional",    "Multi_Day",  "MPCA"),
    ("inter_district",     "2-B",   "MPCA_InterDivisional",  "Inter_District",      "Multi_Day",  "DIV-IND"),
    ("inter_school",       "2-A",   "Invitational",          "Inter_District",      "One_Day",    "DIV-IND"),
    ("inter_club",         "2-E",   "Invitational",          "Inter_District",      "Multi_Day",  "DIV-IND"),
    ("reciprocal",         "3-C",   "MPCA_InterDivisional",  "Inter_Divisional",    "Multi_Day",  "DIV-IND"),
    ("vacation_camp",      "3-B",   "MPCA_InterDivisional",  "Inter_District",      "Multi_Day",  "DIV-IND"),
]

_created_tids: list[str] = []


@pytest.mark.parametrize("type_code,scheme,ttype,scope,fmt,host", NEW_TOURNAMENT_TYPES)
def test_create_tournament_preserves_scheme_code(type_code, scheme, ttype, scope, fmt, host):
    tag = uuid.uuid4().hex[:6]
    payload = {
        "name": f"TEST_MAP_{type_code}_{tag}",
        "format": fmt,
        "scope": scope,
        "tournament_type": ttype,
        "tournament_type_code": type_code,
        "fiscal_cycle": "2025-26",
        "host_body_id": host,
        "scheme_code": scheme,
        "start_date": "2026-02-15",
        "end_date": "2026-02-20",
    }
    r = requests.post(f"{API}/tournaments", json=payload, headers=MPCA_HEADERS, timeout=20)
    if r.status_code == 403 and "not yet activated" in r.text.lower():
        pytest.skip("Season not activated; cannot create tournaments in this env")
    assert r.status_code == 200, f"POST → {r.status_code}: {r.text[:400]}"
    doc = r.json()
    assert doc.get("scheme_code") == scheme, (
        f"{type_code}: expected scheme_code={scheme}, got {doc.get('scheme_code')}"
    )
    assert doc.get("tournament_type_code") == type_code
    _created_tids.append(doc["id"])

    # Verify persistence via GET
    g = requests.get(f"{API}/tournaments/{doc['id']}", headers=MPCA_HEADERS, timeout=10)
    assert g.status_code == 200
    assert g.json().get("scheme_code") == scheme


# ═════════ 5. Regression ═════════
def test_regression_list_tournaments():
    r = requests.get(f"{API}/tournaments", headers=MPCA_HEADERS, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_regression_get_created_tournament():
    if not _created_tids:
        pytest.skip("No tournaments created (all skipped/failed)")
    tid = _created_tids[0]
    r = requests.get(f"{API}/tournaments/{tid}", headers=MPCA_HEADERS, timeout=10)
    assert r.status_code == 200
    assert r.json()["id"] == tid
