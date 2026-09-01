"""Routes · Sprint M13-B — Camps & Coaching module.

Camps are coaching / vacation / pre-tournament camps organised by MPCA schemes
3-A, 3-B, 3-C, 3-D. This module mirrors the Tournament Reimbursement Matrix:
Division creates a camp → picks scheme → auto-budget is created → invoices are
uploaded against camp budget → reimbursement claim is submitted at completion.

The finance pipeline (TournamentBudget + TournamentInvoice + ReimbursementClaim)
is reused by threading `tournament_id = camp_id` (both are UUIDs — the models
don't foreign-key check).
"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from core.infra import api_router, db
from core.scoping import body_scope, get_scope

CampType = Literal["Periodical_Coaching", "Vacation_Camp", "Reciprocal_Match", "Pre_Tournament_Camp"]
CampStatus = Literal["Draft", "Scheduled", "Running", "Completed", "Cancelled"]

CAMP_TYPE_TO_SCHEME = {
    "Periodical_Coaching": "3-A",
    "Vacation_Camp": "3-B",
    "Reciprocal_Match": "3-C",
    "Pre_Tournament_Camp": "3-D",
}


class CampBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    camp_type: CampType
    body_id: str                                  # organising Division / District
    scheme_code: str | None = None             # 3-A / 3-B / 3-C / 3-D
    start_date: str
    end_date: str
    venue_hint: str | None = None
    coach_name: str | None = None
    trainer_name: str | None = None
    manager_name: str | None = None
    target_age_group: str | None = None        # "U-18", "U-23" etc.
    planned_participants: int = 0
    notes: str | None = None
    fiscal_cycle: str = "2025-26"
    # MPCA-204 · Pre-Tournament Camps must be linked to an Inter-Division tournament.
    inter_division_tournament_id: str | None = None
    inter_division_tournament_name: str | None = None


class ReciprocalVisitor(BaseModel):
    """MPCA-204 · A Division that visits ANOTHER division's Pre-Tournament Camp.
    The visiting body still receives its own standard grant on its own camp,
    while the HOST camp gets the extra reciprocal budget top-up.
    """
    model_config = ConfigDict(extra="ignore")
    body_id: str                                  # visiting body code
    body_name: str
    invited_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    invited_by: str | None = None              # actor persona name
    confirmed_at: str | None = None


class Camp(CampBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    camp_no: str
    status: CampStatus = "Draft"
    actual_participants: int | None = None
    auto_budget_id: str | None = None
    reciprocal_visitors: list[ReciprocalVisitor] = Field(default_factory=list)
    created_by: str | None = None
    auto_created_from_tournament: bool = False    # true if the auto-hook birthed it
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # MPCA-254 · Ship B — Populated after the camp is promoted into
    # db.tournaments. If set, UI redirects the user to /tournaments/{id}.
    migrated_to_tournament_id: str | None = None
    migrated_at: str | None = None


class CampCreate(CampBase):
    created_by: str | None = None


async def _next_camp_no(cycle: str) -> str:
    count = await db.camps.count_documents({"fiscal_cycle": cycle})
    return f"CMP-{cycle}-{count + 1:03d}"


@api_router.get("/camps", response_model=list[Camp])
async def list_camps(
    request: Request,
    body_id: str | None = None,
    camp_type: CampType | None = None,
    status: CampStatus | None = None,
    fiscal_cycle: str | None = None,
):
    q: dict = {}
    if body_id:
        q["body_id"] = body_id
    else:
        q.update(body_scope(get_scope(request)))
    if camp_type: q["camp_type"] = camp_type
    if status: q["status"] = status
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.camps.find(q, {"_id": 0}).sort("start_date", -1).to_list(500)
    return docs


@api_router.get("/camps/{cid}", response_model=Camp)
async def get_camp(cid: str):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    return doc


@api_router.post("/camps", response_model=Camp)
async def create_camp(payload: CampCreate):
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body '{payload.body_id}' not found")
    # MPCA-253 · Pre-Tournament Camps do NOT use scheme 3-D auto-budget.
    # Per user directive, camps follow the Master Rate Card (same as tournaments,
    # keyed by tournament_type × format × head). Leave scheme_code null for
    # Pre_Tournament_Camp so the scheme-driven auto-budget path is skipped —
    # the ratecard-driven flow takes over when budgets are provisioned.
    if payload.camp_type == "Pre_Tournament_Camp":
        scheme_code = payload.scheme_code   # keep whatever caller explicitly sent (usually None)
    else:
        scheme_code = payload.scheme_code or CAMP_TYPE_TO_SCHEME.get(payload.camp_type)

    # MPCA-204 · Pre-Tournament Camps are mandatorily linked to an
    # Inter-Divisional tournament. Idempotent on (idt_id, body_id).
    idt_id = payload.inter_division_tournament_id
    idt_name = payload.inter_division_tournament_name
    if payload.camp_type == "Pre_Tournament_Camp":
        if not idt_id:
            raise HTTPException(
                422,
                "Pre-Tournament Camps must be linked to an Inter-Division Tournament. "
                "Please select one from the dropdown.",
            )
        t = await db.tournaments.find_one({"id": idt_id}, {"_id": 0, "name": 1, "tournament_scope": 1, "scope": 1})
        if not t:
            raise HTTPException(404, f"Inter-Division tournament '{idt_id}' not found")
        # MPCA-251 · Accept either `tournament_scope` or `scope` (seed data uses `scope`).
        if t.get("tournament_scope") != "Inter_Divisional" and t.get("scope") != "Inter_Divisional":
            raise HTTPException(
                422,
                f"Only Inter-Division tournaments may host Pre-Tournament Camps "
                f"(got scope: {t.get('tournament_scope') or t.get('scope')}).",
            )
        idt_name = idt_name or t.get("name")
        existing = await db.camps.find_one({
            "camp_type": "Pre_Tournament_Camp",
            "inter_division_tournament_id": idt_id,
            "body_id": payload.body_id,
        }, {"_id": 0})
        if existing:
            # Idempotent: return the pre-existing camp instead of raising.
            return existing

    camp_no = await _next_camp_no(payload.fiscal_cycle)
    camp = Camp(camp_no=camp_no, **{
        **payload.model_dump(),
        "scheme_code": scheme_code,
        "inter_division_tournament_id": idt_id,
        "inter_division_tournament_name": idt_name,
    })
    await db.camps.insert_one(camp.model_dump())
    # MPCA-254 · Ship B — Auto-promote the new camp to a first-class
    # tournament immediately so the caller lands on the wired workspace.
    try:
        new_tid = await _promote_one_camp_to_tournament(camp.model_dump())
        if new_tid:
            camp.migrated_to_tournament_id = new_tid
            camp.migrated_at = datetime.now(timezone.utc).isoformat()
    except Exception as e:   # never let promotion failure block camp creation
        import logging
        logging.getLogger("mpca").warning("Auto-promotion of camp %s failed: %s", camp.id, e)
    return camp


@api_router.patch("/camps/{cid}", response_model=Camp)
async def patch_camp(cid: str, patch: dict):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    allowed = {"name", "camp_type", "scheme_code", "start_date", "end_date", "venue_hint",
               "coach_name", "trainer_name", "manager_name", "target_age_group",
               "planned_participants", "actual_participants", "notes", "status", "auto_budget_id"}
    updates = {k: v for k, v in (patch or {}).items() if k in allowed}
    if updates:
        await db.camps.update_one({"id": cid}, {"$set": updates})
    return await db.camps.find_one({"id": cid}, {"_id": 0})


@api_router.post("/camps/{cid}/complete", response_model=Camp)
async def complete_camp(cid: str, actual_participants: int | None = None):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    updates: dict = {"status": "Completed"}
    if actual_participants is not None:
        updates["actual_participants"] = int(actual_participants)
    await db.camps.update_one({"id": cid}, {"$set": updates})
    return await db.camps.find_one({"id": cid}, {"_id": 0})


@api_router.delete("/camps/{cid}")
async def delete_camp(cid: str):
    doc = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Camp not found")
    if doc.get("status") not in (None, "Draft"):
        raise HTTPException(409, "Only Draft camps may be deleted")
    await db.camps.delete_one({"id": cid})
    return {"ok": True}


@api_router.get("/camps-stats/summary")
async def camps_stats(request: Request, body_id: str | None = None, fiscal_cycle: str | None = None):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    else: q.update(body_scope(get_scope(request)))
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.camps.find(q, {"_id": 0}).to_list(1000)
    return {
        "total": len(docs),
        "by_status": {s: len([d for d in docs if d["status"] == s]) for s in ["Draft", "Scheduled", "Running", "Completed", "Cancelled"]},
        "by_type": {t: len([d for d in docs if d["camp_type"] == t]) for t in ["Periodical_Coaching", "Vacation_Camp", "Reciprocal_Match", "Pre_Tournament_Camp"]},
        "total_planned_participants": sum(d.get("planned_participants") or 0 for d in docs),
    }


# ── MPCA-204 · Inter-Division ↔ Pre-Tournament Camp linkage ────────────────
async def auto_create_pre_camps_for_tournament(tournament: dict) -> dict:
    """Auto-create one Draft Pre-Tournament Camp for each participating body of
    an Inter-Divisional tournament that has just been Approved. Idempotent on
    `(inter_division_tournament_id, body_id)` — never duplicates. Called from
    `approve_tournament_plan()`.

    Returns `{"created": [camp_ids], "skipped": [body_codes_already_linked]}`.
    """
    if tournament.get("tournament_scope") != "Inter_Divisional":
        return {"created": [], "skipped": [], "reason": "not inter-divisional"}
    tid = tournament["id"]
    t_name = tournament.get("name") or tid

    # Participating bodies = every non-removed participation record for this tournament
    participations = await db.tournament_participations.find(
        {"tournament_id": tid, "removed_at": {"$in": [None, ""]}},
        {"_id": 0, "body_code": 1, "body_name": 1, "role": 1},
    ).to_list(200)

    cycle = tournament.get("fiscal_cycle") or "2025-26"
    scheme_code = CAMP_TYPE_TO_SCHEME["Pre_Tournament_Camp"]
    created: list = []
    skipped: list = []
    for p in participations:
        body_code = p.get("body_code")
        if not body_code:
            continue
        already = await db.camps.find_one({
            "camp_type": "Pre_Tournament_Camp",
            "inter_division_tournament_id": tid,
            "body_id": body_code,
        }, {"_id": 0, "id": 1})
        if already:
            skipped.append(body_code)
            continue
        camp_no = await _next_camp_no(cycle)
        # Default window: 14→3 days before the tournament kick-off (best-effort)
        start_date = tournament.get("start_date") or ""
        end_date = tournament.get("start_date") or ""
        camp = Camp(
            name=f"Pre-Tournament Camp · {p.get('body_name') or body_code} · {t_name}",
            camp_type="Pre_Tournament_Camp",
            body_id=body_code,
            scheme_code=scheme_code,
            start_date=start_date,
            end_date=end_date,
            fiscal_cycle=cycle,
            inter_division_tournament_id=tid,
            inter_division_tournament_name=t_name,
            camp_no=camp_no,
            auto_created_from_tournament=True,
        )
        await db.camps.insert_one(camp.model_dump())
        created.append(camp.id)
    return {"created": created, "skipped": skipped}


@api_router.get("/tournaments/{tid}/pre-tournament-camps", response_model=list[Camp])
async def list_pre_tournament_camps(tid: str):
    """List all Pre-Tournament Camps auto-linked to this Inter-Divisional tournament."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0, "tournament_scope": 1, "scope": 1})
    if not t:
        raise HTTPException(404, "Tournament not found")
    # MPCA-251 · Some seeded tournaments use `scope` instead of `tournament_scope`.
    # Accept either — the underlying value is the same enum.
    if t.get("tournament_scope") != "Inter_Divisional" and t.get("scope") != "Inter_Divisional":
        return []
    docs = await db.camps.find({
        "camp_type": "Pre_Tournament_Camp",
        "inter_division_tournament_id": tid,
    }, {"_id": 0}).sort("body_id", 1).to_list(200)
    return docs


class ReciprocalVisitorPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str
    invited_by: str | None = None


@api_router.post("/camps/{cid}/reciprocal-visitors", response_model=Camp)
async def add_reciprocal_visitor(cid: str, payload: ReciprocalVisitorPayload):
    """Register a visiting Division on a HOST division's Pre-Tournament Camp.
    Both the visiting body's own camp and this host camp remain in place — the
    host camp will get extra reciprocal budget top-ups (accommodation + food
    of the visiting team + umpire/scorer fees).

    Rule reminders:
      - Host camp cannot self-invite (`body_id != camp.body_id`).
      - Visitor must belong to the same Inter-Divisional tournament.
      - Cannot double-add the same visitor twice.
    """
    camp = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not camp:
        raise HTTPException(404, "Camp not found")
    if camp.get("camp_type") != "Pre_Tournament_Camp":
        raise HTTPException(422, "Reciprocal visitors are only supported for Pre-Tournament Camps.")
    if payload.body_id == camp["body_id"]:
        raise HTTPException(422, "A camp cannot list itself as a reciprocal visitor.")

    idt_id = camp.get("inter_division_tournament_id")
    if not idt_id:
        raise HTTPException(422, "Camp is not linked to an Inter-Division tournament.")
    # Visitor must be a participating body of the same tournament
    v_participation = await db.tournament_participations.find_one({
        "tournament_id": idt_id,
        "body_code": payload.body_id,
        "removed_at": {"$in": [None, ""]},
    }, {"_id": 0})
    if not v_participation:
        raise HTTPException(
            422,
            f"Body '{payload.body_id}' is not a participant of the Inter-Division tournament linked to this camp.",
        )

    visitors = list(camp.get("reciprocal_visitors") or [])
    if any(v.get("body_id") == payload.body_id for v in visitors):
        raise HTTPException(409, f"Body '{payload.body_id}' is already a reciprocal visitor on this camp.")

    body_doc = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0, "name": 1})
    visitors.append(ReciprocalVisitor(
        body_id=payload.body_id,
        body_name=(body_doc or {}).get("name") or payload.body_id,
        invited_by=payload.invited_by,
    ).model_dump())
    await db.camps.update_one({"id": cid}, {"$set": {"reciprocal_visitors": visitors}})
    return await db.camps.find_one({"id": cid}, {"_id": 0})


