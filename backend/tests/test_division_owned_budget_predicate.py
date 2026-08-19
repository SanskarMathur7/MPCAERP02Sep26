"""Feb 2026 · Regression tests for Fixes A + B + C
Division-owned budget suppression predicate

Ensures MPCA-side budget lifecycle chips and endpoints are suppressed for
the 6 Division-owned tournament types (Pre-Camp / Inter-District / Inter-
School / Inter-Club A-Grade / Periodical Coaching / Vacation Camp) and
preserved for the 2 MPCA-owned types (BCCI, Inter-Division).

Uses the same async-in-sync pattern as test_mpca260 to avoid pulling
pytest_asyncio as a dependency.
"""
import os
import sys
import asyncio
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.wiring_guard import is_division_owned_budget   # noqa: E402


def _mock_wiring(type_id: str, owner: str, approver):
    """Build a mocked wiring config that returns the requested cell."""
    return {"cells": {type_id: {"unified_budget": {"owner": owner, "approver": approver}}}}


def test_predicate_true_for_division_owned_types():
    """Returns True for the 6 Division-run wiring type_ids."""
    async def run():
        for type_id in ["camp", "district", "interschool", "interclub",
                        "coachingcamp", "vacationcamp"]:
            with patch("routes.tournament_wiring_status._resolve_type_id",
                       new=AsyncMock(return_value=type_id)), \
                 patch("routes.tournament_wiring._fetch_or_seed_wiring",
                       new=AsyncMock(return_value=_mock_wiring(type_id, "Division", "None"))):
                assert await is_division_owned_budget({"id": "t1"}) is True, \
                    f"expected True for {type_id}"
    asyncio.get_event_loop().run_until_complete(run())


def test_predicate_true_when_approver_is_python_none():
    """Approver None (Python null) also resolves to Division-owned."""
    async def run():
        with patch("routes.tournament_wiring_status._resolve_type_id",
                   new=AsyncMock(return_value="camp")), \
             patch("routes.tournament_wiring._fetch_or_seed_wiring",
                   new=AsyncMock(return_value=_mock_wiring("camp", "Division", None))):
            assert await is_division_owned_budget({"id": "t1"}) is True
    asyncio.get_event_loop().run_until_complete(run())


def test_predicate_false_for_mpca_owned_types():
    """Returns False for BCCI and Inter-Div (approver=MPCA)."""
    async def run():
        for type_id in ["bcci", "interdiv"]:
            with patch("routes.tournament_wiring_status._resolve_type_id",
                       new=AsyncMock(return_value=type_id)), \
                 patch("routes.tournament_wiring._fetch_or_seed_wiring",
                       new=AsyncMock(return_value=_mock_wiring(type_id, "MPCA", "MPCA"))):
                assert await is_division_owned_budget({"id": "t1"}) is False, \
                    f"expected False for {type_id}"
    asyncio.get_event_loop().run_until_complete(run())


def test_predicate_false_when_approver_present_even_if_owner_division():
    """Owner=Division WITH an approver is a proposal-flow — NOT Division-owned."""
    async def run():
        with patch("routes.tournament_wiring_status._resolve_type_id",
                   new=AsyncMock(return_value="hypo")), \
             patch("routes.tournament_wiring._fetch_or_seed_wiring",
                   new=AsyncMock(return_value=_mock_wiring("hypo", "Division", "MPCA"))):
            assert await is_division_owned_budget({"id": "t1"}) is False
    asyncio.get_event_loop().run_until_complete(run())


def test_predicate_safe_default_on_missing_wiring():
    """Missing wiring cell falls back to False (safest for MPCA)."""
    async def run():
        with patch("routes.tournament_wiring_status._resolve_type_id",
                   new=AsyncMock(return_value="unknown")), \
             patch("routes.tournament_wiring._fetch_or_seed_wiring",
                   new=AsyncMock(return_value={"cells": {}})):
            assert await is_division_owned_budget({"id": "t1"}) is False
    asyncio.get_event_loop().run_until_complete(run())


def test_predicate_safe_default_on_none_or_empty_tournament():
    """None / empty tournament returns False (never mis-hide MPCA actions)."""
    async def run():
        assert await is_division_owned_budget(None) is False
        assert await is_division_owned_budget({}) is False
    asyncio.get_event_loop().run_until_complete(run())
