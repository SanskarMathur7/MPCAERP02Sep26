"""Sprint M15 · Scheme-Aware Tournament Budget Calculator.

Takes tournament parameters (days, pax, outstation setup, etc.) and computes a
precise budget with each head's LIMIT set per scheme rules (from HTML master doc).

Exposed
───────
    GET  /api/schemes/{scheme_code}/input-spec       # variables the calculator needs
    POST /api/schemes/{scheme_code}/compute-budget   # returns computed head allocations
"""
from typing import List, Optional, Any
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import db, api_router


class BudgetInputVar(BaseModel):
    model_config = ConfigDict(extra="ignore")
    key: str
    label: str
    type: str = "number"                    # "number" | "select"
    default: Optional[Any] = None
    options: Optional[List[str]] = None     # for type=select
    hint: Optional[str] = None
    unit: Optional[str] = None


# ─────────────── Input specs per scheme ───────────────
# Only the schemes whose formulae we can compute deterministically from inputs.
# Others fall back to raw head rates.
INPUT_SPECS: dict = {
    "2-A": [
        BudgetInputVar(key="match_days", label="Total match-days", default=6, unit="days"),
        # MPCA-110 · Non-match days (practice / rest / travel days) — feeds a
        # separate ground rent + logistics allowance so budgets don't lump
        # match spend and off-day spend together.
        BudgetInputVar(key="non_match_days", label="Non-match days (practice / rest)", default=0, unit="days"),
        BudgetInputVar(key="umpires_per_day", label="Umpires per match-day", default=2, unit="officials"),
        BudgetInputVar(key="scorers_per_day", label="Scorers per match-day", default=1, unit="officials"),
        BudgetInputVar(key="matches", label="Total matches (for MOM)", default=12, unit="matches"),
    ],
    "2-B": [
        BudgetInputVar(key="match_days", label="Total match-days", default=8, unit="days"),
        # MPCA-110 · Non-match days for Inter-Divisional hosting (rest days,
        # travel days, practice days).
        BudgetInputVar(key="non_match_days", label="Non-match days (practice / rest)", default=0, unit="days"),
        BudgetInputVar(key="outstation_teams", label="Number of outstation teams", type="select", default="1", options=["0", "1", "2+"]),
        BudgetInputVar(key="outstation_pax", label="Outstation pax (auto: 16/32 based on above)", default=16, hint="Max 16 if one team outstation, 32 if both", unit="pax"),
        BudgetInputVar(key="food_pax", label="Food pax (all pax, max 40)", default=32, unit="pax"),
        BudgetInputVar(key="matches", label="Total matches (multi-day)", default=6, unit="matches"),
        BudgetInputVar(key="umpires_per_day", label="Umpires per day", default=2, unit="officials"),
        BudgetInputVar(key="scorers_per_day", label="Scorers per day", default=1, unit="officials"),
        BudgetInputVar(key="teams_outstation_for_travel", label="Teams claiming travel", default=1, unit="teams"),
        BudgetInputVar(key="districts_in_division", label="Districts in the Division", default=5, hint="Prizes vary if ≥ 5 Districts", unit="districts"),
    ],
    "2-C": [
        BudgetInputVar(key="team_strength", label="Team strength (max 18 = 15 pl + coach + mgr + trainer)", default=18, unit="pax"),
        BudgetInputVar(key="rail_fare_per_pax", label="III-tier AC rail fare per pax (one-way, ₹)", default=1500, hint="Estimate based on actual fare"),
        BudgetInputVar(key="alt_mode_used", label="Alternate mode used (rail unavailable)?", type="select", default="No", options=["Yes", "No"]),
        BudgetInputVar(key="alt_mode_fare_total", label="If alternate mode: total one-way fare (₹, all pax)", default=0),
        BudgetInputVar(key="district_joining_pax", label="Players joining from Districts (District-HQ → Div-HQ)", default=0, unit="pax"),
        BudgetInputVar(key="joining_travel_per_pax", label="Joining travel per pax (bus / ordinary rail, ₹)", default=300),
        BudgetInputVar(key="medical_estimate", label="Reasonable medical during tour — estimate (₹)", default=0),
        BudgetInputVar(key="tatkal_charges", label="Tatkal / cancellation charges (₹)", default=0, hint="Allowed case-to-case"),
    ],
    "2-D": [
        BudgetInputVar(key="match_days", label="Match-days", default=6, unit="days"),
        BudgetInputVar(key="camp_days", label="Camp-days before matches", default=0, unit="days"),
        BudgetInputVar(key="rooms_visiting", label="Visiting team rooms (double occ, max 8)", default=8, unit="rooms"),
        BudgetInputVar(key="rooms_host", label="Host district players rooms (max 8)", default=8, unit="rooms"),
        BudgetInputVar(key="rooms_officials", label="Umpires & observers rooms", default=4, unit="rooms"),
        BudgetInputVar(key="daybefore_pax", label="Food day-before pax (visiting + host, max 18)", default=18, unit="pax"),
        BudgetInputVar(key="matches_multiday", label="Multi-day matches", default=1, unit="matches"),
        BudgetInputVar(key="matches_ltdovers", label="Ltd-overs / T20 matches", default=0, unit="matches"),
        BudgetInputVar(key="local_convey_days", label="Local conveyance days", default=6, unit="days"),
    ],
    "3-A": [
        BudgetInputVar(key="camp_days", label="Camp duration (days, max 14)", default=14, unit="days"),
        BudgetInputVar(key="participants", label="Total participants", default=25, unit="pax"),
        BudgetInputVar(key="outstation_pax", label="Outstation participants", default=15, unit="pax"),
    ],
    "3-D": [
        BudgetInputVar(key="camp_days", label="Camp days (max 8)", default=8, unit="days"),
        BudgetInputVar(key="participants", label="Participants (typically 18-20)", default=20, unit="pax"),
        BudgetInputVar(key="outstation_extra_pax", label="Higher-outstation adjustment pax", default=0, unit="pax"),
    ],
}


