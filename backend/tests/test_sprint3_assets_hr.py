"""Sprint 3 · Fixed Asset Register + HR/Payroll · backend pytest.

Covers:
    - Assets: list/summary/create/depreciation-schedule/dispose
    - Employees: list/summary/create (basic_pay validation)
    - Payroll: generate (with idempotency), finalise (auto-voucher), summary
    - Sprint 1/2 regression endpoints
"""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    return {"assets": [], "employees": []}


# ═════════ ASSETS ═════════

class TestAssets:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_list_assets(self, api):
        r = api.get(f"{BASE_URL}/api/assets")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 8, f"Expected >=8 seeded assets, got {len(data)}"
        cats = {a["category"] for a in data}
        for expected in {"Building", "Land", "Vehicle", "Sports_Equipment", "Computer", "Furniture", "Networking", "Equipment"}:
            assert expected in cats, f"Missing category {expected}"
        # book_value < cost for non-land, book == cost for Land
        for a in data:
            if a["category"] == "Land":
                assert a["book_value_inr"] == a["cost_inr"], f"Land book != cost: {a['asset_no']}"
            else:
                assert a["book_value_inr"] < a["cost_inr"], f"{a['asset_no']} book_value should be < cost_inr"

    def test_assets_summary(self, api):
        r = api.get(f"{BASE_URL}/api/assets-stats/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("gross_block_inr", "accumulated_depreciation_inr", "net_block_inr", "by_category", "by_status", "count"):
            assert k in d
        # Gross block expected ~₹11.36 Cr = 113_600_000 (allow ±5%)
        assert 108_000_000 <= d["gross_block_inr"] <= 118_000_000
        # net == gross - accumulated (approx)
        assert abs(d["net_block_inr"] - (d["gross_block_inr"] - d["accumulated_depreciation_inr"])) < 1

    def test_create_asset_and_persist(self, api, created_ids):
        payload = {
            "body_id": "MPCA",
            "category": "Computer",
            "description": "TEST_SPRINT3 Laptop",
            "location": "TEST_LAB",
            "purchase_date": "2026-01-01",
            "cost_inr": 60000,
            "salvage_value_inr": 0,
            "created_by_name": "TEST_SPRINT3",
        }
        r = api.post(f"{BASE_URL}/api/assets", json=payload)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["asset_no"].startswith("ASS/MPCA/2026-27/"), f"Unexpected asset_no {a['asset_no']}"
        assert a["useful_life_years"] == 3, "Computer should default to 3yr life"
        created_ids["assets"].append(a["id"])
        # GET to confirm persistence
        r2 = api.get(f"{BASE_URL}/api/assets/{a['id']}")
        assert r2.status_code == 200
        assert r2.json()["description"] == "TEST_SPRINT3 Laptop"

    def test_create_asset_life_defaults_by_category(self, api, created_ids):
        # Building should default to 30 years
        r = api.post(f"{BASE_URL}/api/assets", json={
            "body_id": "MPCA", "category": "Building",
            "description": "TEST_SPRINT3 shed", "purchase_date": "2026-01-01",
            "cost_inr": 1000000,
        })
        assert r.status_code == 200
        assert r.json()["useful_life_years"] == 30
        created_ids["assets"].append(r.json()["id"])

    def test_create_asset_salvage_ge_cost_400(self, api):
        r = api.post(f"{BASE_URL}/api/assets", json={
            "body_id": "MPCA", "category": "Equipment",
            "description": "TEST_SPRINT3 bad", "purchase_date": "2026-01-01",
            "cost_inr": 10000, "salvage_value_inr": 10000,
        })
        assert r.status_code == 400

    def test_depreciation_schedule_building(self, api):
        # Pick a Building from list
        r = api.get(f"{BASE_URL}/api/assets", params={"category": "Building"})
        assets = r.json()
        assert assets, "No Building asset seeded"
        a = assets[0]
        sr = api.get(f"{BASE_URL}/api/assets/{a['id']}/depreciation-schedule", params={"months": 12})
        assert sr.status_code == 200
        s = sr.json()
        assert "rows" in s and len(s["rows"]) > 0
        # monthly = (cost - salvage) / 360 for 30yr building
        expected_monthly = round((a["cost_inr"] - (a.get("salvage_value_inr") or 0)) / 360, 2)
        assert abs(s["rows"][0]["depreciation_inr"] - expected_monthly) < 1.0, \
            f"Expected monthly ~{expected_monthly}, got {s['rows'][0]['depreciation_inr']}"

    def test_depreciation_schedule_land_is_empty(self, api):
        r = api.get(f"{BASE_URL}/api/assets", params={"category": "Land"})
        land = r.json()
        assert land, "Land asset not seeded"
        sr = api.get(f"{BASE_URL}/api/assets/{land[0]['id']}/depreciation-schedule")
        assert sr.status_code == 200
        s = sr.json()
        assert s["rows"] == [] and "note" in s

    def test_dispose_asset_flow(self, api, created_ids):
        # Create a dedicated asset to dispose
        cr = api.post(f"{BASE_URL}/api/assets", json={
            "body_id": "MPCA", "category": "Furniture",
            "description": "TEST_SPRINT3 chair to dispose",
            "purchase_date": "2020-01-01",  # older so book value < cost
            "cost_inr": 50000, "salvage_value_inr": 0,
        })
        assert cr.status_code == 200
        aid = cr.json()["id"]
        created_ids["assets"].append(aid)

        # Missing reason returns 400 (Pydantic validation for required str)
        bad = api.post(f"{BASE_URL}/api/assets/{aid}/dispose", json={"disposal_amount_inr": 1000})
        assert bad.status_code in (400, 422)

        # Successful disposal
        cur = api.get(f"{BASE_URL}/api/assets/{aid}").json()
        book_before = cur["book_value_inr"]
        ok = api.post(f"{BASE_URL}/api/assets/{aid}/dispose", json={
            "disposal_amount_inr": 5000, "disposal_reason": "TEST_SPRINT3 obsolete",
        })
        assert ok.status_code == 200, ok.text
        d = ok.json()
        assert d["status"] == "Disposed"
        assert "gain_loss_on_disposal_inr" in d
        # gain_loss ~= 5000 - book_before  (small rounding tolerance)
        assert abs(d["gain_loss_on_disposal_inr"] - (5000 - book_before)) < 100

        # Cannot dispose twice
        second = api.post(f"{BASE_URL}/api/assets/{aid}/dispose", json={
            "disposal_amount_inr": 100, "disposal_reason": "again",
        })
        assert second.status_code == 400


# ═════════ EMPLOYEES ═════════

class TestEmployees:
    def test_list_employees(self, api):
        r = api.get(f"{BASE_URL}/api/employees")
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 7, f"Expected >=7 seeded employees, got {len(d)}"
        types = {e["employment_type"] for e in d}
        assert "Consultant" in types
        # Consultant should have tds_applicable True, pf_applicable False
        consultants = [e for e in d if e["employment_type"] == "Consultant"]
        assert consultants, "No consultant"
        c = consultants[0]
        assert c["tds_applicable"] is True
        assert c["pf_applicable"] is False

    def test_employees_summary(self, api):
        r = api.get(f"{BASE_URL}/api/employees-stats/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("count", "active", "by_type", "monthly_gross_inr", "annual_projected_inr"):
            assert k in d
        assert d["annual_projected_inr"] == round(d["monthly_gross_inr"] * 12, 2)

    def test_create_employee_basic_positive(self, api, created_ids):
        r = api.post(f"{BASE_URL}/api/employees", json={
            "body_id": "MPCA",
            "name": "TEST_SPRINT3 Ravi",
            "designation": "TEST_SPRINT3 QA",
            "employment_type": "Permanent",
            "date_of_joining": "2026-01-15",
            "basic_pay_inr": 20000,
            "hra_inr": 8000,
        })
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["employee_no"].startswith("EMP/MPCA/2026-27/")
        created_ids["employees"].append(e["id"])

    def test_create_employee_zero_basic_400(self, api):
        r = api.post(f"{BASE_URL}/api/employees", json={
            "body_id": "MPCA",
            "name": "TEST_SPRINT3 zero",
            "designation": "x",
            "date_of_joining": "2026-01-15",
            "basic_pay_inr": 0,
        })
        assert r.status_code == 422  # Field(gt=0) → 422 unprocessable

    def test_create_employee_negative_basic_400(self, api):
        r = api.post(f"{BASE_URL}/api/employees", json={
            "body_id": "MPCA",
            "name": "TEST_SPRINT3 neg",
            "designation": "x",
            "date_of_joining": "2026-01-15",
            "basic_pay_inr": -1000,
        })
        assert r.status_code == 422


# ═════════ PAYROLL ═════════

class TestPayroll:
    def test_registers_seeded_draft(self, api):
        r = api.get(f"{BASE_URL}/api/payroll/registers")
        assert r.status_code == 200
        regs = r.json()
        assert len(regs) >= 1
        d = regs[0]
        # Seed says ~7.7L gross / ~7.15L net for the draft
        assert 700_000 <= d["total_gross_inr"] <= 850_000
        assert 650_000 <= d["total_net_inr"] <= 800_000
        assert len(d["rows"]) >= 7

    def test_payroll_math_on_rows(self, api):
        regs = api.get(f"{BASE_URL}/api/payroll/registers").json()
        # Find the draft register
        reg = next((r for r in regs if r["status"] in ("Draft", "Finalised")), None)
        assert reg
        for row in reg["rows"]:
            gross = row["basic_inr"] + row["hra_inr"] + row["special_allowance_inr"] + row["conveyance_inr"]
            assert abs(row["gross_inr"] - gross) < 1
            # PF = 12% of basic (when applicable). Row's pf_inr must equal or be zero.
            expected_pf = round(row["basic_inr"] * 0.12, 2)
            assert row["pf_inr"] in (0.0, expected_pf), f"PF mismatch for {row['name']}: got {row['pf_inr']} expected {expected_pf}"
            # ESI: 0.75% of gross ONLY if gross <= 21000
            if row["esi_inr"] > 0:
                assert row["gross_inr"] <= 21000, f"ESI charged though gross={row['gross_inr']} > 21K for {row['name']}"
                assert abs(row["esi_inr"] - round(row["gross_inr"] * 0.0075, 2)) < 1
            # PT: 200 fixed if gross >= 15000
            if row["professional_tax_inr"] > 0:
                assert row["professional_tax_inr"] == 200
                assert row["gross_inr"] >= 15000
            # TDS: 10% of gross for consultants (tds_inr > 0)
            if row["tds_inr"] > 0:
                assert abs(row["tds_inr"] - round(row["gross_inr"] * 0.10, 2)) < 1
            # Net = Gross - deductions
            expected_net = round(row["gross_inr"] - row["total_deductions_inr"], 2)
            assert abs(row["net_pay_inr"] - expected_net) < 1

    def test_payroll_generate_idempotent(self, api):
        # Grab the seeded draft register period
        regs = api.get(f"{BASE_URL}/api/payroll/registers").json()
        draft = next((r for r in regs if r["status"] == "Draft"), None)
        if not draft:
            pytest.skip("No draft register available (may have been finalised already).")
        period = draft["period"]
        rid = draft["id"]
        # Regenerate for same period
        r1 = api.post(f"{BASE_URL}/api/payroll/generate", json={
            "period": period, "body_id": "MPCA", "actor_name": "TEST_SPRINT3",
        })
        assert r1.status_code == 200, r1.text
        assert r1.json()["id"] == rid, "Regeneration must be idempotent (same id)"

    def test_payroll_finalise_creates_voucher(self, api):
        regs = api.get(f"{BASE_URL}/api/payroll/registers").json()
        draft = next((r for r in regs if r["status"] == "Draft"), None)
        if not draft:
            pytest.skip("No draft register to finalise")
        rid = draft["id"]
        net = draft["total_net_inr"]
        # Snapshot vouchers before
        vs_before = api.get(f"{BASE_URL}/api/vouchers").json()
        r = api.post(f"{BASE_URL}/api/payroll/registers/{rid}/finalise", json={
            "actor_name": "TEST_SPRINT3", "actor_role": "president",
        })
        assert r.status_code == 200, r.text
        f = r.json()
        assert f["status"] == "Finalised"
        assert f.get("voucher_id"), "voucher_id missing after finalise"

        # Cannot finalise twice
        r2 = api.post(f"{BASE_URL}/api/payroll/registers/{rid}/finalise", json={"actor_name": "TEST"})
        assert r2.status_code == 400

        # Regenerate now must be 400
        r3 = api.post(f"{BASE_URL}/api/payroll/generate", json={
            "period": draft["period"], "body_id": "MPCA",
        })
        assert r3.status_code == 400

        # Check voucher was actually created with matching amount + linked_module=payroll
        vs_after = api.get(f"{BASE_URL}/api/vouchers").json()
        new_vouchers = [v for v in vs_after if v["id"] not in {x["id"] for x in vs_before}]
        pv = next((v for v in new_vouchers if v.get("linked_module") == "payroll" and v.get("linked_ref_id") == rid), None)
        assert pv, "No payroll-linked voucher created on finalise"
        assert pv["voucher_type"] == "Payment"
        assert abs(pv["amount_inr"] - net) < 1

    def test_payroll_summary(self, api):
        r = api.get(f"{BASE_URL}/api/payroll-stats/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("period_count", "total_gross_inr", "total_net_inr", "total_tds_inr",
                  "total_pf_inr", "total_esi_inr", "total_pt_inr"):
            assert k in d


# ═════════ SPRINT 1/2 REGRESSION ═════════

class TestRegression:
    @pytest.mark.parametrize("path", [
        "/api/division-grants",
        "/api/vouchers",
        "/api/finance/budget-vs-actual",
        "/api/purchase-orders",
        "/api/vendors-kyc/summary",
        "/api/shared/audit-log",
    ])
    def test_endpoint_reachable(self, api, path):
        r = api.get(f"{BASE_URL}{path}")
        assert r.status_code == 200, f"{path} returned {r.status_code}: {r.text[:200]}"

    def test_ledger_reachable(self, api):
        r = api.get(f"{BASE_URL}/api/ledger", params={"body_id": "MPCA", "fiscal_cycle": "2026-27"})
        assert r.status_code == 200


# ═════════ TEARDOWN — remove TEST_SPRINT3_* rows ═════════

def teardown_module(module):
    # Best-effort cleanup via direct Mongo (test data is prefixed with TEST_SPRINT3 in name/description)
    try:
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        cli = MongoClient(mongo_url, serverSelectionTimeoutMS=1500)
        db = cli[db_name]
        db.assets.delete_many({"description": {"$regex": "^TEST_SPRINT3"}})
        db.employees.delete_many({"name": {"$regex": "^TEST_SPRINT3"}})
    except Exception as e:  # pragma: no cover
        print(f"Cleanup skipped: {e}")
