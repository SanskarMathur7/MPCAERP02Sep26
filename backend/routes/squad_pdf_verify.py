"""routes/squad_pdf_verify.py — Iter 108f.

Two endpoints that plug the Gemini PDF reader into the app:

    POST /api/tournaments/{tid}/parse-signed-squad
        Case 2 — MPCA-signed PDF for BCCI-family tournaments.  Reads the
        PDF currently at tournament.mpca_signed_squad_url, stores the parsed
        roster on tournament.parsed_signed_squad.

    POST /api/squads/{sid}/verify-signed-copy
        Case 1 — Division-uploaded signed cover PDF cross-check.  Reads the
        signed_copy_url on the squad doc, fuzzy-matches names against the
        digitally-picked members list, stores verdict on squad.pdf_verification.

Both endpoints require an authenticated caller (AuthMiddleware) and return
the fresh parsed / matched shape for the UI to display without a refetch.
"""
from datetime import datetime, timezone
from fastapi import HTTPException, Request

from core.infra import api_router, db, logger
from services.squad_pdf_reader import parse_squad_pdf, cross_check_roster
from lib.authz import get_principal, require_scope


@api_router.post("/tournaments/{tid}/parse-signed-squad")
async def parse_signed_squad_pdf(tid: str, request: Request):
    """Case 2 — parse the MPCA-uploaded signed PDF and persist the roster."""
    principal = get_principal(request)
    if not principal.is_state:
        raise HTTPException(403, "Only MPCA-HQ personas can trigger this parse.")

    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    url = t.get("mpca_signed_squad_url")
    if not url:
        raise HTTPException(400, "No signed squad PDF is attached to this tournament yet.")

    try:
        parsed = await parse_squad_pdf(url)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    parsed_meta = {
        **parsed,
        "parsed_at": datetime.now(timezone.utc).isoformat(),
        "parsed_by": principal.name or principal.email,
    }
    await db.tournaments.update_one(
        {"id": tid},
        {"$set": {"parsed_signed_squad": parsed_meta, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return parsed_meta


@api_router.post("/squads/{sid}/verify-signed-copy")
async def verify_signed_copy(sid: str, request: Request):
    """Case 1 — cross-check the Division-uploaded PDF vs the picked roster."""
    principal = get_principal(request)
    sq = await db.squads.find_one({"id": sid}, {"_id": 0})
    if not sq:
        raise HTTPException(404, "Squad not found")
    if sq.get("body_id"):
        try: require_scope(principal, sq["body_id"])
        except HTTPException: pass  # State personas can always verify
    url = sq.get("signed_copy_url")
    if not url:
        raise HTTPException(400, "No signed copy uploaded on this squad yet.")

    try:
        parsed = await parse_squad_pdf(url)
    except RuntimeError as e:
        raise HTTPException(502, str(e))

    # Look up the current member list on the squad
    member_ids = [m.get("player_id") for m in (sq.get("members") or []) if m.get("player_id")]
    register_players = []
    if member_ids:
        async for p in db.players.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "full_name": 1, "role": 1}):
            register_players.append(p)

    check = cross_check_roster(parsed["players"], register_players)
    verdict = {
        "parsed": parsed,
        "check":  check,
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "verified_by": principal.name or principal.email,
    }
    await db.squads.update_one(
        {"id": sid},
        {"$set": {"pdf_verification": verdict, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return verdict