# ─────────────── Deterministic formulae ───────────────

def _compute_2A(inp: dict, heads_ref: dict) -> List[dict]:
    days = float(inp.get("match_days", 6))
    # MPCA-110 · Non-match day allowance (practice / rest / travel days)
    non_match_days = float(inp.get("non_match_days", 0))
    umpires = float(inp.get("umpires_per_day", 2))
    scorers = float(inp.get("scorers_per_day", 1))
    matches = float(inp.get("matches", 12))
    # 2026-27 rates (fallback if DB head keys don't match): Per-day grant ₹5,000; Umpire ₹1,000; Scorer ₹750
    per_day = float(heads_ref.get("PER_DAY_GRANT", 5000))
    ump_rate = float(heads_ref.get("UMPIRE_FEES", 1000))
    sc_rate = float(heads_ref.get("SCORER_FEES", 750))
    rows = [
        {"head": "Per-day grant (balls/ground/trophies)", "limit_inr": per_day * days, "formula": f"₹{per_day:,.0f} × {days:g} days"},
        {"head": "Umpire fees", "limit_inr": ump_rate * umpires * days, "formula": f"₹{ump_rate:,.0f} × {umpires:g} × {days:g}"},
        {"head": "Scorer fees", "limit_inr": sc_rate * scorers * days, "formula": f"₹{sc_rate:,.0f} × {scorers:g} × {days:g}"},
    ]
    if non_match_days > 0:
        # Half rate for non-match days — ground stays reserved but no umpiring.
        rows.append({
            "head": "Non-match day allowance (practice / rest)",
            "limit_inr": (per_day * 0.5) * non_match_days,
            "formula": f"₹{per_day * 0.5:,.0f} × {non_match_days:g} non-match days",
        })
    return rows


