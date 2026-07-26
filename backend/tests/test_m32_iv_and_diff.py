"""
M32 · Two-tier Input Variables + per-Division budgets + diff-master
Sprint tests for the Jan-2026 iteration (see /app/test_reports/iteration_51.json).
"""
import os
import copy
import pytest
import requests

def _get_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "")
    if not url:
        # Fallback: read from /app/frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.strip().split("=", 1)[1].strip('"').strip("'")
                        break
        except Exception:
            pass
    return url.rstrip("/")

BASE_URL = _get_backend_url()
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

TID_SM_KHAN = "58bd8f3c-2562-4231-b846-537103e8a542"
DIV_IND = "DIV-IND"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ─────────────────── Baseline: tournament + participant exist ───────────────────

def test_tournament_exists(api):
    r = api.get(f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}")
    assert r.status_code == 200
    t = r.json()
    assert t.get("input_variables"), "SM Khan tournament must have master IV"
    assert t.get("scheme_code"), "SM Khan tournament must have scheme_code"


def test_participant_has_inherited_iv(api):
    r = api.get(f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}")
    assert r.status_code == 200
    p = r.json()
    assert p.get("input_variables"), "DIV-IND must have input_variables populated (inherited from master)"


# ─────────────────── PATCH input-variables ───────────────────

def test_patch_participant_iv_updates_row(api):
    # Read current IV
    r = api.get(f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}")
    current = r.json().get("input_variables") or {}
    modified = copy.deepcopy(current)
    # bump match_days if present, else add a marker key
    if "match_days" in modified:
        modified["match_days"] = (int(modified.get("match_days") or 0)) + 2
    else:
        modified["match_days"] = 10

    r2 = api.patch(
        f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}/input-variables",
        json={"input_variables": modified, "updated_by": "TEST_M32"},
    )
    assert r2.status_code == 200, r2.text
    row = r2.json()
    assert row["input_variables"]["match_days"] == modified["match_days"]
    assert row.get("input_variables_updated_at")
    assert row.get("input_variables_updated_by") == "TEST_M32"


def test_patch_iv_404_when_participant_missing(api):
    r = api.patch(
        f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/DOES-NOT-EXIST/input-variables",
        json={"input_variables": {"match_days": 5}, "updated_by": "TEST_M32"},
    )
    assert r.status_code == 404


# ─────────────────── POST budget/generate ───────────────────

def test_budget_generate_regenerates_existing_draft(api):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}/budget/generate",
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "budget" in data
    b = data["budget"]
    assert b.get("body_id") == DIV_IND
    assert b.get("input_variables_snapshot")
    assert b.get("head_allocations")
    assert b.get("total_ceiling_inr") > 0
    # Existing draft TB-2026-27-002 → regenerated=True expected
    assert data.get("regenerated") is True, data


def test_budget_generate_404_missing_participant(api):
    r = api.post(
        f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/DOES-NOT-EXIST/budget/generate",
    )
    assert r.status_code == 404


# ─────────────────── GET diff-master ───────────────────

def test_diff_master_returns_diff(api):
    # Ensure a divergent IV first
    r0 = api.get(f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}")
    iv = r0.json().get("input_variables") or {}
    tourn = api.get(f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}").json()
    master_iv = tourn.get("input_variables") or {}
    # Force divergence
    iv2 = copy.deepcopy(master_iv)
    iv2["match_days"] = int(master_iv.get("match_days") or 8) + 3
    api.patch(
        f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}/input-variables",
        json={"input_variables": iv2, "updated_by": "TEST_M32_diff"},
    )
    gen = api.post(f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}/budget/generate")
    assert gen.status_code == 200
    bid = gen.json()["budget"]["id"]

    r = api.get(f"{BASE_URL}/api/tournament-budgets/{bid}/diff-master")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("diffable") is True, d
    assert "master_total_inr" in d
    assert "division_total_inr" in d
    assert "delta_total_inr" in d
    assert isinstance(d.get("heads"), list) and len(d["heads"]) > 0
    for h in d["heads"]:
        assert "head" in h and "master_inr" in h and "division_inr" in h and "changed" in h
    assert "changed_heads_count" in d
    assert isinstance(d.get("input_variable_changes"), list)
    # Since we bumped match_days, IV diffs must include it
    keys = [c["key"] for c in d["input_variable_changes"]]
    assert "match_days" in keys


def test_submit_stamps_submitted_by_body(api):
    # find or create a Draft budget for DIV-IND
    r = api.get(f"{BASE_URL}/api/tournament-budgets?tournament_id={TID_SM_KHAN}")
    assert r.status_code == 200
    budgets = r.json()
    draft = None
    for b in budgets:
        if b.get("body_id") == DIV_IND and b.get("status") in ("Draft", "Returned"):
            draft = b
            break
    if not draft:
        # regenerate to get one
        gen = api.post(
            f"{BASE_URL}/api/tournaments/{TID_SM_KHAN}/participants/{DIV_IND}/budget/generate"
        )
        draft = gen.json()["budget"]

    bid = draft["id"]
    r2 = api.post(
        f"{BASE_URL}/api/tournament-budgets/{bid}/submit",
        json={
            "actor_body_id": DIV_IND,
            "actor_name": "TEST_M32 Devashish",
            "actor_post": "Division Secretary",
            "notes": "test submit",
        },
    )
    assert r2.status_code == 200, r2.text
    b = r2.json()
    assert b.get("submitted_by_body") == DIV_IND
    assert b.get("submitted_by_name") == "TEST_M32 Devashish"
    assert b.get("submitted_at")

    # Reset back to Draft for future test runs — return it
    api.post(
        f"{BASE_URL}/api/tournament-budgets/{bid}/return",
        json={"actor_body_id": "MPCA", "actor_name": "TEST cleanup", "actor_post": "Secretary", "notes": "reset for tests"},
    )
