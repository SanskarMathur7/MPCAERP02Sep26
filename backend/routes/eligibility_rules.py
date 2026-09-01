"""Routes · Iter 125 · Eligibility Rules Admin (SysAdmin).

Config-driven thresholds for the sequential MPCA player-eligibility decision
tree. Editable season-over-season by SysAdmin so we don't have to redeploy
whenever MPCA tweaks the residency or education windows.

Collection: `eligibility_rules_config`
Schema:
  {
    id, season ("2026-27"),
    residency_min_months, education_min_months_local,
    education_min_months_guest, guest_prior_years_min,
    age_of_majority_for_parent, medical_required_by_default,
    updated_at, updated_by,
  }
Read via routes.players._load_eligibility_rules at compute-time.
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import api_router, db

_CANONICAL_TAGS: list[dict] = [
    {
        "code": "Local/Birth", "order": 1,
        "description": "Player born within the target Division's jurisdiction.",
        "primary_check": "place_of_birth_division == target_division",
    },
    {
        "code": "Local/Residence", "order": 2,
        "description": "Bonafide resident of the target Division for ≥ residency_min_months.",
        "primary_check": "residency_since ≥ residency_min_months",
    },
    {
        "code": "Local/Employment", "order": 3,
        "description": "Bonafide employment (self or parent if ≤ age_of_majority_for_parent) plus residency threshold.",
        "primary_check": "is_employed && residency_since ≥ residency_min_months",
    },
    {
        "code": "Local/Education", "order": 4,
        "description": "Bonafide educational course (not distance-learning) ≥ education_min_months_local.",
        "primary_check": "education != distance && residency_since ≥ education_min_months_local",
    },
    {
        "code": "Guest/MP-Domicile", "order": 5,
        "description": "Born in MP but registering with a Division other than birth Division.",
        "primary_check": "place_of_birth_state == 'MP' && birth_division != target_division",
    },
    {
        "code": "Guest/Education", "order": 6,
        "description": "Born and resident out of MP, but studying in MP for ≥ education_min_months_guest.",
        "primary_check": "!is_mp_born && education != distance && residency_since ≥ education_min_months_guest",
    },
    {
        "code": "Guest/Out-of-MP", "order": 7,
        "description": "Non-MP born; must have ≥ guest_prior_years_min prior domestic play (BCCI-registered).",
        "primary_check": "!is_mp_born && prior_years ≥ guest_prior_years_min",
    },
    {
        "code": "Ineligible", "order": 8,
        "description": "Fallback — none of the above tags qualified with the current on-file data.",
        "primary_check": "no tag matched — needs Division intervention",
    },
]


class EligibilityRulesConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    season: str = "2026-27"
    residency_min_months: int = 3
    education_min_months_local: int = 3
    education_min_months_guest: int = 12
    guest_prior_years_min: int = 2
    age_of_majority_for_parent: int = 21
    medical_required_by_default: bool = True
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_by: str | None = None


class EligibilityRulesPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    residency_min_months: int | None = Field(None, ge=0, le=120)
    education_min_months_local: int | None = Field(None, ge=0, le=120)
    education_min_months_guest: int | None = Field(None, ge=0, le=120)
    guest_prior_years_min: int | None = Field(None, ge=0, le=20)
    age_of_majority_for_parent: int | None = Field(None, ge=10, le=30)
    medical_required_by_default: bool | None = None
    updated_by: str | None = None


@api_router.get("/eligibility-rules/tags")
async def list_canonical_tags():
    """Read-only catalog of the 8 canonical eligibility tags with their
    primary check pseudocode — for the SysAdmin admin console."""
    return _CANONICAL_TAGS


@api_router.get("/eligibility-rules", response_model=list[EligibilityRulesConfig])
async def list_rules_configs():
    docs = await db.eligibility_rules_config.find({}, {"_id": 0}).sort("season", -1).to_list(50)
    return docs


@api_router.get("/eligibility-rules/{season}", response_model=EligibilityRulesConfig)
async def get_rules_for_season(season: str):
    doc = await db.eligibility_rules_config.find_one({"season": season}, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"No rules config for season {season}")
    return doc


@api_router.patch("/eligibility-rules/{season}", response_model=EligibilityRulesConfig)
async def update_rules_for_season(season: str, patch: EligibilityRulesPatch):
    """Upsert the season's rules config. Creates one with defaults if missing."""
    existing = await db.eligibility_rules_config.find_one({"season": season}, {"_id": 0})
    if not existing:
        existing = EligibilityRulesConfig(season=season).model_dump()
    updates = patch.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "No fields to update.")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged = {**existing, **updates, "season": season}
    if "id" not in merged:
        merged["id"] = str(uuid.uuid4())
    await db.eligibility_rules_config.update_one(
        {"season": season}, {"$set": merged}, upsert=True,
    )
    return merged


class DuplicateSeasonPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source_season: str
    target_season: str
    actor_name: str | None = None


@api_router.post("/eligibility-rules/duplicate", response_model=EligibilityRulesConfig)
async def duplicate_rules_for_season(payload: DuplicateSeasonPayload):
    """Clone a season's config into a new season — the classic 'carry forward
    to next season' workflow. Fails if the target already exists."""
    src = await db.eligibility_rules_config.find_one({"season": payload.source_season}, {"_id": 0})
    if not src:
        raise HTTPException(404, f"Source season {payload.source_season} not found")
    existing = await db.eligibility_rules_config.find_one({"season": payload.target_season}, {"_id": 0})
    if existing:
        raise HTTPException(409, f"Season {payload.target_season} already has a config; edit it instead.")
    clone = {**src, "id": str(uuid.uuid4()), "season": payload.target_season,
             "updated_at": datetime.now(timezone.utc).isoformat(),
             "updated_by": payload.actor_name}
    await db.eligibility_rules_config.insert_one(clone)
    return clone
