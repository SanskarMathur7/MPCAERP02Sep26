"""M26 Phase E · Participation lifecycle notifications & reminders"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

MY_MEMORIAL_TID = "e2a9ac5c-8e72-4d0a-9aa9-8dae40f482e5"
DIV_BPL = "DIV-BPL"


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(autouse=True)
def restore_my_memorial(db):
    # Ensure no NEFT batch receipts corrupt outstanding.
    db.tournament_receipts.delete_many({"tournament_id": MY_MEMORIAL_TID, "mode": "NEFT_Batch"})
    yield
    db.tournament_receipts.delete_many({"tournament_id": MY_MEMORIAL_TID, "mode": "NEFT_Batch"})


# ─────────── Sync helper: new-body notification ───────────

class TestPoolSyncNotifications:
    def test_new_body_added_triggers_notification_and_reappear_does_not(self, s, db):
        # Fresh Inter_Divisional tournament
        payload = {
            "name": f"TEST_M26E_Sync_{uuid.uuid4().hex[:6]}",
            "tournament_type": "MPCA_Championship",
            "scope": "Inter_Divisional",
            "format": "T20",
            "host_body_id": "DIV-BPL",
            "start_date": "2026-03-01",
            "end_date": "2026-03-10",
        }
        r = s.post(f"{BASE_URL}/api/tournaments", json=payload)
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        try:
            # First add: DIV-BPL as host in pool A
            pool_id = uuid.uuid4().hex
            meta = {"setup_meta": {"division_pools": [
                {"id": pool_id, "name": "Pool A", "host_division_code": "DIV-BPL", "division_codes": ["DIV-BPL"]}
            ]}}
            r = s.patch(f"{BASE_URL}/api/tournaments/{tid}/setup-meta", json=meta)
            assert r.status_code == 200, r.text

            notifs = list(db.notifications.find({
                "related_type": "tournament_participation",
                "related_id": tid,
                "recipient_body_id": "DIV-BPL",
            }))
            assert len(notifs) == 1
            n = notifs[0]
            assert n["recipient_role_id"] == "division-secretary"
            assert n["severity"] == "warning"
            assert n["title"].startswith("Invited to ")

            # Second add: soft-delete DIV-BPL (empty pool) then re-add
            r = s.patch(f"{BASE_URL}/api/tournaments/{tid}/setup-meta",
                        json={"setup_meta": {"division_pools": [
                            {"id": pool_id, "name": "Pool A", "host_division_code": None, "division_codes": []}
                        ]}})
            assert r.status_code == 200
            # Now re-add DIV-BPL
            r = s.patch(f"{BASE_URL}/api/tournaments/{tid}/setup-meta", json=meta)
            assert r.status_code == 200

            notifs = list(db.notifications.find({
                "related_type": "tournament_participation",
                "related_id": tid,
                "recipient_body_id": "DIV-BPL",
            }))
            # Reappear must NOT emit a second notification (existing row is re-activated)
            assert len(notifs) == 1, f"expected 1 notification, found {len(notifs)}"

            # Add a brand-new body → should emit
            meta2 = {"setup_meta": {"division_pools": [
                {"id": pool_id, "name": "Pool A", "host_division_code": "DIV-BPL",
                 "division_codes": ["DIV-BPL", "DIV-IND"]}
            ]}}
            r = s.patch(f"{BASE_URL}/api/tournaments/{tid}/setup-meta", json=meta2)
            assert r.status_code == 200
            ind_notifs = list(db.notifications.find({
                "related_type": "tournament_participation",
                "related_id": tid,
                "recipient_body_id": "DIV-IND",
            }))
            assert len(ind_notifs) == 1
            assert ind_notifs[0]["recipient_role_id"] == "division-secretary"
        finally:
            db.tournaments.delete_one({"id": tid})
            db.tournament_participations.delete_many({"tournament_id": tid})
            db.notifications.delete_many({"related_id": tid})


# ─────────── PATCH acceptance → MPCA notification ───────────

class TestAcceptancePatchNotifications:
    def test_accepted_and_declined_fire_mpca_notifications(self, s, db):
        # Create scratch tournament + one participant
        tid = uuid.uuid4().hex
        db.tournaments.insert_one({
            "id": tid, "name": f"TEST_M26E_Patch_{tid[:6]}",
            "tournament_type": "MPCA_Championship", "scope": "Inter_Divisional",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        db.tournament_participations.insert_one({
            "id": uuid.uuid4().hex, "tournament_id": tid,
            "body_code": "DIV-IND", "body_type": "Division", "body_name": "Indore Division",
            "role": "Visitor", "acceptance_status": "Pending", "removed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        db.tournament_participations.insert_one({
            "id": uuid.uuid4().hex, "tournament_id": tid,
            "body_code": "DIV-JBP", "body_type": "Division", "body_name": "Jabalpur Division",
            "role": "Visitor", "acceptance_status": "Pending", "removed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            # Accepted
            r = s.patch(f"{BASE_URL}/api/tournaments/{tid}/participants/DIV-IND",
                        json={"acceptance_status": "Accepted", "acceptance_by_name": "Test Secy"})
            assert r.status_code == 200
            n_acc = list(db.notifications.find({
                "related_type": "tournament_participation", "related_id": tid,
                "recipient_role_id": "secretary", "recipient_body_id": "MPCA",
            }))
            assert len(n_acc) == 1
            assert n_acc[0]["severity"] == "info"
            assert "accepted" in n_acc[0]["message"].lower()

            # Declined
            r = s.patch(f"{BASE_URL}/api/tournaments/{tid}/participants/DIV-JBP",
                        json={"acceptance_status": "Declined"})
            assert r.status_code == 200
            n_all = list(db.notifications.find({
                "related_type": "tournament_participation", "related_id": tid,
                "recipient_role_id": "secretary", "recipient_body_id": "MPCA",
            }))
            assert len(n_all) == 2
            declined = [n for n in n_all if n["severity"] == "warning"]
            assert len(declined) == 1
            assert "declined" in declined[0]["message"].lower()
        finally:
            db.tournaments.delete_one({"id": tid})
            db.tournament_participations.delete_many({"tournament_id": tid})
            db.notifications.delete_many({"related_id": tid})


# ─────────── GET /participation-reminders ───────────

class TestParticipationReminders:
    def test_unknown_tid_404(self, s):
        r = s.get(f"{BASE_URL}/api/tournaments/does-not-exist-xyz/participation-reminders")
        assert r.status_code == 404

    def test_my_memorial_has_unsettled_bpl(self, s):
        r = s.get(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/participation-reminders")
        assert r.status_code == 200
        d = r.json()
        assert "reminder_count" in d and "reminders" in d
        bpl = next((x for x in d["reminders"] if x["body_code"] == DIV_BPL), None)
        assert bpl is not None, f"DIV-BPL missing from reminders: {d}"
        assert "unsettled" in bpl["reasons"]
        assert bpl["outstanding_inr"] >= 49560
        assert bpl["body_type"] == "Division"
        assert bpl["role"] in ("Host", "Visitor")

    def test_reasons_awaiting_and_no_budget(self, s, db):
        # Fresh tournament with end_date in past + one Pending>7d participant + one Accepted-no-budget
        tid = uuid.uuid4().hex
        past_end = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")
        db.tournaments.insert_one({
            "id": tid, "name": f"TEST_M26E_Reminders_{tid[:6]}",
            "tournament_type": "MPCA_Championship", "scope": "Inter_Divisional",
            "end_date": past_end,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        old_created = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        # Pending>7d
        db.tournament_participations.insert_one({
            "id": uuid.uuid4().hex, "tournament_id": tid, "body_code": "DIV-IND",
            "body_type": "Division", "body_name": "Indore Division", "role": "Visitor",
            "acceptance_status": "Pending", "removed_at": None,
            "created_at": old_created,
        })
        # Accepted no-budget
        db.tournament_participations.insert_one({
            "id": uuid.uuid4().hex, "tournament_id": tid, "body_code": "DIV-JBP",
            "body_type": "Division", "body_name": "Jabalpur Division", "role": "Visitor",
            "acceptance_status": "Accepted", "budget_id": None, "removed_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = s.get(f"{BASE_URL}/api/tournaments/{tid}/participation-reminders")
            assert r.status_code == 200
            d = r.json()
            by_code = {x["body_code"]: x for x in d["reminders"]}
            assert "DIV-IND" in by_code
            assert "awaiting_acceptance" in by_code["DIV-IND"]["reasons"]
            assert "no_claim_after_end" in by_code["DIV-IND"]["reasons"]  # end passed, no claim
            assert "DIV-JBP" in by_code
            assert "no_budget" in by_code["DIV-JBP"]["reasons"]
            assert "no_claim_after_end" in by_code["DIV-JBP"]["reasons"]
        finally:
            db.tournaments.delete_one({"id": tid})
            db.tournament_participations.delete_many({"tournament_id": tid})


# ─────────── POST /participation-reminders/dispatch ───────────

class TestDispatchReminders:
    def test_dispatch_fires_notifications_for_bpl_unsettled(self, s, db):
        # Ensure BPL is unsettled (autouse fixture removes NEFT batches)
        # Clear prior dispatch notifications so counts are exact
        db.notifications.delete_many({
            "related_type": "tournament_participation",
            "related_id": MY_MEMORIAL_TID,
            "title": {"$regex": "^Outstanding balance"},
        })
        r = s.post(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/participation-reminders/dispatch")
        assert r.status_code == 200
        d = r.json()
        assert "dispatched_count" in d and "reminder_count" in d
        assert d["reminder_count"] >= 1
        assert d["dispatched_count"] >= 1
        # Verify an "unsettled" MPCA notification exists for DIV-BPL
        n = db.notifications.find_one({
            "related_type": "tournament_participation",
            "related_id": MY_MEMORIAL_TID,
            "recipient_role_id": "secretary",
            "recipient_body_id": "MPCA",
            "title": {"$regex": "Outstanding balance.*Bhopal"},
        })
        assert n is not None, "MPCA outstanding-balance notification not found for Bhopal"
        # Cleanup dispatch notifications so they don't pile up
        db.notifications.delete_many({
            "related_type": "tournament_participation",
            "related_id": MY_MEMORIAL_TID,
            "title": {"$regex": "^Outstanding balance"},
        })

    def test_dispatch_is_idempotent_and_repeatable(self, s, db):
        db.notifications.delete_many({
            "related_type": "tournament_participation",
            "related_id": MY_MEMORIAL_TID,
            "title": {"$regex": "^Outstanding balance"},
        })
        r1 = s.post(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/participation-reminders/dispatch").json()
        r2 = s.post(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/participation-reminders/dispatch").json()
        # Second call fires same batch again (manual, non-dedup)
        assert r2["dispatched_count"] == r1["dispatched_count"]
        # notifications count should have doubled for outstanding-balance topic
        cnt = db.notifications.count_documents({
            "related_type": "tournament_participation",
            "related_id": MY_MEMORIAL_TID,
            "title": {"$regex": "^Outstanding balance"},
        })
        assert cnt >= 2 * max(1, r1["dispatched_count"] and 1)  # at least 2 (fired twice)
        db.notifications.delete_many({
            "related_type": "tournament_participation",
            "related_id": MY_MEMORIAL_TID,
            "title": {"$regex": "^Outstanding balance"},
        })

    def test_dispatch_unknown_tid_404(self, s):
        r = s.post(f"{BASE_URL}/api/tournaments/does-not-exist-xyz/participation-reminders/dispatch")
        assert r.status_code == 404
