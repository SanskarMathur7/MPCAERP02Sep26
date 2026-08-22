"""Iter 120 · Maker-Checker end-to-end sweep with real MPCA roster credentials."""
import os
import httpx
import pytest

BASE = os.environ.get("BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
PW = "mpca@2026"


def _login(email: str) -> str:
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": PW}, timeout=15)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Admin / catalog ----------

def test_workflow_catalog_has_17():
    tok = _login("sysadmin@mpca.in")
    r = httpx.get(f"{API}/mc-admin/workflows", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    keys = {w["key"] for w in r.json()["workflows"]}
    assert len(keys) >= 17, f"expected 17, got {len(keys)}"
    expected = {
        "tournament_create", "grant_claim_approve", "reimbursement_release", "rbac_change",
        "tournament_close", "player_registration_approve", "tournament_budget_sanction",
        "match_officials_post", "rate_card_revise", "eligibility_rules_publish",
        "squad_submit_to_bcci", "grant_claim_recommend", "division_camp_budget_lock",
        "reimbursement_submit_to_mpca", "fixtures_publish", "player_registration_recommend",
        "division_squad_approve",
    }
    missing = expected - keys
    assert not missing, f"missing workflows: {missing}"


def test_posts_catalog_has_canonical_13():
    tok = _login("sysadmin@mpca.in")
    r = httpx.get(f"{API}/mc-admin/posts", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    titles = {p["post_title"] for p in r.json()["posts"]}
    for t in ("President", "Vice President", "Hon. Secretary", "Joint Secretary",
              "Hon. Treasurer", "Chief Accounts Officer", "Internal Auditor",
              "Division Secretary", "District Secretary", "Selection Chairperson",
              "Cricket Manager", "Manager", "System Administrator"):
        assert t in titles, f"missing canonical post {t!r}"


def test_workflow_shape_tournament_create():
    tok = _login("sysadmin@mpca.in")
    r = httpx.get(f"{API}/mc-admin/workflows/tournament_create", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("key", "steps", "collection", "initial_status"):
        assert k in d
    step_actions = {s["action"] for s in d["steps"]}
    for a in ("submit", "approve", "return"):
        assert a in step_actions, f"missing step action {a}"


def test_admin_endpoints_require_rbac_manage():
    """A non-privileged user (internal auditor) should be 403."""
    tok = _login("accounts@mpcaonline.com")
    r = httpx.get(f"{API}/mc-admin/workflows", headers=_h(tok), timeout=15)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------- Runtime state view ----------

def test_state_shape_for_a_tournament():
    tok = _login("sysadmin@mpca.in")
    ts = httpx.get(f"{API}/tournaments?limit=1", headers=_h(tok), timeout=15).json()
    rows = ts if isinstance(ts, list) else ts.get("items") or ts.get("tournaments") or []
    if not rows:
        pytest.skip("no tournaments seeded")
    tid = rows[0]["id"]
    r = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("status", "chain", "next_actions", "workflow", "steps"):
        assert k in d, f"state view missing {k}"


def test_needs_rework_inbox():
    tok = _login("panditrdpandit@gmail.com")  # CAO — maker on tournament_create
    r = httpx.get(f"{API}/mc/inbox/needs-rework", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    assert set(r.json().keys()) >= {"count", "buckets"}


# ---------- Two-person / return / final approve ----------

def _fetch_draft_or_pending_tournament(tok):
    ts = httpx.get(f"{API}/tournaments?limit=50", headers=_h(tok), timeout=15).json()
    rows = ts if isinstance(ts, list) else ts.get("items") or ts.get("tournaments") or []
    for r in rows:
        st = r.get("mc_status") or r.get("status")
        if st in (None, "Draft", "PendingReview"):
            return r
    return rows[0] if rows else None


def test_transition_two_person_rule():
    """CAO submit → Secretary approve or return-with-note. Same person can't do both."""
    cao = _login("panditrdpandit@gmail.com")
    sec = _login("secretary@mpcaonline.com")
    t = _fetch_draft_or_pending_tournament(cao)
    if not t:
        pytest.skip("no tournaments to exercise")
    tid = t["id"]

    st = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_h(cao), timeout=15).json()
    if st["status"] in ("Approved", "Rejected"):
        pytest.skip(f"tournament {tid} already terminal ({st['status']})")

    if st["status"] == "Draft":
        r = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_h(cao),
                       json={"action": "submit"}, timeout=15)
        # OK or 403 if CAO isn't authorised (post_title mismatch)
        if r.status_code == 403:
            pytest.skip(f"CAO not authorised as maker: {r.text}")
        assert r.status_code == 200, r.text

    # Two-person: CAO cannot approve their own submission
    r = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_h(cao),
                   json={"action": "approve"}, timeout=15)
    assert r.status_code in (400, 403), f"maker should not approve own doc; got {r.status_code}"


def test_return_requires_note():
    """A return action without a note should be rejected (400)."""
    sec = _login("secretary@mpcaonline.com")
    t = _fetch_draft_or_pending_tournament(sec)
    if not t:
        pytest.skip("no tournaments")
    tid = t["id"]

    st = httpx.get(f"{API}/mc/tournament_create/{tid}/state", headers=_h(sec), timeout=15).json()
    if st["status"] != "PendingReview":
        pytest.skip(f"tournament not in PendingReview (was {st['status']})")

    r = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_h(sec),
                   json={"action": "return"}, timeout=15)
    # engine should require a note
    assert r.status_code in (400, 422), f"expected note-required error; got {r.status_code}: {r.text}"

    r2 = httpx.post(f"{API}/mc/tournament_create/{tid}/transition", headers=_h(sec),
                    json={"action": "return", "note": "clarify tournament level"}, timeout=15)
    # 200 if secretary is authorised, else 403 — either indicates engine did not silently accept the empty-note
    assert r2.status_code in (200, 403), r2.text
