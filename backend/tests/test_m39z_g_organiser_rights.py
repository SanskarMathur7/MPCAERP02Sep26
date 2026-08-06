"""M39z.g · Host Division acts as organiser (MPCA-equivalent) on their own
tournaments. Backend scope for /finance/matrix must widen to include the
host body, while non-host Divisions remain scoped to their own row.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://nice-aryabhata-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Div-owned Inter-District tournament (host = DIV-IND)
DIV_HOSTED_TID = "16a2fdd5-aac0-4832-9ad5-a862c31b33cd"
# MPCA-owned Inter-Divisional tournament (host = MPCA)
MPCA_HOSTED_TID = "bb71efd9-58be-436d-b04a-0aca48aa4f43"


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestFinanceMatrixScope:
    """/tournaments/{tid}/finance/matrix scope guard — M39z.g extension."""

    def test_tournament_metadata_sanity(self, client):
        r = client.get(f"{API}/tournaments/{DIV_HOSTED_TID}")
        assert r.status_code == 200
        assert r.json().get("host_body_id") == "DIV-IND"
        r2 = client.get(f"{API}/tournaments/{MPCA_HOSTED_TID}")
        assert r2.status_code == 200
        assert r2.json().get("host_body_id") == "MPCA"

    def test_mpca_sees_full_matrix_on_div_hosted(self, client):
        r = client.get(f"{API}/tournaments/{DIV_HOSTED_TID}/finance/matrix",
                       headers={"X-Body-Code": "MPCA", "X-Body-Type": "State"})
        assert r.status_code == 200
        data = r.json()
        assert data["viewer_scope"] == "state"
        mpca_rows = data.get("rows") or []
        # store row count for comparison
        pytest.mpca_row_count = len(mpca_rows)

    def test_host_division_gets_full_matrix(self, client):
        """PRIMARY: DIV-IND (host body) should now see all rows, matching MPCA scope."""
        r = client.get(f"{API}/tournaments/{DIV_HOSTED_TID}/finance/matrix",
                       headers={"X-Body-Code": "DIV-IND", "X-Body-Type": "Division"})
        assert r.status_code == 200
        data = r.json()
        assert data["viewer_scope"] == "state", (
            f"Expected host-Division to be scoped as 'state', got {data.get('viewer_scope')}"
        )
        rows = data.get("rows") or []
        # Match MPCA-scoped row count
        mpca_count = getattr(pytest, "mpca_row_count", None)
        if mpca_count is not None:
            assert len(rows) == mpca_count, (
                f"Host-Division rows ({len(rows)}) != MPCA rows ({mpca_count})"
            )
        # IVs should also be exposed (state-scoped payload)
        assert "input_variables" in data

    def test_non_host_division_stays_scoped(self, client):
        """REGRESSION: DIV-BPL on DIV-IND-hosted tournament sees only its own row (or none)."""
        r = client.get(f"{API}/tournaments/{DIV_HOSTED_TID}/finance/matrix",
                       headers={"X-Body-Code": "DIV-BPL", "X-Body-Type": "Division"})
        assert r.status_code == 200
        data = r.json()
        assert data["viewer_scope"] == "body"
        rows = data.get("rows") or []
        # Either 0 (not participating) or 1 (own row only). Never full set.
        assert len(rows) <= 1
        for row in rows:
            assert row["body_code"] == "DIV-BPL"

    def test_non_host_division_on_mpca_hosted_scoped(self, client):
        """REGRESSION: DIV-BPL on MPCA-hosted tournament — still scoped, not organiser."""
        r = client.get(f"{API}/tournaments/{MPCA_HOSTED_TID}/finance/matrix",
                       headers={"X-Body-Code": "DIV-BPL", "X-Body-Type": "Division"})
        assert r.status_code == 200
        data = r.json()
        assert data["viewer_scope"] == "body"
        rows = data.get("rows") or []
        for row in rows:
            assert row["body_code"] == "DIV-BPL"

    def test_district_on_div_hosted_scoped(self, client):
        """REGRESSION: District DIST-INDO-IND on Div-hosted tournament — participant scope only."""
        r = client.get(f"{API}/tournaments/{DIV_HOSTED_TID}/finance/matrix",
                       headers={"X-Body-Code": "DIST-INDO-IND", "X-Body-Type": "District"})
        assert r.status_code == 200
        data = r.json()
        assert data["viewer_scope"] == "body"
        rows = data.get("rows") or []
        for row in rows:
            assert row["body_code"] == "DIST-INDO-IND"

    def test_mpca_full_matrix_on_mpca_hosted(self, client):
        """REGRESSION: MPCA still sees full matrix on MPCA-hosted tournament."""
        r = client.get(f"{API}/tournaments/{MPCA_HOSTED_TID}/finance/matrix",
                       headers={"X-Body-Code": "MPCA", "X-Body-Type": "State"})
        assert r.status_code == 200
        data = r.json()
        assert data["viewer_scope"] == "state"
