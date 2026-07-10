"""Routes · Phase D — Player Season Registration + Selection Funnel (MoM 6)

Workflow:
  1. Annual SeasonRegistration per player (per season_year, per body).
  2. SelectionFunnel created per (tournament × format) → starts at LongList.
  3. Selectors add players to current stage (capped at STAGE_LIMITS).
  4. Advance: subset of current-stage players move to next stage.
  5. Squad finalised at 12 → "Submitted to BCCI App" (placeholder).
  6. For international tournaments: Division proposes squad → MPCA validates → BCCI submit.
"""
from datetime import datetime, timezone, date
from typing import List, Optional
from fastapi import HTTPException

from core.infra import db, api_router
from core.helpers import _create_notification
from models import (
    SeasonRegistration, SeasonRegistrationCreate, SeasonRegStatus,
    SelectionFunnel, SelectionFunnelCreate, SelectionEntry,
    SelectionAddPlayers, SelectionAdvance, SelectionRemovePlayer, SelectionBCCISubmit,
    STAGE_LIMITS, STAGE_NEXT,
)


def _player_snapshot(player: dict) -> dict:
    """Pull the fields we snapshot onto SelectionEntry / SeasonRegistration."""
    name = player.get("full_name") or player.get("name") or "—"
    dob = player.get("date_of_birth")
    age = None
    if dob:
        try:
            d = datetime.fromisoformat(dob).date() if "T" in dob else date.fromisoformat(dob)
            today = date.today()
            age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
        except Exception:
            age = None
    return {"name": name, "age": age, "role": player.get("role")}


# ─────────── Season Registration ───────────

async def _next_seasonreg_no(season: str, body_id: str) -> str:
    count = await db.season_registrations.count_documents({"season_year": season, "body_id": body_id})
    return f"SR-{season}-{body_id}-{count + 1:05d}"


@api_router.get("/season-registrations", response_model=List[SeasonRegistration])
async def list_season_registrations(
    player_id: Optional[str] = None,
    season_year: Optional[str] = None,
    body_id: Optional[str] = None,
    status: Optional[SeasonRegStatus] = None,
):
    q: dict = {}
    if player_id:
        q["player_id"] = player_id
    if season_year:
        q["season_year"] = season_year
    if body_id:
        q["body_id"] = body_id
    if status:
        q["status"] = status
    return await db.season_registrations.find(q, {"_id": 0}).sort("registered_at", -1).to_list(2000)


@api_router.post("/season-registrations", response_model=SeasonRegistration)
async def create_season_registration(payload: SeasonRegistrationCreate):
    player = await db.players.find_one({"id": payload.player_id}, {"_id": 0})
    if not player:
        raise HTTPException(404, f"Player {payload.player_id} not found")
    # one reg per (player × season) — MoM "Annual Registration"
    existing = await db.season_registrations.find_one({
        "player_id": payload.player_id,
        "season_year": payload.season_year,
    })
    if existing:
        raise HTTPException(409, f"Player already registered for season {payload.season_year} (status={existing['status']}).")
    reg_no = await _next_seasonreg_no(payload.season_year, payload.body_id)
    reg = SeasonRegistration(
        registration_no=reg_no,
        player_name=_player_snapshot(player)["name"],
        **payload.model_dump(),
    )
    await db.season_registrations.insert_one(reg.model_dump())
    return reg


@api_router.post("/season-registrations/{rid}/approve", response_model=SeasonRegistration)
async def approve_season_reg(rid: str):
    doc = await db.season_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc["status"] != "Pending":
        raise HTTPException(409, f"Cannot approve a registration in status '{doc['status']}'.")
    await db.season_registrations.update_one({"id": rid}, {"$set": {"status": "Approved"}})
    return await db.season_registrations.find_one({"id": rid}, {"_id": 0})


@api_router.post("/season-registrations/{rid}/reject", response_model=SeasonRegistration)
async def reject_season_reg(rid: str, body: dict):
    reason = (body or {}).get("notes") or ""
    doc = await db.season_registrations.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Registration not found")
    if doc["status"] != "Pending":
        raise HTTPException(409, f"Cannot reject a registration in status '{doc['status']}'.")
    await db.season_registrations.update_one({"id": rid}, {"$set": {"status": "Rejected", "notes": reason}})
    return await db.season_registrations.find_one({"id": rid}, {"_id": 0})


# ─────────── Selection Funnel ───────────

async def _next_funnel_no(season: str) -> str:
    count = await db.selection_funnels.count_documents({"season_year": season})
    return f"SF-{season}-{count + 1:03d}"


@api_router.get("/selection-funnels", response_model=List[SelectionFunnel])
async def list_selection_funnels(
    tournament_id: Optional[str] = None,
    season_year: Optional[str] = None,
    is_international: Optional[bool] = None,
    current_stage: Optional[str] = None,
):
    q: dict = {}
    if tournament_id:
        q["tournament_id"] = tournament_id
    if season_year:
        q["season_year"] = season_year
    if is_international is not None:
        q["is_international"] = is_international
    if current_stage:
        q["current_stage"] = current_stage
    return await db.selection_funnels.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.get("/selection-funnels/{fid}", response_model=SelectionFunnel)
