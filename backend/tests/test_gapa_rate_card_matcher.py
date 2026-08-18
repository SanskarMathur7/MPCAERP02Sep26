"""Gap A · Rate card matcher must prioritise `tournament_type` (BCCI/Camp)
over `scope` (Championship). Regression guard for the silent bug where BCCI
tournaments were routed to the Championship rate card because their default
`scope=Championship` matched first."""
from routes.unified_budget import _tournament_type_key


def test_bcci_staging_resolves_to_bcci_not_championship():
    """BCCI staging (default scope=Championship) must resolve to BCCI."""
    t = {"tournament_type": "BCCI", "tournament_type_code": "bcci_staging", "scope": "Championship"}
    assert _tournament_type_key(t) == "BCCI"


def test_away_participation_resolves_to_bcci():
    t = {"tournament_type": "BCCI", "tournament_type_code": "away_participation", "scope": "Championship"}
    assert _tournament_type_key(t) == "BCCI"


def test_legacy_ranji_code_resolves_to_bcci():
    """Legacy seed uses `ranji_trophy` (not in catalog) — still must be BCCI."""
    t = {"tournament_type": "BCCI", "tournament_type_code": "ranji_trophy", "scope": "Championship"}
    assert _tournament_type_key(t) == "BCCI"


def test_bcci_only_via_type_code_when_type_missing():
    """Even if `tournament_type` is blank, a `bcci_*` code should route to BCCI."""
    t = {"tournament_type": "", "tournament_type_code": "bcci_staging", "scope": "Championship"}
    assert _tournament_type_key(t) == "BCCI"


def test_pre_camp_resolves_to_camp_not_scope_parent():
    """A pre-tournament camp inherits parent scope=Inter_Divisional but must
    use the Pre_Tournament_Camp rate card."""
    t = {"tournament_type": "MPCA_InterDivisional", "tournament_type_code": "pre_camp", "scope": "Inter_Divisional"}
    assert _tournament_type_key(t) == "Pre_Tournament_Camp"


def test_pure_championship_still_resolves_to_championship():
    """Non-BCCI Championship-scope events (e.g. state invitational) keep the
    Championship rate card — regression check."""
    t = {"tournament_type": "Invitational", "tournament_type_code": "", "scope": "Championship"}
    assert _tournament_type_key(t) == "Championship"


def test_inter_divisional_regression():
    t = {"tournament_type": "MPCA_InterDivisional", "tournament_type_code": "inter_div", "scope": "Inter_Divisional"}
    assert _tournament_type_key(t) == "Inter_Divisional"


def test_inter_district_regression():
    t = {"tournament_type": "MPCA_Championship", "tournament_type_code": "inter_district", "scope": "Inter_District"}
    assert _tournament_type_key(t) == "Inter_District"


def test_empty_tournament_defaults_to_inter_divisional():
    t = {}
    assert _tournament_type_key(t) == "Inter_Divisional"
