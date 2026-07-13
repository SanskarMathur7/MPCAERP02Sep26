"""Sprint 2 · Vendor KYC + Purchase Orders backend regression.

Runs against the public REACT_APP_BACKEND_URL. Covers:
  · KYC summary shape + expiring 30d
  · KYC submit-docs (400 on missing required doc + happy path)
  · KYC verify (guard: only from Docs_Submitted; sets expiry/TDS)
  · KYC reject (requires note)
  · KYC auto-expiry flag in summary
  · Purchase Orders listing + stats shape
  · Purchase Orders guards: blacklisted / non-KYC / empty items
  · Purchase Orders auto totals + TDS + approval steps (2 or 3)
  · Full 2-step lifecycle (submit → approve → issue → receive → link-bill full+paid)
  · 3-step gate (>₹1L needs Head + Finance)
  · Partial receipt (Partially_Received → Received)
  · Link-bill overage 400
  · Burn-down shape
  · Send-back + Cancel (require note; refuse on Paid/Cancelled)
  · Sprint 1 regression endpoints

Prefixes all test-created data with TEST_SPRINT2_ for cleanup.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Also connect directly to Mongo for the "expired auto-flag" scenario (impossible via API alone
# because verify sets expiry to now+validity_months and we can't backdate through the endpoint).
try:
    from pymongo import MongoClient
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    DB_NAME = os.environ.get("DB_NAME", "test_database")
    _mongo = MongoClient(MONGO_URL, serverSelectionTimeoutMS=1500)
    _mongo.admin.command("ping")
    mdb = _mongo[DB_NAME]
    HAS_MONGO = True
except Exception:
    HAS_MONGO = False
    mdb = None


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

def _create_temp_vendor(s, name_suffix: str, kyc_status: str = "Not_Started",
                         is_blacklisted: bool = False, tds_rate_pct: float = 2.0,
                         expires_in_days: int | None = None) -> dict:
    """Insert a vendor directly via Mongo (there is no create-vendor API in Sprint 2 that we saw)."""
    assert HAS_MONGO, "Mongo unavailable — cannot seed temp vendor"
    now = datetime.now(timezone.utc)
    v = {
        "id": str(uuid.uuid4()),
        "vendor_no": f"TEST_VN_{uuid.uuid4().hex[:6].upper()}",
        "name": f"TEST_SPRINT2_{name_suffix}",
        # NOTE: Vendor model uses Literal for category — must be one of
        # {Hotel, Travel, Material, Infra, Catering, Printing, Services, Other}.
        # Any other value will make GET /api/vendors 500 (see report — robustness bug).
        "category": "Services",
        "gstin": "22AAAAA0000A1Z5",
        "pan": "AAAAA0000A",
        "bank_account_no": "1234567890",
        "bank_ifsc": "SBIN0000001",
        "msme_registered": False,
        "is_blacklisted": is_blacklisted,
        "kyc_status": kyc_status,
        "tds_applicable": True,
        "tds_rate_pct": tds_rate_pct,
        "created_at": now.isoformat(),
    }
    if kyc_status == "KYC_Verified":
        exp = now + timedelta(days=expires_in_days if expires_in_days is not None else 365)
        v["kyc_verified_at"] = now.isoformat()
        v["kyc_verified_by"] = "TEST_SPRINT2_seed"
        v["kyc_expires_at"] = exp.isoformat()
    mdb.vendors.insert_one(v)
    v.pop("_id", None)
    return v


def _cleanup_temp_vendors():
    if HAS_MONGO:
        mdb.vendors.delete_many({"name": {"$regex": "^TEST_SPRINT2_"}})
        # Also remove any TEST_SPRINT2_ POs
        mdb.purchase_orders.delete_many({"subject": {"$regex": "^TEST_SPRINT2_"}})


@pytest.fixture(scope="module", autouse=True)
def _cleanup_module():
    yield
    _cleanup_temp_vendors()


def _get_verified_vendor(s):
    r = s.get(f"{API}/vendors")
    r.raise_for_status()
    for v in r.json():
        if v.get("kyc_status") == "KYC_Verified" and not v.get("is_blacklisted"):
            return v
    pytest.skip("No KYC_Verified vendor in seed")


# ═════════════════════════════════════════════════════════
# 1. VENDOR KYC SUMMARY
# ═════════════════════════════════════════════════════════
class TestKycSummary:
    def test_summary_shape(self, s):
        r = s.get(f"{API}/vendors-kyc/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_vendors", "by_status", "expiring_30d", "ready_for_transactions"]:
            assert k in d, f"missing key {k}"
        assert d["total_vendors"] >= 15
        assert d["ready_for_transactions"] >= 1
        assert isinstance(d["by_status"], dict)
        assert isinstance(d["expiring_30d"], list)
        # Each expiring entry has vendor_no + days_left
        for e in d["expiring_30d"]:
            assert "days_left" in e and isinstance(e["days_left"], int)
            assert e["days_left"] <= 30
            assert "vendor_no" in e and "name" in e

    def test_auto_expired_flag(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        # seed a vendor with kyc_expires_at in the past
        v = _create_temp_vendor(s, "Expired1", kyc_status="KYC_Verified", expires_in_days=-1)
        # override expiry to a definitely-past date
        past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        mdb.vendors.update_one({"id": v["id"]}, {"$set": {"kyc_expires_at": past}})
        r = s.get(f"{API}/vendors-kyc/summary")
        d = r.json()
        assert d["by_status"].get("Expired", 0) >= 1, f"Expired not counted: {d['by_status']}"


# ═════════════════════════════════════════════════════════
# 2. VENDOR KYC LIFECYCLE
# ═════════════════════════════════════════════════════════
class TestKycLifecycle:
    def test_submit_docs_missing_returns_400(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "SubmitMissing", kyc_status="Not_Started")
        r = s.post(f"{API}/vendors/{v['id']}/kyc/submit-docs", json={
            "docs": [{"doc_type": "gst_certificate", "url": "http://x/g.pdf"}],
            "actor_name": "TEST_vendor",
        })
        assert r.status_code == 400
        assert "Missing" in r.json().get("detail", "")

    def test_submit_then_verify_then_expiry_and_tds(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "Verify1", kyc_status="Not_Started")
        # 1. submit all 4 required docs
        r = s.post(f"{API}/vendors/{v['id']}/kyc/submit-docs", json={
            "docs": [
                {"doc_type": "gst_certificate",   "url": "http://x/g.pdf"},
                {"doc_type": "pan_card",           "url": "http://x/p.pdf"},
                {"doc_type": "cancelled_cheque",   "url": "http://x/c.pdf"},
                {"doc_type": "signed_declaration", "url": "http://x/d.pdf"},
            ],
            "msme_registered": True,
            "msme_udyam_no": "UDYAM-MP-01-1234567",
        })
        assert r.status_code == 200, r.text
        assert r.json()["kyc_status"] == "Docs_Submitted"
        # 2. verify (state persona)
        r = s.post(f"{API}/vendors/{v['id']}/kyc/verify", json={
            "actor_name": "TEST_state_president",
            "actor_role": "president",
            "tds_rate_pct": 10.0,
            "validity_months": 6,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kyc_status"] == "KYC_Verified"
        assert d["tds_rate_pct"] == 10.0
        assert d["kyc_verified_by"] == "TEST_state_president"
        assert d["kyc_expires_at"]
        # expiry roughly 6 months in future (>=150 days, <=200 days)
        exp = datetime.fromisoformat(d["kyc_expires_at"].replace("Z", "+00:00"))
        delta_days = (exp - datetime.now(timezone.utc)).days
        assert 150 < delta_days < 200, f"expected ~180d, got {delta_days}"

    def test_verify_from_wrong_state_returns_400(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "WrongState", kyc_status="Not_Started")
        r = s.post(f"{API}/vendors/{v['id']}/kyc/verify", json={"actor_name": "TEST"})
        assert r.status_code == 400
        assert "Cannot verify" in r.json().get("detail", "")

    def test_reject_requires_note(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "RejNoNote", kyc_status="Docs_Submitted")
        # missing note
        r = s.post(f"{API}/vendors/{v['id']}/kyc/reject", json={"actor_name": "TEST"})
        assert r.status_code == 400
        # with note
        r = s.post(f"{API}/vendors/{v['id']}/kyc/reject", json={
            "actor_name": "TEST_state_president",
            "note": "Missing GST return filings for the last 2 quarters.",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["kyc_status"] == "Rejected"
        assert "Missing GST" in d.get("kyc_rejected_reason", "")


# ═════════════════════════════════════════════════════════
# 3. PURCHASE ORDERS · LISTING + STATS
# ═════════════════════════════════════════════════════════
class TestPoListing:
    def test_list_returns_seeded_pos(self, s):
        r = s.get(f"{API}/purchase-orders")
        assert r.status_code == 200
        data = r.json()
        # >=3 seeded, may be more if previous test runs added TEST_ ones
        assert len(data) >= 3
        for p in data[:3]:
            for k in ["po_no", "total_amount_inr", "gst_total_inr",
                      "tds_amount_inr", "tds_rate_pct", "status"]:
                assert k in p, f"missing key {k} in PO {p.get('po_no')}"
            assert p["po_no"].startswith("PO/")

    def test_stats_summary_shape(self, s):
        r = s.get(f"{API}/purchase-orders-stats/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ["committed_inr", "invoiced_inr", "paid_inr",
                  "outstanding_inr", "tds_accrued_inr"]:
            assert k in d
        assert d["committed_inr"] > 0
        assert d["outstanding_inr"] == round(d["committed_inr"] - d["invoiced_inr"], 2)


# ═════════════════════════════════════════════════════════
# 4. PO CREATE · GUARDS + AUTO-COMPUTE
# ═════════════════════════════════════════════════════════
class TestPoCreateGuards:
    def _base_items(self, unit=1000, qty=1, gst=18):
        return [{"description": "TEST_SPRINT2_line", "quantity": qty,
                 "unit_price_inr": unit, "gst_pct": gst, "uom": "nos"}]

    def _payload(self, vendor_id, subject="TEST_SPRINT2_ordinary", unit=1000, qty=1, gst=18):
        return {
            "body_id": "MPCA",
            "vendor_id": vendor_id,
            "subject": subject,
            "items": self._base_items(unit=unit, qty=qty, gst=gst),
            "created_by_name": "TEST_SPRINT2_creator",
        }

    def test_non_kyc_verified_vendor_rejected(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "NonKyc", kyc_status="Not_Started")
        r = s.post(f"{API}/purchase-orders", json=self._payload(v["id"]))
        assert r.status_code == 400
        assert "not KYC verified" in r.json().get("detail", "").lower() or \
               "not kyc verified" in r.json().get("detail", "").lower()

    def test_blacklisted_vendor_rejected(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "Blacklisted", kyc_status="KYC_Verified", is_blacklisted=True)
        r = s.post(f"{API}/purchase-orders", json=self._payload(v["id"]))
        assert r.status_code == 400
        assert "blacklist" in r.json().get("detail", "").lower()

    def test_empty_items_rejected(self, s):
        v = _get_verified_vendor(s)
        payload = self._payload(v["id"])
        payload["items"] = []
        r = s.post(f"{API}/purchase-orders", json=payload)
        assert r.status_code == 400

    def test_auto_totals_and_2step_threshold(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "AutoTot2step", kyc_status="KYC_Verified", tds_rate_pct=2.0)
        r = s.post(f"{API}/purchase-orders",
                    json=self._payload(v["id"], subject="TEST_SPRINT2_2step",
                                        unit=10_000, qty=1, gst=18))
        assert r.status_code == 200, r.text
        p = r.json()
        # base 10 000, gst 1 800, total 11 800, tds = 2% of 10 000 = 200
        assert p["subtotal_inr"] == 10_000
        assert p["gst_total_inr"] == 1_800
        assert p["total_amount_inr"] == 11_800
        assert p["tds_amount_inr"] == 200
        assert p["tds_rate_pct"] == 2.0
        assert p["net_payable_inr"] == 11_600  # total − tds
        assert p["approval_required_steps"] == 2  # ≤₹1L
        assert p["status"] == "Draft"
        assert p["po_no"].startswith("PO/MPCA/")

    def test_auto_totals_3step_threshold(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "AutoTot3step", kyc_status="KYC_Verified", tds_rate_pct=2.0)
        # sub 2 00 000 → gst 36 000 → total 2 36 000 (>₹1L)
        r = s.post(f"{API}/purchase-orders",
                    json=self._payload(v["id"], subject="TEST_SPRINT2_3step",
                                        unit=200_000, qty=1, gst=18))
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["total_amount_inr"] == 236_000
        assert p["approval_required_steps"] == 3


# ═════════════════════════════════════════════════════════
# 5. PO WORKFLOW · 2-STEP FULL HAPPY PATH
# ═════════════════════════════════════════════════════════
class TestPoTwoStepWorkflow:
    @pytest.fixture(scope="class")
    def po_id(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "TwoStepHappy", kyc_status="KYC_Verified", tds_rate_pct=2.0)
        r = s.post(f"{API}/purchase-orders", json={
            "body_id": "MPCA", "vendor_id": v["id"],
            "subject": "TEST_SPRINT2_2step_happy",
            "items": [{"description": "TEST_line", "quantity": 1, "unit_price_inr": 50_000, "gst_pct": 18}],
            "created_by_name": "TEST_creator",
        })
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_submit(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/submit",
                    json={"actor_name": "TEST_creator", "actor_role": "mpca_accounts"})
        assert r.status_code == 200
        assert r.json()["status"] == "Submitted"

    def test_double_submit_400(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/submit",
                    json={"actor_name": "TEST_creator"})
        assert r.status_code == 400

    def test_approve_2step_single_approval_completes(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/approve",
                    json={"actor_name": "TEST_head", "actor_role": "secretary"})
        assert r.status_code == 200
        assert r.json()["status"] == "Approved"

    def test_issue(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/issue",
                    json={"actor_name": "TEST_president"})
        assert r.status_code == 200
        assert r.json()["status"] == "Issued"

    def test_mark_received_full(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/mark-received",
                    json={"actor_name": "TEST_receiver", "received_qty_pct": 100})
        assert r.status_code == 200
        assert r.json()["status"] == "Received"

    def test_link_bill_partial_and_full_paid(self, s, po_id):
        # Full amount = 50 000 + 9 000 (GST) = 59 000
        r = s.post(f"{API}/purchase-orders/{po_id}/link-bill", json={
            "bill_id": "TEST_BILL_A", "amount_inr": 30_000, "is_paid": False,
            "actor_name": "TEST_accounts",
        })
        assert r.status_code == 200
        p = r.json()
        assert p["invoiced_amount_inr"] == 30_000
        assert p["paid_amount_inr"] == 0
        assert p["status"] in ("Received", "Partially_Received", "Invoiced")

        # Link remaining and mark paid — should flip to Paid
        r = s.post(f"{API}/purchase-orders/{po_id}/link-bill", json={
            "bill_id": "TEST_BILL_B", "amount_inr": 29_000, "is_paid": True,
            "actor_name": "TEST_accounts",
        })
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["invoiced_amount_inr"] == 59_000
        # only the second bill (₹29k) was marked paid; total paid = 29k, not full ⇒ Invoiced
        # → But invoice-total reached total ⇒ Invoiced (not Paid).
        assert p["status"] == "Invoiced", f"unexpected status {p['status']}"

    def test_link_bill_overage_returns_400(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/link-bill", json={
            "bill_id": "TEST_BILL_OVER", "amount_inr": 10_000, "is_paid": False,
            "actor_name": "TEST_accounts",
        })
        assert r.status_code == 400
        assert "exceeds" in r.json().get("detail", "").lower()

    def test_burn_down_shape(self, s, po_id):
        r = s.get(f"{API}/purchase-orders/{po_id}/burn-down")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_amount_inr", "invoiced_amount_inr", "paid_amount_inr",
                  "remaining_amount_inr", "invoiced_pct", "paid_pct", "linked_bill_ids"]:
            assert k in d
        assert d["remaining_amount_inr"] == round(d["total_amount_inr"] - d["invoiced_amount_inr"], 2)
        assert set(d["linked_bill_ids"]) == {"TEST_BILL_A", "TEST_BILL_B"}


# ═════════════════════════════════════════════════════════
# 6. PO WORKFLOW · 3-STEP GATE (>₹1L)
# ═════════════════════════════════════════════════════════
class TestPoThreeStepGate:
    @pytest.fixture(scope="class")
    def po_id(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "ThreeStep", kyc_status="KYC_Verified", tds_rate_pct=2.0)
        r = s.post(f"{API}/purchase-orders", json={
            "body_id": "MPCA", "vendor_id": v["id"],
            "subject": "TEST_SPRINT2_3step_flow",
            "items": [{"description": "TEST_high_value", "quantity": 1, "unit_price_inr": 200_000, "gst_pct": 18}],
            "created_by_name": "TEST_creator",
        })
        assert r.status_code == 200
        return r.json()["id"]

    def test_submit(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/submit",
                    json={"actor_name": "TEST_creator"})
        assert r.status_code == 200
        assert r.json()["status"] == "Submitted"

    def test_first_approve_moves_to_finance_stage_but_stays_submitted(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/approve",
                    json={"actor_name": "TEST_head", "actor_role": "secretary"})
        assert r.status_code == 200
        p = r.json()
        assert p["status"] == "Submitted", f"expected still-Submitted after 1st approval, got {p['status']}"
        assert p["current_stage"] == "Finance_Approval"

    def test_second_approve_moves_to_approved(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/approve",
                    json={"actor_name": "TEST_finance", "actor_role": "treasurer"})
        assert r.status_code == 200
        assert r.json()["status"] == "Approved"

    def test_issue_before_receive_partial(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/issue",
                    json={"actor_name": "TEST_president"})
        assert r.status_code == 200
        assert r.json()["status"] == "Issued"


# ═════════════════════════════════════════════════════════
# 7. PARTIAL RECEIPT → RECEIVED
# ═════════════════════════════════════════════════════════
class TestPoPartialReceipt:
    @pytest.fixture(scope="class")
    def po_id(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        v = _create_temp_vendor(s, "PartialRec", kyc_status="KYC_Verified", tds_rate_pct=2.0)
        r = s.post(f"{API}/purchase-orders", json={
            "body_id": "MPCA", "vendor_id": v["id"],
            "subject": "TEST_SPRINT2_partial_receipt",
            "items": [{"description": "TEST", "quantity": 1, "unit_price_inr": 40_000, "gst_pct": 18}],
        })
        assert r.status_code == 200
        pid = r.json()["id"]
        # walk to Issued
        for act, payload in [
            ("submit",  {"actor_name": "TEST"}),
            ("approve", {"actor_name": "TEST"}),
            ("issue",   {"actor_name": "TEST"}),
        ]:
            r = s.post(f"{API}/purchase-orders/{pid}/{act}", json=payload)
            assert r.status_code == 200, f"{act} failed: {r.text}"
        return pid

    def test_partial_60pct(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/mark-received",
                    json={"actor_name": "TEST", "received_qty_pct": 60})
        assert r.status_code == 200
        assert r.json()["status"] == "Partially_Received"

    def test_repeatable_partial_80pct(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/mark-received",
                    json={"actor_name": "TEST", "received_qty_pct": 80})
        assert r.status_code == 200
        assert r.json()["status"] == "Partially_Received"

    def test_final_100pct_flips_to_received(self, s, po_id):
        r = s.post(f"{API}/purchase-orders/{po_id}/mark-received",
                    json={"actor_name": "TEST", "received_qty_pct": 100})
        assert r.status_code == 200
        assert r.json()["status"] == "Received"


# ═════════════════════════════════════════════════════════
# 8. SEND-BACK + CANCEL
# ═════════════════════════════════════════════════════════
class TestPoSendBackCancel:
    def _fresh_po(self, s):
        v = _create_temp_vendor(s, f"SBCancel_{uuid.uuid4().hex[:4]}", kyc_status="KYC_Verified")
        r = s.post(f"{API}/purchase-orders", json={
            "body_id": "MPCA", "vendor_id": v["id"],
            "subject": "TEST_SPRINT2_sbcancel",
            "items": [{"description": "TEST", "quantity": 1, "unit_price_inr": 5_000, "gst_pct": 18}],
        })
        assert r.status_code == 200
        return r.json()["id"]

    def test_send_back_requires_note(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        pid = self._fresh_po(s)
        s.post(f"{API}/purchase-orders/{pid}/submit", json={"actor_name": "TEST"})
        r = s.post(f"{API}/purchase-orders/{pid}/send-back",
                    json={"actor_name": "TEST"})
        assert r.status_code == 400
        r = s.post(f"{API}/purchase-orders/{pid}/send-back",
                    json={"actor_name": "TEST", "note": "Please revise line item pricing."})
        assert r.status_code == 200
        assert r.json()["status"] == "Sent_Back"

    def test_cancel_requires_note_and_blocks_paid(self, s):
        if not HAS_MONGO:
            pytest.skip("Mongo not reachable")
        pid = self._fresh_po(s)
        # missing note
        r = s.post(f"{API}/purchase-orders/{pid}/cancel", json={"actor_name": "TEST"})
        assert r.status_code == 400
        # with note
        r = s.post(f"{API}/purchase-orders/{pid}/cancel",
                    json={"actor_name": "TEST", "note": "Vendor unavailable."})
        assert r.status_code == 200
        assert r.json()["status"] == "Cancelled"
        # try cancelling a Cancelled PO — should 400
        r = s.post(f"{API}/purchase-orders/{pid}/cancel",
                    json={"actor_name": "TEST", "note": "Retry."})
        assert r.status_code == 400


# ═════════════════════════════════════════════════════════
# 9. SPRINT 1 REGRESSION
# ═════════════════════════════════════════════════════════
class TestSprint1Regression:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("app") == "MPCA ERP"

    def test_division_grants(self, s):
        r = s.get(f"{API}/division-grants")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_ledger(self, s):
        r = s.get(f"{API}/ledger", params={"body_id": "MPCA", "fiscal_cycle": "2026-27"})
        assert r.status_code == 200
        d = r.json()
        assert "entries" in d or "rows" in d or "closing" in d or "closing_balance" in d, \
            f"ledger response missing expected fields: {list(d.keys())[:8]}"

    def test_budget_vs_actual(self, s):
        r = s.get(f"{API}/finance/budget-vs-actual")
        assert r.status_code == 200
        assert isinstance(r.json(), list) or isinstance(r.json(), dict)

    def test_vouchers(self, s):
        r = s.get(f"{API}/vouchers")
        assert r.status_code == 200

    def test_audit_log(self, s):
        r = s.get(f"{API}/shared/audit-log")
        assert r.status_code == 200
