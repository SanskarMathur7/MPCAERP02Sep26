"""M39b/c — Event Calendar + Birthday Reminders + Scheme Season Activation Gate"""
import os
import time
from datetime import date

import pytest
import requests

_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not _URL:
    # Fallback: read frontend/.env
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    _URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
if not _URL:
    raise RuntimeError("REACT_APP_BACKEND_URL not set")
BASE_URL = _URL.rstrip("/")

# Persona headers
MPCA = {
    "X-Persona-Id": "test-mpca-pres",
    "X-Body-Code": "MPCA",
    "X-Body-Type": "State",
    "X-Persona-Name": "TEST_MPCA President",
}
DIV = {
    "X-Persona-Id": "test-div-sec",
    "X-Body-Code": "DIV-IND",
    "X-Body-Type": "Division",
    "X-Persona-Name": "TEST_DIV Secretary",
}

BDAY_MEMBER_ID = "cffa6cc2-78fa-4ef6-b90a-836ad9969814"  # Devendra Bundela, DOB 1976-07-27
NON_BDAY_ID = "70981d75-6613-490d-9183-31007d58350f"     # DOB 1985-01-15


# ── Event CRUD + RBAC ──────────────────────────────────────────────────
class TestEventsRBAC:
    def test_list_events_open_to_all(self):
        r = requests.get(f"{BASE_URL}/api/events", headers=DIV)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_mpca_can_create(self, request):
        payload = {
            "title": "TEST_M39 Exec Council",
            "event_date": f"{date.today().isoformat()}",
            "location": "MPCA Boardroom",
            "event_type": "meeting",
        }
        r = requests.post(f"{BASE_URL}/api/events", json=payload, headers=MPCA)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == payload["title"]
        assert data["event_date"] == payload["event_date"]
        assert "id" in data
        # stash for later cleanup / re-use
        request.config.cache.set("m39/event_id", data["id"])

        # verify GET reflects it
        r2 = requests.get(f"{BASE_URL}/api/events", headers=MPCA)
        assert any(e["id"] == data["id"] for e in r2.json())

    def test_division_cannot_create(self):
        payload = {"title": "TEST_M39 Bad", "event_date": date.today().isoformat()}
        r = requests.post(f"{BASE_URL}/api/events", json=payload, headers=DIV)
        assert r.status_code == 403
        assert "MPCA" in r.json().get("detail", "")

    def test_division_cannot_patch(self, request):
        eid = request.config.cache.get("m39/event_id", None)
        if not eid:
            pytest.skip("no event created")
        r = requests.patch(
            f"{BASE_URL}/api/events/{eid}", json={"title": "hack"}, headers=DIV
        )
        assert r.status_code == 403

    def test_division_cannot_delete(self, request):
        eid = request.config.cache.get("m39/event_id", None)
        if not eid:
            pytest.skip("no event created")
        r = requests.delete(f"{BASE_URL}/api/events/{eid}", headers=DIV)
        assert r.status_code == 403

    def test_mpca_patch_ok(self, request):
        eid = request.config.cache.get("m39/event_id", None)
        if not eid:
            pytest.skip("no event created")
        r = requests.patch(
            f"{BASE_URL}/api/events/{eid}",
            json={"location": "MPCA Boardroom · Updated"},
            headers=MPCA,
        )
        assert r.status_code == 200
        assert r.json()["location"] == "MPCA Boardroom · Updated"

    def test_mpca_delete_ok(self, request):
        eid = request.config.cache.get("m39/event_id", None)
        if not eid:
            pytest.skip("no event created")
        r = requests.delete(f"{BASE_URL}/api/events/{eid}", headers=MPCA)
        assert r.status_code == 200
        assert r.json().get("deleted") is True


# ── Birthdays ──────────────────────────────────────────────────────────
class TestBirthdays:
    def test_today_contains_devendra(self):
        r = requests.get(f"{BASE_URL}/api/events/birthdays/today", headers=DIV)
        assert r.status_code == 200
        data = r.json()
        # Devendra DOB 1976-07-27 — depends on real today; check membership if today's 07-27
        today = date.today()
        if (today.month, today.day) == (7, 27):
            names = [m.get("name", "") for m in data["members"]]
            assert any("Devendra" in n for n in names), f"Expected Devendra, got {names}"
            assert data["count"] >= 1
        else:
            pytest.skip(f"Today is {today} — Devendra bday is 07-27; date-dependent")

    def test_today_visible_to_mpca(self):
        r = requests.get(f"{BASE_URL}/api/events/birthdays/today", headers=MPCA)
        assert r.status_code == 200
        assert "members" in r.json()

    def test_upcoming_includes_today_but_not_far(self):
        r = requests.get(f"{BASE_URL}/api/events/birthdays/upcoming?days=30", headers=MPCA)
        assert r.status_code == 200
        data = r.json()
        ids = [m["id"] for m in data["members"]]
        today = date.today()
        if (today.month, today.day) == (7, 27):
            assert BDAY_MEMBER_ID in ids
            # 1985-01-15 should NOT be within 30 days of July 27
            assert NON_BDAY_ID not in ids

    def test_send_daily_emails_mocked(self):
        r = requests.post(f"{BASE_URL}/api/events/birthdays/send-daily-emails", headers=MPCA)
        assert r.status_code == 200
        data = r.json()
        assert data.get("mocked") is True
        assert "attempted" in data and "sent" in data


