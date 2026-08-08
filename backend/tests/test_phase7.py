"""Phase 7 · MPCA-113/114/115/118/129 backend tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to reading frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ── MPCA-113 · Sub-committee registry ──────────────────────────────────────
class TestSubCommittees:
    def test_list_returns_8_curated(self, s):
        r = s.get(f"{API}/sub-committees")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) == 8
        codes = {c["code"] for c in data}
        assert {"SELECTION", "FINANCE", "INFRA", "DISCIPLINARY", "UMPIRING",
                "COACHING", "WOMENS", "MEDIA"} == codes
        for c in data:
            assert "label" in c and "description" in c and "member_count" in c
            assert isinstance(c["member_count"], int)

    def test_selection_members_shape(self, s):
        r = s.get(f"{API}/sub-committees/SELECTION/members")
        assert r.status_code == 200
        data = r.json()
        assert data["code"] == "SELECTION"
        assert data["label"] == "Selection"
        assert isinstance(data["count"], int)
        assert isinstance(data["members"], list)
        assert data["count"] == len(data["members"])

    def test_unknown_code_404(self, s):
        r = s.get(f"{API}/sub-committees/NOPE/members")
        assert r.status_code == 404


# ── MPCA-113 & MPCA-114 · Meeting create with sub-committee + documents ─────
class TestMeetingCreateExpanded:
    def test_create_with_subcommittee_expands_attendees(self, s):
        # get selection members first
        sel = s.get(f"{API}/sub-committees/SELECTION/members").json()
        member_ids = [m["id"] for m in sel["members"]]

        payload = {
            "title": "TEST_Phase7 Selection Meeting",
            "meeting_type": "Sub_Committee",
            "scheduled_date": "2026-03-15",
            "scheduled_time": "11:00 AM",
            "venue": "MPCA Board Room",
            "sub_committee_code": "SELECTION",
            "external_attendees": [
                {"name": "TEST_Guest", "email": "guest@example.com"}
            ],
            "documents": [
                {"name": "Agenda PDF", "url": "https://africau.edu/images/default/sample.pdf"}
            ],
        }
        r = s.post(f"{API}/meetings", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["sub_committee_code"] == "SELECTION"
        # attendees should contain each selection member id
        for mid in member_ids:
            assert mid in m["attendees"], f"missing {mid}"
        # external attendees preserved
        assert len(m["external_attendees"]) == 1
        assert m["external_attendees"][0]["email"] == "guest@example.com"
        # documents preserved
        assert len(m["documents"]) == 1
        assert m["documents"][0]["name"] == "Agenda PDF"

        # GET verifies persistence
        g = s.get(f"{API}/meetings/{m['id']}")
        assert g.status_code == 200
        gd = g.json()
        assert gd["documents"][0]["url"].endswith("sample.pdf")
        assert gd["sub_committee_code"] == "SELECTION"

        # cleanup
        s.delete(f"{API}/meetings/{m['id']}")

    def test_create_without_subcommittee_no_expansion(self, s):
        payload = {
            "title": "TEST_Phase7 Plain",
            "meeting_type": "Committee",
            "scheduled_date": "2026-03-16",
            "venue": "Room A",
        }
        r = s.post(f"{API}/meetings", json=payload)
        assert r.status_code == 200
        m = r.json()
        assert m["attendees"] == []
        assert m["documents"] == []
        s.delete(f"{API}/meetings/{m['id']}")


# ── MPCA-118 · SMTP mocked email dispatch ──────────────────────────────────
class TestBirthdayEmails:
    def test_birthdays_today_ok(self, s):
        r = s.get(f"{API}/events/birthdays/today")
        assert r.status_code == 200
        data = r.json()
        # Endpoint returns {count, date, members: [...]}
        assert "members" in data
        assert isinstance(data["members"], list)

    def test_send_daily_returns_mocked(self, s):
        r = s.post(f"{API}/events/birthdays/send-daily-emails")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "mocked" in data
        assert "attempted" in data
        assert "sent" in data
        # When SMTP_HOST unset, we expect mocked True (or all sent entries mocked)
        if data.get("sent"):
            statuses = {e.get("status") for e in data["sent"]}
            assert statuses.issubset({"mocked", "sent", "skipped", "error"})


# ── Regression: existing meetings endpoint healthy ─────────────────────────
class TestMeetingsRegression:
    def test_list_meetings(self, s):
        r = s.get(f"{API}/meetings")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
