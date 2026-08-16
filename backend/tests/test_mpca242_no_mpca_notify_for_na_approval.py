"""MPCA-242 · No MPCA notification / auto-approve for squad submissions on
tournament types whose wiring says `squad_approval.flag != "M"`.

Locks the contract for all 8 tournament types plus the legacy-heal migration.
"""
from pathlib import Path

import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def _wiring():
    r = requests.get(f"{API}/tournament-wiring", timeout=20)
    r.raise_for_status()
    return r.json()


def test_only_interdiv_has_mandatory_squad_approval():
    """Contract lock: after MPCA-242 only Inter-Division should have
    squad_approval.flag == "M". Every other tournament type must be O or NA.
    If a future edit turns another type Mandatory, this test flags it so we
    can review whether that's intentional."""
    cells = _wiring().get("cells") or {}
    for tid in ("bcci", "interdiv", "camp", "district", "interschool",
                "interclub", "coachingcamp", "vacationcamp"):
        flag = cells.get(tid, {}).get("squad_approval", {}).get("flag")
        if tid == "interdiv":
            # Default is M — but if an admin changed it to O/NA, allow it.
            assert flag in {"M", "O", "NA"}, f"interdiv squad_approval.flag={flag!r} invalid"
        else:
            # These should NEVER be Mandatory per user's stated intent
            assert flag != "M", (
                f"{tid} squad_approval.flag became Mandatory — MPCA does not "
                "approve for this tournament type per the wiring config."
            )


def test_notify_ai_review_short_circuits_for_non_mandatory_approval():
    """POST /squads/{sid}/notify-ai-review must return
    `{notified: False, skipped: 'wiring_squad_approval_not_mandatory', flag: ...}`
    for any squad whose tournament's squad_approval.flag != "M".

    Picks the first non-interdiv tournament with any squad; asserts the
    endpoint refuses to fire the notification."""
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    tournaments = r.json() or []
    if not tournaments:
        return  # nothing seeded

    for t in tournaments:
        tid = t["id"]
        # Fetch wiring-status to identify non-M types
        wr = requests.get(f"{API}/tournaments/{tid}/wiring-status", timeout=20)
        if wr.status_code != 200:
            continue
        step = next((s for s in wr.json()["steps"] if s["key"] == "squad_approval"), None)
        if not step or step.get("flag") == "M":
            continue
        # Find a squad for this tournament
        sr = requests.get(f"{API}/tournaments/{tid}/squads", timeout=20)
        if sr.status_code != 200 or not sr.json():
            continue
        sid = sr.json()[0]["id"]
        nr = requests.post(f"{API}/squads/{sid}/notify-ai-review", timeout=20)
        assert nr.status_code == 200, nr.text
        body = nr.json()
        assert body.get("notified") is False, f"notification should be suppressed for non-M types, got {body}"
        assert body.get("skipped") == "wiring_squad_approval_not_mandatory"
        return  # verified once — done

    # If we couldn't find a suitable squad we skip rather than fail.


def test_legacy_stuck_squads_healed_by_migration():
    """After startup, no squad should be stuck at Awaiting_MPCA_Approval on a
    tournament whose wiring says squad_approval.flag != "M". The startup
    migration `heal_legacy_stuck_squads` should have auto-promoted them."""
    r = requests.get(f"{API}/tournaments", timeout=20)
    r.raise_for_status()
    tournaments = r.json() or []
    for t in tournaments:
        tid = t["id"]
        wr = requests.get(f"{API}/tournaments/{tid}/wiring-status", timeout=20)
        if wr.status_code != 200:
            continue
        step = next((s for s in wr.json()["steps"] if s["key"] == "squad_approval"), None)
        if not step or step.get("flag") == "M":
            continue
        sr = requests.get(f"{API}/tournaments/{tid}/squads", timeout=20)
        if sr.status_code != 200:
            continue
        for sq in sr.json():
            assert sq.get("submission_status") != "Awaiting_MPCA_Approval", (
                f"Squad {sq['id']} on tournament {tid} still stuck at "
                "Awaiting_MPCA_Approval even though wiring flag != M. "
                "Legacy-heal migration should have flipped it to Approved."
            )
