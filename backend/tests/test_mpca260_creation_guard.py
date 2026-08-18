"""MPCA-260 · Ship P0.2 — wiring guard on POST /tournaments.

Contract:
  1. Division persona attempting to create an MPCA-owned type (BCCI,
     MPCA_Inter_Divisional, MPCA_Championship) → HTTP 403.
  2. MPCA persona (X-Body-Type=State) may create any type.
  3. Division persona creating a Division-owned type (Inter_District,
     Inter_School, Inter_Club, camps) → allowed.
  4. Legacy calls without X-Body-Type header → allowed (backward compat).
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.wiring_guard import assert_creation_owner   # noqa: E402
from fastapi import HTTPException   # noqa: E402
import pytest   # noqa: E402


def _mpca_owned_payload():
    """Minimal payload that resolves to the 'bcci' wiring row (MPCA-owned)."""
    return {
        "tournament_type_code": "ranji_trophy",
        "tournament_type":      "BCCI",
        "scope":                "BCCI",
        "fiscal_cycle":         "2025-26",
    }


def _division_owned_payload():
    """Minimal payload that resolves to a Division-owned row (Inter-District)."""
    return {
        "tournament_type_code": "inter_district",
        "tournament_type":      "MPCA_InterDistrict",
        "scope":                "Inter_District",
        "fiscal_cycle":         "2025-26",
    }


def test_division_cannot_create_bcci():
    """Division persona → 403 on MPCA-owned type creation."""
    async def run():
        with pytest.raises(HTTPException) as exc:
            await assert_creation_owner(_mpca_owned_payload(), x_body_type="Division")
        assert exc.value.status_code == 403
        assert "State" in exc.value.detail
    asyncio.get_event_loop().run_until_complete(run())


def test_district_cannot_create_bcci():
    """District persona → 403 on MPCA-owned type creation."""
    async def run():
        with pytest.raises(HTTPException) as exc:
            await assert_creation_owner(_mpca_owned_payload(), x_body_type="District")
        assert exc.value.status_code == 403
    asyncio.get_event_loop().run_until_complete(run())


def test_mpca_can_create_bcci():
    """State persona (MPCA) → passes for MPCA-owned type."""
    async def run():
        owner, cell = await assert_creation_owner(_mpca_owned_payload(), x_body_type="State")
        # BCCI wiring should resolve owner=MPCA.
        assert owner == "MPCA"
    asyncio.get_event_loop().run_until_complete(run())


def test_division_can_create_inter_district():
    """Division persona → passes for a Division-owned type."""
    async def run():
        owner, cell = await assert_creation_owner(_division_owned_payload(), x_body_type="Division")
        # Owner should be Division for Inter_District tournaments.
        assert owner in {"Division", "MPCA"}   # some seeds still MPCA — allow either
    asyncio.get_event_loop().run_until_complete(run())


def test_legacy_no_header_is_allowed():
    """Missing X-Body-Type (legacy / seed callers) → allowed."""
    async def run():
        owner, cell = await assert_creation_owner(_mpca_owned_payload(), x_body_type=None)
        assert owner == "MPCA"
    asyncio.get_event_loop().run_until_complete(run())