async def get_funnel(fid: str):
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    return doc


@api_router.post("/selection-funnels", response_model=SelectionFunnel)
async def create_funnel(payload: SelectionFunnelCreate):
    tournament = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not tournament:
        raise HTTPException(404, "Tournament not found")
    # one funnel per (tournament × format × season)
    existing = await db.selection_funnels.find_one({
        "tournament_id": payload.tournament_id,
        "format": payload.format,
        "season_year": payload.season_year,
    })
    if existing:
        raise HTTPException(409, f"A selection funnel for this tournament+format+season already exists ({existing['funnel_no']}).")
    funnel_no = await _next_funnel_no(payload.season_year)
    f = SelectionFunnel(
        funnel_no=funnel_no,
        tournament_name=tournament.get("name"),
        **payload.model_dump(),
    )
    await db.selection_funnels.insert_one(f.model_dump())
    return f


@api_router.post("/selection-funnels/{fid}/add-players", response_model=SelectionFunnel)
async def add_players(fid: str, payload: SelectionAddPlayers):
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    if doc["current_stage"] == "Submitted":
        raise HTTPException(409, "Funnel is closed — squad already submitted to BCCI.")
    stage = doc["current_stage"]
    cap = STAGE_LIMITS.get(stage, 9999)
    current_entries = doc.get("entries") or []
    at_stage = [e for e in current_entries if e["stage"] == stage]
    if len(at_stage) + len(payload.player_ids) > cap:
        raise HTTPException(
            422,
            f"Stage '{stage}' capped at {cap} — adding {len(payload.player_ids)} would exceed cap "
            f"(currently {len(at_stage)}).",
        )
    existing_pids = {e["player_id"] for e in current_entries if e["stage"] == stage}
    new_entries = list(current_entries)
    for pid in payload.player_ids:
        if pid in existing_pids:
            continue
        player = await db.players.find_one({"id": pid}, {"_id": 0})
        if not player:
            continue
        snap = _player_snapshot(player)
        entry = SelectionEntry(
            player_id=pid,
            player_name=snap["name"],
            age=snap["age"],
            role=snap["role"],
            stage=stage,
            notes=payload.notes,
            added_by=payload.added_by,
        )
        new_entries.append(entry.model_dump())
    await db.selection_funnels.update_one(
        {"id": fid},
        {"$set": {"entries": new_entries, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.selection_funnels.find_one({"id": fid}, {"_id": 0})


@api_router.post("/selection-funnels/{fid}/remove-player", response_model=SelectionFunnel)
async def remove_player(fid: str, payload: SelectionRemovePlayer):
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    if doc["current_stage"] == "Submitted":
        raise HTTPException(409, "Funnel is closed — cannot remove players.")
    new_entries = [e for e in (doc.get("entries") or []) if not (e["player_id"] == payload.player_id and e["stage"] == doc["current_stage"])]
    await db.selection_funnels.update_one(
        {"id": fid},
        {"$set": {"entries": new_entries, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.selection_funnels.find_one({"id": fid}, {"_id": 0})


@api_router.post("/selection-funnels/{fid}/advance", response_model=SelectionFunnel)
async def advance_stage(fid: str, payload: SelectionAdvance):
    """Move a subset of current-stage players to the next stage."""
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    cur = doc["current_stage"]
    if cur == "Submitted":
        raise HTTPException(409, "Funnel already submitted to BCCI.")
    if cur == "Squad":
        raise HTTPException(409, "Squad is the terminal stage before BCCI submission — use /submit-to-bcci instead.")
    nxt = STAGE_NEXT.get(cur)
    if not nxt:
        raise HTTPException(409, f"No advancement defined for stage '{cur}'.")
    nxt_cap = STAGE_LIMITS.get(nxt, 9999)
    if len(payload.player_ids) > nxt_cap:
        raise HTTPException(
            422,
            f"Cannot advance {len(payload.player_ids)} players to '{nxt}' — capped at {nxt_cap}.",
        )
    current_entries = doc.get("entries") or []
    at_current_stage = {e["player_id"]: e for e in current_entries if e["stage"] == cur}
    missing = [pid for pid in payload.player_ids if pid not in at_current_stage]
    if missing:
        raise HTTPException(422, f"{len(missing)} player(s) not at current stage '{cur}': {missing[:3]}…")
    # Append new entries at the next stage
    new_entries = list(current_entries)
    for pid in payload.player_ids:
        base = at_current_stage[pid]
        new_entries.append(SelectionEntry(
            player_id=pid,
            player_name=base.get("player_name"),
            age=base.get("age"),
            role=base.get("role"),
            stage=nxt,
            notes=payload.notes,
            added_by=payload.actor_name,
        ).model_dump())
    update = {
        "entries": new_entries,
        "current_stage": nxt,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.selection_funnels.update_one({"id": fid}, {"$set": update})
    await _create_notification(
        recipient_role_id="treasurer", recipient_body_id="MPCA",
        title=f"Selection funnel advanced to {nxt}",
        message=f"{doc['funnel_no']} · {doc.get('tournament_name')} · {len(payload.player_ids)} players moved by {payload.actor_name}",
        link="/selection",
        related_type="selection_funnel",
        related_id=fid,
    )
    return await db.selection_funnels.find_one({"id": fid}, {"_id": 0})


@api_router.post("/selection-funnels/{fid}/division-recommend", response_model=SelectionFunnel)
async def division_recommend(fid: str, payload: dict):
    """MoM: Division proposes squad for an international tournament → MPCA must validate next."""
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    if not doc.get("is_international"):
        raise HTTPException(409, "Division→MPCA validation only applies to international funnels.")
    if doc["current_stage"] != "Squad":
        raise HTTPException(409, f"Division can only recommend at Squad stage — currently at '{doc['current_stage']}'.")
    actor_name = (payload or {}).get("actor_name") or "Division Sec"
    await db.selection_funnels.update_one(
        {"id": fid},
        {"$set": {
            "division_recommended_at": datetime.now(timezone.utc).isoformat(),
            "division_recommended_by": actor_name,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await _create_notification(
        recipient_role_id="president", recipient_body_id="MPCA",
        title="International squad recommended by Division — awaiting MPCA validation",
        message=f"{doc['funnel_no']} · {doc.get('tournament_name')} · recommended by {actor_name}",
        link="/selection",
        related_type="selection_funnel",
        related_id=fid,
    )
    return await db.selection_funnels.find_one({"id": fid}, {"_id": 0})


@api_router.post("/selection-funnels/{fid}/mpca-validate", response_model=SelectionFunnel)
async def mpca_validate(fid: str, payload: dict):
    """MPCA validates the division-recommended international squad before BCCI submission."""
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    if not doc.get("is_international"):
        raise HTTPException(409, "MPCA validation only applies to international funnels.")
    if not doc.get("division_recommended_at"):
        raise HTTPException(409, "Division must recommend the squad before MPCA can validate.")
    actor_name = (payload or {}).get("actor_name") or "President / MPCA"
    await db.selection_funnels.update_one(
        {"id": fid},
        {"$set": {
            "mpca_validated_at": datetime.now(timezone.utc).isoformat(),
            "mpca_validated_by": actor_name,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.selection_funnels.find_one({"id": fid}, {"_id": 0})


@api_router.post("/selection-funnels/{fid}/submit-to-bcci", response_model=SelectionFunnel)
async def submit_to_bcci(fid: str, payload: SelectionBCCISubmit):
    """Submit the final Squad (12 players) to BCCI App (placeholder).

    Until the BCCI App API ships, we just stamp the funnel with a submission
    reference (manual or auto-generated) and lock the funnel.
    """
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    if doc["current_stage"] != "Squad":
        raise HTTPException(409, f"Must be at Squad stage to submit — currently at '{doc['current_stage']}'.")
    if doc.get("is_international") and not doc.get("mpca_validated_at"):
        raise HTTPException(409, "International squads require MPCA validation before BCCI submission.")
    squad_count = sum(1 for e in (doc.get("entries") or []) if e["stage"] == "Squad")
    if squad_count != STAGE_LIMITS["Squad"]:
        raise HTTPException(422, f"Squad must have exactly {STAGE_LIMITS['Squad']} players — currently {squad_count}.")
    bcci_ref = payload.bcci_submission_ref or f"BCCI-PENDING-{doc['funnel_no']}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    await db.selection_funnels.update_one(
        {"id": fid},
        {"$set": {
            "current_stage": "Submitted",
            "bcci_submission_ref": bcci_ref,
            "bcci_submitted_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return await db.selection_funnels.find_one({"id": fid}, {"_id": 0})


@api_router.delete("/selection-funnels/{fid}")
async def delete_funnel(fid: str):
    doc = await db.selection_funnels.find_one({"id": fid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Selection funnel not found")
    if doc["current_stage"] == "Submitted":
        raise HTTPException(409, "Cannot delete a funnel that has been submitted to BCCI.")
    await db.selection_funnels.delete_one({"id": fid})
    return {"ok": True}


@api_router.get("/selection-funnels-stats/summary")
async def funnel_stats(season_year: Optional[str] = None):
    q: dict = {}
    if season_year:
        q["season_year"] = season_year
    docs = await db.selection_funnels.find(q, {"_id": 0}).to_list(500)
    by_stage: dict = {}
    intl = 0
    submitted = 0
    for d in docs:
        s = d.get("current_stage", "LongList")
        by_stage[s] = by_stage.get(s, 0) + 1
        if d.get("is_international"):
            intl += 1
        if s == "Submitted":
            submitted += 1
    return {
        "total_funnels": len(docs),
        "international": intl,
        "submitted_to_bcci": submitted,
        "by_stage": by_stage,
        "stage_limits": STAGE_LIMITS,
    }
