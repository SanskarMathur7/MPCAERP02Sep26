"""Routes · Phase T1-T4 — Tournament Plan, Grant Scheme, Auto-Budget, Match Official DA."""
from datetime import datetime, timezone
from typing import List, Optional, Literal
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict

import re
from core.infra import db, api_router
from core.shared_services import next_seq  # H6 · atomic sequence
from core.scoping import get_scope
from core.helpers import _create_notification
from models import (
    Tournament, TournamentPlan, TournamentPlanAction, TournamentPlanStatus,
    GrantSchemeRate, RateCardUnit,
    TournamentBudget, BudgetHeadAllocation, ApprovalStep,
    MatchOfficialDA, MatchOfficialDAUpdate, DAStatus,
    DATravelSegment, DAMiscItem, DAAttachment, DAComplianceFlag,
)


# ═══════════════════ Grant Scheme Rate Card ═══════════════════


@api_router.get("/grant-scheme/rates", response_model=List[GrantSchemeRate])
async def list_grant_rates(fiscal_cycle: Optional[str] = None, active_only: bool = True):
    q: dict = {}
    if fiscal_cycle:
        q["fiscal_cycle"] = fiscal_cycle
    if active_only:
        q["is_active"] = True
    docs = await db.grant_scheme_rates.find(q, {"_id": 0}).sort("head_code", 1).to_list(200)
    return docs


@api_router.post("/grant-scheme/rates", response_model=GrantSchemeRate)
async def upsert_grant_rate(rate: GrantSchemeRate):
    """Create or update a rate card row (MPCA only). Uniqueness on head_code+fiscal_cycle."""
    existing = await db.grant_scheme_rates.find_one({
        "head_code": rate.head_code, "fiscal_cycle": rate.fiscal_cycle,
    }, {"_id": 0})
    payload = rate.model_dump()
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    if existing:
        await db.grant_scheme_rates.update_one({"id": existing["id"]}, {"$set": payload})
        return await db.grant_scheme_rates.find_one({"id": existing["id"]}, {"_id": 0})
    await db.grant_scheme_rates.insert_one(payload)
    return payload


