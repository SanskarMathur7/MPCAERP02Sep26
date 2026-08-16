"""M39r · Tournament Finance Console — MPCA-owned budget flow.

Replaces the old "Division writes budget first, MPCA approves" model with a
cleaner MPCA-owned flow that matters more for a state cricket association:

  1. MPCA (state office) enters input variables ONCE for the tournament.
  2. MPCA hits Prepare — the system generates one Host budget (full scheme
     allocation) and one Visitor budget per accepted visiting body (travel +
     DA + stay + contingency). Both are private Drafts on MPCA's console.
  3. MPCA hits Send — every Draft budget flips to Sent_To_Division. Divisions
     see an Action Centre card ("Budget received · needs your acceptance").
  4. Division taps Accept → status Approved (M39z: auto-sanction; MPCA
     already authored the ceiling so a second MPCA click adds friction only).
     Or taps Request Revision (with a reason) → status Revision_Requested,
     back to MPCA for edits and re-send.
  5. Terminal state Approved unlocks invoice / DA / claim spending.

State machine:
    Draft ─send─▶ Sent_To_Division ─div-accept─▶ Approved  (M39z: auto-sanction)
                                  └─request-revision─▶ Revision_Requested ─(re-send)─▶ Sent_To_Division

Legacy note: the old `/sanction` endpoint remains for pre-M39z docs stuck
in the transitional `Accepted_By_Division` state — new acceptances skip it.

The old submit/approve/return/reject endpoints are preserved for backward
compatibility (existing tournaments in flight keep working); this console
layer is used by the new UI.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Header
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router
from models import (
    ApprovalStep,
    BudgetHeadAllocation,
    TournamentBudget,
)


# ─────────────────────── Helpers ───────────────────────

# Keyword-based classifier borrowed from the old auto-split logic. Any head
# label that mentions travel/DA/food/stay/etc. is treated as a visitor head;
# everything else lives with the host.
_VISITOR_HEAD_KEYWORDS = (
    "travel", " ta ", " da ", "food", "stay", "hotel", "lodging",
    "boarding", "meal", "conveyance", "transport", "contingency",
)


def _is_visitor_head(label: str) -> bool:
    l = f" {(label or '').lower()} "
    return any(k in l for k in _VISITOR_HEAD_KEYWORDS)


async def _next_budget_no(cycle: str) -> str:
    count = await db.tournament_budgets.count_documents({"fiscal_cycle": cycle})
    return f"TB-{cycle}-{count + 1:03d}"


def _append_chain(doc: dict, step: ApprovalStep, new_status: str) -> Dict[str, Any]:
    chain = list(doc.get("approval_chain") or []) + [step.model_dump()]
    return {
        "status": new_status,
        "approval_chain": chain,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def _push_notification(*, recipient_body_id: str, recipient_role_id: str,
                             title: str, message: str, link: str,
                             related_type: str, related_id: str,
                             severity: str = "info", kind: str = "info") -> None:
    """Minimal notify — the Action Centre reads state directly, but push a
    notification for the bell/toast side too."""
    try:
        from routes.notifications import add_notification
        await add_notification(
            recipient_role_id=recipient_role_id,
            recipient_body_id=recipient_body_id,
            title=title, message=message, link=link,
            related_type=related_type, related_id=related_id,
            severity=severity, kind=kind,
        )
    except Exception:  # noqa
        return


# ─────────────────────── Payloads ───────────────────────

class PreparePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    input_variables: Optional[Dict[str, Any]] = None       # global fallback IVs
    pool_input_variables: Optional[Dict[str, Dict[str, Any]]] = None  # M39s · per-pool IVs
    # M39w · MPCA may override individual head amounts per body before sending.
    # Keyed by body_code → dict of head_name → new_limit_inr. Anything omitted
    # keeps the scheme-computed value.
    per_body_head_overrides: Optional[Dict[str, Dict[str, float]]] = None
    prepared_by_name: Optional[str] = None


class SendPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: Optional[str] = None
    actor_post: Optional[str] = None
    only_budget_ids: Optional[List[str]] = None        # if provided, send only these; else all Draft/Revision_Requested for this tid


class DivisionAcceptPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_post: Optional[str] = None
    actor_body_id: Optional[str] = None
    notes: Optional[str] = None


class RevisionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_post: Optional[str] = None
    actor_body_id: Optional[str] = None
    reason: str = Field(..., min_length=3)


class SanctionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_post: Optional[str] = None
    actor_body_id: str = "MPCA"
    approved_total_inr: Optional[float] = None
    approved_head_allocations: Optional[List[BudgetHeadAllocation]] = None
    notes: Optional[str] = None


# ─────────────────────── Endpoints ───────────────────────

@api_router.post("/tournaments/{tid}/finance/prepare-budgets")
async def prepare_budgets(tid: str, payload: PreparePayload):
    """MPCA one-shot budget prep. Pool-aware (M39s):
       - If the tournament has multiple pools, one Host budget per pool + one
         Visitor budget per (pool, body) — each priced with that pool's IVs
         (or the global IVs as fallback).
       - Single-pool tournaments behave exactly as before.
       - Anything already Draft or Revision_Requested is replaced; live
         (Sent/Accepted/Approved) budgets are preserved."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    # Save master + per-pool IVs if the caller sent them
    update_doc: Dict[str, Any] = {}
    if payload.input_variables:
        update_doc["input_variables"] = payload.input_variables
        t["input_variables"] = payload.input_variables
    if payload.pool_input_variables is not None:
        update_doc["pool_input_variables"] = payload.pool_input_variables
        t["pool_input_variables"] = payload.pool_input_variables
    if update_doc:
        await db.tournaments.update_one({"id": tid}, {"$set": update_doc})

    global_ivs = t.get("input_variables") or {}
    pool_ivs = t.get("pool_input_variables") or {}
    if not global_ivs and not pool_ivs:
        raise HTTPException(400, "Set input variables before preparing budgets.")

    scheme_code = t.get("scheme_code")
    if not scheme_code:
        raise HTTPException(400, "Pick a reimbursement scheme on the tournament before preparing budgets.")
    cycle = t.get("fiscal_cycle") or "2025-26"

    # Fetch participants (accepted or pending, not removed)
    participants = await db.tournament_participations.find({
        "tournament_id": tid,
        "removed_at": None,
        "acceptance_status": {"$in": ["Accepted", "Pending"]},
    }, {"_id": 0}).to_list(500)
    if not participants:
        raise HTTPException(400, "Add participants (Host + Visitors) before preparing budgets.")

    # Group participants by pool_id (None = "single-pool tournament")
    pools_map: Dict[Optional[str], List[Dict[str, Any]]] = {}
    for p in participants:
        pools_map.setdefault(p.get("pool_id"), []).append(p)

    from routes.scheme_calc import compute_budget, ComputeRequest

    created: List[Dict[str, Any]] = []
    replaced: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for pool_id, pool_members in pools_map.items():
        pool_name = (pool_members[0].get("pool_name") if pool_members else None) or "Main"
        # Pool-specific IVs, falling back to global IVs
        ivs_for_pool = (pool_ivs.get(pool_id) if pool_id else None) or global_ivs
        if not ivs_for_pool:
            skipped.append({"pool_id": pool_id, "pool_name": pool_name,
                            "reason": "No IVs for this pool."})
            continue

        preview = await compute_budget(scheme_code, ComputeRequest(inputs=ivs_for_pool))
        full_heads = preview.get("head_allocations") or []
        if not full_heads:
            skipped.append({"pool_id": pool_id, "pool_name": pool_name,
                            "reason": "Scheme returned no heads for these IVs."})
            continue
        visitor_heads = [h for h in full_heads if _is_visitor_head(h["head"])]
        if not visitor_heads:
            visitor_heads = [{
                "head": "Team Travel Subsidy",
                "limit_inr": round(preview.get("total_ceiling_inr", 0) * 0.20, 2),
                "formula": "20% of total ceiling (fallback)",
            }]

        for p in pool_members:
            body_code = p.get("body_code")
            role = p.get("role", "Visitor")

            # If a live (post-Draft) budget exists for this body in THIS pool, skip
            live = await db.tournament_budgets.find_one({
                "tournament_id": tid,
                "body_id": body_code,
                "pool_id": pool_id,
                "fiscal_cycle": cycle,
                "status": {"$in": [
                    "Submitted", "Approved", "Sent_To_Division",
                    "Accepted_By_Division",
                ]},
            }, {"_id": 0})
            if live:
                skipped.append({
                    "body_code": body_code, "pool_name": pool_name, "role": role,
                    "budget_no": live.get("budget_no"),
                    "reason": f"already {live.get('status')}",
                })
                continue

            # Kill any pre-existing Draft / Revision_Requested for this body+pool
            old_draft = await db.tournament_budgets.find_one({
                "tournament_id": tid,
                "body_id": body_code,
                "pool_id": pool_id,
                "fiscal_cycle": cycle,
                "status": {"$in": ["Draft", "Revision_Requested", "Returned"]},
            }, {"_id": 0})
            if old_draft:
                await db.tournament_budgets.delete_one({"id": old_draft["id"]})
                replaced.append({"body_code": body_code, "pool_name": pool_name,
                                 "budget_no": old_draft.get("budget_no")})

            heads_for_this = full_heads if role == "Host" else visitor_heads
            head_allocs = [BudgetHeadAllocation(
                head=h["head"], limit_inr=float(h["limit_inr"]),
                notes=h.get("formula"),
            ) for h in heads_for_this]

            # M39w · Apply MPCA per-body head overrides on top of scheme values.
            # Sprint FIN-CustomHead · MPCA can also add ENTIRELY NEW heads that
            # aren't in the scheme master (e.g. a Division-specific reimbursement
            # like "Referee travel — chartered bus"). Any override key that
            # matches a scheme head is treated as an override; any key that
            # doesn't match is appended as an extra head allocation.
            body_overrides = ((payload.per_body_head_overrides or {}).get(body_code) or {})
            if body_overrides:
                scheme_head_labels = {h.head for h in head_allocs}
                for h in head_allocs:
                    if h.head in body_overrides:
                        try:
                            new_amt = float(body_overrides[h.head])
                            h.notes = (h.notes or "") + f" · MPCA override ₹{new_amt:,.0f}"
                            h.limit_inr = new_amt
                        except (TypeError, ValueError):
                            pass
                # Extras (custom rows added by MPCA)
                for label, amt in body_overrides.items():
                    if label in scheme_head_labels:
                        continue
                    try:
                        amt_f = float(amt)
                        if amt_f <= 0:
                            continue
                    except (TypeError, ValueError):
                        continue
                    head_allocs.append(BudgetHeadAllocation(
                        head=label,
                        limit_inr=amt_f,
                        notes=f"MPCA custom head ₹{amt_f:,.0f}",
                    ))
            total = round(sum(h.limit_inr for h in head_allocs), 2)

            body = await db.bodies.find_one({"code": body_code}, {"_id": 0})
            pool_suffix = f" · {pool_name}" if pool_id else ""
            tb = TournamentBudget(
                budget_no=await _next_budget_no(cycle),
                tournament_id=tid,
                tournament_name=t.get("name"),
                body_id=body_code,
                body_name=(body or {}).get("name", body_code),
                fiscal_cycle=cycle,
                head_allocations=[h.model_dump() for h in head_allocs],
                total_ceiling_inr=total,
                status="Draft",
                notes=(f"MPCA prepared{pool_suffix} · {role} allocation · "
                       f"{scheme_code} · {len(head_allocs)} heads · ₹{total:,.0f}"),
                participant_body_code=body_code,
                input_variables_snapshot=ivs_for_pool,
                prepared_by_name=payload.prepared_by_name,
                role_flavour="Host" if role == "Host" else "Visitor",
                pool_id=pool_id,
                pool_name=pool_name if pool_id else None,
            )
            await db.tournament_budgets.insert_one(tb.model_dump())
            try:
                from routes.tournament_participations import link_budget_to_participant
                await link_budget_to_participant(tid, body_code, tb.id)
            except Exception:  # noqa
                pass
            created.append({
                "budget_id": tb.id, "budget_no": tb.budget_no,
                "body_code": body_code, "role": role,
                "pool_id": pool_id, "pool_name": pool_name,
                "total_inr": total, "heads_count": len(head_allocs),
            })

    return {
        "tournament_id": tid, "scheme_code": scheme_code,
        "pool_count": len(pools_map), "multi_pool": len([k for k in pools_map if k]) > 1,
        "created": created, "replaced": replaced, "skipped": skipped,
        "created_count": len(created), "replaced_count": len(replaced),
        "skipped_count": len(skipped),
    }