def _compute_2B(inp: dict, heads: dict) -> List[dict]:
    days = float(inp.get("match_days", 8))
    # MPCA-110 · Non-match day allowance for Inter-Divisional hosting
    non_match_days = float(inp.get("non_match_days", 0))
    outstation_teams = str(inp.get("outstation_teams", "1"))
    outstation_pax = float(inp.get("outstation_pax", 16 if outstation_teams == "1" else 32))
    food_pax = float(inp.get("food_pax", 32))
    matches = float(inp.get("matches", 6))
    umpires = float(inp.get("umpires_per_day", 2))
    scorers = float(inp.get("scorers_per_day", 1))
    teams_travel = float(inp.get("teams_outstation_for_travel", 1))
    districts = int(inp.get("districts_in_division", 5))

    accom_rate = float(heads.get("ACCOM", 500))
    food_rate = float(heads.get("FOOD_MATCH", 350))
    dinner_rate = float(heads.get("DINNER", 150))
    misc_rate = float(heads.get("MISC", 3600 if outstation_teams == "1" else 4200))
    ump_rate = float(heads.get("UMPIRE_FEES", 1000))
    sc_rate = float(heads.get("SCORER_FEES", 750))
    mom_rate = float(heads.get("MOM", 1500))
    team_travel = float(heads.get("TEAM_TRAVEL", 5000))
    prize1 = float(heads.get("PRIZE_1", 30000))
    prize2 = float(heads.get("PRIZE_2", 20000))

    rows = [
        {"head": "Accommodation — outstation", "limit_inr": accom_rate * outstation_pax * days, "formula": f"₹{accom_rate:,.0f} × {outstation_pax:g} pax × {days:g} days"},
        {"head": "Food — match days", "limit_inr": food_rate * food_pax * days, "formula": f"₹{food_rate:,.0f} × {food_pax:g} × {days:g}"},
        {"head": "Dinner — outstation", "limit_inr": dinner_rate * outstation_pax * days, "formula": f"₹{dinner_rate:,.0f} × {outstation_pax:g} × {days:g}"},
        {"head": "Miscellaneous expenses", "limit_inr": misc_rate * days, "formula": f"₹{misc_rate:,.0f} × {days:g} days"},
        {"head": "Umpire fees", "limit_inr": ump_rate * umpires * days, "formula": f"₹{ump_rate:,.0f} × {umpires:g} × {days:g}"},
        {"head": "Scorer fees", "limit_inr": sc_rate * scorers * days, "formula": f"₹{sc_rate:,.0f} × {scorers:g} × {days:g}"},
        {"head": "Man of the Match", "limit_inr": mom_rate * matches, "formula": f"₹{mom_rate:,.0f} × {matches:g} matches"},
        {"head": "Visiting team travel", "limit_inr": team_travel * teams_travel, "formula": f"₹{team_travel:,.0f} × {teams_travel:g} team(s)"},
        {"head": "Team prize — Winner", "limit_inr": prize1, "formula": f"Lump ₹{prize1:,.0f}"},
    ]
    if districts >= 5:
        rows.append({"head": "Team prize — Runner-up", "limit_inr": prize2, "formula": f"Lump ₹{prize2:,.0f} (Div has {districts} Districts ≥ 5)"})
    # MPCA-110 · Non-match day allowance — practice-day food + accom + local
    # conveyance for the outstation contingent (~½ match-day rate).
    if non_match_days > 0:
        rows.append({
            "head": "Non-match day allowance (practice / rest)",
            "limit_inr": (accom_rate * outstation_pax + food_rate * food_pax) * 0.5 * non_match_days,
            "formula": f"(₹{accom_rate:,.0f}×{outstation_pax:g} + ₹{food_rate:,.0f}×{food_pax:g}) × 0.5 × {non_match_days:g} non-match days",
        })
    return rows


def _compute_2C(inp: dict, heads: dict) -> List[dict]:
    strength = float(inp.get("team_strength", 18))
    rail = float(inp.get("rail_fare_per_pax", 1500))
    alt = str(inp.get("alt_mode_used", "No")) == "Yes"
    alt_fare_total = float(inp.get("alt_mode_fare_total", 0))
    dist_pax = float(inp.get("district_joining_pax", 0))
    join_rate = float(inp.get("joining_travel_per_pax", 300))
    medical = float(inp.get("medical_estimate", 0))
    tatkal = float(inp.get("tatkal_charges", 0))

    inter_city = alt_fare_total * 2 if alt else rail * 2 * strength     # to & fro
    rows = [
        {"head": "Inter-city travel (to & fro)", "limit_inr": inter_city, "formula": f"{'Alt-mode ₹{:,.0f} × 2'.format(alt_fare_total) if alt else f'₹{rail:,.0f} × 2 × {strength:g} pax'}"},
        {"head": "Misc journey expense", "limit_inr": 5000, "formula": "Lump ₹5,000"},
        {"head": "District-HQ → Division-HQ joining travel", "limit_inr": join_rate * dist_pax * 2, "formula": f"₹{join_rate:,.0f} × {dist_pax:g} pax × 2 (round-trip)"},
    ]
    if medical > 0:
        rows.append({"head": "Reasonable medical during tour", "limit_inr": medical, "formula": "At actuals"})
    if tatkal > 0:
        rows.append({"head": "Tatkal / cancellation charges", "limit_inr": tatkal, "formula": "At actuals"})
    return rows


