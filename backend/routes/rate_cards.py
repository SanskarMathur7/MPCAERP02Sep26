"""MPCA-215 · Unified Rate Card routes + seeder.

One rate card per (tournament_type, format_group, season). Only MPCA-scope
personas may edit. Feeds the unified per-match budget engine (Sprint 2).

Rate values mirror the MPCA Inter-Division Utility HTML (v20). Seeded once per
tournament_type × format_group. Idempotent.

Endpoints
─────────
    GET    /api/rate-cards                              → list all
    GET    /api/rate-cards/for/{tournament_type}/{format_group}?season=
    PATCH  /api/rate-cards/{id}                         → MPCA-only edit
    POST   /api/rate-cards/reset/{id}                   → reset to seed defaults
    GET    /api/rate-cards/heads                        → returns BUDGET_HEADS_META + TRAVEL_HEADS_META (frontend meta)
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from core.infra import api_router, db
from models import (
    BUDGET_HEADS_META,
    TRAVEL_HEADS_META,
    RateCard,
    RateCardPatch,
    RateHead,
)


# ─────────────── Default rate values (from HTML utility v20) ───────────────
# Two format groups: ltd_overs (Ltd Overs / T20 / One-Day) and multi_day
# (Multi-Day / Four-Day / Pink-Ball). Values here are the ONE-TIME seed —
# once MPCA edits a card in-app, this seed no longer overwrites it.

_DEFAULT_BUDGET_RATES = {
    "ltd_overs": {
        "hotel_team":  {"md": 1800, "nmd": 1800},
        "hotel_off":   {"md": 1800, "nmd": 1800},
        "food_on":     {"md": 500,  "nmd": 0},
        "food_off":    {"md": 300,  "nmd": 0},
        "food_nmd":    {"md": 0,    "nmd": 630},
        "tent":        {"md": 4500, "nmd": 4500},
        "conv_team":   {"md": 1500, "nmd": 1500},
        "conv_off":    {"md": 6000, "nmd": 6000},
        "labour":      {"md": 2500, "nmd": 2500},
        "local_mgr":   {"md": 2600, "nmd": 2600},
        "doctor":      {"md": 2500, "nmd": 0},
        "ambulance":   {"md": 2000, "nmd": 0},
        "coach_mgr":   {"md": 4250, "nmd": 4250},
        "scoreboard":  {"md": 500,  "nmd": 500},
        "water":       {"md": 3500, "nmd": 0},
        "drinks":      {"md": 250,  "nmd": 0},
        "mom":         {"md": 2500, "nmd": 0},
    },
    "multi_day": {
        "hotel_team":  {"md": 1800, "nmd": 1800},
        "hotel_off":   {"md": 1800, "nmd": 1800},
        "food_on":     {"md": 500,  "nmd": 0},
        "food_off":    {"md": 300,  "nmd": 0},
        "food_nmd":    {"md": 0,    "nmd": 630},
        "tent":        {"md": 4500, "nmd": 4500},
        "conv_team":   {"md": 1500, "nmd": 1500},
        "conv_off":    {"md": 6000, "nmd": 6000},
        "labour":      {"md": 2500, "nmd": 2500},
        "local_mgr":   {"md": 2600, "nmd": 2600},
        "doctor":      {"md": 2500, "nmd": 0},
        "ambulance":   {"md": 2000, "nmd": 0},
        "coach_mgr":   {"md": 4250, "nmd": 4250},
        "scoreboard":  {"md": 500,  "nmd": 500},
        "water":       {"md": 3500, "nmd": 0},
        "drinks":      {"md": 250,  "nmd": 0},
        "mom":         {"md": 5000, "nmd": 0},   # multi-day MOM is ₹5,000
    },
}

_DEFAULT_TRAVEL_RATES = {
    "ltd_overs": {
        "travel_rt":         {"md": 2800, "nmd": 0},
        "coach":             {"md": 3000, "nmd": 1500},
        "manager":           {"md": 2000, "nmd": 1000},
        "trainer":           {"md": 2000, "nmd": 1000},
        "local_conveyance":  {"md": 1500, "nmd": 0},
        "medical":           {"md": 2000, "nmd": 0},
        "misc_journey":      {"md": 2500, "nmd": 0},
        "other":             {"md": 1000, "nmd": 0},
    },
    "multi_day": {
        "travel_rt":         {"md": 2800, "nmd": 0},
        "coach":             {"md": 3000, "nmd": 1500},
        "manager":           {"md": 2000, "nmd": 1000},
        "trainer":           {"md": 2000, "nmd": 1000},
        "local_conveyance":  {"md": 1500, "nmd": 0},
        "medical":           {"md": 2000, "nmd": 0},
        "misc_journey":      {"md": 2500, "nmd": 0},
        "other":             {"md": 1000, "nmd": 0},
    },
}

SEED_TOURNAMENT_TYPES: List[str] = [
    "Inter_Divisional",
    "Inter_District",
    "BCCI",
    "Championship",
    "Pre_Tournament_Camp",
]


def _build_default_card(tournament_type: str, format_group: str, season: str) -> RateCard:
    budget = {k: RateHead(**v) for k, v in _DEFAULT_BUDGET_RATES[format_group].items()}
    travel = {k: RateHead(**v) for k, v in _DEFAULT_TRAVEL_RATES[format_group].items()}
    return RateCard(
        tournament_type=tournament_type,
        format_group=format_group,
        season=season,
        budget_rates=budget,
        travel_rates=travel,
    )


async def seed_rate_cards(season: str = "2026-27") -> dict:
    """Idempotent — inserts one rate card per (tournament_type, format_group)
    tuple. Never overwrites edits made in-app."""
    created = 0
    for tt in SEED_TOURNAMENT_TYPES:
        for fg in ("ltd_overs", "multi_day"):
            exists = await db.rate_cards.find_one(
                {"tournament_type": tt, "format_group": fg, "season": season},
                {"_id": 0, "id": 1},
            )
            if exists:
                continue
            card = _build_default_card(tt, fg, season)
            doc = card.model_dump()
            # Nested RateHead → dict
            doc["budget_rates"] = {k: v.model_dump() if hasattr(v, "model_dump") else v for k, v in card.budget_rates.items()}
            doc["travel_rates"] = {k: v.model_dump() if hasattr(v, "model_dump") else v for k, v in card.travel_rates.items()}
            await db.rate_cards.insert_one(doc)
            created += 1
    return {"created": created, "season": season}


# ─────────────── Routes ───────────────

@api_router.get("/rate-cards/heads")
async def rate_card_heads():
    """Return the head metadata (keys, drivers, owners) — single source of
    truth for frontend rate-card editor + budget engine."""
    return {
        "budget_heads": BUDGET_HEADS_META,
        "travel_heads": TRAVEL_HEADS_META,
        "format_groups": ["ltd_overs", "multi_day"],
        "tournament_types": SEED_TOURNAMENT_TYPES,
    }


@api_router.get("/rate-cards", response_model=List[RateCard])
async def list_rate_cards(season: Optional[str] = None):
    q: dict = {}
    if season:
        q["season"] = season
    docs = await db.rate_cards.find(q, {"_id": 0}).sort([
        ("tournament_type", 1), ("format_group", 1),
    ]).to_list(200)
    return docs


@api_router.get("/rate-cards/for/{tournament_type}/{format_group}", response_model=RateCard)
async def get_rate_card(tournament_type: str, format_group: str, season: str = "2026-27"):
    doc = await db.rate_cards.find_one(
        {"tournament_type": tournament_type, "format_group": format_group, "season": season},
        {"_id": 0},
    )
    if not doc:
        # Auto-create from defaults so callers always get a working card.
        if format_group not in _DEFAULT_BUDGET_RATES:
            raise HTTPException(400, f"Unknown format_group '{format_group}'")
        card = _build_default_card(tournament_type, format_group, season)
        payload = card.model_dump()
        payload["budget_rates"] = {k: v.model_dump() if hasattr(v, "model_dump") else v for k, v in card.budget_rates.items()}
        payload["travel_rates"] = {k: v.model_dump() if hasattr(v, "model_dump") else v for k, v in card.travel_rates.items()}
        await db.rate_cards.insert_one(payload)
        return payload
    return doc


@api_router.patch("/rate-cards/{card_id}", response_model=RateCard)
async def patch_rate_card(card_id: str, patch: RateCardPatch):
    existing = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Rate card not found")
    payload: dict = {}
    if patch.budget_rates is not None:
        payload["budget_rates"] = {k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in patch.budget_rates.items()}
    if patch.travel_rates is not None:
        payload["travel_rates"] = {k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in patch.travel_rates.items()}
    if not payload:
        return existing
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.rate_cards.update_one({"id": card_id}, {"$set": payload})
    return await db.rate_cards.find_one({"id": card_id}, {"_id": 0})


@api_router.post("/rate-cards/reset/{card_id}", response_model=RateCard)
async def reset_rate_card(card_id: str):
    existing = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Rate card not found")
    fg = existing["format_group"]
    if fg not in _DEFAULT_BUDGET_RATES:
        raise HTTPException(400, f"No default seed for format_group '{fg}'")
    payload = {
        "budget_rates": _DEFAULT_BUDGET_RATES[fg],
        "travel_rates": _DEFAULT_TRAVEL_RATES[fg],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rate_cards.update_one({"id": card_id}, {"$set": payload})
    return await db.rate_cards.find_one({"id": card_id}, {"_id": 0})


# ─────────────── MPCA-223 · Custom line items ───────────────

from models import RateCardCustomHead   # noqa: E402
import re   # noqa: E402


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")
    return s or "custom"


@api_router.post("/rate-cards/{card_id}/custom-heads", response_model=RateCard)
async def add_custom_head(card_id: str, head: RateCardCustomHead):
    """Append a new custom line item to a rate card. Auto-generates a unique
    `custom_<slug>` key so it never collides with the default 17 heads."""
    card = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not card:
        raise HTTPException(404, "Rate card not found")
    base = "custom_" + _slugify(head.name)
    existing_keys = {h.get("key") for h in (card.get("custom_heads") or [])}
    key = base
    i = 2
    while key in existing_keys:
        key = f"{base}_{i}"
        i += 1
    row = {
        "key": key,
        "name": head.name,
        "driver": head.driver or None,
        "rooms": bool(head.rooms),
        "basis": head.basis if head.basis in ("MatchDays", "Match") else "MatchDays",
        "owner": head.owner if head.owner in ("Host", "Visitor", "Officials", "Common") else "Host",
        "md_rate": float(head.md_rate or 0),
        "nmd_rate": float(head.nmd_rate or 0),
        "is_custom": True,
    }
    updated_heads = list(card.get("custom_heads") or []) + [row]
    updated_budget_rates = dict(card.get("budget_rates") or {})
    updated_budget_rates[key] = {"md": row["md_rate"], "nmd": row["nmd_rate"]}
    await db.rate_cards.update_one(
        {"id": card_id},
        {"$set": {
            "custom_heads": updated_heads,
            "budget_rates": updated_budget_rates,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.rate_cards.find_one({"id": card_id}, {"_id": 0})


@api_router.delete("/rate-cards/{card_id}/custom-heads/{key}", response_model=RateCard)
async def delete_custom_head(card_id: str, key: str):
    card = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not card:
        raise HTTPException(404, "Rate card not found")
    updated_heads = [h for h in (card.get("custom_heads") or []) if h.get("key") != key]
    updated_budget_rates = {k: v for k, v in (card.get("budget_rates") or {}).items() if k != key}
    await db.rate_cards.update_one(
        {"id": card_id},
        {"$set": {
            "custom_heads": updated_heads,
            "budget_rates": updated_budget_rates,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.rate_cards.find_one({"id": card_id}, {"_id": 0})


# ─────────────── MPCA-224 · Editable head metadata (name / driver / owner) ───────────────

_ALLOWED_DRIVERS = {"", "AwayTeamPax", "HostTeamPax", "MatchOfficialsPax", "AllPax", "TeamCount", "HostTeamCount"}
_ALLOWED_OWNERS = {"Host", "Visitor", "Officials", "Common"}
_ALLOWED_BASIS = {"MatchDays", "Match"}
_ALLOWED_META = {"name", "driver", "owner", "rooms", "basis"}


@api_router.patch("/rate-cards/{card_id}/heads/{key}", response_model=RateCard)
async def patch_head_meta(card_id: str, key: str, patch: Dict[str, Any]):
    """MPCA-224 · Edit the metadata of a rate-card head (default OR custom).

    Accepts any subset of `name`, `driver`, `owner`, `rooms`, `basis`. For
    default 17 heads, changes go into `head_meta_overrides[key]`. For custom
    heads, changes update the entry in `custom_heads` in-place.
    """
    card = await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
    if not card:
        raise HTTPException(404, "Rate card not found")
    # Sanitise + validate
    clean: Dict[str, Any] = {}
    for k, v in (patch or {}).items():
        if k not in _ALLOWED_META:
            continue
        if k == "driver":
            if v is None:
                clean[k] = None
            elif v in _ALLOWED_DRIVERS:
                clean[k] = v or None
        elif k == "owner":
            if v in _ALLOWED_OWNERS:
                clean[k] = v
        elif k == "basis":
            if v in _ALLOWED_BASIS:
                clean[k] = v
        elif k == "rooms":
            clean[k] = bool(v)
        elif k == "name":
            s = str(v or "").strip()
            if s:
                clean[k] = s
    if not clean:
        return card

    default_keys = {h["key"] for h in __import__("models", fromlist=["BUDGET_HEADS_META"]).BUDGET_HEADS_META}
    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if key in default_keys:
        # Default head → override
        overrides = dict(card.get("head_meta_overrides") or {})
        overrides[key] = {**(overrides.get(key) or {}), **clean}
        updates["head_meta_overrides"] = overrides
    else:
        # Custom head → update in-place
        heads = list(card.get("custom_heads") or [])
        found = False
        for i, h in enumerate(heads):
            if h.get("key") == key:
                heads[i] = {**h, **clean}
                found = True
                break
        if not found:
            raise HTTPException(404, f"Head '{key}' not found on this rate card")
        updates["custom_heads"] = heads
    await db.rate_cards.update_one({"id": card_id}, {"$set": updates})
    return await db.rate_cards.find_one({"id": card_id}, {"_id": 0})
