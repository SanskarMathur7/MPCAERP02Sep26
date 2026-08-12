"""Routes · Tournaments + Squads"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException, Header, Request
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from core.shared_services import next_seq  # H6 · atomic sequence
from core.scoping import get_scope
from models import Tournament, TournamentCreate, TournamentStatus, Squad, SquadCreate, SquadAddPlayer, SquadMember, Body, Player, TournamentFormat, TournamentScope, TournamentAcceptance, TournamentAcceptanceEntry
from core.helpers import _next_tournament_no, _check_player_against_tournament, _age_years


# M11 · Persona role IDs that may accept a tournament on behalf of their body
# M39d · Strict acceptance — MPCA (president / secretary) may no longer act on
# behalf of Division / District. Only division-secretary or district-secretary
# personas belonging to the target body may accept or reject.
# M39i · match "division-secretary" and any suffixed variants (e.g.
# division-secretary-gwl) to support multiple sample logins per division.
_ACCEPTANCE_ROLE_PREFIXES = ("division-secretary", "district-secretary")


# ---------------- Routes: Tournaments (Phase IV.2 — M2) ----------------


async def _next_tournament_no(cycle: str) -> str:
    seq = await next_seq(f"tournament:{cycle}", lambda: db.tournaments.count_documents({"fiscal_cycle": cycle}))
    return f"TRN-{cycle}-{seq:03d}"


async def _visible_tids_via_participations(scope) -> List[str]:
    """M39l · Bug 2 · Return every tournament id where the persona's body (or
    any of its downstream districts) is listed in `tournament_participations`.
    Fixes BCCI-hosted tournaments not showing up for visiting Divisions."""
    if scope.is_state or not scope.body_code:
        return []
    body_or: list = [{"body_code": scope.body_code}]
    if scope.is_division and scope.division_suffix:
        body_or.append({"body_code": {"$regex": f"^DIST-.+-{scope.division_suffix}$"}})
    tids: set[str] = set()
    async for p in db.tournament_participations.find(
        {"$or": body_or}, {"_id": 0, "tournament_id": 1},
    ):
        if p.get("tournament_id"):
            tids.add(p["tournament_id"])
    return list(tids)


def _tournament_scope_query(scope) -> dict:
    """M13: Divisions/Districts see ONLY:
    - Their own body's tournaments (hosted by their body_code)
    - Tournaments hosted by their child bodies (Division → children Districts)
    - Tournaments where their body is on the acceptance-required list
    They do NOT see MPCA-hosted tournaments unless required to accept them."""
    if scope.is_state or not scope.body_code:
        return {}
    if scope.is_division:
        suffix = scope.division_suffix
        return {"$or": [
            {"host_body_id": scope.body_code},
            {"host_body_id": {"$regex": f"^DIST-.+-{suffix}$"}},
            {"acceptance.required_from": scope.body_code},
            {"acceptance.required_from": {"$regex": f"^DIST-.+-{suffix}$"}},
        ]}
    if scope.is_district:
        # MPCA-121 · Include tournaments hosted by parent Division and by
        # sibling Districts under the same Division (so Division-orchestrated
        # inter-district tournaments show up). Participation-based filtering
        # for actual allocation is layered on via `_visible_tids_via_participations`.
        parts = (scope.body_code or "").split("-")
        div_suffix = parts[-1] if len(parts) >= 3 else ""
        or_list = [
            {"host_body_id": scope.body_code},
            {"acceptance.required_from": scope.body_code},
        ]
        if div_suffix:
            or_list.append({"host_body_id": f"DIV-{div_suffix}"})
            or_list.append({"host_body_id": {"$regex": f"^DIST-.+-{div_suffix}$"}})
        return {"$or": or_list}
    if scope.is_official:
        # Match officials see all — they may be assigned to any tournament
        return {}
    return {}


async def _official_visible_tids(scope) -> List[str]:
    """M37 · A match-official only sees tournaments in which they are
    listed on a squad's `match_officials.{umpire_1|umpire_2|scorer|referee}`
    slot OR have a DA form for. Returns the de-duplicated list of tournament
    ids visible to `scope.name`."""
    if not scope.name:
        return []
    tids: set[str] = set()
    slot_or = [
        {"match_officials.umpire_1": scope.name},
        {"match_officials.umpire_2": scope.name},
        {"match_officials.scorer": scope.name},
        {"match_officials.referee": scope.name},
    ]
    async for s in db.squads.find(
        {"$or": slot_or}, {"_id": 0, "tournament_id": 1},
    ):
        if s.get("tournament_id"):
            tids.add(s["tournament_id"])
    async for d in db.match_official_da.find(
        {"official_name": scope.name}, {"_id": 0, "tournament_id": 1},
    ):
        if d.get("tournament_id"):
            tids.add(d["tournament_id"])
    return list(tids)


@api_router.get("/tournaments", response_model=List[Tournament])
async def list_tournaments(
    request: Request,
    status: Optional[TournamentStatus] = None,
    scope: Optional[TournamentScope] = None,
    fiscal_cycle: Optional[str] = None,
    format: Optional[TournamentFormat] = None,
    skip: int = 0,
    limit: int = 200,
):
    query: dict = {}
    if status:
        query["status"] = status
    if scope:
        query["scope"] = scope
    if fiscal_cycle:
        query["fiscal_cycle"] = fiscal_cycle
    if format:
        query["format"] = format
    req_scope = get_scope(request)
    # M37 · Match officials only see tournaments they're allocated to
    if req_scope.is_official:
        allowed = await _official_visible_tids(req_scope)
        if not allowed:
            return []
        query["id"] = {"$in": allowed}
    else:
        scope_q = _tournament_scope_query(req_scope)
        # M39l · Bug 2 · Also include tournaments where the caller's body is
        # a participant (host or visitor) in `tournament_participations`.
        extra_tids = await _visible_tids_via_participations(req_scope)
        if extra_tids:
            # Widen the scope_q to allow either the existing match OR any
            # participation match.
            if scope_q.get("$or"):
                scope_q = {"$or": scope_q["$or"] + [{"id": {"$in": extra_tids}}]}
            elif scope_q:
                scope_q = {"$or": [scope_q, {"id": {"$in": extra_tids}}]}
            else:
                scope_q = {"id": {"$in": extra_tids}}
        if scope_q:
            if "$or" in query:
                query["$and"] = [{"$or": query.pop("$or")}, scope_q]
            else:
                query.update(scope_q)
    docs = await db.tournaments.find(query, {"_id": 0}).sort("start_date", 1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    return docs


@api_router.get("/tournaments/pending-acceptance", response_model=List[Tournament])
async def list_pending_acceptance(x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code")):
    """List tournaments where the caller's body is on the required-acceptance list AND has NOT yet acted.
    Registered BEFORE the generic /tournaments/{tid} route to avoid tid='pending-acceptance' collision."""
    if not x_body_code:
        raise HTTPException(400, "X-User-Body-Code header is required.")
    docs = await db.tournaments.find({
        "acceptance.status": "Pending",
        "acceptance.required_from": x_body_code,
    }, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    for d in docs:
        acted = any(e.get("body_code") == x_body_code for e in (d.get("acceptance") or {}).get("entries") or [])
        if not acted:
            out.append(d)
    return out


@api_router.get("/tournaments/{tid}", response_model=Tournament)
async def get_tournament(tid: str, request: Request):
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    # M37 · Match officials cannot open tournaments they're not allocated to
    req_scope = get_scope(request)
    if req_scope.is_official and req_scope.name:
        allowed = await _official_visible_tids(req_scope)
        if tid not in allowed:
            raise HTTPException(403, "You are not allocated to this tournament.")
    # M39l · Bug 2 · Divisions/Districts may open the tournament if they are on
    # the participants list, even when they are neither the host nor on the
    # acceptance-required list yet.
    # M39z.e · Districts strictly see only tournaments HOSTED by their parent
    # Division (Inter-District / Clubs / etc.) — they don't participate in
    # MPCA-owned Inter-Division tournaments even when their parent Division does.
    if (req_scope.is_division or req_scope.is_district) and req_scope.body_code:
        req_from = (doc.get("acceptance") or {}).get("required_from") or []
        host_ok = doc.get("host_body_id") == req_scope.body_code
        accept_ok = req_scope.body_code in req_from
        # Downstream districts also allowed for a division
        if not host_ok and req_scope.is_division and req_scope.division_suffix:
            import re as _re
            pat = _re.compile(f"^DIST-.+-{req_scope.division_suffix}$")
            if pat.match(doc.get("host_body_id") or "") or any(pat.match(x or "") for x in req_from):
                host_ok = True
        # M39z.e / MPCA-121 · Districts strictly see only tournaments hosted
        # by their parent Division OR by a sibling District under the same
        # Division. Combined with the participation check below this ensures
        # a District only sees tournaments in which they've been allocated
        # (either explicitly on `acceptance.required_from` or via a
        # `tournament_participations` row).
        if req_scope.is_district:
            me = await db.bodies.find_one({"code": req_scope.body_code}, {"_id": 0})
            parent = (me or {}).get("parent_code")
            host = doc.get("host_body_id") or ""
            if parent and host == parent:
                host_ok = True
            elif parent and host.startswith("DIST-"):
                # Sibling-District-hosted tournament — allow if hosted by a
                # District under the same parent Division (participation
                # check will confirm actual allocation below).
                host_body = await db.bodies.find_one({"code": host}, {"_id": 0})
                if host_body and host_body.get("parent_code") == parent:
                    host_ok = True
        if not (host_ok or accept_ok):
            part_tids = await _visible_tids_via_participations(req_scope)
            if tid not in part_tids:
                raise HTTPException(403, "You cannot view this tournament — your body is not a host or participant.")
    return doc


@api_router.patch("/tournaments/{tid}", response_model=Tournament)
async def patch_tournament(tid: str, patch: dict):
    """Partial update — Sprint T-RIM: primarily used to attach scheme_code."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    allowed = {"scheme_code", "host_scheme_code", "visiting_scheme_code",
               "default_scheme_inputs", "notes", "trophy_name", "status",
               "start_date", "end_date", "venue_id", "ground_id",
               "venue_name_snapshot", "ground_name_snapshot",
               "input_variables", "setup_meta", "calendar_fixed",
               "closure_letter_url", "closure_letter_generated_at",
               # MPCA-102 / MPCA-105 / MPCA-108
               "max_squad_size", "medical_required", "is_womens",
               "age_cap_years", "age_floor_years"}
    updates = {k: v for k, v in (patch or {}).items() if k in allowed}
    if updates:
        await db.tournaments.update_one({"id": tid}, {"$set": updates})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


