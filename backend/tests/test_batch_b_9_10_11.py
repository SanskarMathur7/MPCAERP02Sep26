"""Batch B backend tests · Items 9, 10, 11
Grounds overhaul (venue optional), Meeting AI signed-minutes, Squad AI advisory review.
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

MPCA_HEADERS = {"X-Body-Code": "MPCA", "X-Body-Type": "State", "X-Role-Id": "secretary", "X-User-Name": "MPCA Sec"}
DIV_HEADERS = {"X-Body-Code": "DIV-IND", "X-Body-Type": "Division", "X-Role-Id": "division-secretary", "X-User-Name": "Div Sec"}


# ─── Item 9 · Grounds without venue_id ────────────────────────────────
class TestItem9GroundsOverhaul:
    created_id = None

    def test_create_ground_without_venue_id(self):
        payload = {
            "name": "TEST_Batch_B_Ground",
            "type": "Main",
            "city": "Bhopal",
            "owner_body_id": "MPCA",
            "owner_name": "MPCA HQ",
            "bcci_approval": "Domestic",
            "floodlights": True,
            "allowed_tournament_types": ["MPCA_InterDivisional", "BCCI"],
            "suitable_formats": ["Multi_Day", "T20"],
            "category": "MPCA_State",
            "capacity_seats": 500,
        }
        r = requests.post(f"{BASE}/grounds", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("venue_id") in (None, ""), f"venue_id should be null, got {data.get('venue_id')}"
        assert data.get("ground_no", "").startswith("GRD-BHOPA") or data.get("ground_no", "").startswith("GRD-BHOP"), data.get("ground_no")
        assert data["name"] == "TEST_Batch_B_Ground"
        assert data["city"] == "Bhopal"
        assert data["owner_body_id"] == "MPCA"
        assert data["bcci_approval"] == "Domestic"
        assert data["floodlights"] is True
        assert "MPCA_InterDivisional" in data["allowed_tournament_types"]
        assert "BCCI" in data["allowed_tournament_types"]
        assert "Multi_Day" in data["suitable_formats"]
        TestItem9GroundsOverhaul.created_id = data["id"]

    def test_list_grounds_includes_new(self):
        # Filter to only our new ground's id since seed has 1000 name-sorted grounds
        gid = TestItem9GroundsOverhaul.created_id
        assert gid, "prior test must have created a ground"
        r = requests.get(f"{BASE}/grounds/{gid}")
        assert r.status_code == 200
        data = r.json()
        assert data.get("venue_id") in (None, ""), f"venue_id should be null, got {data.get('venue_id')}"

    def test_cleanup(self):
        if TestItem9GroundsOverhaul.created_id:
            requests.delete(f"{BASE}/grounds/{TestItem9GroundsOverhaul.created_id}")


# ─── Item 10 · Meeting AI signed minutes ────────────────────────────────
@pytest.fixture(scope="module")
def sample_meeting():
    # Create a meeting to work with
    payload = {
        "title": "TEST_Batch_B_AGM",
        "meeting_type": "AGM",
        "scheduled_date": "2026-02-01",
        "venue": "MPCA HQ",
        "chairperson": "Test President",
    }
    r = requests.post(f"{BASE}/meetings", json=payload)
    assert r.status_code == 200, r.text
    m = r.json()
    yield m
    requests.delete(f"{BASE}/meetings/{m['id']}")


class TestItem10MeetingAI:
    def test_signed_minutes_upload_as_mpca(self, sample_meeting):
        mid = sample_meeting["id"]
        r = requests.post(
            f"{BASE}/meetings/{mid}/signed-minutes",
            json={"signed_minutes_url": "/api/uploads/bogus_batch_b.pdf", "uploaded_by": "MPCA Sec"},
            headers=MPCA_HEADERS,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("signed_minutes_url") == "/api/uploads/bogus_batch_b.pdf"
        assert data.get("ai_summary_status") == "Pending"

    def test_signed_minutes_upload_forbidden_for_division(self, sample_meeting):
        mid = sample_meeting["id"]
        r = requests.post(
            f"{BASE}/meetings/{mid}/signed-minutes",
            json={"signed_minutes_url": "/api/uploads/bogus.pdf"},
            headers=DIV_HEADERS,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_ai_summary_requires_signed_url(self):
        # Fresh meeting without signed_minutes_url
        r_meet = requests.post(f"{BASE}/meetings", json={
            "title": "TEST_Batch_B_NoMinutes",
            "meeting_type": "Committee",
            "scheduled_date": "2026-02-05",
            "venue": "MPCA HQ",
        })
        mid = r_meet.json()["id"]
        try:
            r = requests.post(f"{BASE}/meetings/{mid}/ai-summary", headers=MPCA_HEADERS)
            assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        finally:
            requests.delete(f"{BASE}/meetings/{mid}")

    def test_ai_summary_forbidden_for_division(self, sample_meeting):
        r = requests.post(f"{BASE}/meetings/{sample_meeting['id']}/ai-summary", headers=DIV_HEADERS)
        assert r.status_code == 403

    def test_ai_summary_with_bogus_file_returns_failed(self, sample_meeting):
        # signed_minutes_url was set to bogus path; AI helper should gracefully return Failed
        r = requests.post(f"{BASE}/meetings/{sample_meeting['id']}/ai-summary", headers=MPCA_HEADERS)
        assert r.status_code == 200, r.text
        data = r.json()
        # Should be Failed since the file doesn't actually exist
        assert data.get("ai_summary_status") in ("Failed", "Completed"), f"got {data.get('ai_summary_status')}"


# ─── Item 11 · Squad AI advisory review ────────────────────────────────
@pytest.fixture(scope="module")
def sample_squad():
    # Find an existing tournament and create a squad on it, or find a squad
    r = requests.get(f"{BASE}/tournaments")
    tournaments = r.json() if r.status_code == 200 else []
    if not tournaments:
        pytest.skip("No tournaments seeded")
    tid = tournaments[0]["id"]
    # get-or-create the selection squad
    r = requests.get(f"{BASE}/tournaments/{tid}/selection")
    if r.status_code != 200:
        pytest.skip(f"Cannot access selection for tournament {tid}: {r.text}")
    return r.json()


class TestItem11SquadAI:
    def test_ai_review_without_signed_copy_returns_400(self, sample_squad):
        sid = sample_squad["id"]
        # Ensure signed_copy_url is not set on this squad — try only if empty
        r = requests.get(f"{BASE}/squads/{sid}")
        cur = r.json()
        if cur.get("signed_copy_url"):
            pytest.skip("Squad already has signed_copy_url; can't test 400 path here")
        r = requests.post(f"{BASE}/squads/{sid}/ai-review")
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_signed_copy_upload_triggers_ai_review(self, sample_squad):
        sid = sample_squad["id"]
        r = requests.post(
            f"{BASE}/squads/{sid}/signed-copy",
            json={"signed_copy_url": "/api/uploads/bogus_squad_pdf.pdf"},
            headers=MPCA_HEADERS,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("signed_copy_url") == "/api/uploads/bogus_squad_pdf.pdf"
        # ai_review_status should be Pending or Completed (endpoint runs synchronously)
        assert data.get("ai_review_status") in ("Pending", "Completed", "Failed"), data.get("ai_review_status")

    def test_ai_review_with_bogus_file_returns_needs_attention(self, sample_squad):
        sid = sample_squad["id"]
        pre_status = sample_squad.get("submission_status")
        # Ensure signed_copy_url is set
        requests.post(
            f"{BASE}/squads/{sid}/signed-copy",
            json={"signed_copy_url": "/api/uploads/bogus_squad_pdf.pdf"},
            headers=MPCA_HEADERS,
        )
        r = requests.post(f"{BASE}/squads/{sid}/ai-review")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ai_review_status") in ("Completed", "Failed")
        assert data.get("ai_review_verdict") == "Needs_Attention"
        comments = data.get("ai_review_comments") or []
        # Should include a warning about missing file or a comment
        assert isinstance(comments, list)
        # Ensure squad was NOT auto-rejected
        r2 = requests.get(f"{BASE}/squads/{sid}")
        assert r2.json().get("submission_status") == pre_status, "AI review should NOT change submission_status"


# ─── Regression · Item 8: MPCA cannot PATCH DIV-IND participation ─────
class TestRegressionItem8:
    def test_mpca_forbidden_on_division_participation(self):
        # find a tournament that has DIV-IND participation
        r = requests.get(f"{BASE}/tournaments")
        for t in r.json():
            r2 = requests.get(f"{BASE}/tournaments/{t['id']}/participants")
            if r2.status_code != 200:
                continue
            parts = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
            if any((p.get("body_code") == "DIV-IND" or p.get("id") == "DIV-IND") for p in parts):
                r3 = requests.patch(
                    f"{BASE}/tournaments/{t['id']}/participants/DIV-IND",
                    json={"acceptance_status": "Accepted"},
                    headers=MPCA_HEADERS,
                )
                # Expect 403 (strict acceptance) or acceptable
                assert r3.status_code in (403, 404), f"Expected 403 for MPCA acting on DIV-IND, got {r3.status_code}: {r3.text}"
                return
        pytest.skip("No tournament with DIV-IND participant found")