# ─────────────────── MPCA-226 · Unified-Budget Prepare ───────────────────
# Deprecates legacy 2-B / 2-D scheme calculators for tournament types that
# have a Unified Budget rate card. Reads by_body_totals + head_allocations
# from the unified snapshot (or computes it live) and materialises one
# TournamentBudget draft per body — same downstream flow (send / accept /
# revise), just with math coming from the Unified Budget engine instead of
# scheme_calc.
UNIFIED_TOURNAMENT_TYPES = {
    "Inter_Divisional", "Inter_District", "BCCI",
    "Championship", "Pre_Tournament_Camp",
}


class PrepareUnifiedPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    prepared_by_name: Optional[str] = None
    per_body_head_overrides: Optional[Dict[str, Dict[str, float]]] = None


@api_router.post("/tournaments/{tid}/finance/prepare-budgets-unified")
async def prepare_budgets_unified(tid: str, payload: PrepareUnifiedPayload):
    """MPCA-226 · One TournamentBudget draft per body sourced from the
    Unified Budget engine (owner-attributed by_body_totals + head_allocations).
    Replaces the legacy scheme-based `prepare_budgets` for tournament types
    covered by a rate card (Inter_Divisional / Inter_District / BCCI /
    Championship / Pre_Tournament_Camp). Existing live budgets (Sent/Accepted/
    Approved) are preserved; Draft / Revision_Requested rows are replaced."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if t.get("scope") not in UNIFIED_TOURNAMENT_TYPES:
        raise HTTPException(400, f"Tournament scope {t.get('scope')!r} is not covered by the Unified Budget. Use the legacy scheme-based prepare-budgets instead.")

    # Compute (or use locked snapshot) — never override a locked snapshot's math
    snap = t.get("unified_budget_snapshot") or {}
    if snap.get("is_locked"):
        source = f"locked-v{snap.get('locked_version')}"
        budget = snap.get("budget") or {}
    else:
        # Live compute — same code path as the compute endpoint (with travel merge)
        from routes.unified_budget import (
            compute_tournament_budget, compute_travel_grant,
            _load_rate_card_for_tournament,
        )
        setup_meta = t.get("setup_meta") or {}
        pools = list(setup_meta.get("division_pools") or []) + list(setup_meta.get("district_pools") or [])
        matches: List[Dict[str, Any]] = []
        async for m in db.tournament_matches.find({"tournament_id": tid}, {"_id": 0}):
            matches.append(m)
        async for f in db.fixtures.find({"tournament_id": tid}, {"_id": 0}):
            matches.append(f)
        card = await _load_rate_card_for_tournament(t)
        default_squad = int(t.get("max_squad_size") or 18)
        budget = compute_tournament_budget(matches, pools, card, default_squad=default_squad)
        travel = compute_travel_grant(matches, pools, card, default_squad=default_squad, trip_overrides=t.get("trip_overrides") or {})
        # Merge travel per (body,pool) + synthetic head allocation
        body_map = {f"{b['body_code']}|{b.get('pool_id') or ''}": b for b in budget.get("by_body_totals") or []}
        for tr in (travel.get("trips") or []):
            code = tr.get("division")
            pool_id = tr.get("pool_id")
            pool_name = tr.get("pool_name")
            amt = float(tr.get("total", 0) or 0)
            rk = f"{code}|{pool_id or ''}"
            row = body_map.get(rk) or {"body_code": code, "pool_id": pool_id, "pool_name": pool_name, "role": "Visitor", "budget": 0.0, "travel_grant": 0.0, "total": 0.0, "head_allocations": []}
            row["travel_grant"] = row.get("travel_grant", 0.0) + amt
            row["total"] = row.get("budget", 0.0) + row.get("travel_grant", 0.0)
            allocs = list(row.get("head_allocations") or [])
            if amt > 0 and not any(a.get("head_key") == "travel_grant" for a in allocs):
                allocs.append({"head_key": "travel_grant", "head": "Travel Grant", "owner": "Visitor", "limit_inr": amt})
            row["head_allocations"] = allocs
            body_map[rk] = row
        budget["by_body_totals"] = list(body_map.values())
        source = "live"

    by_body = budget.get("by_body_totals") or []
    if not by_body:
        raise HTTPException(400, "Unified budget produced no per-body allocations. Ensure the Match Calendar has fixtures with pool + host + teams set.")

    cycle = t.get("fiscal_cycle") or "2025-26"
    created: List[Dict[str, Any]] = []
    replaced: List[Dict[str, Any]] = []
    skipped: List[Dict[str, Any]] = []

    for row in by_body:
        body_code = row.get("body_code")
        pool_id = row.get("pool_id")
        pool_name = row.get("pool_name") or ""
        role = row.get("role") or ("Host" if float(row.get("budget", 0)) >= float(row.get("travel_grant", 0)) else "Visitor")
        if not body_code:
            continue
        # Skip MPCA — it's the sanctioning authority, not a claimant
        if body_code == "MPCA":
            skipped.append({"body_code": body_code, "reason": "MPCA is sanctioner (Common heads stay on state books)"})
            continue

        allocs = list(row.get("head_allocations") or [])
        if not allocs:
            skipped.append({"body_code": body_code, "pool_id": pool_id, "reason": "no head allocations"})
            continue

        # MPCA-237 · Dedup existing budgets for this (body,pool) — INCLUDING legacy
        # rows that pre-date pool_id storage (pool_id is null). Otherwise a legacy
        # Approved row + a fresh Draft would both persist as phantom duplicates.
        live_q: Dict[str, Any] = {
            "tournament_id": tid,
            "body_id": body_code,
            "fiscal_cycle": cycle,
            "status": {"$in": ["Submitted", "Approved", "Sent_To_Division", "Accepted_By_Division"]},
        }
        if pool_id:
            live_q["$or"] = [{"pool_id": pool_id}, {"pool_id": {"$in": [None, ""]}}]
        live = await db.tournament_budgets.find_one(live_q, {"_id": 0})
        if live:
            skipped.append({
                "body_code": body_code,
                "pool_id": pool_id,
                "budget_no": live.get("budget_no"),
                "reason": f"already {live.get('status')}",
            })
            continue

        # Replace any Draft / Revision_Requested / Returned rows for this (body,pool)
        # + legacy pool_id-less siblings.
        draft_q: Dict[str, Any] = {
            "tournament_id": tid,
            "body_id": body_code,
            "fiscal_cycle": cycle,
            "status": {"$in": ["Draft", "Revision_Requested", "Returned"]},
        }
        if pool_id:
            draft_q["$or"] = [{"pool_id": pool_id}, {"pool_id": {"$in": [None, ""]}}]
        old_draft = await db.tournament_budgets.find_one(draft_q, {"_id": 0})
        if old_draft:
            await db.tournament_budgets.delete_one({"id": old_draft["id"]})
            replaced.append({"body_code": body_code, "pool_id": pool_id, "budget_no": old_draft.get("budget_no")})

        head_allocs = [BudgetHeadAllocation(
            head=a["head"], limit_inr=float(a["limit_inr"]),
            notes=f"{a.get('owner', 'Common')} owner · Unified Budget {source}",
        ) for a in allocs if float(a.get("limit_inr", 0)) > 0]

        # MPCA per-body head overrides
        body_overrides = ((payload.per_body_head_overrides or {}).get(body_code) or {})
        if body_overrides:
            existing = {h.head for h in head_allocs}
            for h in head_allocs:
                if h.head in body_overrides:
                    try:
                        new_amt = float(body_overrides[h.head])
                        h.notes = (h.notes or "") + f" · MPCA override ₹{new_amt:,.0f}"
                        h.limit_inr = new_amt
                    except (TypeError, ValueError):
                        pass
            for label, amt in body_overrides.items():
                if label in existing:
                    continue
                try:
                    amt_f = float(amt)
                    if amt_f <= 0:
                        continue
                except (TypeError, ValueError):
                    continue
                head_allocs.append(BudgetHeadAllocation(
                    head=label, limit_inr=amt_f,
                    notes=f"MPCA custom head ₹{amt_f:,.0f}",
                ))

        total = round(sum(h.limit_inr for h in head_allocs), 2)
        body = await db.bodies.find_one({"code": body_code}, {"_id": 0})

        tb = TournamentBudget(
            budget_no=await _next_budget_no(cycle),
            tournament_id=tid,
            tournament_name=t.get("name"),
            body_id=body_code,
            body_name=(body or {}).get("name", body_code),
            fiscal_cycle=cycle,
            pool_id=pool_id,
            pool_name=pool_name,
            head_allocations=[h.model_dump() for h in head_allocs],
            total_ceiling_inr=total,
            status="Draft",
            notes=(f"MPCA prepared · Unified Budget {source} · {role} allocation · "
                   f"Pool: {pool_name or '—'} · {len(head_allocs)} heads · ₹{total:,.0f}"),
            participant_body_code=body_code,
            prepared_by_name=payload.prepared_by_name,
            role_flavour=role,
        )
        await db.tournament_budgets.insert_one(tb.model_dump())
        try:
            from routes.tournament_participations import link_budget_to_participant
            await link_budget_to_participant(tid, body_code, tb.id)
        except Exception:  # noqa
            pass
        created.append({
            "budget_id": tb.id, "budget_no": tb.budget_no,
            "body_code": body_code, "role": role,
            "pool_id": pool_id, "pool_name": pool_name,
            "total_inr": total, "heads_count": len(head_allocs),
        })

    return {
        "tournament_id": tid,
        "source": source,
        "engine": "unified_budget",
        "created": created, "replaced": replaced, "skipped": skipped,
        "created_count": len(created), "replaced_count": len(replaced),
        "skipped_count": len(skipped),
    }


@api_router.post("/tournaments/{tid}/finance/send-budgets")
async def send_budgets(tid: str, payload: SendPayload):
    """MPCA flips prepared Drafts to Sent_To_Division. Also handles the
    'send-again' case for Revision_Requested rows."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    q: Dict[str, Any] = {
        "tournament_id": tid,
        "status": {"$in": ["Draft", "Revision_Requested"]},
    }
    if payload.only_budget_ids:
        q["id"] = {"$in": payload.only_budget_ids}
    docs = await db.tournament_budgets.find(q, {"_id": 0}).to_list(500)
    if not docs:
        raise HTTPException(400, "No draft budgets to send. Prepare budgets first.")

    now = datetime.now(timezone.utc).isoformat()
    sent: List[Dict[str, Any]] = []
    for d in docs:
        step = ApprovalStep(
            stage="Sent_To_Division",
            actor_post=payload.actor_post or "MPCA_Secretary",
            actor_name=payload.actor_name,
            actor_body_id="MPCA",
            decision="Submitted",
            notes=(f"Prepared ₹{d.get('total_ceiling_inr', 0):,.0f} for "
                   f"{d.get('body_id')} — awaiting Division acceptance."),
        )
        upd = _append_chain(d, step, "Sent_To_Division")
        upd["sent_at"] = now
        await db.tournament_budgets.update_one({"id": d["id"]}, {"$set": upd})
        sent.append({
            "budget_id": d["id"], "budget_no": d.get("budget_no"),
            "body_code": d.get("body_id"), "total_inr": d.get("total_ceiling_inr"),
        })
        # Notify the Division
        await _push_notification(
            recipient_body_id=d["body_id"],
            recipient_role_id="secretary",
            title=f"Budget received · {t.get('name')}",
            message=(f"MPCA has sent ₹{d.get('total_ceiling_inr', 0):,.0f} "
                     f"for your acceptance. Open Action Centre to accept or "
                     f"request revision."),
            link=f"/tournament-budgets/{d['id']}",
            related_type="tournament_budget", related_id=d["id"],
            severity="info", kind="info",
        )

    return {
        "tournament_id": tid, "sent": sent, "sent_count": len(sent),
    }


