"""Iter 130h · Seed grant claims + AI verdicts for the /launch-presentation demo.

Populates the /claims dashboard with 8 claims across various schemes so the
MPCA approver queue and claim-detail pages have real content for screenshots.

Idempotent — safe to re-run. Cleans up prior demo claims (claim_no starting
with 'CLM-2026-27-01').
"""
from __future__ import annotations
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _iso(days_ago: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


CLAIMS = [
    # 1 · Rich detail claim for the AI-Review slide screenshot
    {
        "claim_no":  "CLM-2026-27-0142",
        "title":     "Rural Coaching Camp · Ashoknagar · Jun-Jul 2026",
        "description": "Sponsored coaching camp for 42 rural players, 15 days · 3 MPCA-panel coaches · Ground: District Stadium Ashoknagar.",
        "body_id":   "DIV-GWL",
        "parent_body_id": "MPCA",
        "category":  "Coaching_Grant",
        "amount_inr": 184500.0,
        "fiscal_cycle": "2026-27",
        "claim_path": "Bulk_Budget",
        "status":    "Submitted",
        "created_by": "Rajesh Tiwari · Division Secretary Gwalior",
        "sub_bills": [
            {"id": str(uuid.uuid4()), "head": "Ground_Expenses",  "description": "District Stadium Ashoknagar · 15 days",           "amount_inr": 22500.0, "qty": 15,   "unit_note": "₹1,500 × 15 days (claimed above ceiling)"},
            {"id": str(uuid.uuid4()), "head": "Match_Officials",  "description": "3 MPCA-panel coaches × 15 days",                  "amount_inr": 90000.0, "qty": 45,   "unit_note": "₹2,000 × 45 coach-days"},
            {"id": str(uuid.uuid4()), "head": "Road_BLP_Lunch_Rain","description": "Refreshment · 42 players × 15 days",              "amount_inr": 50400.0, "qty": 630,  "unit_note": "₹80 × 630 head-days"},
            {"id": str(uuid.uuid4()), "head": "Equipment",         "description": "Bat/ball/pads for camp use",                       "amount_inr": 21600.0, "qty": None, "unit_note": None},
        ],
        "ai_decision":  "HOLD_FOR_HUMAN",
        "ai_reasoning": (
            "Overall APPROVE with a minor variance. All 7 required documents attached and legible. "
            "Ground rental (₹22,500) exceeds Scheme 3-A rate-card ceiling of ₹18,000 for District-level camps by "
            "₹4,500 (2.4% of claim). Coach honorarium (₹2,000/day × 45 coach-days = ₹90,000) matches MPCA panel rate. "
            "Refreshment (₹80/head × 42 × 15 = ₹50,400) matches attendance register. GSTIN active, PAN + bank match "
            "claimant record. Recommend approve at rate-card ceiling — sanction ₹1,80,000 with ₹4,500 held back "
            "under Rule 3.4.2 (ground variance). Confidence 0.92."
        ),
        "ai_missing_docs": [],
        "ai_validated_at": _iso(0),
    },
    # 2 · Green · Annual Grant (auto-approve)
    {
        "claim_no": "CLM-2026-27-0141", "title": "Annual Grant · DCA Indore · Q1 2026-27",
        "body_id": "DIV-IND", "parent_body_id": "MPCA", "category": "Annual_Grant",
        "amount_inr": 350000.0, "fiscal_cycle": "2026-27", "claim_path": "Bulk_Budget",
        "status": "Submitted", "created_by": "Devashish Nilesey · DS Indore",
        "sub_bills": [{"id": str(uuid.uuid4()), "head": "Miscellaneous", "description": "Q1 division operating expenses", "amount_inr": 350000.0}],
        "ai_decision": "APPROVE_STANDARD",
        "ai_reasoning": "Annual Grant 1-A · claim ₹3,50,000 matches the sanctioned quarterly allocation for DIV-IND. Board resolution 2026/AP/12 on file. Utilization certificate for Q4 2025-26 available and clean. PAN + GSTIN + bank triangulated with ERP master. Fast-track approve.",
        "ai_missing_docs": [], "ai_validated_at": _iso(1),
    },
    # 3 · Green · Umpire Honorarium
    {
        "claim_no": "CLM-2026-27-0140", "title": "Umpire Honorarium · Q3 2026-27 · 42 matches",
        "body_id": "MPCA", "parent_body_id": "MPCA", "category": "Honorarium",
        "amount_inr": 42600.0, "fiscal_cycle": "2026-27", "claim_path": "Bulk_Budget",
        "status": "Submitted", "created_by": "Umpire Panel Convener",
        "sub_bills": [{"id": str(uuid.uuid4()), "head": "Match_Officials", "description": "42 matches × ₹1,015 (avg. panel rate incl. TA)", "amount_inr": 42600.0}],
        "ai_decision": "APPROVE_STANDARD",
        "ai_reasoning": "Umpire Panel · Scheme 4-A · 42 matches umpired across Ranji, Vijay Hazare and inter-divisional cycles. Match slips cross-verified against Tournament Fixtures for all 42 dates. All umpires on active MPCA panel. Rate card ₹1,015 avg. matches Season 2026-27 activated schedule. Approve.",
        "ai_missing_docs": [], "ai_validated_at": _iso(2),
    },
    # 4 · Amber · Reimbursement with variance
    {
        "claim_no": "CLM-2026-27-0139", "title": "Inter-District Tournament · Bhopal Zone · Reimbursement",
        "body_id": "DIV-BPL", "parent_body_id": "MPCA", "category": "Tournament_Expense",
        "amount_inr": 112400.0, "fiscal_cycle": "2026-27", "claim_path": "As_per_Budget",
        "status": "Submitted", "created_by": "Arvind Sharma · DS Bhopal",
        "sub_bills": [
            {"id": str(uuid.uuid4()), "head": "Travel", "description": "3 teams × 4 buses", "amount_inr": 48000.0},
            {"id": str(uuid.uuid4()), "head": "Hotel",  "description": "12 rooms × 4 nights @ ₹1,450", "amount_inr": 69600.0},
        ],
        "is_excess": True,
        "excess_heads": [{"head": "Hotel", "claimed_inr": 69600.0, "limit_inr": 67000.0, "excess_inr": 2600.0}],
        "ai_decision": "HOLD_FOR_HUMAN",
        "ai_reasoning": "Scheme 2-B · Hotel head exceeds approved budget envelope by ₹2,600 (3.8%). All other heads within limit. Sub-bill line-items match attached bills; hotel invoice from Hotel Sayaji dated 14-Aug-2026 confirms 12 rooms × 4 nights at ₹1,450 (rate card ceiling is ₹1,400). Recommend REVIEW — Treasurer to sanction at ceiling OR approve variance with written note.",
        "ai_missing_docs": [], "ai_validated_at": _iso(3),
    },
    # 5 · Amber · Missing document
    {
        "claim_no": "CLM-2026-27-0138", "title": "Ground Maintenance Equipment · DCA Rewa",
        "body_id": "DIV-REW", "parent_body_id": "MPCA", "category": "Infrastructure",
        "amount_inr": 88000.0, "fiscal_cycle": "2026-27", "claim_path": "Bulk_Budget",
        "status": "Submitted", "created_by": "Suresh Mishra · DS Rewa",
        "sub_bills": [{"id": str(uuid.uuid4()), "head": "Equipment", "description": "1 super-sopper + 2 heavy rollers (per Scheme 5-A)", "amount_inr": 88000.0}],
        "ai_decision": "RETURN_TO_ORIGINATOR",
        "ai_reasoning": "Scheme 5-A · Infrastructure · Requires 3 documents; only 2 attached. Missing: Satisfactory Report from Divisional Secretary AND CDC nominee (Rule 5-A.3). Equipment quote is genuine (vendor: MP Sports Solutions, GSTIN active). District Committee Resolution present. Return to originator with note listing the missing document — will re-enter queue on resubmit.",
        "ai_missing_docs": ["Divisional Secretary Satisfactory Report", "CDC Nominee Endorsement"],
        "ai_validated_at": _iso(4),
    },
    # 6 · Green · Revenue Share
    {
        "claim_no": "CLM-2026-27-0137", "title": "Revenue Share · Jabalpur Div · ODI Match Aug 2026",
        "body_id": "DIV-JBP", "parent_body_id": "MPCA", "category": "Special_Sanction",
        "amount_inr": 125000.0, "fiscal_cycle": "2026-27", "claim_path": "Bulk_Budget",
        "status": "Submitted", "created_by": "Anand Kumar · DS Jabalpur",
        "sub_bills": [{"id": str(uuid.uuid4()), "head": "Miscellaneous", "description": "Scheme 1-B share of net revenue · Holkar ODI 12-Aug", "amount_inr": 125000.0}],
        "ai_decision": "APPROVE_STANDARD",
        "ai_reasoning": "Scheme 1-B · Revenue Share · Net revenue for Holkar ODI (12-Aug-2026) certified at ₹12.5 lakh. Each of 10 divisions entitled to ₹1,25,000 (10%). Claim amount matches formula exactly. Board resolution + BCCI receipt on file. Approve.",
        "ai_missing_docs": [], "ai_validated_at": _iso(5),
    },
    # 7 · Green · Coaching Grant
    {
        "claim_no": "CLM-2026-27-0136", "title": "Periodical Coaching Camp · Sagar · May 2026",
        "body_id": "DIV-SGR", "parent_body_id": "MPCA", "category": "Coaching_Grant",
        "amount_inr": 96000.0, "fiscal_cycle": "2026-27", "claim_path": "Bulk_Budget",
        "status": "Submitted", "created_by": "Kailash Jain · DS Sagar",
        "sub_bills": [
            {"id": str(uuid.uuid4()), "head": "Match_Officials", "description": "2 coaches × 20 days", "amount_inr": 60000.0},
            {"id": str(uuid.uuid4()), "head": "Road_BLP_Lunch_Rain", "description": "30 players × 20 days × ₹60", "amount_inr": 36000.0},
        ],
        "ai_decision": "APPROVE_STANDARD",
        "ai_reasoning": "Scheme 3-B · Coaching Grant · All required documents attached. Coach honorarium (₹1,500/day × 40 coach-days = ₹60,000) matches Coaching Grant rate card. Refreshment (₹60/head × 600 head-days = ₹36,000) within Scheme 3-B ceiling. Approve at claimed amount.",
        "ai_missing_docs": [], "ai_validated_at": _iso(6),
    },
    # 8 · Red · Auto-reject
    {
        "claim_no": "CLM-2026-27-0135", "title": "Special Sanction · Ex-gratia · Requesting body invalid",
        "body_id": "DIV-CBL", "parent_body_id": "MPCA", "category": "Special_Sanction",
        "amount_inr": 250000.0, "fiscal_cycle": "2026-27", "claim_path": "Bulk_Budget",
        "status": "Submitted", "created_by": "Ram Kumar · DS Chambal",
        "sub_bills": [{"id": str(uuid.uuid4()), "head": "Miscellaneous", "description": "Ex-gratia to family of deceased player · Scheme 4-B", "amount_inr": 250000.0}],
        "ai_decision": "RETURN_TO_ORIGINATOR",
        "ai_reasoning": "Scheme 4-B (Ex-gratia to Deceased Player's Family) rate card is ₹1,00,000 flat. Claim of ₹2,50,000 exceeds ceiling by ₹1,50,000 (150%). Death certificate + BCCI-registered player verification on file — beneficiary is genuine. However amount is not compliant with scheme. Return to originator requesting revised claim at scheme ceiling.",
        "ai_missing_docs": [], "ai_validated_at": _iso(7),
    },
]


async def go():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Clean previous demo claims (idempotent)
    await db.claims.delete_many({"claim_no": {"$regex": r"^CLM-2026-27-01"}})

    for c in CLAIMS:
        c.setdefault("id", str(uuid.uuid4()))
        c.setdefault("approval_chain", [])
        c.setdefault("supporting_doc_urls", [])
        c.setdefault("created_at", c.get("ai_validated_at") or _iso(0))
        c.setdefault("updated_at", c.get("ai_validated_at") or _iso(0))
        await db.claims.insert_one(c)

    print(f"Seeded {len(CLAIMS)} demo claims.")
    client.close()


if __name__ == "__main__":
    asyncio.run(go())