@api_router.delete("/camps/{cid}/reciprocal-visitors/{body_id}", response_model=Camp)
async def remove_reciprocal_visitor(cid: str, body_id: str):
    camp = await db.camps.find_one({"id": cid}, {"_id": 0})
    if not camp:
        raise HTTPException(404, "Camp not found")
    visitors = [v for v in (camp.get("reciprocal_visitors") or []) if v.get("body_id") != body_id]
    await db.camps.update_one({"id": cid}, {"$set": {"reciprocal_visitors": visitors}})
    return await db.camps.find_one({"id": cid}, {"_id": 0})


# ═════════════════════════════════════════════════════════════════════
# MPCA-254 · Ship B — Promote legacy camps to first-class tournaments.
# ═════════════════════════════════════════════════════════════════════
# Camps historically lived in a separate `db.camps` collection with a
# parallel finance pipeline. New camps created via the Tournament type
# picker already write to `db.tournaments` with the correct
# `tournament_type_code`. This endpoint back-fills the legacy population
# so every camp is visible on the main Tournaments list and inherits the
# 10-step wiring flow.
#
# Idempotent: skips any camp already carrying `migrated_to_tournament_id`.
# Safe to re-run on every boot.

CAMP_TYPE_TO_TOURNAMENT_CODE = {
    "Periodical_Coaching":  "periodical_coaching_camp",
    "Vacation_Camp":        "vacation_camp",
    "Pre_Tournament_Camp":  "pre_tournament_camp",
    # Reciprocal_Match is intentionally NOT promoted — user decision (removed from wiring).
}

