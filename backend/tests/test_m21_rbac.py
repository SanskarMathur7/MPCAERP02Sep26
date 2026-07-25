"""Sprint M21 RBAC console backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # try frontend .env
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

SEC_HDR = {"X-Persona-Id": "secretary", "X-Body-Code": "MPCA", "X-Body-Type": "State",
           "X-Persona-Name": "Sanjeev Dua", "X-Persona-Post": "Hon. Secretary"}
DIV_HDR = {"X-Persona-Id": "division-secretary", "X-Body-Code": "DIV-IND", "X-Body-Type": "Division",
           "X-Persona-Name": "Devashish Nilosey"}
PRES_HDR = {"X-Persona-Id": "president", "X-Body-Code": "MPCA", "X-Body-Type": "State"}

EXPECTED_ROLES = {"president", "hon_secretary", "hon_treasurer", "joint_secretary", "auditor",
                  "state_selector", "system_administrator", "division_secretary",
                  "division_treasurer", "district_secretary", "match_official", "coach", "data_entry"}


class TestRBACRoles:
    def test_list_roles_as_secretary(self):
        r = requests.get(f"{API}/rbac/roles", headers=SEC_HDR)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 13
        ids = {x["id"] for x in data}
        assert ids == EXPECTED_ROLES
        for role in data:
            assert "name" in role and "body_scope" in role and "permissions" in role
            assert isinstance(role["permissions"], list)

    def test_list_roles_as_division_forbidden(self):
        r = requests.get(f"{API}/rbac/roles", headers=DIV_HDR)
        assert r.status_code == 403

    def test_list_roles_bootstrap_no_persona_allowed(self):
        r = requests.get(f"{API}/rbac/roles")
        assert r.status_code == 200

    def test_president_perms_84(self):
        r = requests.get(f"{API}/rbac/roles/president", headers=SEC_HDR)
        assert r.status_code == 200
        # Should be full catalog (~84)
        cat = requests.get(f"{API}/rbac/permission-catalog", headers=SEC_HDR).json()
        assert len(r.json()["permissions"]) == len(cat["all_permissions"])

    def test_auditor_view_only(self):
        r = requests.get(f"{API}/rbac/roles/auditor", headers=SEC_HDR)
        perms = r.json()["permissions"]
        for p in perms:
            assert p.endswith(".view") or p == "rbac.audit_log", f"non-view perm on auditor: {p}"


class TestRBACPatchRole:
    def test_patch_role_persists(self):
        # Read current
        r0 = requests.get(f"{API}/rbac/roles/hon_secretary", headers=SEC_HDR)
        perms = set(r0.json()["permissions"])
        original = set(perms)
        # toggle players.export off
        perms.discard("players.export")
        r1 = requests.patch(f"{API}/rbac/roles/hon_secretary",
                            headers=SEC_HDR, json={"permissions": list(perms)})
        assert r1.status_code == 200, r1.text
        assert "players.export" not in r1.json()["permissions"]
        # GET again
        r2 = requests.get(f"{API}/rbac/roles/hon_secretary", headers=SEC_HDR)
        assert "players.export" not in r2.json()["permissions"]
        # Restore
        requests.patch(f"{API}/rbac/roles/hon_secretary",
                       headers=SEC_HDR, json={"permissions": list(original)})

    def test_patch_role_bad_perm_400(self):
        r = requests.patch(f"{API}/rbac/roles/coach",
                          headers=SEC_HDR, json={"permissions": ["fake.badperm"]})
        assert r.status_code == 400

    def test_patch_role_as_division_forbidden(self):
        r = requests.patch(f"{API}/rbac/roles/coach",
                          headers=DIV_HDR, json={"description": "x"})
        assert r.status_code == 403


class TestRBACUsers:
    def test_list_users_seeded(self):
        r = requests.get(f"{API}/rbac/users", headers=SEC_HDR)
        assert r.status_code == 200
        users = r.json()
        assert len(users) >= 6
        persona_ids = {u["persona_id"] for u in users if u.get("persona_id")}
        assert {"president", "secretary", "treasurer", "division-secretary",
                "district-secretary", "match-official"}.issubset(persona_ids)

    def test_create_toggle_delete_user(self):
        payload = {"display_name": "TEST_QA User", "email": "qa@test", "role_id": "coach",
                   "body_code": "DIV-BPL", "body_type": "Division"}
        r = requests.post(f"{API}/rbac/users", headers=SEC_HDR, json=payload)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        assert r.json()["display_name"] == "TEST_QA User"
        # Toggle deactivate
        r2 = requests.patch(f"{API}/rbac/users/{uid}", headers=SEC_HDR, json={"is_active": False})
        assert r2.status_code == 200
        assert r2.json()["is_active"] is False
        # Delete
        r3 = requests.delete(f"{API}/rbac/users/{uid}", headers=SEC_HDR)
        assert r3.status_code == 200
        # Verify gone
        users = requests.get(f"{API}/rbac/users", headers=SEC_HDR).json()
        assert uid not in [u["id"] for u in users]

    def test_delete_persona_user_forbidden(self):
        r = requests.delete(f"{API}/rbac/users/secretary", headers=SEC_HDR)
        assert r.status_code == 400

    def test_create_user_bad_role(self):
        r = requests.post(f"{API}/rbac/users", headers=SEC_HDR,
                          json={"display_name": "X", "role_id": "not_a_role"})
        assert r.status_code == 400


class TestWhoami:
    def test_whoami_division_secretary(self):
        r = requests.get(f"{API}/rbac/whoami", headers=DIV_HDR)
        assert r.status_code == 200
        data = r.json()
        assert data["role"]["name"] == "Division Secretary"
        # Div Sec has ~40 perms (approximate — verify it's around that range)
        assert 30 <= len(data["permissions"]) <= 55

    def test_whoami_no_persona(self):
        r = requests.get(f"{API}/rbac/whoami")
        assert r.status_code == 200
        assert r.json()["user"] is None


class TestAuditLog:
    def test_audit_log_records_role_edit(self):
        # trigger an edit
        requests.patch(f"{API}/rbac/roles/coach", headers=SEC_HDR,
                       json={"description": "Coach / Physio (audit-test)"})
        r = requests.get(f"{API}/rbac/audit-log", headers=SEC_HDR, params={"limit": 20})
        assert r.status_code == 200
        events = r.json()
        assert any(e["action"] == "rbac.role_edited" for e in events)


class TestRegression:
    def test_tournaments_still_reachable(self):
        r = requests.get(f"{API}/tournaments", headers=DIV_HDR)
        # legacy endpoint - should not be 403
        assert r.status_code in (200, 404)

    def test_bodies_endpoint(self):
        r = requests.get(f"{API}/bodies", headers=DIV_HDR)
        assert r.status_code == 200