# M39w · Tournament type + scope → default reimbursement scheme.
# When MPCA users create a new tournament, we pre-fill scheme_code so the
# finance console picks up the right catalogue immediately.
# ⚡ Feb-2026 · Aligned with /app/frontend/src/lib/tournamentCatalog.js after
# the scheme-mapping-correction sprint. Any non-UI caller that omits
# scheme_code still gets the right default now.
def _auto_scheme_for(tournament_type, scope, type_code):
    tc = (type_code or "").lower()
    sc = (scope or "")
    tt = (tournament_type or "")
    if tt == "BCCI" or tc.startswith("bcci") or tc == "away_participation":
        return "9-BCCI"
    if sc == "Inter_District" or tc == "inter_district":
        return "2-B"
    if tc == "inter_div_travel":
        return "2-C"
    if sc == "Inter_Divisional" or tc == "inter_div":
        return "2-D"
    if tc == "inter_school":
        return "2-A"
    if tc == "inter_club":
        return "2-E"
    if tc == "reciprocal":
        return "3-C"
    if tc == "coaching_camp":
        return "3-A"
    if tc == "vacation_camp":
        return "3-B"
    if tc == "pre_camp":
        return "3-D"
    return None


@api_router.post("/tournaments", response_model=Tournament)
async def create_tournament(payload: TournamentCreate):
    # M39c · Block new tournaments until MPCA has activated the schemes for
    # the requested fiscal cycle by uploading the signed master PDF.
    from routes.events import is_season_activated
    if not await is_season_activated(payload.fiscal_cycle):
        raise HTTPException(
            403,
            f"Schemes for {payload.fiscal_cycle} are not yet activated. MPCA must "
            "export the MPCA Schemes PDF, get it signed by the office bearers, "
            "and upload it under Schemes Register before any tournament can be created.",
        )
    host = await db.bodies.find_one({"code": payload.host_body_id}, {"_id": 0})
    if not host:
        raise HTTPException(400, f"Host body {payload.host_body_id} does not exist")
    if payload.age_floor_years and payload.age_cap_years and payload.age_floor_years > payload.age_cap_years:
        raise HTTPException(400, "age_floor_years cannot exceed age_cap_years")

    # M8 · Snapshot venue + ground names for quick display; validate linkage.
    data = payload.model_dump()

    # M39w · Auto-map scheme_code from tournament type + scope when caller
    # didn't set one — fixes the "Inter-Divisional tournament picked
    # Inter-District scheme" bug.
    if not data.get("scheme_code"):
        data["scheme_code"] = _auto_scheme_for(
            data.get("tournament_type"), data.get("scope"), data.get("tournament_type_code"),
        )
    if payload.venue_id:
        v = await db.venues.find_one({"id": payload.venue_id}, {"_id": 0})
        if not v:
            raise HTTPException(400, f"Venue {payload.venue_id} does not exist")
        data["venue_name_snapshot"] = v.get("name")
        if not data.get("venue"):
            data["venue"] = v.get("name")  # backfill legacy free-text
    if payload.ground_id:
        g = await db.grounds.find_one({"id": payload.ground_id}, {"_id": 0})
        if not g:
            raise HTTPException(400, f"Ground {payload.ground_id} does not exist")
        # Ground must belong to the given venue (if venue supplied)
        if payload.venue_id and g.get("venue_id") != payload.venue_id:
            raise HTTPException(400, f"Ground {payload.ground_id} does not belong to Venue {payload.venue_id}")
        data["ground_name_snapshot"] = g.get("name")

    # M11 · Auto-seed the host-body acceptance workflow when MPCA allots a tournament
    # to a Division or a District. Division-hosted → division must accept.
    # District-hosted → BOTH district AND its parent division must accept.
    acceptance = TournamentAcceptance()
    if host["body_type"] == "Division":
        acceptance.required_from = [host["code"]]
        acceptance.status = "Pending"
    elif host["body_type"] == "District":
        req = [host["code"]]
        parent_code = host.get("parent_code")
        if parent_code:
            req.append(parent_code)
        acceptance.required_from = req
        acceptance.status = "Pending"
    # else: State-hosted (MPCA) → no acceptance flow needed (Not_Required)
    data["acceptance"] = acceptance.model_dump()

    t = Tournament(
        tournament_no=await _next_tournament_no(payload.fiscal_cycle),
        status="Draft" if acceptance.status == "Pending" else "Draft",
        **data,
    )
    await db.tournaments.insert_one(t.model_dump())
    # MPCA-133+ · Ping MPCA secretary that this new tournament needs match
    # officials posted centrally. Non-fatal on any error.
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "recipient_type": "role",
            "recipient_id": "secretary",
            "title": f"New tournament — post match officials · {t.name}",
            "message": f"Tournament {t.tournament_no} created (host {t.host_body_id}). Please assign umpires, scorers, referees and physios via the Match Officials tab on the Tournament Workspace.",
            "link": f"/tournaments/{t.id}?tab=officials",
            "related_type": "tournament",
            "related_id": t.id,
            "severity": "info",
            "kind": "reminder",
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:  # noqa: BLE001
        pass
    # M39m · Activity log
    from core.shared_services import log_activity
    await log_activity(
        module="tournament", action="Created",
        record_id=t.id, tournament_id=t.id,
        actor_body_id=data.get("created_by_body_code"),
        details={"tournament_no": t.tournament_no, "name": t.name,
                 "host_body_id": t.host_body_id, "fiscal_cycle": t.fiscal_cycle},
    )
    return t


