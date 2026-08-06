"""M39z.h · Parent Division of District-host tournament gets organiser rights on
GET /api/tournaments/{tid}/finance/matrix.

Convention: body codes DIV-<3letter>, DIST-<slug>-<3letter>. DIST-*-IND is
under DIV-IND. When a District hosts a tournament, its parent Division should
receive State-equivalent (full pipeline) view rights.
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

# Curated tournaments (from live DB at time of writing)
TID_DIST_HOST = "da0adb0f-916f-4450-afc4-3965d86ac7dd"   # host_body_id = DIST-ALIR-IND
TID_DIV_HOST = "16a2fdd5-aac0-4832-9ad5-a862c31b33cd"    # host_body_id = DIV-IND
TID_MPCA_HOST = "bb71efd9-58be-436d-b04a-0aca48aa4f43"   # host_body_id = MPCA


def _matrix(tid, body_type, body_code):
    return requests.get(
        f"{BASE_URL}/api/tournaments/{tid}/finance/matrix",
        headers={"X-Body-Type": body_type, "X-Body-Code": body_code},
        timeout=15,
    )


class TestParentDivOrganiserRights:
    """M39z.h · Parent Division of a District-hosted tournament gets full matrix."""

    def test_mpca_sees_full_matrix_on_dist_host(self):
        r = _matrix(TID_DIST_HOST, "State", "MPCA")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["viewer_scope"] == "state"

    def test_parent_div_ind_gets_full_scope_on_dist_alir_ind_host(self):
        # BUG 2 core: DIV-IND is parent of DIST-ALIR-IND, should get state scope.
        r = _matrix(TID_DIST_HOST, "Division", "DIV-IND")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["viewer_scope"] == "state", f"Expected full scope for parent DIV-IND, got {d['viewer_scope']}"
        # input_variables gate — only exposed to organisers
        assert isinstance(d["input_variables"], dict)

    def test_unrelated_division_does_not_get_organiser_rights(self):
        # DIV-BPL is NOT parent of DIST-ALIR-IND. Should be scoped to own row (empty if not participant).
        r = _matrix(TID_DIST_HOST, "Division", "DIV-BPL")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["viewer_scope"] == "body", "DIV-BPL leaked organiser rights on unrelated District tournament!"
        # No rows leaked (or only DIV-BPL row if they were a participant)
        for row in d["rows"]:
            assert row["body_code"] == "DIV-BPL"

    def test_district_host_still_gets_organiser(self):
        # M39z.g regression: the host District itself keeps full rights.
        r = _matrix(TID_DIST_HOST, "District", "DIST-ALIR-IND")
        assert r.status_code == 200, r.text
        assert r.json()["viewer_scope"] == "state"

    def test_division_hosted_tournament_host_div_still_organiser(self):
        # M39z.g core case: DIV-IND on a DIV-IND-hosted tournament.
        r = _matrix(TID_DIV_HOST, "Division", "DIV-IND")
        assert r.status_code == 200, r.text
        assert r.json()["viewer_scope"] == "state"

    def test_non_participant_division_on_mpca_owned_gets_scoped(self):
        # Regression: DIV-BPL on MPCA-owned tournament -> body scope only.
        r = _matrix(TID_MPCA_HOST, "Division", "DIV-BPL")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["viewer_scope"] == "body"

    def test_mpca_on_div_owned_tournament(self):
        r = _matrix(TID_DIV_HOST, "State", "MPCA")
        assert r.status_code == 200, r.text
        assert r.json()["viewer_scope"] == "state"