def _compute_2D(inp: dict, heads: dict) -> List[dict]:
    days = float(inp.get("match_days", 6))
    camp_days = float(inp.get("camp_days", 0))
    rv = float(inp.get("rooms_visiting", 8))
    rh = float(inp.get("rooms_host", 8))
    ro = float(inp.get("rooms_officials", 4))
    daybefore_pax = float(inp.get("daybefore_pax", 18))
    m_multi = float(inp.get("matches_multiday", 1))
    m_ltd = float(inp.get("matches_ltdovers", 0))
    conv_days = float(inp.get("local_convey_days", days))
    accom = float(heads.get("ACCOM_VISITING", 1800))
    gr = float(heads.get("GROUND_RENT", 4500))
    daybefore = float(heads.get("FOOD_DAYBEFORE", 630))
    coach = float(heads.get("COACH_HON_MATCH", 2000))
    trainer = float(heads.get("TRAINER_HON_MATCH", 1000))
    manager = float(heads.get("MANAGER_HON", 1250))
    mom_m = float(heads.get("MOM_MULTIDAY", 5000))
    mom_l = 2500
    rooms_total = rv + rh + ro
    return [
        {"head": "Accommodation — all rooms", "limit_inr": accom * rooms_total * days, "formula": f"₹{accom:,.0f} × {rooms_total:g} rooms × {days:g} days"},
        {"head": "Ground rent + tent", "limit_inr": gr * days, "formula": f"₹{gr:,.0f} × {days:g} match-days"},
        {"head": "Food day-before", "limit_inr": daybefore * daybefore_pax, "formula": f"₹{daybefore:,.0f} × {daybefore_pax:g} pax"},
        {"head": "Coach honorarium (match-day)", "limit_inr": coach * days, "formula": f"₹{coach:,.0f} × {days:g}"},
        {"head": "Trainer honorarium (match-day)", "limit_inr": trainer * days, "formula": f"₹{trainer:,.0f} × {days:g}"},
        {"head": "Manager honorarium", "limit_inr": manager * days, "formula": f"₹{manager:,.0f} × {days:g}"},
        {"head": "Man of the Match (multi-day)", "limit_inr": mom_m * m_multi, "formula": f"₹{mom_m:,.0f} × {m_multi:g}"},
        {"head": "Man of the Match (ltd-overs)", "limit_inr": mom_l * m_ltd, "formula": f"₹{mom_l:,.0f} × {m_ltd:g}"},
        {"head": "Local conveyance", "limit_inr": 1500 * conv_days, "formula": f"₹1,500 × {conv_days:g} days"},
    ]


def _compute_3A(inp: dict, heads: dict) -> List[dict]:
    days = float(inp.get("camp_days", 14))
    pax = float(inp.get("participants", 25))
    outstation = float(inp.get("outstation_pax", 15))
    return [
        {"head": "Accommodation (outstation)", "limit_inr": 500 * outstation * days, "formula": f"₹500 × {outstation:g} × {days:g}"},
        {"head": "Food", "limit_inr": 500 * pax * days, "formula": f"₹500 × {pax:g} × {days:g}"},
        {"head": "Daily conveyance", "limit_inr": 50 * pax * days, "formula": f"₹50 × {pax:g} × {days:g}"},
        {"head": "Misc expenses", "limit_inr": 15000, "formula": "Lump ₹15,000"},
    ]