# ---------------- Routes: Tournament Acceptance (M11) ----------------


class TournamentAcceptancePayload(BaseModel):
    action: Literal["accept", "reject"]
    note: Optional[str] = None


@api_router.post("/tournaments/{tid}/acceptance", response_model=Tournament)
async def act_on_tournament_acceptance(
    tid: str,
    payload: TournamentAcceptancePayload,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_persona_body: Optional[str] = Header(None, alias="X-Body-Code"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
):
    """A Division or District secretary accepts (or rejects) a tournament that
    MPCA has allotted to their body. When ALL required bodies have accepted →
    acceptance.status becomes 'Accepted' and the tournament moves from 'Draft'
    → 'Upcoming'. If any required body rejects → status becomes 'Rejected'.

    M39d · Strict: only the Division/District Secretary of the invited body may
    act. MPCA no longer acts on behalf of Divisions/Districts."""
    if not x_role_id or not any(x_role_id.startswith(p) for p in _ACCEPTANCE_ROLE_PREFIXES):
        raise HTTPException(
            403,
            "Only the Division or District Secretary of the invited body may "
            "accept or reject this tournament. MPCA officers can no longer act "
            "on behalf of Divisions or Districts.",
        )
    if not x_body_code:
        raise HTTPException(400, "X-User-Body-Code header is required — indicates which body you are acting on behalf of.")

    # M39d · Persona-body must match target-body. Prevents anyone from
    # spoofing X-User-Body-Code to a different body than their own persona.
    if x_persona_body and x_persona_body != x_body_code:
        raise HTTPException(
            403,
            f"Your persona ({x_persona_body}) cannot act on behalf of {x_body_code}. "
            "Each body must accept or reject its own invitations.",
        )

    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")

    acc = doc.get("acceptance") or {"required_from": [], "entries": [], "status": "Not_Required"}
    required = acc.get("required_from") or []
    if x_body_code not in required:
        raise HTTPException(403, f"Body '{x_body_code}' is not on the required-acceptance list for this tournament ({required}).")

    # Guard: same body cannot double-act if an accept already stands (idempotent-ish).
    already_accepted = any(
        e.get("body_code") == x_body_code and e.get("action") == "accept"
        for e in acc.get("entries") or []
    )
    if already_accepted and payload.action == "accept":
        raise HTTPException(400, f"Body '{x_body_code}' has already accepted this tournament.")

    entry = TournamentAcceptanceEntry(
        body_code=x_body_code,
        action=payload.action,
        by_role_id=x_role_id,
        by_name=x_user_name,
        note=payload.note,
    )
    entries = acc.get("entries") or []
    entries.append(entry.model_dump())
    acc["entries"] = entries

    # Recompute rolled-up status
    if payload.action == "reject":
        acc["status"] = "Rejected"
        new_status = "Draft"  # keep as Draft; MPCA can re-allot
    else:
        # Consider it fully accepted only if every required body has an accept entry AND none rejected.
        accepted_bodies = {e["body_code"] for e in acc["entries"] if e["action"] == "accept"}
        rejected_bodies = {e["body_code"] for e in acc["entries"] if e["action"] == "reject"}
        if rejected_bodies:
            acc["status"] = "Rejected"
            new_status = "Draft"
        elif set(required).issubset(accepted_bodies):
            acc["status"] = "Accepted"
            new_status = "Upcoming"
        else:
            acc["status"] = "Pending"
            new_status = doc.get("status", "Draft")

    await db.tournaments.update_one({"id": tid}, {"$set": {"acceptance": acc, "status": new_status}})
    # M39m · Activity log — Division/District accept/reject
    from core.shared_services import log_activity
    await log_activity(
        module="tournament",
        action="Accepted" if payload.action == "accept" else "Rejected",
        record_id=tid, tournament_id=tid,
        actor_name=x_user_name, actor_body_id=x_body_code, actor_role=x_role_id,
        details={"note": payload.note, "acceptance_status": acc["status"], "new_status": new_status},
    )
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})