@api_router.delete("/grant-scheme/rates/{rid}")
async def delete_grant_rate(rid: str):
    r = await db.grant_scheme_rates.delete_one({"id": rid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Rate not found")
    return {"ok": True}


# ═══════════════════ Auto-Budget Generator ═══════════════════


async def _compute_auto_budget(plan: TournamentPlan, fiscal_cycle: str) -> tuple[List[BudgetHeadAllocation], float, dict]:
    """Return (head_allocations, total, breakdown_log)."""
    rates = await db.grant_scheme_rates.find({"is_active": True, "fiscal_cycle": fiscal_cycle}, {"_id": 0}).to_list(200)
    heads: List[BudgetHeadAllocation] = []
    log: dict = {"lines": [], "notes": []}
    subtotal = 0.0
    for r in rates:
        code = r["head_code"]
        rate = float(r["rate_inr"] or 0)
        unit = r["unit"]
        qty = 0.0
        if unit == "per_official_per_day":
            qty = plan.num_match_officials * plan.days
        elif unit == "per_official_per_match":
            qty = plan.num_match_officials * max(plan.match_days, 1)
        elif unit == "per_official_lump":
            qty = plan.num_match_officials
        elif unit == "per_player_per_day":
            qty = plan.num_teams * plan.num_players_per_team * plan.days
        elif unit == "per_player_lump":
            qty = plan.num_teams * plan.num_players_per_team
        elif unit == "per_player_per_match":
            qty = plan.num_teams * plan.num_players_per_team * max(plan.match_days, 1)
        elif unit == "per_match_day":
            qty = max(plan.match_days, plan.days)
        elif unit == "per_day":
            qty = plan.days
        elif unit == "percent_of_subtotal":
            continue  # handled after subtotal
        if qty <= 0:
            continue
        amount = round(qty * rate, 2)
        subtotal += amount
        heads.append(BudgetHeadAllocation(head=r["head_label"], limit_inr=amount, spent_inr=0.0))
        log["lines"].append({"head": r["head_label"], "code": code, "qty": qty, "rate": rate, "amount": amount, "unit": unit})

    # Now apply any percent_of_subtotal (contingency)
    for r in rates:
        if r["unit"] != "percent_of_subtotal":
            continue
        pct = float(r["rate_inr"] or 0)
        amount = round(subtotal * pct / 100.0, 2)
        if amount <= 0:
            continue
        subtotal += amount
        heads.append(BudgetHeadAllocation(head=r["head_label"], limit_inr=amount, spent_inr=0.0))
        log["lines"].append({"head": r["head_label"], "code": r["head_code"], "qty": 1, "rate": pct, "amount": amount, "unit": "percent_of_subtotal"})

    if not heads:
        log["notes"].append("No active grant-scheme rates matched the plan quantities.")
    return heads, round(subtotal, 2), log


async def _next_tb_no(cycle: str) -> str:
    count = await db.tournament_budgets.count_documents({"fiscal_cycle": cycle})
    return f"TB-{cycle}-{count + 1:03d}"


# ═══════════════════ Tournament Plan Workflow ═══════════════════


@api_router.get("/tournaments/{tid}/plan")
async def get_tournament_plan(tid: str):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    return {
        "plan": t.get("plan"),
        "plan_status": t.get("plan_status") or "Draft",
        "plan_approval_chain": t.get("plan_approval_chain") or [],
        "auto_budget_id": t.get("auto_budget_id"),
    }


@api_router.post("/tournaments/{tid}/plan", response_model=Tournament)
async def upsert_tournament_plan(tid: str, plan: TournamentPlan):
    """Division saves/updates the tournament plan while in Draft or Returned status."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    curr_status = t.get("plan_status") or "Draft"
    if curr_status not in ("Draft", "Plan_Returned"):
        raise HTTPException(409, f"Plan is locked ({curr_status}). MPCA must return it before edits.")
    await db.tournaments.update_one(
        {"id": tid},
        {"$set": {"plan": plan.model_dump(), "plan_status": curr_status}},
    )
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/plan/preview-budget")
async def preview_auto_budget(tid: str):
    """Compute a preview of the auto-budget without saving. Division uses this to sanity-check."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    plan_dict = t.get("plan")
    if not plan_dict:
        raise HTTPException(400, "Plan not yet set. POST /tournaments/{id}/plan first.")
    plan = TournamentPlan(**plan_dict)
    heads, total, log = await _compute_auto_budget(plan, t.get("fiscal_cycle") or "2025-26")
    return {
        "heads": [h.model_dump() for h in heads],
        "total_inr": total,
        "breakdown": log,
    }


@api_router.post("/tournaments/{tid}/plan/submit", response_model=Tournament)
async def submit_tournament_plan(tid: str, action: TournamentPlanAction):
    """Division submits plan → auto-generates TournamentBudget → status Plan_Submitted."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    curr = t.get("plan_status") or "Draft"
    if curr not in ("Draft", "Plan_Returned"):
        raise HTTPException(409, f"Cannot submit from status {curr}.")
    plan_dict = t.get("plan")
    if not plan_dict:
        raise HTTPException(400, "Plan not set. POST /tournaments/{id}/plan first.")
    plan = TournamentPlan(**plan_dict)
    if plan.days <= 0 or plan.num_teams <= 0 or plan.num_match_officials < 0:
        raise HTTPException(422, "Plan must include days > 0, num_teams > 0, non-negative num_match_officials.")

    # Auto-generate budget
    heads, total, log = await _compute_auto_budget(plan, t.get("fiscal_cycle") or "2025-26")
    if not heads:
        raise HTTPException(422, "Auto-budget computed zero heads — please configure the Grant Scheme rate card.")

    body_id = action.actor_body_id
    body = await db.bodies.find_one({"code": body_id}, {"_id": 0})

    budget_no = await _next_tb_no(t.get("fiscal_cycle") or "2025-26")
    tb = TournamentBudget(
        budget_no=budget_no,
        tournament_id=tid,
        tournament_name=t.get("name"),
        body_id=body_id,
        body_name=(body or {}).get("name", body_id),
        fiscal_cycle=t.get("fiscal_cycle") or "2025-26",
        head_allocations=heads,
        total_ceiling_inr=total,
        status="Submitted",
        notes=f"Auto-generated from Tournament Plan · {plan.days}d · {plan.num_teams} teams · {plan.num_match_officials} officials",
    )
    tb.approval_chain = [ApprovalStep(
        stage="Auto_Generated", actor_post=action.actor_post or "Division Secretary",
        actor_name=action.actor_name, actor_body_id=action.actor_body_id,
        decision="Submitted", notes="Auto-generated from Grant Scheme rate card",
    )]
    await db.tournament_budgets.insert_one(tb.model_dump())

    # Update tournament
    step = ApprovalStep(
        stage="Plan_Submitted", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id, decision="Submitted", notes=action.notes,
    )
    chain = (t.get("plan_approval_chain") or []) + [step.model_dump()]
    await db.tournaments.update_one({"id": tid}, {"$set": {
        "plan_status": "Plan_Submitted",
        "plan_approval_chain": chain,
        "auto_budget_id": tb.id,
    }})

    await _create_notification(
        recipient_role_id="secretary", recipient_body_id="MPCA",
        title=f"Tournament plan submitted · {t.get('name')}",
        message=f"{plan.days}d · {plan.num_teams} teams · budget ₹{total:,.0f} · from {action.actor_name}",
        link=f"/tournaments/{tid}", related_type="tournament", related_id=tid,
        severity="info", kind="info",
    )
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/plan/approve", response_model=Tournament)
async def approve_tournament_plan(tid: str, action: TournamentPlanAction):
    """MPCA approves the plan + budget → tournament status becomes Ready (Upcoming)."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if (t.get("plan_status") or "Draft") != "Plan_Submitted":
        raise HTTPException(409, f"Plan must be Plan_Submitted to approve (got {t.get('plan_status')}).")

    step = ApprovalStep(
        stage="Plan_Approved", actor_post=action.actor_post or "Hon. Secretary",
        actor_name=action.actor_name, actor_body_id=action.actor_body_id or "MPCA",
        decision="Sanctioned", notes=action.notes,
    )
    chain = (t.get("plan_approval_chain") or []) + [step.model_dump()]
    await db.tournaments.update_one({"id": tid}, {"$set": {
        "plan_status": "Plan_Approved",
        "plan_approval_chain": chain,
        "status": "Upcoming",   # ready to start
    }})

    # Auto-approve the linked budget too
    if t.get("auto_budget_id"):
        tb_step = ApprovalStep(
            stage="Approved", actor_post=action.actor_post or "Hon. Secretary",
            actor_name=action.actor_name, actor_body_id=action.actor_body_id or "MPCA",
            decision="Sanctioned", notes=f"Auto-approved with plan: {action.notes or ''}",
        )
        tb = await db.tournament_budgets.find_one({"id": t["auto_budget_id"]}, {"_id": 0})
        if tb:
            tb_chain = (tb.get("approval_chain") or []) + [tb_step.model_dump()]
            await db.tournament_budgets.update_one(
                {"id": tb["id"]},
                {"$set": {
                    "status": "Approved",
                    "approval_chain": tb_chain,
                    "approved_total_inr": tb["total_ceiling_inr"],
                    "approved_head_allocations": tb["head_allocations"],
                }},
            )

    # Pre-build DA forms from proposed_official_ids (or from fixtures.officials)
    await _prebuild_da_forms(t)

    # MPCA-204 · Auto-create Pre-Tournament Camps for Inter-Divisional tournaments.
    try:
        from routes.camps import auto_create_pre_camps_for_tournament
        # Re-fetch to pick up the "status" flip we just committed
        fresh = await db.tournaments.find_one({"id": tid}, {"_id": 0})
        await auto_create_pre_camps_for_tournament(fresh or t)
    except Exception:
        pass

    updated = await db.tournaments.find_one({"id": tid}, {"_id": 0})

    # Notify the originating division
    body_id = (t.get("plan_approval_chain") or [{}])[0].get("actor_body_id") or "MPCA"
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=body_id,
        title=f"Tournament plan APPROVED · {t.get('name')}",
        message=f"Plan approved by {action.actor_name}. DA forms pre-built.",
        link=f"/tournaments/{tid}", related_type="tournament", related_id=tid,
        severity="info", kind="info",
    )
    return updated


@api_router.post("/tournaments/{tid}/plan/return", response_model=Tournament)
async def return_tournament_plan(tid: str, action: TournamentPlanAction):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if (t.get("plan_status") or "Draft") != "Plan_Submitted":
        raise HTTPException(409, "Only submitted plans can be returned.")
    if not action.notes:
        raise HTTPException(400, "Return reason required in notes.")
    step = ApprovalStep(
        stage="Plan_Returned", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id or "MPCA", decision="Returned", notes=action.notes,
    )
    chain = (t.get("plan_approval_chain") or []) + [step.model_dump()]
    await db.tournaments.update_one({"id": tid}, {"$set": {
        "plan_status": "Plan_Returned",
        "plan_approval_chain": chain,
    }})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


@api_router.post("/tournaments/{tid}/plan/reject", response_model=Tournament)
async def reject_tournament_plan(tid: str, action: TournamentPlanAction):
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if (t.get("plan_status") or "Draft") not in ("Plan_Submitted", "Plan_Returned"):
        raise HTTPException(409, "Cannot reject from current status.")
    step = ApprovalStep(
        stage="Plan_Rejected", actor_post=action.actor_post, actor_name=action.actor_name,
        actor_body_id=action.actor_body_id or "MPCA", decision="Rejected", notes=action.notes,
    )
    chain = (t.get("plan_approval_chain") or []) + [step.model_dump()]
    await db.tournaments.update_one({"id": tid}, {"$set": {
        "plan_status": "Plan_Rejected",
        "plan_approval_chain": chain,
    }})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


# ═══════════════════ Match Official DA Forms ═══════════════════


async def _next_da_ref(cycle: str) -> str:
    seq = await next_seq(f"da:{cycle}", lambda: db.match_official_da.count_documents({"da_ref": {"$regex": f"^DA-{cycle}-"}}))
    return f"DA-{cycle}-{seq:04d}"


async def _prebuild_da_forms(tournament: dict) -> int:
    """Pre-build one DA form per allocated official across all fixtures of this tournament.
    Returns number of forms created.

    MPCA-202 · Two day counters:
      - scheduled_days → sum of days across ALL fixtures the official is allocated to
                        (drives Match-Officials Fee, paid even if match cancelled)
      - played_days    → sum of days across fixtures actually played
                        (status ∈ {In_Progress, Completed}) — drives DA/TA
    """
    tid = tournament["id"]
    cycle = tournament.get("fiscal_cycle") or "2025-26"
    PLAYED_STATUSES = {"In_Progress", "Completed"}
    # Collect unique (name, role) across fixtures — track scheduled + played separately
    fixtures = await db.fixtures.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    seen: dict = {}
    for fx in fixtures:
        fx_days = float(fx.get("days") or 1)
        fx_played = fx.get("status") in PLAYED_STATUSES
        for o in (fx.get("officials") or []):
            key = (o.get("name") or "", o.get("role") or "")
            if key not in seen:
                seen[key] = {"official": o, "fixture_ids": [], "scheduled_days": 0.0, "played_days": 0.0}
            seen[key]["fixture_ids"].append(fx["id"])
            seen[key]["scheduled_days"] += fx_days
            if fx_played:
                seen[key]["played_days"] += fx_days

    # Look up DA + officiating fee rates from grant scheme
    async def _rate(head_code: str) -> float:
        row = await db.grant_scheme_rates.find_one({
            "head_code": head_code, "is_active": True, "fiscal_cycle": cycle,
        }, {"_id": 0})
        return float((row or {}).get("rate_inr") or 0)

    da_rate = await _rate("MATCH_OFFICIAL_DA")
    fee_rate_by_role = {
        "umpire": await _rate("UMPIRE_HONORARIUM"),
        "scorer": await _rate("SCORER_HONORARIUM"),
    }
    created = 0
    for (name, role), meta in seen.items():
        if not name:
            continue
        # Skip if already exists
        exists = await db.match_official_da.find_one({
            "tournament_id": tid, "official_name": name, "official_role": role,
        })
        if exists:
            continue
        scheduled_days = int(meta["scheduled_days"] or 1)
        played_days = int(meta["played_days"] or 0)
        role_key = (role or "").lower().split("_")[0]  # umpire / scorer / referee...
        fee_rate = fee_rate_by_role.get(role_key, 0.0)
        o = meta["official"]
        da = MatchOfficialDA(
            da_ref=await _next_da_ref(cycle),
            tournament_id=tid,
            tournament_name=tournament.get("name"),
            official_name=name,
            official_role=role,
            official_phone=o.get("phone"),
            body_id=o.get("body_id"),
            scheduled_days=scheduled_days,
            played_days=played_days,
            days=played_days,                                # legacy alias
            match_fee_rate_inr=fee_rate,
            match_fee_amount_inr=round(scheduled_days * fee_rate, 2),
            da_rate_inr=da_rate,
            da_amount_inr=round(played_days * da_rate, 2),
            total_inr=round(scheduled_days * fee_rate + played_days * da_rate, 2),
        )
        await db.match_official_da.insert_one(da.model_dump())
        created += 1
    return created


@api_router.get("/match-official-da", response_model=List[MatchOfficialDA])
async def list_da_forms(request: Request, tournament_id: Optional[str] = None, status: Optional[DAStatus] = None, official_name: Optional[str] = None):
    q: dict = {}
    if tournament_id:
        q["tournament_id"] = tournament_id
    if status:
        q["status"] = status
    scope = get_scope(request)
    # Sprint M13: match-official persona sees only own DA forms
    if scope.is_official and scope.name and not official_name:
        official_name = scope.name
    if official_name:
        q["official_name"] = {"$regex": re.escape(official_name), "$options": "i"}
    # M37 · Division / District reviewers see DA forms for tournaments they host
    if (scope.is_division or scope.is_district) and not tournament_id and not scope.is_official:
        # Resolve tournaments visible to this body-scope
        from routes.tournaments import _tournament_scope_query
        tscope = _tournament_scope_query(scope)
        if tscope:
            allowed_tids = [t["id"] async for t in db.tournaments.find(tscope, {"_id": 0, "id": 1})]
            q["tournament_id"] = {"$in": allowed_tids}
    docs = await db.match_official_da.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.get("/match-official-da/{did}", response_model=MatchOfficialDA)
async def get_da_form(did: str):
    doc = await db.match_official_da.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DA form not found")
    return doc


@api_router.patch("/match-official-da/{did}", response_model=MatchOfficialDA)
async def update_da_form(did: str, patch: MatchOfficialDAUpdate):
    """Match official fills their DA form.

    Server recomputes every derived total (travel, journey, DA amount,
    conveyance, incidental, misc) and the grand total on every save so the
    client never has to trust its own arithmetic. Compliance flags are NOT
    stamped here — only on submit (see `submit_da_form`).
    """
    doc = await db.match_official_da.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DA form not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, f"Cannot edit DA in status {doc['status']}")
    p = patch.model_dump(exclude_none=True)

    # ── Merge patch onto doc for derived-value computation ──
    merged = {**doc, **p}
    # Normalise nested lists into plain dicts for storage
    if "travel_segments" in p:
        merged["travel_segments"] = [
            s if isinstance(s, dict) else s.model_dump() for s in p["travel_segments"]
        ]
    if "misc_items" in p:
        merged["misc_items"] = [
            m if isinstance(m, dict) else m.model_dump() for m in p["misc_items"]
        ]
    if "attachments" in p:
        merged["attachments"] = [
            a if isinstance(a, dict) else a.model_dump() for a in p["attachments"]
        ]

    # ── Derived totals ──
    import math
    # Travel (sum of segments · both-ways amount) — fall back to legacy scalar
    if "travel_segments" in p:
        travel_total = round(sum(float(s.get("both_ways_amount_inr") or 0) for s in merged["travel_segments"]), 2)
    else:
        travel_total = float(merged.get("travel_amount_inr") or 0)
    merged["travel_amount_inr"] = travel_total

    # Journey — 300 per every 12 hrs OR part thereof
    j_hours = float(merged.get("journey_hours") or 0)
    j_rate = float(merged.get("journey_rate_per_12h_inr") or 300)
    journey_units = math.ceil(j_hours / 12) if j_hours > 0 else 0
    merged["journey_amount_inr"] = round(journey_units * j_rate, 2)

    # DA amount (MPCA-202 · driven by played_days, not scheduled_days)
    scheduled_days = int(merged.get("scheduled_days") or merged.get("days") or 0)
    played_days = int(merged.get("played_days") if merged.get("played_days") is not None else merged.get("days") or 0)
    # Legacy `days` kept in sync with played_days
    merged["scheduled_days"] = scheduled_days
    merged["played_days"] = played_days
    merged["days"] = played_days
    da_rate = float(merged.get("da_rate_inr") or 0)
    merged["da_amount_inr"] = round(played_days * da_rate, 2)

    # Match Officials Fee (paid for every scheduled day, cancelled or not)
    fee_rate = float(merged.get("match_fee_rate_inr") or 0)
    merged["match_fee_amount_inr"] = round(scheduled_days * fee_rate, 2)

    # Conveyance
    conv_rate = float(merged.get("conveyance_rate_inr") or 0)
    conv_count = int(merged.get("conveyance_count") or 0)
    merged["conveyance_amount_inr"] = round(conv_rate * conv_count, 2)

    # Incidental
    inc_rate = float(merged.get("incidental_rate_inr") or 0)
    inc_days = int(merged.get("incidental_days") or 0)
    merged["incidental_amount_inr"] = round(inc_rate * inc_days, 2)

    # Misc (sum of items) — fall back to legacy scalar
    if "misc_items" in p:
        misc_total = round(sum(float(m.get("amount_inr") or 0) for m in merged["misc_items"]), 2)
    else:
        misc_total = float(merged.get("misc_amount_inr") or 0)
    merged["misc_amount_inr"] = misc_total

    # Grand Total (MPCA-202 · include Match-Officials Fee)
    night_halt = float(merged.get("night_halt_amount_inr") or 0)
    food_legacy = float(merged.get("food_amount_inr") or 0)   # only for old rows
    grand_total = round(
        merged["da_amount_inr"] + merged["match_fee_amount_inr"] +
        merged["travel_amount_inr"] + merged["journey_amount_inr"] +
        merged["conveyance_amount_inr"] + merged["incidental_amount_inr"] + night_halt +
        merged["misc_amount_inr"] + food_legacy,
        2,
    )
    merged["total_inr"] = grand_total
    merged["total_in_words"] = _rupees_in_words(grand_total)

    # Persist ONLY the fields we touched + derived
    to_set = {
        **{k: merged[k] for k in p.keys() if k in merged},
        "scheduled_days": merged["scheduled_days"],
        "played_days": merged["played_days"],
        "days": merged["days"],
        "match_fee_amount_inr": merged["match_fee_amount_inr"],
        "da_amount_inr": merged["da_amount_inr"],
        "travel_amount_inr": merged["travel_amount_inr"],
        "journey_amount_inr": merged["journey_amount_inr"],
        "conveyance_amount_inr": merged["conveyance_amount_inr"],
        "incidental_amount_inr": merged["incidental_amount_inr"],
        "misc_amount_inr": merged["misc_amount_inr"],
        "total_inr": grand_total,
        "total_in_words": merged["total_in_words"],
        "status": "Draft" if doc["status"] == "Rejected" else doc["status"],
    }
    await db.match_official_da.update_one({"id": did}, {"$set": to_set})
    return await db.match_official_da.find_one({"id": did}, {"_id": 0})


