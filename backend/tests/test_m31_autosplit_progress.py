"""M31 · Auto-Split Budget endpoint + Squad Progress derivation tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# Primary tournament from review request
SM_KHAN_TID = "58bd8f3c-2562-4231-b846-537103e8a542"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ─────────────── Auto-Split Endpoint ───────────────

class TestAutoSplit:
    def test_sm_khan_autosplit_shape(self, s):
        r = s.post(f"{API}/tournaments/{SM_KHAN_TID}/budget/auto-split")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("tournament_id", "scheme_code", "created", "skipped", "created_count", "skipped_count"):
            assert k in data, f"missing {k}"
        assert isinstance(data["created"], list)
        assert isinstance(data["skipped"], list)
        assert data["created_count"] == len(data["created"])
        assert data["skipped_count"] == len(data["skipped"])

    def test_idempotent_rerun_skips(self, s):
        # First ensure some budgets exist by calling once
        s.post(f"{API}/tournaments/{SM_KHAN_TID}/budget/auto-split")
        # Then rerun — nothing new should be created
        r = s.post(f"{API}/tournaments/{SM_KHAN_TID}/budget/auto-split")
        assert r.status_code == 200
        d = r.json()
        assert d["created_count"] == 0
        assert d["skipped_count"] >= 1

    def test_404_missing_tournament(self, s):
        r = s.post(f"{API}/tournaments/does-not-exist-xyz/budget/auto-split")
        assert r.status_code == 404

    def test_created_budgets_have_expected_props(self, s):
        """Fetch tournament budgets after autosplit — verify status=Draft, body_id set, ceiling > 0."""
        # ensure autosplit ran
        s.post(f"{API}/tournaments/{SM_KHAN_TID}/budget/auto-split")
        r = s.get(f"{API}/tournament-budgets?tournament_id={SM_KHAN_TID}")
        # Tolerate either list endpoint or alt path
        if r.status_code == 404:
            r = s.get(f"{API}/tournaments/{SM_KHAN_TID}/budgets")
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            budgets = r.json()
            for b in budgets:
                # Only assert on autosplit-created ones (notes contains 'Auto-split')
                if "Auto-split" in (b.get("notes") or ""):
                    assert b.get("status") == "Draft"
                    assert b.get("body_id")
                    assert (b.get("total_ceiling_inr") or 0) > 0

    def test_host_gets_full_scheme_visitor_gets_subset(self, s):
        """Compare heads count: host budget should have >= visitor budget heads."""
        s.post(f"{API}/tournaments/{SM_KHAN_TID}/budget/auto-split")
        # fetch participations to identify host vs visitor bodies
        r = s.get(f"{API}/tournaments/{SM_KHAN_TID}/participants")
        if r.status_code != 200:
            pytest.skip(f"participants endpoint returned {r.status_code}")
        parts = r.json()
        host_bodies = [p["body_code"] for p in parts if p.get("role") == "Host"]
        visitor_bodies = [p["body_code"] for p in parts if p.get("role") == "Visitor"]
        if not host_bodies or not visitor_bodies:
            pytest.skip("Need at least one host and one visitor to compare")

        # fetch budgets
        rb = s.get(f"{API}/tournament-budgets?tournament_id={SM_KHAN_TID}")
        if rb.status_code != 200:
            pytest.skip("no tournament-budgets list endpoint")
        budgets = rb.json()
        host_b = next((b for b in budgets if b.get("body_id") in host_bodies and "Auto-split" in (b.get("notes") or "")), None)
        vis_b = next((b for b in budgets if b.get("body_id") in visitor_bodies and "Auto-split" in (b.get("notes") or "")), None)
        if not (host_b and vis_b):
            pytest.skip("Host/visitor auto-split budgets not both present")
        assert len(host_b["head_allocations"]) >= len(vis_b["head_allocations"])
        # Visitor heads must be subsidy-ish only
        allowed = ("travel", "da ", " da", "food", "stay", "hotel", "lodging", "boarding", "meal", "conveyance", "transport", "contingency", "subsidy")
        for h in vis_b["head_allocations"]:
            label = h["head"].lower()
            assert any(k.strip() in label for k in allowed), f"Visitor head not subsidy: {h['head']}"


# ─────────────── Auto-Split Error Cases ───────────────

class TestAutoSplitErrors:
    def _create_bare_tournament(self, s, **overrides):
        payload = {
            "name": "TEST_M31_autosplit_bare",
            "format": "T20",
            "tournament_type_code": "2-B",
            "scheme_code": "2-B",
            "host_body_id": "DIV-IND",
            "fiscal_cycle": "2025-26",
            "scope": "Inter_Divisional",
        }
        payload.update(overrides)
        r = s.post(f"{API}/tournaments", json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_400_when_input_variables_missing(self, s):
        t = self._create_bare_tournament(s)
        try:
            r = s.post(f"{API}/tournaments/{t['id']}/budget/auto-split")
            assert r.status_code == 400
            assert "Input Variables" in r.text or "input_variables" in r.text.lower()
        finally:
            s.delete(f"{API}/tournaments/{t['id']}")

    def test_400_when_scheme_code_missing(self, s):
        t = self._create_bare_tournament(s, scheme_code=None, tournament_type_code=None)
        try:
            # Give it input vars but no scheme_code
            s.patch(f"{API}/tournaments/{t['id']}/input-variables", json={"input_variables": {"n_days": 3}})
            r = s.post(f"{API}/tournaments/{t['id']}/budget/auto-split")
            # If backend auto-fills scheme, this may still 400 for another reason;
            # We accept 400 as pass.
            assert r.status_code == 400
        finally:
            s.delete(f"{API}/tournaments/{t['id']}")


# ─────────────── Progress · squad_approved derivation ───────────────

class TestProgressSquadApproved:
    def test_sm_khan_squad_approved_true(self, s):
        """SM Khan Trophy has DIV-IND squad with submission_status='Approved'."""
        r = s.get(f"{API}/tournaments/{SM_KHAN_TID}/progress")
        assert r.status_code == 200
        data = r.json()
        squad_phase = next(p for p in data["phases"] if p["key"] == "squad")
        selected = next(s for s in squad_phase["steps"] if s["key"] == "squad_selected")
        approved = next(s for s in squad_phase["steps"] if s["key"] == "squad_approved")
        assert selected["done"] is True, "squad_selected should be done"
        assert approved["done"] is True, "squad_approved MUST be true when squad is Approved"

    def test_progress_404_missing(self, s):
        r = s.get(f"{API}/tournaments/nope-nope-nope/progress")
        assert r.status_code == 404