@api_router.post("/tournaments/{tid}/submit-for-approval", response_model=Tournament)
async def submit_tournament(tid: str, actor_name: str, actor_body_id: str, actor_post: str = "Secretary", notes: Optional[str] = None):
    """Draft → Awaiting_Approval."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(400, f"Cannot submit for approval from status {doc['status']}")
    from models import ApprovalStep
    step = ApprovalStep(stage="Awaiting_Approval", actor_post=actor_post, actor_name=actor_name, actor_body_id=actor_body_id, decision="Submitted", notes=notes)
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": "Awaiting_Approval"}, "$push": {"approval_chain": step.model_dump()}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/approve", response_model=Tournament)
async def approve_tournament(tid: str, actor_name: str, actor_body_id: str = "MPCA", actor_post: str = "Hon. Secretary", notes: Optional[str] = None):
    """Awaiting_Approval → Upcoming (approved & live). Must be submitted first."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    if doc["status"] != "Awaiting_Approval":
        raise HTTPException(400, f"Approve requires status=Awaiting_Approval, got {doc['status']}. Submit for approval first.")
    from models import ApprovalStep
    step = ApprovalStep(stage="Approved", actor_post=actor_post, actor_name=actor_name, actor_body_id=actor_body_id, decision="Sanctioned", notes=notes)
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": "Upcoming"}, "$push": {"approval_chain": step.model_dump()}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/reject", response_model=Tournament)
async def reject_tournament(tid: str, actor_name: str, actor_body_id: str = "MPCA", actor_post: str = "Hon. Secretary", notes: Optional[str] = None):
    """Reject a tournament proposal."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    if doc["status"] not in ("Awaiting_Approval", "Draft"):
        raise HTTPException(400, f"Cannot reject from status {doc['status']}")
    from models import ApprovalStep
    step = ApprovalStep(stage="Rejected", actor_post=actor_post, actor_name=actor_name, actor_body_id=actor_body_id, decision="Rejected", notes=notes)
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": "Rejected"}, "$push": {"approval_chain": step.model_dump()}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/status/{new_status}", response_model=Tournament)
async def set_tournament_status(tid: str, new_status: TournamentStatus):
    """Manually transition a tournament between Upcoming → Squad_Selection → In_Progress → Completed (or Cancelled)."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    allowed = {
        "Draft": ["Awaiting_Approval", "Cancelled"],
        "Awaiting_Approval": ["Upcoming", "Rejected", "Cancelled"],
        "Rejected": ["Draft", "Cancelled"],
        "Upcoming": ["Squad_Selection", "Cancelled"],
        "Squad_Selection": ["In_Progress", "Upcoming", "Cancelled"],
        "In_Progress": ["Completed", "Cancelled"],
        "Completed": [],
        "Cancelled": [],
    }
    if new_status not in allowed.get(doc["status"], []):
        raise HTTPException(400, f"Cannot move tournament from {doc['status']} to {new_status}")
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": new_status}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