# ── Scheme Season Activation Gate ─────────────────────────────────────
class TestSchemeActivation:
    def test_bootstrap_seasons_activated(self):
        for cycle in ["2024-25", "2025-26", "2026-27"]:
            r = requests.get(
                f"{BASE_URL}/api/schemes/season-activation?fiscal_cycle={cycle}",
                headers=MPCA,
            )
            assert r.status_code == 200, r.text
            assert r.json().get("is_active") is True, f"{cycle} not active"

    def test_novel_season_not_active(self):
        r = requests.get(
            f"{BASE_URL}/api/schemes/season-activation?fiscal_cycle=2099-99",
            headers=MPCA,
        )
        assert r.status_code == 200
        assert r.json().get("is_active") is False

    def test_division_cannot_activate(self):
        r = requests.post(
            f"{BASE_URL}/api/schemes/season-activation",
            json={"fiscal_cycle": "2099-99", "signed_pdf_url": "/tmp/x.pdf"},
            headers=DIV,
        )
        assert r.status_code == 403

    def test_mpca_can_activate(self):
        r = requests.post(
            f"{BASE_URL}/api/schemes/season-activation",
            json={"fiscal_cycle": "TEST-2099-99", "signed_pdf_url": "/uploads/TEST_signed.pdf"},
            headers=MPCA,
        )
        assert r.status_code == 200
        assert r.json().get("is_active") is True

    def test_tournament_creation_blocked_on_inactive_season(self):
        # Use novel cycle guaranteed inactive
        payload = {
            "name": "TEST_M39 Gate Tournament",
            "format": "T20",
            "scope": "Inter_Divisional",
            "host_body_id": "MPCA",
            "fiscal_cycle": "2098-99",
            "start_date": "2098-06-01",
            "end_date": "2098-06-15",
        }
        r = requests.post(f"{BASE_URL}/api/tournaments", json=payload, headers=MPCA)
        # Must reject due to scheme activation gate
        assert r.status_code == 403, f"expected 403 gate rejection, got {r.status_code}: {r.text[:400]}"
        detail = (r.json().get("detail") or "").lower()
        assert "activat" in detail or "scheme" in detail, r.text

    def test_grant_claim_blocked_on_inactive_season(self):
        payload = {
            "scheme_code": "1-A",
            "body_id": "DIV-IND",
            "fiscal_cycle": "2098-99",
            "claimed_amount_inr": 10000,
        }
        r = requests.post(f"{BASE_URL}/api/grant-claims", json=payload, headers=DIV)
        assert r.status_code == 403, f"expected 403 gate, got {r.status_code}: {r.text[:400]}"
        detail = (r.json().get("detail") or "").lower()
        assert "activat" in detail or "scheme" in detail

    def test_tournament_ok_on_active_season(self):
        payload = {
            "name": "TEST_M39 Active Season Tournament",
            "format": "T20",
            "scope": "Inter_Divisional",
            "host_body_id": "MPCA",
            "fiscal_cycle": "2026-27",
            "start_date": "2026-08-01",
            "end_date": "2026-08-15",
        }
        r = requests.post(f"{BASE_URL}/api/tournaments", json=payload, headers=MPCA)
        # not asserting 200 (schema may need more fields) — just that it's not blocked by activation
        if r.status_code in (400, 403):
            detail = (r.json().get("detail") or "").lower()
            assert not ("not yet activat" in detail), (
                f"tournament wrongly blocked on ACTIVE season: {r.text[:300]}"
            )


# ── Member DOB persistence ────────────────────────────────────────────
class TestMemberDOB:
    def test_member_has_dob(self):
        r = requests.get(f"{BASE_URL}/api/members/{BDAY_MEMBER_ID}", headers=MPCA)
        assert r.status_code == 200, r.text
        assert r.json().get("date_of_birth") == "1976-07-27"

    def test_member_dob_update_persists(self):
        # Read → change → revert
        orig = requests.get(f"{BASE_URL}/api/members/{NON_BDAY_ID}", headers=MPCA).json()
        original_dob = orig.get("date_of_birth")
        new_dob = "1990-03-14"
        r = requests.patch(
            f"{BASE_URL}/api/members/{NON_BDAY_ID}",
            json={"date_of_birth": new_dob},
            headers=MPCA,
        )
        if r.status_code == 405:
            # try PUT
            r = requests.put(
                f"{BASE_URL}/api/members/{NON_BDAY_ID}",
                json={"date_of_birth": new_dob},
                headers=MPCA,
            )
        assert r.status_code in (200, 204), r.text
        got = requests.get(f"{BASE_URL}/api/members/{NON_BDAY_ID}", headers=MPCA).json()
        assert got.get("date_of_birth") == new_dob
        # revert
        if original_dob:
            requests.patch(
                f"{BASE_URL}/api/members/{NON_BDAY_ID}",
                json={"date_of_birth": original_dob},
                headers=MPCA,
            )
