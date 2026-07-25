"""M26 Phase D · Bulk NEFT batch generator + Closure guard tests"""
import os
import uuid
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
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(autouse=True)
def cleanup_neft_receipts(db):
    """Remove any NEFT_Batch receipts for MY memorial before + after each test to restore state."""
    db.tournament_receipts.delete_many({"tournament_id": MY_MEMORIAL_TID, "mode": "NEFT_Batch"})
    yield
    db.tournament_receipts.delete_many({"tournament_id": MY_MEMORIAL_TID, "mode": "NEFT_Batch"})


# ─────────── GET /neft-batch ───────────

class TestNeftBatchPreview:
    def test_neft_batch_shape_and_ready_flag(self, s):
        r = s.get(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-batch")
        assert r.status_code == 200
        data = r.json()
        assert "batch_count" in data and "total_outstanding_inr" in data and "participants" in data
        assert data["batch_count"] >= 1
        assert data["total_outstanding_inr"] >= 49560
        bpl = next((p for p in data["participants"] if p["body_code"] == DIV_BPL), None)
        assert bpl is not None
        assert bpl["outstanding_inr"] == 49560.0
        assert bpl["bank_account"] is not None
        assert bpl["bank_account"]["account_no"] == "38294857123"
        assert bpl["bank_account"]["ifsc"] == "SBIN0000123"
        assert bpl["ready_for_neft"] is True

    def test_neft_batch_excludes_settled(self, s):
        # All returned participants should have outstanding > 0
        r = s.get(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-batch")
        assert all(p["outstanding_inr"] > 0 for p in r.json()["participants"])

    def test_neft_batch_404(self, s):
        r = s.get(f"{BASE_URL}/api/tournaments/does-not-exist-xyz/neft-batch")
        assert r.status_code == 404


# ─────────── POST /neft-export ───────────

class TestNeftExport:
    def test_dry_run_returns_csv_no_receipts(self, s, db):
        before = db.tournament_receipts.count_documents({"tournament_id": MY_MEMORIAL_TID, "mode": "NEFT_Batch"})
        r = s.post(
            f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-export",
            json={"body_codes": [DIV_BPL], "recorded_by_name": "TEST Treasurer", "dry_run": True},
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("text/csv")
        assert "attachment;" in r.headers.get("content-disposition", "")
        assert ".csv" in r.headers.get("content-disposition", "")
        assert r.headers.get("X-Batch-Ref", "").startswith("NEFT-")
        body = r.text
        lines = [l for l in body.strip().split("\n") if l]
        assert lines[0].startswith("SL_NO,BODY_CODE,BENEFICIARY_NAME,ACCOUNT_NO,IFSC,AMOUNT_INR,PAYMENT_REF,REMARKS")
        assert DIV_BPL in body and "38294857123" in body and "SBIN0000123" in body and "49560.00" in body
        after = db.tournament_receipts.count_documents({"tournament_id": MY_MEMORIAL_TID, "mode": "NEFT_Batch"})
        assert after == before  # dry_run: no receipt created

    def test_export_creates_receipt_and_zeroes_outstanding(self, s, db):
        r = s.post(
            f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-export",
            json={"body_codes": [DIV_BPL], "recorded_by_name": "TEST Treasurer", "dry_run": False},
        )
        assert r.status_code == 200
        assert r.headers.get("X-Receipts-Created") == "1"
        assert r.headers.get("X-Rows-Skipped") == "0"
        batch_ref = r.headers["X-Batch-Ref"]
        assert batch_ref.startswith(f"NEFT-{MY_MEMORIAL_TID[:6].upper()}-B")
        # Receipt persisted with correct linkage
        rct = db.tournament_receipts.find_one({"tournament_id": MY_MEMORIAL_TID, "mode": "NEFT_Batch"})
        assert rct is not None
        assert rct["amount_inr"] == 49560.0
        assert rct["reference_no"] == batch_ref
        assert rct["participant_body_code"] == DIV_BPL
        assert rct.get("linked_claim_id") == "fbacaead-ab48-46f5-a402-8917e9b58c01"
        # Outstanding is now zero
        pr = s.get(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/participants/{DIV_BPL}").json()
        assert pr["outstanding_inr"] == 0.0

    def test_batch_sequence_increments(self, s, db):
        # First export
        r1 = s.post(
            f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-export",
            json={"body_codes": [DIV_BPL], "dry_run": False},
        )
        b1 = r1.headers["X-Batch-Ref"]
        # Reset outstanding by removing 2nd receipt scenario — instead, force second call while participant still owes:
        # After first, outstanding is 0. So 2nd call should skip and still increment sequence.
        r2 = s.post(
            f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-export",
            json={"body_codes": [DIV_BPL], "dry_run": True},
        )
        b2 = r2.headers["X-Batch-Ref"]
        assert b2 != b1
        # Extract seq numbers
        seq1 = int(b1.rsplit("B", 1)[1])
        seq2 = int(b2.rsplit("B", 1)[1])
        assert seq2 > seq1

    def test_skipped_missing_bank(self, s, db):
        # Insert temp participant with no bank
        fake_code = f"TEST-NOBANK-{uuid.uuid4().hex[:6].upper()}"
        db.tournament_participations.insert_one({
            "id": uuid.uuid4().hex,
            "tournament_id": MY_MEMORIAL_TID,
            "body_code": fake_code,
            "body_type": "Division",
            "body_name": "Fake NoBank Body",
            "role": "Visitor",
            "acceptance_status": "Pending",
            "removed_at": None,
        })
        # Insert a fake approved claim so outstanding > 0
        claim_id = uuid.uuid4().hex
        db.tournament_reimbursement_claims.insert_one({
            "id": claim_id, "tournament_id": MY_MEMORIAL_TID,
            "participant_body_code": fake_code, "status": "Approved",
            "approved_amount_inr": 1000.0, "created_at": "2026-01-01T00:00:00+00:00",
        })
        try:
            r = s.post(
                f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-export",
                json={"body_codes": [fake_code], "dry_run": True},
            )
            assert r.status_code == 200
            assert r.headers.get("X-Rows-Skipped") == "1"
            assert fake_code not in r.text  # skipped rows not in CSV
        finally:
            db.tournament_participations.delete_one({"tournament_id": MY_MEMORIAL_TID, "body_code": fake_code})
            db.tournament_reimbursement_claims.delete_one({"id": claim_id})

    def test_empty_body_codes_400(self, s):
        r = s.post(
            f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-export",
            json={"body_codes": [], "dry_run": True},
        )
        assert r.status_code == 400


# ─────────── GET /closure-readiness ───────────

class TestClosureReadiness:
    def test_readiness_before_settlement(self, s):
        r = s.get(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/closure-readiness")
        assert r.status_code == 200
        d = r.json()
        assert d["total_active"] >= 1
        assert d["unsettled_count"] >= 1
        assert any(u["body_code"] == DIV_BPL for u in d["unsettled"])
        assert d["ready_for_closure"] is False

    def test_readiness_after_settlement(self, s):
        # Post export to settle
        s.post(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/neft-export",
               json={"body_codes": [DIV_BPL], "dry_run": False})
        r = s.get(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/closure-readiness")
        d = r.json()
        assert d["unsettled_count"] == 0
        assert d["ready_for_closure"] is True


# ─────────── POST /closure-letter (guard) ───────────

class TestClosureGuard:
    def test_blocks_with_409_when_unsettled(self, s):
        r = s.post(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/closure-letter",
                   json={"issued_by_name": "TEST", "issued_by_post": "Secretary"})
        assert r.status_code == 409
        detail = r.json().get("detail", {})
        assert detail.get("error") == "not_ready_for_closure"
        assert isinstance(detail.get("unsettled"), list) and len(detail["unsettled"]) >= 1

    def test_force_bypasses_guard(self, s):
        r = s.post(f"{BASE_URL}/api/tournaments/{MY_MEMORIAL_TID}/closure-letter",
                   json={"issued_by_name": "TEST", "issued_by_post": "Secretary", "force": True})
        assert r.status_code == 200

    def test_zero_participants_letter_ok(self, s, db):
        # Create bare tournament with no participants
        tid = uuid.uuid4().hex
        db.tournaments.insert_one({
            "id": tid, "name": "TEST_M26D_ZeroParts",
            "tournament_type": "MPCA_Championship", "scope": "Intra_District",
            "created_at": "2026-01-01T00:00:00+00:00",
        })
        try:
            r = s.post(f"{BASE_URL}/api/tournaments/{tid}/closure-letter",
                       json={"issued_by_name": "TEST", "issued_by_post": "Secretary"})
            assert r.status_code == 200
        finally:
            db.tournaments.delete_one({"id": tid})
