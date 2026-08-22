"""Tournament Player Eligibility Engine · Feb 2026

Given a player and a `tournament_master` row (with flattened eligibility
fields — see `scripts/flatten_interdiv_eligibility.py`), decide whether
the player is eligible to be nominated in the squad for that tournament.

Rules (order matters — first failing rule wins):
  1. Gender must match (`master.gender` in {Men, Women}). Player's `gender`
     field ("Male"/"Female"/"Men"/"Women"/etc.) is normalised.
  2. DOB must be on-or-before `master.born_on_or_before` (i.e. player is
     old enough / not under-age).
  3. DOB must be on-or-after `master.born_on_or_after` (i.e. player is
     young enough / not over-age).
  4. Medical clearance required: if `master.medical_required` is True,
     player must have `medical_cleared_at` populated.

Returns (ok, reasons[]) where `reasons` is the list of failing rules —
empty when the player is eligible.
"""
from typing import Iterable, Optional, Tuple


def _norm_gender(g: Optional[str]) -> Optional[str]:
    if not g:
        return None
    v = str(g).strip().lower()
    if v in ("m", "male", "men"):
        return "Men"
    if v in ("f", "female", "women", "w"):
        return "Women"
    return None


def _player_dob(player: dict) -> Optional[str]:
    """Players expose DOB as either `dob` (ISO) or `date_of_birth`."""
    for k in ("dob", "date_of_birth"):
        v = (player.get(k) or "").strip() if isinstance(player.get(k), str) else None
        if v:
            return v
    return None


def check_player_for_tournament(player: dict, master: Optional[dict]) -> Tuple[bool, list]:
    """Return (eligible, reasons[]). Both inputs are plain dicts."""
    reasons: list = []
    if not master:
        # No master row → skip enforcement (backwards compat for non-InterDiv types).
        return True, []

    # 1. Gender
    m_gender = master.get("gender")
    p_gender = _norm_gender(player.get("gender"))
    if m_gender and p_gender and m_gender != p_gender:
        reasons.append(f"gender_mismatch: player is {p_gender.lower()}, tournament requires {m_gender.lower()}")
    elif m_gender and not p_gender:
        reasons.append(f"gender_unknown: player DOB gender missing, tournament requires {m_gender.lower()}")

    # 2 & 3. DOB fenceposts
    dob = _player_dob(player)
    boob = (master.get("born_on_or_before") or "").strip()
    boa = (master.get("born_on_or_after") or "").strip()
    if boob or boa:
        if not dob:
            reasons.append("dob_missing: date-of-birth not on record")
        else:
            if boob and dob > boob:
                # Under-age (born too late = too young)
                reasons.append(f"under_age: born {dob}, must be born on or before {boob}")
            if boa and dob < boa:
                # Over-age (born too early = too old)
                reasons.append(f"over_age: born {dob}, must be born on or after {boa}")

    # 4. Medical clearance
    if master.get("medical_required") and not (player.get("medical_cleared_at") or "").strip():
        reasons.append("medical_missing: MPCA medical clearance is required for this tournament")

    return (len(reasons) == 0), reasons


def bulk_check(players: Iterable[dict], master: Optional[dict]) -> list:
    """Utility: return [{player_id, eligible, reasons}] for a list of players."""
    out = []
    for p in players:
        ok, r = check_player_for_tournament(p, master)
        out.append({
            "player_id": p.get("id"),
            "eligible": ok,
            "reasons": r,
        })
    return out