def _compute_3D(inp: dict, heads: dict) -> List[dict]:
    days = min(float(inp.get("camp_days", 8)), 8)
    pax = float(inp.get("participants", 20))
    extra_pax = float(inp.get("outstation_extra_pax", 0))
    return [
        {"head": "Daily subsidy (accom+food+conveyance)", "limit_inr": 11000 * days, "formula": f"₹11,000 × {days:g}"},
        {"head": "Outstation higher-adjustment", "limit_inr": 1000 * extra_pax * days, "formula": f"₹1,000 × {extra_pax:g} × {days:g}"},
        {"head": "Coach honorarium", "limit_inr": 1000 * days, "formula": f"₹1,000 × {days:g}"},
        {"head": "Trainer honorarium", "limit_inr": 750 * days, "formula": f"₹750 × {days:g}"},
    ]


COMPUTE_FN = {
    "2-A": _compute_2A, "2-B": _compute_2B, "2-C": _compute_2C,
    "2-D": _compute_2D, "3-A": _compute_3A, "3-D": _compute_3D,
}


class ComputeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    inputs: dict = Field(default_factory=dict)


@api_router.get("/schemes/{scheme_code}/input-spec")
async def get_input_spec(scheme_code: str):
    scheme = await db.reimbursement_schemes.find_one({"scheme_code": scheme_code}, {"_id": 0})
    if not scheme:
        raise HTTPException(404, "Scheme not found")
    vars_ = INPUT_SPECS.get(scheme_code, [])
    return {
        "scheme_code": scheme_code, "scheme_name": scheme["name"],
        "computable": scheme_code in COMPUTE_FN,
        "input_variables": [v.model_dump() for v in vars_],
        "conditions": scheme.get("conditions", []),
    }


@api_router.post("/schemes/{scheme_code}/compute-budget")
async def compute_budget(scheme_code: str, req: ComputeRequest):
    scheme = await db.reimbursement_schemes.find_one({"scheme_code": scheme_code}, {"_id": 0})
    if not scheme:
        raise HTTPException(404, "Scheme not found")
    heads_ref = {h["code"]: h["rate_inr"] for h in (scheme.get("heads") or [])}
    fn = COMPUTE_FN.get(scheme_code)
    if fn:
        head_allocations = fn(req.inputs or {}, heads_ref)
    else:
        # Fallback — use raw head rates as limits (no multiplication)
        head_allocations = [{"head": h["label"], "limit_inr": h["rate_inr"], "formula": "Base rate (no formula)"} for h in scheme.get("heads", [])]
    # Round to nearest rupee
    for h in head_allocations:
        h["limit_inr"] = round(float(h["limit_inr"]), 2)
    total = round(sum(h["limit_inr"] for h in head_allocations), 2)
    return {
        "scheme_code": scheme_code, "scheme_name": scheme["name"],
        "inputs_used": req.inputs,
        "head_allocations": head_allocations,
        "total_ceiling_inr": total,
        "computable": fn is not None,
        "conditions": scheme.get("conditions", []),
    }


@api_router.get("/tournaments/{tid}/scheme-for-body/{body_code}")
async def scheme_for_body(tid: str, body_code: str):
    """M39l · Bug 3 · Resolve the applicable scheme (host vs visiting) for
    a specific body on a specific tournament.

    Returns {role, scheme_code, scheme_name, input_variables}.
    - HOST (body_code == tournament.host_body_id): uses
      `tournament.host_scheme_code` (fallback: `tournament.scheme_code`).
    - VISITING (any other body): uses `tournament.visiting_scheme_code`.
    """
    t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    is_host = body_code == t.get("host_body_id")
    role = "host" if is_host else "visiting"
    scheme_code = (
        (t.get("host_scheme_code") if is_host else t.get("visiting_scheme_code"))
        or t.get("scheme_code")
    )
    if not scheme_code:
        return {"role": role, "scheme_code": None, "scheme_name": None,
                "input_variables": [], "note": (
                    "No scheme assigned for this role yet. MPCA must set the "
                    f"tournament's {role}-scheme."
                )}
    scheme = await db.reimbursement_schemes.find_one({"scheme_code": scheme_code}, {"_id": 0})
    if not scheme:
        raise HTTPException(404, f"Scheme {scheme_code} not found")
    vars_ = INPUT_SPECS.get(scheme_code, [])
    return {
        "role": role,
        "scheme_code": scheme_code,
        "scheme_name": scheme["name"],
        "computable": scheme_code in COMPUTE_FN,
        "input_variables": [v.model_dump() for v in vars_],
        "conditions": scheme.get("conditions", []),
    }