CAMP_TYPE_TO_FAMILY = {
    "Periodical_Coaching":  "MPCA_InterDivisional",
    "Vacation_Camp":        "MPCA_InterDivisional",
    "Pre_Tournament_Camp":  "MPCA_InterDivisional",
}


async def _promote_one_camp_to_tournament(camp: dict) -> str | None:
    """Create a `db.tournaments` row that mirrors this camp. Returns the new
    tournament id, or None if the camp isn't promotable (e.g. Reciprocal_Match).
    """
    code = CAMP_TYPE_TO_TOURNAMENT_CODE.get(camp.get("camp_type"))
    if not code:
        return None
    if camp.get("migrated_to_tournament_id"):
        return camp["migrated_to_tournament_id"]

    # Reserve a tournament number.
    from routes.tournaments import _next_tournament_no  # local import avoids cycle
    tno = await _next_tournament_no(camp.get("fiscal_cycle") or "2025-26")

    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id":                     tid,
        "tournament_no":          tno,
        "name":                   camp.get("name") or f"Camp {camp.get('camp_no')}",
        "short_name":             None,
        "tournament_type":        CAMP_TYPE_TO_FAMILY.get(camp["camp_type"]) or "MPCA_InterDivisional",
        "tournament_type_code":   code,
        "format":                 "Multi_Day",
        "scope":                  "Inter_Divisional",
        "fiscal_cycle":           camp.get("fiscal_cycle") or "2025-26",
        "host_body_id":           camp.get("body_id"),
        "scheme_code":            camp.get("scheme_code"),
        "start_date":             camp.get("start_date"),
        "end_date":               camp.get("end_date"),
        "venue":                  camp.get("venue_hint"),
        "venue_id":               None,
        "ground_id":              None,
        "max_squad_size":         18,
        "is_womens":              False,
        "allows_guests":          False,
        "notes":                  camp.get("notes"),
        "status":                 {
            "Draft":     "Draft",
            "Scheduled": "Approved",
            "Running":   "In_Progress",
            "Completed": "Completed",
            "Cancelled": "Cancelled",
        }.get(camp.get("status") or "Draft", "Draft"),
        "acceptance":             {"status": "Not_Required", "required_from": [], "entries": []},
        "created_at":             camp.get("created_at") or now,
        "created_by":             camp.get("created_by"),
        "migrated_from_camp_id":  camp["id"],           # provenance
        "parent_tournament_id":   camp.get("inter_division_tournament_id"),
        "is_pre_tournament_camp": camp.get("camp_type") == "Pre_Tournament_Camp",
    }
    await db.tournaments.insert_one(doc)
    await db.camps.update_one(
        {"id": camp["id"]},
        {"$set": {"migrated_to_tournament_id": tid, "migrated_at": now}},
    )
    return tid


@api_router.post("/camps/migrate-to-tournaments")
async def migrate_camps_to_tournaments():
    """Idempotent bulk migration. Promotes every un-migrated camp (except
    Reciprocal_Match) into `db.tournaments` and stamps the camp record with
    a `migrated_to_tournament_id` pointer. Returns a summary.

    Safe to call multiple times — already-migrated camps are skipped.
    """
    q = {"migrated_to_tournament_id": {"$exists": False}}
    camps_to_migrate = await db.camps.find(q, {"_id": 0}).to_list(2000)
    promoted = 0
    skipped_reciprocal = 0
    failed: list[dict] = []
    for camp in camps_to_migrate:
        try:
            new_tid = await _promote_one_camp_to_tournament(camp)
            if new_tid is None:
                skipped_reciprocal += 1
            else:
                promoted += 1
        except Exception as e:   # noqa: BLE001
            failed.append({"camp_id": camp.get("id"), "camp_no": camp.get("camp_no"), "error": str(e)})
    return {
        "promoted":            promoted,
        "skipped_reciprocal":  skipped_reciprocal,
        "already_migrated":    (await db.camps.count_documents({"migrated_to_tournament_id": {"$exists": True}})),
        "failed":              failed,
    }

