"""Routes · Sprint M13-C — AI Squad Recommendation + KYC Gap Analysis.

Deterministic + optional Gemini second-opinion. Compares a Division-submitted
squad vs the algorithm-picked best-XV for the tournament's age-group + format,
flags KYC/document gaps, and detects district selection bias.

Exposed
───────
    GET  /api/squads/{sid}/recommendation           deterministic verdict
    POST /api/squads/{sid}/ai-second-opinion        Gemini second opinion (merged verdict)

Verdict shape
─────────────
    {
      selected: [ {player, score, kyc_gaps: [...], flags:[]} ],
      recommended: [ {player, score, reason} ],
      overlap_pct: float,
      kyc_gaps_total: int,
      bias: { top_body: str, top_body_pct: float, warning: str? },
      role_mix: { batters: n, all_rounders: n, keepers: n, pace: n, spin: n },
      quality_score: float,             # 0-100
      ai_notes: [str, ...]
    }
"""
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from collections import Counter
from fastapi import HTTPException

from core.infra import db, api_router
from core.helpers import _create_notification


# ─────────────── Scoring ───────────────

def _player_score(p: dict) -> float:
    """0-100 composite score using selection_meta if present."""
    meta = p.get("selection_meta") or {}
    stats = meta.get("stats") or {}
    yo_yo = float(meta.get("yo_yo") or 0)
    # Form last 5 innings — use mean of fc last-5 batting or bowling ratings
    form = meta.get("form_last_5") or {}
    form_avg = 0.0
    fc = form.get("fc")
    if isinstance(fc, list) and fc:
        # Each fc row: [runs, balls, avg, sr, wickets, econ, ...]
        vals = [r[0] if isinstance(r, list) and r else 0 for r in fc[:5]]
        form_avg = sum(vals) / max(len(vals), 1)
    # Stats — first-class average / bowler wickets
    fc_stats = stats.get("fc") or []
    matches = fc_stats[0] if fc_stats else 0
    bat_avg = fc_stats[3] if len(fc_stats) > 3 else 0
    strike_rate = fc_stats[4] if len(fc_stats) > 4 else 0
    wickets = fc_stats[9] if len(fc_stats) > 9 else 0

    kyc_ok = bool((meta.get("compliance") or {}).get("age_verified") and
                  (meta.get("compliance") or {}).get("noc_ok") and
                  (meta.get("compliance") or {}).get("anti_doping_ok"))
    availability_ok = (meta.get("availability") or "Available").lower() == "available"

    # Weighted composite (0-100)
    yo_yo_norm = min(yo_yo / 20.0, 1.0) * 100        # yo-yo 20+ = full marks
    form_norm = min(form_avg / 100.0, 1.0) * 100     # 100+ runs avg last-5 = full
    stats_norm = min((matches * 2 + bat_avg + wickets * 3) / 200.0, 1.0) * 100
    kyc_bonus = 100 if kyc_ok else 40
    avail_bonus = 100 if availability_ok else 20

    return round(yo_yo_norm * 0.25 + form_norm * 0.30 + stats_norm * 0.25 +
                 kyc_bonus * 0.15 + avail_bonus * 0.05, 1)


def _kyc_gaps(p: dict) -> List[str]:
    gaps = []
    meta = p.get("selection_meta") or {}
    comp = meta.get("compliance") or {}
    if not comp.get("age_verified", True):
        gaps.append("Age proof pending")
    if not comp.get("noc_ok", True):
        gaps.append("Employer NOC pending")
    if not comp.get("anti_doping_ok", True):
        gaps.append("Anti-doping form missing")
    if p.get("court_order_flag"):
        gaps.append("⚠ Court order flag active")
    if (p.get("disqualification_count") or 0) > 0:
        gaps.append(f"{p['disqualification_count']} active disqualification(s)")
    if p.get("status") not in ("Active", "Division_Approved", None):
        gaps.append(f"Status: {p.get('status')}")
    docs = p.get("documents") or []
    required = {"AGE_PROOF", "PHOTO_ID", "MEDICAL_CERT"}
    have = {d.get("doc_type") for d in docs}
    missing = required - have
    for m in missing:
        gaps.append(f"Missing doc: {m.replace('_', ' ').title()}")
    return gaps


