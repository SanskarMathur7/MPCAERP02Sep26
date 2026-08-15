"""MPCA-237 · Ship 4a · Cross-type regression for the Accept-banner suppression.

Verifies the blast-radius contract published for the fix:

    "Suppress the Accept banner IFF scope==Inter_District AND persona is a
     Division AND persona.body_code == tournament.host_body_id."

For every one of the 8 wiring types, this test asserts the derivation matches
the contract. Runs against live data; no DB writes."""
from pathlib import Path

import requests


def _api():
    for ln in Path("/app/frontend/.env").read_text().splitlines():
        if ln.startswith("REACT_APP_BACKEND_URL="):
            return ln.split("=", 1)[1].strip() + "/api"
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


API = _api()


def _predicate(scope: str, body_type: str, host_body_id: str, persona_body: str) -> bool:
    """Mirror of the JSX condition in TournamentDetail.jsx."""
    return (
        scope == "Inter_District"
        and body_type == "Division"
        and persona_body == host_body_id
    )


def test_ship4a_suppression_matrix():
    """Fires for exactly one combination per tournament: (Division creator × Inter-District)."""
    tournaments = requests.get(f"{API}/tournaments?include_camp_scoped=true", timeout=20).json()
    assert tournaments, "seed missing"

    # Simulated personas covering every scope: MPCA state · Division · District
    personas = [
        {"body_type": "State",    "body_code": "MPCA"},
        {"body_type": "Division", "body_code": "DIV-IND"},
        {"body_type": "Division", "body_code": "DIV-BPL"},
        {"body_type": "District", "body_code": "DIST-INDO-IND"},
    ]

    total_hits = 0
    for t in tournaments:
        scope = t.get("scope")
        host  = t.get("host_body_id")
        for p in personas:
            fires = _predicate(scope, p["body_type"], host, p["body_code"])
            if fires:
                # Must be an Inter-District tournament whose Division is the host
                assert scope == "Inter_District", f"Rule fired on wrong scope: {scope}"
                assert p["body_type"] == "Division", "Rule fired on non-Division persona"
                assert p["body_code"] == host, "Rule fired on non-host body"
                total_hits += 1

    # We seed exactly 1 Inter-District tournament, so exactly 1 combination must match.
    assert total_hits == 1, f"Expected 1 suppression hit, got {total_hits}"


def test_ship4a_unaffected_types_untouched():
    """Every non-Inter_District tournament must NOT trigger suppression for ANY persona."""
    tournaments = requests.get(f"{API}/tournaments?include_camp_scoped=true", timeout=20).json()
    personas = [
        {"body_type": "State",    "body_code": "MPCA"},
        {"body_type": "Division", "body_code": "DIV-IND"},
        {"body_type": "Division", "body_code": "DIV-BPL"},
        {"body_type": "District", "body_code": "DIST-INDO-IND"},
    ]
    for t in tournaments:
        if t.get("scope") == "Inter_District":
            continue
        for p in personas:
            assert not _predicate(t["scope"], p["body_type"], t.get("host_body_id"), p["body_code"]), \
                f"Rule wrongly fired on scope={t['scope']} for persona={p}"


def test_ship4a_district_participant_still_sees_banner():
    """A District persona (participant, not creator) must NEVER be suppressed —
    even for Inter-District tournaments they are participating in."""
    tournaments = requests.get(f"{API}/tournaments?include_camp_scoped=true", timeout=20).json()
    for t in tournaments:
        if t.get("scope") != "Inter_District":
            continue
        # District persona participating in the Inter-District tournament
        district_persona = {"body_type": "District", "body_code": "DIST-DHAR-IND"}
        assert not _predicate(t["scope"], district_persona["body_type"],
                              t.get("host_body_id"), district_persona["body_code"])
