"""MPCA Feb-2026 · Player Registration sprint · MPCA-147/148/149/151/153.

Tests six tickets. Cleans up all campaigns & registrations it creates.
"""
import os
import time
import requests
import pytest

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # Fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()

MPCA_HEADERS = {
    "X-User-Body-Code": "MPCA",
    "X-Body-Type": "State",
    "X-Role-Id": "secretary",
    "X-Persona-Name": "Sanjeev Dua",
    "Content-Type": "application/json",
}
DIV_HEADERS = {
    "X-User-Body-Code": "DIV-IND",
    "X-Body-Type": "Division",
    "X-Role-Id": "secretary",
    "X-Persona-Name": "Div Sec",
    "Content-Type": "application/json",
}


def _delete_campaign(cid):
    """Best effort cleanup (no explicit delete endpoint — set is_active False)."""
    try:
        requests.delete(f"{BASE_URL}/api/player-registration-campaigns/{cid}", headers=MPCA_HEADERS, timeout=10)
    except Exception:
        pass
    # Fallback: mongo direct via patch to at least deactivate
    try:
        requests.patch(
            f"{BASE_URL}/api/player-registration-campaigns/{cid}",
            headers=MPCA_HEADERS,
            json={"is_active": False, "notes": "TEST cleanup"},
            timeout=10,
        )
    except Exception:
        pass


def _delete_reg(rid):
    try:
        requests.delete(f"{BASE_URL}/api/player-registrations/{rid}", headers=MPCA_HEADERS, timeout=10)
    except Exception:
        pass


# ─────────────── MPCA-147 · Campaign create returns cycle_code ───────────────

def test_mpca147_campaign_create_returns_cycle():
    payload = {"body_code": "MPCA", "cycle_code": "2026-27", "title": "TEST · MPCA-147 · cycle check"}
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns", headers=MPCA_HEADERS, json=payload, timeout=15)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    doc = r.json()
    assert doc["cycle_code"] == "2026-27", f"Expected cycle_code 2026-27, got {doc.get('cycle_code')}"
    assert doc["title"] == payload["title"]
    _delete_campaign(doc["id"])


# ─────────────── MPCA-148 · Registration-campaign approval surfaces in Action Centre ───────────────

def test_mpca148_pending_campaign_in_action_centre():
    # Division creates a campaign — will land Pending.
    div_payload = {"body_code": "DIV-IND", "cycle_code": "2026-27", "title": "TEST · MPCA-148 · pending req"}
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns", headers=DIV_HEADERS, json=div_payload, timeout=15)
    assert r.status_code == 200, f"Div create failed: {r.status_code} {r.text}"
    camp = r.json()
    cid = camp["id"]
    assert camp["request_status"] == "Pending", f"expected Pending, got {camp.get('request_status')}"

    try:
        r2 = requests.get(f"{BASE_URL}/api/pending-actions/me", headers=MPCA_HEADERS, timeout=15)
        assert r2.status_code == 200, f"pending-actions failed: {r2.status_code} {r2.text}"
        data = r2.json()
        items = data.get("items", [])
        matches = [i for i in items if i.get("kind") == "registration_campaign_approval" and i.get("record_id") == cid]
        assert matches, (
            f"registration_campaign_approval for {cid} not surfaced in Action Centre. "
            f"Kinds seen: {[i.get('kind') for i in items[:20]]}"
        )
        m = matches[0]
        assert m.get("link") == "/player-registrations"
        assert m.get("waiting_on") == "MPCA"
    finally:
        _delete_campaign(cid)


# ─────────────── MPCA-149 · Public form accepts submission without home_district_code ───────────────

@pytest.fixture(scope="module")
def approved_campaign():
    """MPCA creates an auto-Approved campaign; teardown deletes it."""
    payload = {"body_code": "MPCA", "cycle_code": "2026-27", "title": "TEST · Sprint pub form"}
    r = requests.post(f"{BASE_URL}/api/player-registration-campaigns", headers=MPCA_HEADERS, json=payload, timeout=15)
    assert r.status_code == 200
    camp = r.json()
    assert camp["request_status"] == "Approved"
    yield camp
    _delete_campaign(camp["id"])


def _base_player(email_suffix, division="DIV-IND"):
    return {
        "first_name": "TESTFN",
        "surname": "TESTSN",
        "dob": "2005-05-15",
        "gender": "M",
        "role": "Batter",
        "mobile": "9999911111",
        "email": f"TEST_reg_{email_suffix}_{int(time.time()*1000)}@example.com",
        "preferred_division_code": division,
        "consent": True,
        "dpdp_consent": True,
    }


def test_mpca149_public_submit_without_home_district(approved_campaign):
    token = approved_campaign["public_token"]
    player = _base_player("149")
    r = requests.post(
        f"{BASE_URL}/api/public/player-registration/submit",
        json={"token": token, "player": player},
        timeout=20,
    )
    assert r.status_code == 200, f"submit failed: {r.status_code} {r.text}"
    reg = r.json()
    assert "home_district_code" not in reg["player_data"] or not reg["player_data"].get("home_district_code")
    _delete_reg(reg["id"])


# ─────────────── MPCA-151 · 15 new fields ───────────────