@api_router.post("/tournament-budgets/{bid}/division-accept", response_model=TournamentBudget)
async def division_accept(bid: str, payload: DivisionAcceptPayload,
                          x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code")):
    """Division taps Accept on the MPCA-sent budget.

    M39z · Since MPCA authored the budget in the first place, a separate
    MPCA sanction step adds friction with no signal. Division acceptance
    now transitions **directly to Approved** (terminal): the proposed
    total & head allocations are copied into the approved fields, and
    spending unlocks immediately."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Budget not found")
    if doc["status"] != "Sent_To_Division":
        raise HTTPException(409, f"Cannot accept a budget in status '{doc['status']}'. Only Sent_To_Division is acceptable.")

    # Scope guard: only the target Division (or MPCA on behalf) may accept
    body_id = doc.get("body_id")
    if x_user_body_code and x_user_body_code not in (body_id, "MPCA"):
        raise HTTPException(403, f"Only {body_id} can accept this budget.")

    now = datetime.now(timezone.utc).isoformat()
    proposed_total = float(doc.get("total_ceiling_inr") or 0)
    proposed_heads = list(doc.get("head_allocations") or [])

    step = ApprovalStep(
        stage="Approved",
        actor_post=payload.actor_post or "Division_Secretary",
        actor_name=payload.actor_name,
        actor_body_id=payload.actor_body_id or body_id,
        decision="Sanctioned",
        notes=(payload.notes or
               f"Accepted by {body_id} · auto-sanctioned ₹{proposed_total:,.0f}."),
    )
    upd = _append_chain(doc, step, "Approved")
    upd["division_accepted_by"] = payload.actor_name
    upd["division_accepted_at"] = now
    # Auto-sanction: copy proposed → approved
    upd["approved_total_inr"] = proposed_total
    upd["approved_head_allocations"] = proposed_heads
    upd["sanctioned_by"] = payload.actor_name
    upd["sanctioned_at"] = now
    await db.tournament_budgets.update_one({"id": bid}, {"$set": upd})

    # Notify Division — budget is now sanctioned & spending unlocked
    await _push_notification(
        recipient_body_id=body_id,
        recipient_role_id="secretary",
        title=f"Budget SANCTIONED · {doc.get('tournament_name')}",
        message=(f"₹{proposed_total:,.0f} sanctioned on your acceptance. "
                 f"You may now upload invoices and DA/TA claims."),
        link=f"/tournament-budgets/{bid}",
        related_type="tournament_budget", related_id=bid,
        severity="info", kind="info",
    )
    # Also inform MPCA for record-keeping
    await _push_notification(
        recipient_body_id="MPCA",
        recipient_role_id="secretary",
        title=f"Budget accepted & sanctioned · {body_id}",
        message=(f"{doc.get('body_name') or body_id} accepted the budget for "
                 f"'{doc.get('tournament_name')}' — auto-sanctioned ₹{proposed_total:,.0f}."),
        link=f"/tournament-budgets/{bid}",
        related_type="tournament_budget", related_id=bid,
        severity="info", kind="info",
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


@api_router.post("/tournament-budgets/{bid}/request-revision", response_model=TournamentBudget)
async def request_revision(bid: str, payload: RevisionPayload,
                           x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code")):
    """Division asks MPCA to revise the sent budget."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Budget not found")
    if doc["status"] != "Sent_To_Division":
        raise HTTPException(409, f"Cannot request revision on a budget in status '{doc['status']}'.")
    body_id = doc.get("body_id")
    if x_user_body_code and x_user_body_code not in (body_id, "MPCA"):
        raise HTTPException(403, f"Only {body_id} can request revision on this budget.")

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Revision_Requested",
        actor_post=payload.actor_post or "Division_Secretary",
        actor_name=payload.actor_name,
        actor_body_id=payload.actor_body_id or body_id,
        decision="Returned",
        notes=payload.reason,
    )
    upd = _append_chain(doc, step, "Revision_Requested")
    upd["revision_requested_by"] = payload.actor_name
    upd["revision_requested_at"] = now
    upd["revision_reason"] = payload.reason
    await db.tournament_budgets.update_one({"id": bid}, {"$set": upd})

    await _push_notification(
        recipient_body_id="MPCA",
        recipient_role_id="secretary",
        title=f"Budget revision requested · {body_id}",
        message=f"{doc.get('body_name') or body_id}: {payload.reason[:180]}",
        link=f"/tournament-budgets/{bid}",
        related_type="tournament_budget", related_id=bid,
        severity="warning", kind="warning",
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


@api_router.post("/tournament-budgets/{bid}/sanction", response_model=TournamentBudget)
async def sanction(bid: str, payload: SanctionPayload):
    """MPCA final sanction. Terminal state — spending unlocks."""
    doc = await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Budget not found")
    if doc["status"] != "Accepted_By_Division":
        raise HTTPException(409, f"Cannot sanction a budget in status '{doc['status']}'. Division must accept first.")

    approved_total = (payload.approved_total_inr if payload.approved_total_inr is not None
                      else doc["total_ceiling_inr"])
    if approved_total > doc["total_ceiling_inr"]:
        raise HTTPException(422, "Approved total cannot exceed proposed total.")

    approved_heads = payload.approved_head_allocations
    if approved_heads is None:
        approved_heads = [BudgetHeadAllocation(**h) for h in (doc.get("head_allocations") or [])]
    head_sum = sum(h.limit_inr for h in approved_heads)
    if head_sum > approved_total:
        raise HTTPException(422, f"Head limits (₹{head_sum:,.0f}) exceed approved total (₹{approved_total:,.0f}).")

    now = datetime.now(timezone.utc).isoformat()
    step = ApprovalStep(
        stage="Approved",
        actor_post=payload.actor_post or "MPCA_Secretary",
        actor_name=payload.actor_name,
        actor_body_id=payload.actor_body_id,
        decision="Sanctioned",
        notes=payload.notes or f"Sanctioned ₹{approved_total:,.0f}.",
    )
    upd = _append_chain(doc, step, "Approved")
    upd["approved_total_inr"] = float(approved_total)
    upd["approved_head_allocations"] = [h.model_dump() for h in approved_heads]
    upd["sanctioned_by"] = payload.actor_name
    upd["sanctioned_at"] = now
    await db.tournament_budgets.update_one({"id": bid}, {"$set": upd})

    await _push_notification(
        recipient_body_id=doc["body_id"],
        recipient_role_id="secretary",
        title=f"Budget SANCTIONED · {doc.get('tournament_name')}",
        message=f"₹{approved_total:,.0f} approved by MPCA. You may now upload invoices.",
        link=f"/tournament-budgets/{bid}",
        related_type="tournament_budget", related_id=bid,
        severity="info", kind="info",
    )
    return await db.tournament_budgets.find_one({"id": bid}, {"_id": 0})


# ─────────────────────── Status matrix (per-tournament) ───────────────────────

@api_router.get("/tournaments/{tid}/finance/matrix")
async def finance_matrix(
    tid: str,
    x_body_code: Optional[str] = Header(None, alias="X-Body-Code"),
    x_body_type: Optional[str] = Header(None, alias="X-Body-Type"),
):
    """One-row-per-body matrix for the MPCA console. Renders:
       body · role · budget_status · totals · division response · MPCA action ·
       spending totals · claim status.

       M39r+ · Privacy scoping — Divisions/Districts see ONLY their own row.
       Only MPCA (State) sees the full multi-body pipeline."""
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")

    # ── Scope guard ───────────────────────────────────────────────
    # M39z.g / M39z.h · Grant State-equivalent view rights to:
    #   · MPCA (State)
    #   · The host body itself (Division or District running the tournament)
    #   · The parent Division of a District host (Divisions supervise their
    #     Districts' tournaments)
    host_body_id = t.get("host_body_id") or "MPCA"
    body_code = (x_body_code or "")
    is_host = bool(body_code) and body_code == host_body_id
    is_parent_div_of_host_dist = (
        body_code.startswith("DIV-")
        and host_body_id.startswith("DIST-")
        and host_body_id.endswith(f"-{body_code[-3:]}")
    )
    # MPCA-243 · Ship 1 · Wiring-aware finance owner elevation. If the wiring
    # says `finance_console.owner == "Division"` and the caller's body_type
    # is Division (or their district lies under this Division), grant the
    # State-equivalent aggregate view — matches user's intent that Divisions
    # own the finance console for District/School/Club/Camp tournaments.
    is_wiring_owner = False
    try:
        from core.wiring_guard import resolve_wiring_cell, _OWNER_TO_BODY_TYPES
        fc_cell = await resolve_wiring_cell(tid, "finance_console")
        fc_owner = (fc_cell or {}).get("owner")
        if fc_owner and (x_body_type or "") in _OWNER_TO_BODY_TYPES.get(fc_owner, set()):
            is_wiring_owner = True
    except Exception:
        pass
    is_state = (
        (x_body_type or "").lower() == "state"
        or body_code.upper() == "MPCA"
        or is_host
        or is_parent_div_of_host_dist
        or is_wiring_owner
    )
    parts_query: Dict[str, Any] = {"tournament_id": tid, "removed_at": None}
    if not is_state and x_body_code:
        parts_query["body_code"] = x_body_code
    parts = await db.tournament_participations.find(parts_query, {"_id": 0}).to_list(500)

    rows: List[Dict[str, Any]] = []
    for p in parts:
        body_code = p.get("body_code")
        role = p.get("role", "Visitor")
        body = await db.bodies.find_one({"code": body_code}, {"_id": 0})

        # Prefer a budget matching this participation's pool
        pool_id = p.get("pool_id")
        budget = await db.tournament_budgets.find_one(
            {"tournament_id": tid, "body_id": body_code, "pool_id": pool_id},
            {"_id": 0}, sort=[("created_at", -1)],
        )
        if not budget:
            # Fallback for single-pool tournaments or legacy budgets without pool_id
            budget = await db.tournament_budgets.find_one(
                {"tournament_id": tid, "body_id": body_code},
                {"_id": 0}, sort=[("created_at", -1)],
            )

        # Spending: sum invoices + extras + DA (approved/submitted)
        inv_agg = await db.tournament_invoices.aggregate([
            {"$match": {
                "tournament_id": tid, "body_id": body_code,
                "status": {"$in": ["Approved", "Submitted"]},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$total_inr"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        inv_total = float((inv_agg[0].get("total") if inv_agg else 0) or 0)
        inv_count = int((inv_agg[0].get("count") if inv_agg else 0) or 0)

        extras_agg = await db.extra_expense_requests.aggregate([
            {"$match": {
                "tournament_id": tid, "body_id": body_code, "status": "Approved",
            }},
            {"$group": {"_id": None, "total": {"$sum": "$approved_amount_inr"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        extras_total = float((extras_agg[0].get("total") if extras_agg else 0) or 0)

        da_agg = await db.match_official_da.aggregate([
            {"$match": {
                "tournament_id": tid, "status": "Approved",
            }},
            {"$group": {"_id": None, "total": {"$sum": "$total_inr"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        # DA totals belong to the host by convention, but reflect on all rows as info
        da_total = float((da_agg[0].get("total") if da_agg else 0) or 0)

        # Reimbursement claim
        claim = await db.tournament_reimbursement_claims.find_one(
            {"tournament_id": tid, "body_id": body_code},
            {"_id": 0}, sort=[("created_at", -1)],
        )

        rows.append({
            "body_code": body_code,
            "body_name": (body or {}).get("name", body_code),
            "role": role,
            "pool_id": p.get("pool_id"),                    # M39s
            "pool_name": p.get("pool_name"),                # M39s
            "iv_set": bool(t.get("input_variables") or (t.get("pool_input_variables") or {}).get(p.get("pool_id"))),
            "budget_id": (budget or {}).get("id"),
            "budget_no": (budget or {}).get("budget_no"),
            "budget_status": (budget or {}).get("status"),
            "budget_total_inr": float((budget or {}).get("total_ceiling_inr") or 0),
            "approved_total_inr": (budget or {}).get("approved_total_inr"),
            "sent_at": (budget or {}).get("sent_at"),
            "division_accepted_at": (budget or {}).get("division_accepted_at"),
            "revision_reason": (budget or {}).get("revision_reason"),
            "sanctioned_at": (budget or {}).get("sanctioned_at"),
            "role_flavour": (budget or {}).get("role_flavour"),
            "invoice_count": inv_count,
            "invoice_total_inr": inv_total,
            "extras_total_inr": extras_total,
            "da_total_inr": da_total if role == "Host" else 0.0,
            "claim_id": (claim or {}).get("id"),
            "claim_ref": (claim or {}).get("claim_ref"),
            "claim_status": (claim or {}).get("status"),
            "claim_approved_inr": (claim or {}).get("approved_amount_inr"),
            # Derived hint for the UI: what should this row's owner do next?
            "next_action_for": _next_action_hint((budget or {}), (claim or {}), role),
        })

    # M39s · Build a pools summary so the UI can group + iterate
    pools_summary: List[Dict[str, Any]] = []
    seen_pools: set = set()
    for r in rows:
        pid = r.get("pool_id")
        if pid in seen_pools:
            continue
        seen_pools.add(pid)
        pool_rows = [x for x in rows if x.get("pool_id") == pid]
        host_row = next((x for x in pool_rows if x.get("role") == "Host"), None)
        pools_summary.append({
            "pool_id": pid,
            "pool_name": (host_row or pool_rows[0]).get("pool_name") if pool_rows else "Main",
            "host_body_code": (host_row or {}).get("body_code"),
            "host_body_name": (host_row or {}).get("body_name"),
            "member_count": len(pool_rows),
            "budget_total_inr": sum(x.get("budget_total_inr", 0) for x in pool_rows),
            "approved_total_inr": sum(x.get("approved_total_inr", 0) or 0 for x in pool_rows),
        })
    multi_pool = len([p for p in pools_summary if p["pool_id"]]) > 1

    # MPCA-243 · Ship 3 · Visibility timing enforcement.
    # If the wiring says finance_console.visibility == "On_Submit" AND the
    # caller is the observing State persona (not the wiring owner), the
    # detailed spend rows are HIDDEN until each body actually submits its
    # reimbursement claim. Rows whose claim_status ∈ Submitted/Under_Review/
    # Approved/Rejected remain visible; the rest are redacted with a hint.
    on_submit_gated = False
    try:
        from core.wiring_guard import resolve_wiring_cell, _OWNER_TO_BODY_TYPES
        _fc_cell = await resolve_wiring_cell(tid, "finance_console")
        _visibility = (_fc_cell or {}).get("visibility")
        _fc_owner = (_fc_cell or {}).get("owner")
        _caller_in_owner = (x_body_type or "") in _OWNER_TO_BODY_TYPES.get(_fc_owner or "", set())
        # Only redact when caller is State AND is NOT the wiring owner.
        if _visibility == "On_Submit" and (x_body_type or "").lower() == "state" and not _caller_in_owner:
            on_submit_gated = True
    except Exception:
        pass
    _SUBMITTED_STATUSES = {"Submitted", "Under_Review", "Approved", "Rejected"}
    if on_submit_gated:
        redacted_rows = []
        for r in rows:
            if (r.get("claim_status") or "") in _SUBMITTED_STATUSES:
                redacted_rows.append(r)
            else:
                # Preserve identity + role so MPCA can see who exists, but
                # zero-out the financials until the body submits.
                redacted_rows.append({
                    "body_code": r["body_code"],
                    "body_name": r["body_name"],
                    "role": r["role"],
                    "pool_id": r.get("pool_id"),
                    "pool_name": r.get("pool_name"),
                    "iv_set": r.get("iv_set"),
                    "budget_status": "Hidden_Until_Submit",
                    "budget_total_inr": 0, "approved_total_inr": None,
                    "invoice_count": 0, "invoice_total_inr": 0,
                    "extras_total_inr": 0, "da_total_inr": 0,
                    "claim_status": None,
                    "next_action_for": {"role": r["role"], "hint": "Awaiting body submission (On_Submit visibility)"},
                    "_redacted": True,
                })
        rows = redacted_rows
        # Also zero pool totals so the aggregate view doesn't leak
        for ps in pools_summary:
            ps["budget_total_inr"] = sum(x.get("budget_total_inr", 0) for x in rows if x.get("pool_id") == ps["pool_id"])
            ps["approved_total_inr"] = sum((x.get("approved_total_inr") or 0) for x in rows if x.get("pool_id") == ps["pool_id"])

    return {
        "tournament_id": tid,
        "tournament_name": t.get("name"),
        "scheme_code": t.get("scheme_code"),
        "fiscal_cycle": t.get("fiscal_cycle") or "2025-26",
        "input_variables": (t.get("input_variables") or {}) if is_state else {},
        "pool_input_variables": (t.get("pool_input_variables") or {}) if is_state else {},
        "input_vars_set": bool(t.get("input_variables") or t.get("pool_input_variables")),
        "pools": pools_summary,
        "multi_pool": multi_pool,
        "rows": rows,
        "row_count": len(rows),
        "viewer_scope": "state" if is_state else "body",
        "viewer_body_code": x_body_code if not is_state else None,
        "visibility_gated": on_submit_gated,
    }


def _next_action_hint(budget: dict, claim: dict, role: str) -> Dict[str, str]:
    """Returns {waiting_on, action} — a UI-friendly cue for who needs to act."""
    bs = (budget or {}).get("status")
    if not budget:
        return {"waiting_on": "MPCA", "action": "Prepare budget"}
    if bs == "Draft":
        return {"waiting_on": "MPCA", "action": "Send to Division"}
    if bs == "Sent_To_Division":
        return {"waiting_on": (budget or {}).get("body_id", "Division"),
                "action": "Accept / Request revision"}
    if bs == "Revision_Requested":
        return {"waiting_on": "MPCA", "action": "Revise & re-send"}
    if bs == "Accepted_By_Division":
        return {"waiting_on": "MPCA", "action": "Final sanction"}
    if bs in ("Approved",):
        # After sanction, look at claim
        cs = (claim or {}).get("status")
        if not claim:
            return {"waiting_on": (budget or {}).get("body_id", "Division"),
                    "action": "Upload invoices"}
        if cs in ("Draft", "Rejected"):
            return {"waiting_on": (budget or {}).get("body_id", "Division"),
                    "action": "Submit reimbursement claim"}
        if cs == "Submitted":
            return {"waiting_on": "MPCA", "action": "Review claim"}
        if cs == "Under_Review":
            return {"waiting_on": "MPCA", "action": "Approve / Reject claim"}
        if cs == "Approved":
            return {"waiting_on": "MPCA", "action": "Disburse & record receipt"}
    if bs == "Rejected":
        return {"waiting_on": "MPCA", "action": "Re-prepare"}
    return {"waiting_on": "MPCA", "action": "Review"}