# ---------------- Routes: Squads ----------------


@api_router.get("/tournaments/{tid}/squads", response_model=List[Squad])
async def list_squads(tid: str):
    docs = await db.squads.find({"tournament_id": tid}, {"_id": 0}).sort("team_name", 1).to_list(100)
    return docs


@api_router.post("/squads", response_model=Squad)
async def create_squad(payload: SquadCreate):
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    # Disallow duplicate squad per tournament × body
    existing = await db.squads.find_one({"tournament_id": payload.tournament_id, "body_id": payload.body_id})
    if existing:
        raise HTTPException(400, f"A squad for {payload.body_id} already exists in this tournament")
    payload_dump = payload.model_dump()
    # M28 · auto-link to tournament participant row if one exists
    from routes.tournament_participations import resolve_participant_body_code
    payload_dump["participant_body_code"] = await resolve_participant_body_code(
        payload.tournament_id, payload.body_id
    )
    squad = Squad(**payload_dump)
    await db.squads.insert_one(squad.model_dump())
    return squad



@api_router.post("/squads/{squad_id}/players", response_model=Squad)
async def add_player_to_squad(squad_id: str, payload: SquadAddPlayer):
    squad = await db.squads.find_one({"id": squad_id}, {"_id": 0})
    if not squad:
        raise HTTPException(404, "Squad not found")
    t = await db.tournaments.find_one({"id": squad["tournament_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if t["status"] not in ("Draft", "Upcoming", "Squad_Selection"):
        raise HTTPException(400, f"Cannot modify squad once tournament is {t['status']}")
    # MPCA-131 · Once MPCA has APPROVED the squad, no further add/remove is
    # allowed — the roster is locked. Rejected + Draft + Awaiting-review can
    # still be edited. Any change post-approval must go via a new revision.
    if squad.get("submission_status") == "Approved":
        raise HTTPException(
            409,
            "This squad has been APPROVED by MPCA and is locked. To make "
            "changes, MPCA must first re-open the squad for revision.",
        )
    player = await db.players.find_one({"id": payload.player_id}, {"_id": 0})
    if not player:
        raise HTTPException(404, "Player not found")

    # Player must belong to the same body as the squad (or a descendant district under a Division squad)
    if squad["body_id"].startswith("DIV-"):
        # Division squad: any district under it is fine
        div_short = squad["body_id"][-3:]
        if not (player["body_id"] == squad["body_id"] or player["body_id"].endswith(div_short)):
            raise HTTPException(400, f"Player {player['player_id']} (body {player['body_id']}) does not belong to {squad['body_id']} or its districts.")
    elif squad["body_id"].startswith("DIST-"):
        if player["body_id"] != squad["body_id"]:
            raise HTTPException(400, f"Player {player['player_id']} (body {player['body_id']}) does not belong to {squad['body_id']}.")

    # Already in squad?
    if any(m["player_id"] == player["id"] for m in squad.get("members", [])):
        raise HTTPException(400, "Player is already in this squad")
    # M39k · Capacity is now ADVISORY at Division-submit stage. MPCA trims
    # the roster to the playing XI/squad during their approval pass. The cap
    # is retained on the squad object as `max_squad_size` for MPCA guidance
    # only; Division can add as many players as they wish.
    # Eligibility against tournament rules (with M1-C guest quotas)
    ok, warns = _check_player_against_tournament(player, t, squad.get("members", []))
    if not ok:
        raise HTTPException(400, " · ".join(warns))

    # Captain uniqueness
    if payload.is_captain:
        for m in squad.get("members", []):
            m["is_captain"] = False

    new_member = SquadMember(
        player_id=player["id"],
        player_no=player["player_id"],
        full_name=player["full_name"],
        role=player["role"],
        guest_subtype=player.get("guest_subtype"),
        is_captain=payload.is_captain,
        is_keeper=payload.is_keeper or player["role"] == "Wicket_Keeper",
    )
    members = (squad.get("members") or []) + [new_member.model_dump()]
    warnings = list(squad.get("eligibility_warnings", []) or [])
    if warns:
        warnings.append(f"{player['player_id']} · " + " · ".join(warns))
    await db.squads.update_one(
        {"id": squad_id},
        {"$set": {"members": members, "eligibility_warnings": warnings}},
    )
    return await db.squads.find_one({"id": squad_id}, {"_id": 0})


@api_router.delete("/squads/{squad_id}/players/{player_id}", response_model=Squad)
async def remove_player_from_squad(squad_id: str, player_id: str):
    squad = await db.squads.find_one({"id": squad_id}, {"_id": 0})
    if not squad:
        raise HTTPException(404, "Squad not found")
    t = await db.tournaments.find_one({"id": squad["tournament_id"]}, {"_id": 0})
    if t and t["status"] not in ("Draft", "Upcoming", "Squad_Selection"):
        raise HTTPException(400, f"Cannot modify squad once tournament is {t['status']}")
    # MPCA-131 · Squad-level lock after MPCA approval.
    if squad.get("submission_status") == "Approved":
        raise HTTPException(
            409,
            "This squad has been APPROVED by MPCA and is locked. To make "
            "changes, MPCA must first re-open the squad for revision.",
        )
    members = [m for m in (squad.get("members") or []) if m["player_id"] != player_id]
    if len(members) == len(squad.get("members") or []):
        raise HTTPException(404, "Player is not in this squad")
    await db.squads.update_one({"id": squad_id}, {"$set": {"members": members}})
    return await db.squads.find_one({"id": squad_id}, {"_id": 0})


@api_router.get("/tournaments-stats/summary")
async def tournament_stats():
    total = await db.tournaments.count_documents({})
    upcoming = await db.tournaments.count_documents({"status": "Upcoming"})
    selection = await db.tournaments.count_documents({"status": "Squad_Selection"})
    in_progress = await db.tournaments.count_documents({"status": "In_Progress"})
    completed = await db.tournaments.count_documents({"status": "Completed"})
    squads = await db.squads.count_documents({})
    # selected players (sum of member counts via aggregation)
    pipeline = [{"$project": {"sz": {"$size": {"$ifNull": ["$members", []]}}}}, {"$group": {"_id": None, "total": {"$sum": "$sz"}}}]
    selected = 0
    async for row in db.squads.aggregate(pipeline):
        selected = row.get("total", 0)
    return {
        "total_tournaments": total,
        "upcoming": upcoming,
        "in_selection": selection,
        "in_progress": in_progress,
        "completed": completed,
        "total_squads": squads,
        "total_players_selected": selected,
    }