def test_mpca151_15_new_fields_roundtrip(approved_campaign):
    token = approved_campaign["public_token"]
    player = _base_player("151")
    extras = {
        "samagra_id_player_url": "https://example.com/samagra_p.pdf",
        "samagra_id_family_url": "https://example.com/samagra_f.pdf",
        "consent_form_url": "https://example.com/consent.pdf",
        "no_study_affidavit_url": "https://example.com/affidavit.pdf",
        "bonafide_school_cert_url": "https://example.com/bonafide.pdf",
        "is_employed": True,
        "appointment_letter_url": "https://example.com/appt.pdf",
        "salary_slip_url": "https://example.com/salary.pdf",
        "bank_statement_1yr_url": "https://example.com/bank12mo.pdf",
        "last_season_division_code": "DIV-BPL",
        "noc_previous_division_url": "https://example.com/noc.pdf",
        "place_of_birth_city": "Indore",
        "place_of_birth_state": "MP",
        "bcci_registered": True,
        "bcci_registration_year": 2022,
    }
    player.update(extras)
    r = requests.post(
        f"{BASE_URL}/api/public/player-registration/submit",
        json={"token": token, "player": player},
        timeout=20,
    )
    assert r.status_code == 200, f"submit failed: {r.status_code} {r.text}"
    rid = r.json()["id"]

    try:
        g = requests.get(f"{BASE_URL}/api/player-registrations/{rid}", headers=MPCA_HEADERS, timeout=15)
        assert g.status_code == 200, f"get reg failed: {g.status_code} {g.text}"
        pd = g.json().get("player_data") or {}
        missing = [k for k, v in extras.items() if pd.get(k) != v]
        assert not missing, f"Fields not persisted correctly: {missing}. Got: {[(k, pd.get(k)) for k in missing]}"
    finally:
        _delete_reg(rid)


# ─────────────── MPCA-153 · Edit endpoint with audit diff ───────────────

def test_mpca153_edit_endpoint_audit_diff(approved_campaign):
    token = approved_campaign["public_token"]
    player = _base_player("153edit")
    player["place_of_birth_city"] = "Indore"
    player["bcci_registered"] = True
    player["bcci_registration_year"] = 2021
    r = requests.post(f"{BASE_URL}/api/public/player-registration/submit",
                      json={"token": token, "player": player}, timeout=20)
    assert r.status_code == 200
    rid = r.json()["id"]

    try:
        patch = {"place_of_birth_city": "Bhopal", "bcci_registration_year": 2023, "mobile": "9111111111"}
        e = requests.post(
            f"{BASE_URL}/api/player-registrations/{rid}/edit",
            headers=MPCA_HEADERS,
            json={"patch": patch, "actor_name": "MPCA"},
            timeout=15,
        )
        assert e.status_code == 200, f"edit failed: {e.status_code} {e.text}"
        doc = e.json()
        events = doc.get("audit_events") or []
        edited_events = [ev for ev in events if ev.get("event") == "edited"]
        assert edited_events, f"no 'edited' event found. Events: {[ev.get('event') for ev in events]}"
        newest = edited_events[-1]
        diff = newest.get("diff") or {}
        for k, new_v in patch.items():
            assert k in diff, f"diff missing field {k}. diff={diff}"
            assert diff[k][1] == new_v, f"diff[{k}][1]={diff[k][1]!r} expected {new_v!r}"
        # old vs new for place_of_birth_city
        assert diff["place_of_birth_city"][0] == "Indore"
        assert diff["bcci_registration_year"][0] == 2021
    finally:
        _delete_reg(rid)


# ─────────────── MPCA-153 · division-approve triggers email (mock log) ───────────────

def test_mpca153_division_approve_emits_email_mock(approved_campaign):
    token = approved_campaign["public_token"]
    # Use preferred_division_code = MPCA so the MPCA persona counts as "home division" too? No.
    # The campaign is body_code=MPCA. _is_home_division checks caller_body in {pref, body}.
    # So we use preferred_division_code=DIV-IND then div-approve with DIV_HEADERS.
    player = _base_player("153div", division="DIV-IND")
    r = requests.post(f"{BASE_URL}/api/public/player-registration/submit",
                      json={"token": token, "player": player}, timeout=20)
    assert r.status_code == 200
    rid = r.json()["id"]

    try:
        d = requests.post(
            f"{BASE_URL}/api/player-registrations/{rid}/division-approve",
            headers=DIV_HEADERS,
            json={"remark": "ok · TEST", "actor_name": "Div"},
            timeout=15,
        )
        assert d.status_code == 200, f"div-approve failed: {d.status_code} {d.text}"
        doc = d.json()
        assert doc["status"] == "Division_Approved"
        # Give backend a beat to flush stdout
        time.sleep(1.5)

        # Check backend log for [EMAIL · MOCKED] with "passed Division review"
        found = False
        for log in ("/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"):
            try:
                with open(log, "r") as f:
                    tail = f.read()[-40000:]
                if "[EMAIL" in tail and "passed Division review" in tail:
                    found = True
                    break
            except FileNotFoundError:
                continue
        assert found, "[EMAIL · MOCKED] line with 'passed Division review' subject not found in backend logs"
    finally:
        _delete_reg(rid)