# ─── ₹ in-words helper (Indian numbering system, up to 99,99,99,999) ───
def _rupees_in_words(n: float) -> str:
    if n is None:
        return ""
    n = int(round(float(n)))
    if n == 0:
        return "Zero Rupees Only"
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def _two(x: int) -> str:
        if x < 20:
            return ones[x]
        return tens[x // 10] + (" " + ones[x % 10] if x % 10 else "")

    def _three(x: int) -> str:
        h, rest = divmod(x, 100)
        s = ""
        if h:
            s = ones[h] + " Hundred"
            if rest:
                s += " "
        if rest:
            s += _two(rest)
        return s

    parts: List[str] = []
    crore = n // 10_000_000; n %= 10_000_000
    lakh = n // 100_000; n %= 100_000
    thou = n // 1000; n %= 1000
    hund = n
    if crore:
        parts.append(_two(crore) + " Crore")
    if lakh:
        parts.append(_two(lakh) + " Lakh")
    if thou:
        parts.append(_two(thou) + " Thousand")
    if hund:
        parts.append(_three(hund))
    return " ".join(parts).strip() + " Rupees Only"


# ─── Scheme compliance snapshot ───
async def _compute_da_compliance(doc: dict) -> List[dict]:
    """Build advisory badges: DA rate, journey rate, night halt vs scheme."""
    cycle = None
    if doc.get("tournament_id"):
        t = await db.tournaments.find_one({"id": doc["tournament_id"]}, {"_id": 0, "fiscal_cycle": 1})
        cycle = (t or {}).get("fiscal_cycle") or "2025-26"
    else:
        cycle = "2025-26"
    flags: List[dict] = []

    async def _rate(head_code: str) -> Optional[float]:
        row = await db.grant_scheme_rates.find_one(
            {"head_code": head_code, "is_active": True, "fiscal_cycle": cycle}, {"_id": 0},
        )
        return float(row.get("rate_inr")) if row else None

    da_ceiling = await _rate("MATCH_OFFICIAL_DA")
    if da_ceiling is not None and float(doc.get("da_rate_inr") or 0) > da_ceiling:
        flags.append({
            "field": "da_rate_inr",
            "claimed": float(doc.get("da_rate_inr") or 0),
            "scheme_ceiling": da_ceiling,
            "severity": "warning",
            "note": f"Claimed ₹{doc.get('da_rate_inr'):,.0f}/day exceeds scheme cap of ₹{da_ceiling:,.0f}/day",
        })

    # Journey allowance: MPCA standard ₹300 / 12 hrs
    j_rate = float(doc.get("journey_rate_per_12h_inr") or 0)
    if j_rate > 300:
        flags.append({
            "field": "journey_rate_per_12h_inr",
            "claimed": j_rate,
            "scheme_ceiling": 300.0,
            "severity": "warning",
            "note": f"Journey rate ₹{j_rate:,.0f}/12hrs exceeds MPCA standard of ₹300/12hrs",
        })

    # Night Halt vs scheme (if configured)
    nh_ceiling = await _rate("MATCH_OFFICIAL_NIGHT_HALT")
    if nh_ceiling is not None and float(doc.get("night_halt_amount_inr") or 0) > nh_ceiling:
        flags.append({
            "field": "night_halt_amount_inr",
            "claimed": float(doc.get("night_halt_amount_inr") or 0),
            "scheme_ceiling": nh_ceiling,
            "severity": "warning",
            "note": f"Night halt ₹{doc.get('night_halt_amount_inr'):,.0f} exceeds scheme cap of ₹{nh_ceiling:,.0f}",
        })

    return flags


@api_router.post("/match-official-da/self-create", response_model=MatchOfficialDA)
async def self_create_da_form(
    request: Request,
    tournament_id: str,
    official_id: Optional[str] = None,
    official_name: Optional[str] = None,
):
    """Match official self-creates a DA form for a tournament they officiated.

    Fills the header from their profile (`match_officials` collection).
    If a form already exists for (tournament_id, official_name) it is
    returned instead of creating a duplicate.
    """
    scope = get_scope(request)
    t = await db.tournaments.find_one({"id": tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    # Resolve official from either the id, the passed name, or the caller scope
    off = None
    if official_id:
        off = await db.match_officials.find_one({"id": official_id}, {"_id": 0})
    elif official_name:
        off = await db.match_officials.find_one({"full_name": official_name}, {"_id": 0})
    elif scope.is_official and scope.name:
        off = await db.match_officials.find_one({"full_name": scope.name}, {"_id": 0})
    if not off:
        raise HTTPException(404, "Match official profile not found — please ensure your profile exists first.")

    name = off["full_name"]
    # M37 · A match-official can only self-create a DA for a tournament they're allocated to
    if scope.is_official and scope.name and scope.name == name:
        squad_hit = await db.squads.find_one({
            "tournament_id": tournament_id,
            "$or": [
                {"match_officials.umpire_1": name},
                {"match_officials.umpire_2": name},
                {"match_officials.scorer": name},
                {"match_officials.referee": name},
            ],
        }, {"_id": 0, "id": 1})
        if not squad_hit:
            raise HTTPException(403, "You are not allocated to this tournament — please contact your Division/MPCA to be added to the squad first.")

    # Return existing draft if present
    exists = await db.match_official_da.find_one({
        "tournament_id": tournament_id, "official_name": name,
    }, {"_id": 0})
    if exists:
        return exists

    cycle = t.get("fiscal_cycle") or "2025-26"
    # Look up DA rate from grant scheme
    da_rate_row = await db.grant_scheme_rates.find_one({
        "head_code": "MATCH_OFFICIAL_DA", "is_active": True, "fiscal_cycle": cycle,
    }, {"_id": 0})
    da_rate = float((da_rate_row or {}).get("rate_inr") or 0)

    # Body display name for the "Association/Division" line
    body_id = off.get("body_id") or scope.body_code
    body_name = None
    if body_id:
        body_doc = await db.bodies.find_one({"code": body_id}, {"_id": 0, "name": 1})
        body_name = (body_doc or {}).get("name")

    purpose = f"{off.get('role')} for {t.get('name')}"
    da = MatchOfficialDA(
        da_ref=await _next_da_ref(cycle),
        tournament_id=tournament_id,
        tournament_name=t.get("name"),
        official_id=off["id"],
        official_name=name,
        official_role=off.get("role") or "Umpire",
        official_phone=off.get("phone"),
        body_id=body_id,
        association_division=body_name,
        purpose_of_visit=purpose,
        place_of_visit=t.get("venue_city") or t.get("host_city") or None,
        days=0,
        da_rate_inr=da_rate,
        journey_rate_per_12h_inr=300.0,
        conveyance_rate_inr=200.0,          # MPCA typical default
    )
    await db.match_official_da.insert_one(da.model_dump())
    return da


@api_router.post("/match-official-da/{did}/submit", response_model=MatchOfficialDA)
async def submit_da_form(did: str):
    doc = await db.match_official_da.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DA form not found")
    if doc["status"] not in ("Draft", "Rejected"):
        raise HTTPException(409, f"Cannot submit from status {doc['status']}")
    if float(doc.get("total_inr") or 0) <= 0:
        raise HTTPException(400, "Cannot submit an empty DA form. Please fill days + amounts first.")

    # Compliance snapshot — advisory only, does NOT block submission
    flags = await _compute_da_compliance(doc)

    now = datetime.now(timezone.utc).isoformat()
    await db.match_official_da.update_one({"id": did}, {"$set": {
        "status": "Submitted", "submitted_at": now,
        "compliance_flags": flags,
    }})
    # Notify Division for approval
    await _create_notification(
        recipient_role_id="division-secretary", recipient_body_id=doc.get("body_id") or "MPCA",
        title=f"DA form submitted · {doc.get('official_name')}",
        message=f"{doc.get('tournament_name')} · ₹{doc.get('total_inr'):,.0f}"
                + (f" · {len(flags)} scheme flag(s)" if flags else ""),
        link=f"/tournaments/{doc.get('tournament_id')}", related_type="match_official_da", related_id=did,
        severity="warning" if flags else "info", kind="info",
    )
    return await db.match_official_da.find_one({"id": did}, {"_id": 0})


@api_router.post("/match-official-da/{did}/approve", response_model=MatchOfficialDA)
async def approve_da_form(did: str, actor_name: str, actor_body_id: str = "MPCA"):
    """M37 · Division approves the DA form. Approved DAs are eligible to be
    bundled into the Division's Reimbursement Claim to MPCA (no separate
    MPCA approval)."""
    doc = await db.match_official_da.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DA form not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, "Only submitted DA forms can be approved.")
    now = datetime.now(timezone.utc).isoformat()
    await db.match_official_da.update_one({"id": did}, {"$set": {
        "status": "Approved", "approved_by": actor_name, "approved_at": now,
    }})
    # Notify the match official
    await _create_notification(
        recipient_role_id="match-official",
        recipient_body_id=doc.get("body_id") or "MPCA",
        title=f"DA form approved · {doc.get('da_ref')}",
        message=f"{doc.get('tournament_name')} · ₹{doc.get('total_inr'):,.0f} · Approved by {actor_name}. Will be bundled with the Division's reimbursement claim to MPCA.",
        link="/my-da-forms",
        related_type="match_official_da", related_id=did,
        severity="info", kind="info",
    )
    return await db.match_official_da.find_one({"id": did}, {"_id": 0})


@api_router.post("/match-official-da/{did}/reject", response_model=MatchOfficialDA)
async def reject_da_form(did: str, actor_name: str, reason: str, actor_body_id: str = "MPCA"):
    doc = await db.match_official_da.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DA form not found")
    if doc["status"] != "Submitted":
        raise HTTPException(409, "Only submitted DA forms can be rejected.")
    await db.match_official_da.update_one({"id": did}, {"$set": {
        "status": "Rejected", "rejection_reason": reason,
        "approved_by": actor_name,
    }})
    # Notify the match official so they can edit + re-submit
    await _create_notification(
        recipient_role_id="match-official",
        recipient_body_id=doc.get("body_id") or "MPCA",
        title=f"DA form returned · {doc.get('da_ref')}",
        message=f"{doc.get('tournament_name')} · Rejected by {actor_name}. Reason · {reason}",
        link="/my-da-forms",
        related_type="match_official_da", related_id=did,
        severity="warning", kind="info",
    )
    return await db.match_official_da.find_one({"id": did}, {"_id": 0})


# ─────────────────── MPCA-233 · Payment marking (Treasurer) ───────────────────

class _MarkPaidPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    payment_ref: str = Field(..., min_length=1)                # UTR / cheque no. / UPI txn id
    payment_mode: Literal["NEFT", "UPI", "Cheque", "Cash", "RTGS"] = "NEFT"
    paid_amount_inr: Optional[float] = None                    # defaults to approved total_inr
    paid_at: Optional[str] = None                              # ISO date; defaults to now
    payment_notes: Optional[str] = None
    actor_name: str = "MPCA Treasurer"


@api_router.post("/match-official-da/{did}/mark-paid", response_model=MatchOfficialDA)
async def mark_da_paid(did: str, payload: _MarkPaidPayload):
    """MPCA-233 · Treasurer records the DA disbursement.
    Only Approved forms may transition → Paid. Recorded UTR / mode / date show
    up on the Match Official's `/my-assignments` portal so they know their
    payment has landed.
    """
    doc = await db.match_official_da.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DA form not found")
    if doc["status"] not in ("Approved", "Paid"):
        raise HTTPException(409, f"Only Approved forms can be marked Paid — current status: {doc['status']}")
    now = datetime.now(timezone.utc).isoformat()
    paid_amount = float(payload.paid_amount_inr if payload.paid_amount_inr is not None else (doc.get("total_inr") or 0))
    await db.match_official_da.update_one({"id": did}, {"$set": {
        "status": "Paid",
        "paid_at": payload.paid_at or now,
        "paid_amount_inr": max(0.0, paid_amount),
        "payment_ref": payload.payment_ref.strip(),
        "payment_mode": payload.payment_mode,
        "payment_notes": (payload.payment_notes or "").strip() or None,
        "paid_by": payload.actor_name,
    }})
    await _create_notification(
        recipient_role_id="match-official",
        recipient_body_id=doc.get("body_id") or "MPCA",
        title=f"Payment made · {doc.get('da_ref')}",
        message=f"Rs {paid_amount:,.0f} paid via {payload.payment_mode} · Ref {payload.payment_ref}",
        link="/my-assignments",
        related_type="match_official_da", related_id=did,
        severity="info", kind="info",
    )
    return await db.match_official_da.find_one({"id": did}, {"_id": 0})


@api_router.post("/match-official-da/{did}/mark-unpaid", response_model=MatchOfficialDA)
async def mark_da_unpaid(did: str, actor_name: str = "MPCA Treasurer"):
    """Reverse a Paid marking (e.g. bank return, UTR entered wrong).
    Rolls status back to Approved and clears payment fields.
    """
    doc = await db.match_official_da.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DA form not found")
    if doc["status"] != "Paid":
        raise HTTPException(409, f"Only Paid forms can be reversed — current status: {doc['status']}")
    await db.match_official_da.update_one({"id": did}, {"$set": {
        "status": "Approved",
        "paid_at": None,
        "paid_amount_inr": 0.0,
        "payment_ref": None,
        "payment_mode": None,
        "payment_notes": f"Payment reversed by {actor_name} on {datetime.now(timezone.utc).isoformat()}",
        "paid_by": None,
    }})
    return await db.match_official_da.find_one({"id": did}, {"_id": 0})


@api_router.get("/tournaments/{tid}/match-official-payments")
async def list_tournament_da_payments(tid: str):
    """MPCA-233 · Aggregate view for the Finance Console TA/DA tab.
    Returns every DA form for the tournament + assignment linkage + rollups
    grouped by status. Consumed by `FinanceMatchOfficialsDAPaymentsPanel`.
    """
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    forms = await db.match_official_da.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    # Snapshot central assignments so we can show role/days from the assignment
    # even if the DA form's played_days is still 0.
    assigns = await db.tournament_match_officials.find(
        {"tournament_id": tid}, {"_id": 0}
    ).to_list(500)
    assign_by_name = {}
    for a in assigns:
        assign_by_name[(a.get("official_name") or "", a.get("role") or "")] = a
    rollup = {"submitted": 0.0, "approved": 0.0, "paid": 0.0, "count": len(forms), "total_approved": 0.0}
    for f in forms:
        s = (f.get("status") or "").lower()
        total = float(f.get("total_inr") or 0)
        if s == "submitted":
            rollup["submitted"] += total
        elif s == "approved":
            rollup["approved"] += total
            rollup["total_approved"] += total
        elif s == "paid":
            rollup["paid"] += float(f.get("paid_amount_inr") or total)
            rollup["total_approved"] += total
        a = assign_by_name.get((f.get("official_name") or "", f.get("official_role") or ""))
        if a:
            f["assignment_id"] = a.get("id")
            f["assignment_status"] = a.get("acceptance_status")
    forms.sort(key=lambda x: (x.get("official_name") or "").lower())
    return {
        "tournament_id": tid,
        "tournament_name": t.get("name"),
        "forms": forms,
        "rollup": rollup,
    }




@api_router.post("/tournaments/{tid}/da-forms/rebuild")
async def rebuild_da_forms(tid: str):
    """Regenerate any missing DA forms and refresh scheduled/played day counters
    on Draft/Rejected forms. Submitted/Approved forms are left untouched.

    MPCA-202 · When fixtures flip to Completed / In_Progress after the form
    was pre-built, the Draft DA needs to pick up the fresh played-day count.
    """
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    # Create any missing forms first
    created = await _prebuild_da_forms(t)

    # Recompute counters on editable forms
    PLAYED_STATUSES = {"In_Progress", "Completed"}
    fixtures = await db.fixtures.find({"tournament_id": tid}, {"_id": 0}).to_list(500)
    seen: dict = {}
    for fx in fixtures:
        fx_days = float(fx.get("days") or 1)
        fx_played = fx.get("status") in PLAYED_STATUSES
        for o in (fx.get("officials") or []):
            key = (o.get("name") or "", o.get("role") or "")
            if key not in seen:
                seen[key] = {"scheduled_days": 0.0, "played_days": 0.0}
            seen[key]["scheduled_days"] += fx_days
            if fx_played:
                seen[key]["played_days"] += fx_days
    refreshed = 0
    for (name, role), meta in seen.items():
        if not name:
            continue
        form = await db.match_official_da.find_one({
            "tournament_id": tid, "official_name": name, "official_role": role,
        }, {"_id": 0})
        if not form or form.get("status") not in ("Draft", "Rejected"):
            continue
        scheduled_days = int(meta["scheduled_days"] or 0)
        played_days = int(meta["played_days"] or 0)
        fee_rate = float(form.get("match_fee_rate_inr") or 0)
        da_rate = float(form.get("da_rate_inr") or 0)
        match_fee = round(scheduled_days * fee_rate, 2)
        da_amount = round(played_days * da_rate, 2)
        # Compute new grand total from existing fields + refreshed amounts
        night_halt = float(form.get("night_halt_amount_inr") or 0)
        food_legacy = float(form.get("food_amount_inr") or 0)
        total = round(
            match_fee + da_amount +
            float(form.get("travel_amount_inr") or 0) +
            float(form.get("journey_amount_inr") or 0) +
            float(form.get("conveyance_amount_inr") or 0) +
            float(form.get("incidental_amount_inr") or 0) +
            night_halt + food_legacy +
            float(form.get("misc_amount_inr") or 0),
            2,
        )
        await db.match_official_da.update_one({"id": form["id"]}, {"$set": {
            "scheduled_days": scheduled_days,
            "played_days": played_days,
            "days": played_days,
            "match_fee_amount_inr": match_fee,
            "da_amount_inr": da_amount,
            "total_inr": total,
        }})
        refreshed += 1
    return {"created": created, "refreshed": refreshed}