def _classify_role(p: dict) -> str:
    role = p.get("role") or "Batter"
    style = (p.get("bowling_style") or "").lower()
    if role == "Wicket_Keeper":
        return "keeper"
    if role == "All_Rounder":
        return "all_rounder"
    if role == "Bowler":
        if "spin" in style or "chinaman" in style or "orthodox" in style:
            return "spin"
        return "pace"
    return "batter"


def _pool_recommendation(pool: List[dict], target_size: int = 15) -> List[dict]:
    """Deterministic XV pick with role balance:
    - 5-6 batters, 2 all-rounders, 1-2 keepers, 3 pace, 3 spin. Falls back to top-N by score
    if pool is too thin.
    """
    scored = [{**p, "_score": _player_score(p), "_role": _classify_role(p)} for p in pool]
    scored.sort(key=lambda x: x["_score"], reverse=True)

    quotas = {"batter": 6, "all_rounder": 2, "keeper": 2, "pace": 3, "spin": 2}
    picked = []
    role_counts: Counter = Counter()
    for p in scored:
        r = p["_role"]
        if role_counts[r] < quotas.get(r, 0) and len(picked) < target_size:
            picked.append(p)
            role_counts[r] += 1
    # Fill any remaining slots with next-best regardless of role
    if len(picked) < target_size:
        for p in scored:
            if p not in picked and len(picked) < target_size:
                picked.append(p)
    return picked


def _selection_bias(members_players: List[dict]) -> dict:
    bodies = [p.get("body_id") or "UNKNOWN" for p in members_players]
    if not bodies:
        return {}
    ctr = Counter(bodies)
    top_body, top_count = ctr.most_common(1)[0]
    pct = round(top_count * 100.0 / len(bodies), 1)
    warning = None
    if pct >= 70:
        warning = f"⚠ Selection bias: {pct}% of squad from a single body ({top_body}). Consider broader representation."
    return {"top_body": top_body, "top_body_pct": pct, "spread": dict(ctr), "warning": warning}


async def _get_squad(sid: str) -> dict:
    s = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Squad not found")
    return s


async def _fetch_players(pids: List[str]) -> List[dict]:
    if not pids:
        return []
    docs = await db.players.find({"id": {"$in": pids}}, {"_id": 0}).to_list(500)
    order = {pid: i for i, pid in enumerate(pids)}
    return sorted(docs, key=lambda x: order.get(x["id"], 9999))


async def _get_eligible_pool(tournament: dict, squad_body: str) -> List[dict]:
    """Pool = all players from same-or-child bodies of the squad's owning body,
    who meet the tournament's age-group eligibility."""
    # Simple pool: all players of same division suffix
    if squad_body.startswith("DIV-"):
        suffix = squad_body.replace("DIV-", "")
        q = {"$or": [{"body_id": squad_body}, {"body_id": {"$regex": f"^DIST-.+-{suffix}$"}}]}
    elif squad_body.startswith("DIST-"):
        q = {"body_id": squad_body}
    else:
        q = {}
    q["status"] = {"$in": ["Active", "Division_Approved"]}
    docs = await db.players.find(q, {"_id": 0}).to_list(2000)
    return docs


# ─────────────── Endpoint ───────────────

@api_router.get("/squads/{sid}/recommendation")
async def squad_recommendation(sid: str):
    """Deterministic AI recommendation comparing selected squad vs pool-best-XV,
    plus KYC gaps and selection bias."""
    squad = await _get_squad(sid)
    tournament = await db.tournaments.find_one({"id": squad["tournament_id"]}, {"_id": 0}) or {}

    selected_pids = [m.get("player_id") for m in (squad.get("members") or [])]
    selected_players = await _fetch_players(selected_pids)
    pool = await _get_eligible_pool(tournament, squad["body_id"])
    recommended = _pool_recommendation(pool, target_size=max(15, len(selected_pids) or 15))

    # Rich rows
    selected_rows = []
    kyc_gap_count = 0
    for p in selected_players:
        gaps = _kyc_gaps(p)
        kyc_gap_count += len(gaps)
        selected_rows.append({
            "player_id": p["id"],
            "full_name": p.get("full_name"),
            "role": p.get("role"),
            "body_id": p.get("body_id"),
            "player_display_id": p.get("player_display_id"),
            "score": _player_score(p),
            "kyc_gaps": gaps,
            "kyc_ok": len(gaps) == 0,
        })
    recommended_rows = [{
        "player_id": p["id"],
        "full_name": p.get("full_name"),
        "role": p.get("role"),
        "body_id": p.get("body_id"),
        "player_display_id": p.get("player_display_id"),
        "score": p.get("_score"),
        "role_bucket": p.get("_role"),
        "reason": _reason_line(p),
    } for p in recommended]

    selected_set = set(selected_pids)
    recommended_set = {r["player_id"] for r in recommended_rows}
    overlap = len(selected_set & recommended_set)
    overlap_pct = round(overlap * 100.0 / max(len(recommended_set), 1), 1)

    role_mix = Counter([_classify_role(p) for p in selected_players])

    bias = _selection_bias(selected_players)

    avg_selected_score = round(sum(r["score"] for r in selected_rows) / max(len(selected_rows), 1), 1)
    avg_recommended_score = round(sum(r["score"] or 0 for r in recommended_rows) / max(len(recommended_rows), 1), 1)
    quality_score = round((avg_selected_score / max(avg_recommended_score, 1)) * 100.0, 1)

    ai_notes = []
    if overlap_pct < 60:
        ai_notes.append(f"Only {overlap_pct}% overlap between Division's squad and the algorithm-picked best XV. Consider whether the missing recommended players were unavailable.")
    if kyc_gap_count > 0:
        ai_notes.append(f"{kyc_gap_count} KYC/document gap(s) across the squad — resolve before finalising.")
    if bias.get("warning"):
        ai_notes.append(bias["warning"])
    if role_mix.get("keeper", 0) == 0:
        ai_notes.append("⚠ No wicket-keeper in squad.")
    if role_mix.get("spin", 0) + role_mix.get("pace", 0) < 4:
        ai_notes.append("⚠ Bowling attack thin — fewer than 4 specialist bowlers.")

    # Sprint M15 · Overall PASS/FAIL verdict
    # Fail if: (a) KYC gaps present, (b) role mix broken, (c) severe bias, (d) very low quality
    critical_issues = []
    if kyc_gap_count > 0:
        critical_issues.append(f"{kyc_gap_count} KYC gap(s)")
    if role_mix.get("keeper", 0) == 0:
        critical_issues.append("no wicket-keeper")
    if role_mix.get("spin", 0) + role_mix.get("pace", 0) < 4:
        critical_issues.append("thin bowling attack")
    if bias.get("top_body_pct", 0) >= 85:
        critical_issues.append(f"severe body bias ({bias.get('top_body_pct')}%)")
    if quality_score < 70:
        critical_issues.append(f"quality score {quality_score} below 70")

    if not critical_issues:
        overall_verdict = "PASS"
        verdict_reason = "Squad meets all critical checks — KYC, role balance, quality, and body spread are all within acceptable thresholds."
    elif len(critical_issues) == 1 and kyc_gap_count > 0 and kyc_gap_count <= 5:
        overall_verdict = "PASS_WITH_REMARKS"
        verdict_reason = f"Minor KYC gaps ({kyc_gap_count}) — approve with a directive to resolve pending documents before departure."
    else:
        overall_verdict = "FAIL"
        verdict_reason = f"Squad has {len(critical_issues)} critical issue(s): {', '.join(critical_issues)}. Recommend Division to revise selection or provide clarifications."

    return {
        "squad_id": sid,
        "tournament_name": tournament.get("name"),
        "team_name": squad.get("team_name"),
        "selected": selected_rows,
        "recommended": recommended_rows,
        "overlap_pct": overlap_pct,
        "kyc_gaps_total": kyc_gap_count,
        "bias": bias,
        "role_mix": dict(role_mix),
        "quality_score": quality_score,
        "avg_selected_score": avg_selected_score,
        "avg_recommended_score": avg_recommended_score,
        "ai_notes": ai_notes,
        "overall_verdict": overall_verdict,
        "verdict_reason": verdict_reason,
        "critical_issues": critical_issues,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "algorithm": "deterministic_v1",
    }


def _reason_line(p: dict) -> str:
    meta = p.get("selection_meta") or {}
    stats = (meta.get("stats") or {}).get("fc") or []
    yo_yo = meta.get("yo_yo")
    bat_avg = stats[3] if len(stats) > 3 else 0
    wkts = stats[9] if len(stats) > 9 else 0
    parts = []
    if bat_avg:
        parts.append(f"FC avg {bat_avg:.1f}")
    if wkts:
        parts.append(f"{wkts} wkts")
    if yo_yo:
        parts.append(f"Yo-Yo {yo_yo}")
    parts.append(f"Score {p.get('_score')}")
    return " · ".join(parts)


@api_router.post("/squads/{sid}/ai-second-opinion")
async def ai_second_opinion(sid: str):
    """Optional Gemini second opinion — mixes deterministic + LLM verdicts."""
    verdict = await squad_recommendation(sid)
    # Fetch pool + selected
    try:
        import os
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            verdict["ai_second_opinion"] = {"error": "EMERGENT_LLM_KEY not configured"}
            return verdict
        prompt = f"""You are a senior MPCA selection panel advisor. Below is a Division-submitted squad and the algorithm-picked recommended XV for a tournament. Provide 3-4 crisp bullet observations (Hindi or English, whichever is clearer). Focus on: (a) player quality overlap, (b) role balance, (c) KYC/eligibility issues, (d) selection bias if any. Keep total under 100 words. No pleasantries.

TOURNAMENT: {verdict['tournament_name']}
QUALITY SCORE: {verdict['quality_score']}/100 (Selected vs Recommended avg score)
OVERLAP: {verdict['overlap_pct']}%
KYC GAPS: {verdict['kyc_gaps_total']}
BIAS: {verdict['bias'].get('warning') or 'No selection bias detected.'}
ROLE MIX: {verdict['role_mix']}
AI NOTES: {verdict['ai_notes']}

SELECTED SQUAD (top 5 by score): {[{'name': r['full_name'], 'role': r['role'], 'score': r['score'], 'kyc_ok': r['kyc_ok']} for r in verdict['selected'][:5]]}
RECOMMENDED XV (top 5): {[{'name': r['full_name'], 'role': r['role'], 'score': r['score']} for r in verdict['recommended'][:5]]}
"""
        chat = LlmChat(api_key=key, session_id=f"squad-review-{sid}", system_message="You are a concise MPCA cricket selection expert.")
        chat = chat.with_model("gemini", "gemini-2.5-flash")
        resp = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=45)  # H4
        verdict["ai_second_opinion"] = {
            "text": str(resp),
            "model": "gemini-2.5-flash",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        verdict["algorithm"] = "deterministic_v1 + gemini-2.5-flash"
    except Exception as e:
        verdict["ai_second_opinion"] = {"error": str(e)}
    return verdict


# ─────────────── Notification hook on squad submit ───────────────

@api_router.post("/squads/{sid}/notify-ai-review")
async def notify_ai_review(sid: str):
    """Called after Division submits squad for MPCA approval — sends the AI verdict
    summary as an in-app notification to MPCA Secretary."""
    verdict = await squad_recommendation(sid)
    summary_lines = [
        f"Quality: {verdict['quality_score']}/100",
        f"Overlap w/ AI XV: {verdict['overlap_pct']}%",
        f"KYC gaps: {verdict['kyc_gaps_total']}",
    ]
    if verdict["bias"].get("warning"):
        summary_lines.append(verdict["bias"]["warning"])
    await _create_notification(
        recipient_role_id="secretary", recipient_body_id="MPCA",
        title=f"Squad submitted · {verdict['team_name']} · {verdict['tournament_name']}",
        message=" · ".join(summary_lines),
        link=f"/squads/{sid}/review",
        related_type="squad", related_id=sid,
        severity="info", kind="info",
    )
    return {"notified": True, "verdict_summary": summary_lines}
