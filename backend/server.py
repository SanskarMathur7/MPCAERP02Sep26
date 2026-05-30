"""MPCA ERP Backend — Phase 1 MVP

Modules implemented:
- Members (Individual / Institutional / Honorary)
- Disclosures (AGM notices, minutes, audited accounts, selection announcements)
- Dashboard stats
"""
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, date

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="MPCA ERP API", version="1.0.0")
api_router = APIRouter(prefix="/api")


# ---------------- Models ----------------

MemberCategory = Literal["Individual", "Institutional", "Honorary", "Patron"]
MemberStatus = Literal["Active", "Suspended", "Lapsed", "Transferred", "Pending"]


class MemberBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    body_id: str = "MPCA"  # owning body — defaults to MPCA HQ
    name: str
    category: MemberCategory
    sub_category: Optional[str] = None  # e.g. "Life Member", "Annual", "School", "District Assoc."
    address: str
    phone: Optional[str] = None
    email: Optional[str] = None
    eligibility_factor: Optional[str] = None
    membership_date: Optional[str] = None  # ISO date string
    effectiveness: Optional[str] = None  # validity window
    fee_structure: Optional[str] = None
    photo_url: Optional[str] = None
    signature_url: Optional[str] = None
    approving_authority: Optional[str] = None
    representative_name: Optional[str] = None  # for institutional members
    representative_contact: Optional[str] = None
    status: MemberStatus = "Active"
    loss_reason: Optional[str] = None
    transferred_to: Optional[str] = None
    notes: Optional[str] = None


class Member(MemberBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str  # MPCA UID like "MPCA-IND-0001"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MemberCreate(MemberBase):
    pass


DisclosureType = Literal["AGM_Notice", "Committee_Minutes", "GBM_Minutes", "Audited_Accounts", "Selection_Announcement", "Circular"]


class DisclosureBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    body_id: str = "MPCA"
    title: str
    disclosure_type: DisclosureType
    summary: Optional[str] = None
    content: Optional[str] = None
    document_url: Optional[str] = None
    issued_date: str  # ISO date
    issued_by: Optional[str] = None


class Disclosure(DisclosureBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DisclosureCreate(DisclosureBase):
    pass


# ---------------- Phase 2: Meetings ----------------

MeetingType = Literal["AGM", "SGM", "Committee", "Sub_Committee"]
MeetingStatus = Literal["Scheduled", "Notice_Issued", "In_Progress", "Concluded", "Cancelled"]


class AgendaItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    number: int
    title: str
    description: Optional[str] = None
    decided: bool = False
    decision: Optional[str] = None


class MeetingBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    title: str
    meeting_type: MeetingType
    scheduled_date: str  # ISO date
    scheduled_time: Optional[str] = None  # "11:00 AM"
    venue: str
    notice_date: Optional[str] = None
    quorum_required: int = 0
    quorum_present: int = 0
    chairperson: Optional[str] = None
    convened_by: Optional[str] = None
    agenda: List[AgendaItem] = []
    attendees: List[str] = []  # list of member UIDs
    minutes: Optional[str] = None
    minutes_url: Optional[str] = None
    status: MeetingStatus = "Scheduled"
    notes: Optional[str] = None


class Meeting(MeetingBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    meeting_no: str  # e.g. "AGM-2025-78"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MeetingCreate(MeetingBase):
    pass


ResolutionStatus = Literal["Proposed", "Carried", "Carried_Unanimously", "Rejected", "Deferred"]


class ResolutionBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    meeting_id: str
    number: int
    title: str
    text: str
    proposed_by: Optional[str] = None
    seconded_by: Optional[str] = None
    votes_for: int = 0
    votes_against: int = 0
    votes_abstain: int = 0
    status: ResolutionStatus = "Proposed"


class Resolution(ResolutionBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ResolutionCreate(ResolutionBase):
    pass


# ---------------- Phase 2: Elections ----------------

ElectionStatus = Literal["Announced", "Nominations_Open", "Nominations_Closed", "Voting_Open", "Concluded", "Cancelled"]


class ElectionBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    title: str
    post: str  # e.g. "President", "Hon. Secretary"
    tenure_years: int = 4
    cooling_period_years: int = 4
    electoral_officer: str
    nomination_open_date: str
    nomination_close_date: str
    voting_date: str
    eligible_voters_count: int = 0
    status: ElectionStatus = "Announced"
    notes: Optional[str] = None


class Election(ElectionBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ElectionCreate(ElectionBase):
    pass


CandidateStatus = Literal["Nominated", "Accepted", "Withdrawn", "Disqualified", "Elected", "Defeated"]


class CandidateBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    election_id: str
    member_uid: str  # references Member.uid
    member_name: str
    nominated_by: Optional[str] = None  # member uid
    seconded_by: Optional[str] = None
    manifesto: Optional[str] = None
    status: CandidateStatus = "Nominated"
    votes_received: int = 0


class Candidate(CandidateBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CandidateCreate(CandidateBase):
    pass


class VoteCast(BaseModel):
    model_config = ConfigDict(extra="ignore")
    election_id: str
    candidate_id: str
    voter_uid: str  # member uid


class Vote(VoteCast):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cast_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------------- Phase 3: Fees & Subscriptions ----------------

FeeStatus = Literal["Pending", "Paid", "Overdue", "Waived"]


class FeeInvoiceBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    member_uid: str
    member_name: Optional[str] = None
    cycle: str  # e.g. "2025-26"
    description: Optional[str] = None
    amount: float
    late_fee: float = 0.0
    due_date: str  # ISO date
    status: FeeStatus = "Pending"
    paid_date: Optional[str] = None
    payment_ref: Optional[str] = None
    notes: Optional[str] = None


class FeeInvoice(FeeInvoiceBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_no: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class FeeInvoiceCreate(FeeInvoiceBase):
    pass


# ---------------- Phase 3: Bank Operations ----------------

AccountType = Literal["Current", "Savings", "Fixed_Deposit"]
TxnType = Literal["Credit", "Debit"]


class BankAccountBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    name: str  # "MPCA General Account"
    bank: str
    branch: Optional[str] = None
    account_no: str
    ifsc: Optional[str] = None
    account_type: AccountType = "Current"
    opening_balance: float = 0.0
    current_balance: float = 0.0
    signatories: List[str] = []  # e.g. ["Hon. Secretary", "Hon. Treasurer"]
    notes: Optional[str] = None


class BankAccount(BankAccountBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BankAccountCreate(BankAccountBase):
    pass


class BankTransactionBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    account_id: str
    date: str  # ISO date
    txn_type: TxnType
    amount: float
    narration: str
    reference: Optional[str] = None
    approved_by: Optional[str] = None  # post


class BankTransaction(BankTransactionBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    balance_after: float = 0.0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BankTransactionCreate(BankTransactionBase):
    pass


# ---------------- Phase III.5: Org Hierarchy (Multi-Tenant) ----------------
# Models the BCCI → MPCA HQ → 10 Divisions → 52 Districts tree.
# Every existing collection (members, fees, meetings, bank, etc.) can be scoped
# by `body_id` for hierarchical RBAC. Existing data — if unscoped — implicitly
# belongs to MPCA HQ.

BodyType = Literal["BCCI", "State", "Division", "District", "Club"]


class BodyBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str                                  # e.g. "MPCA", "DIV-IND", "DIST-UJN"
    name: str                                  # e.g. "Indore Division"
    body_type: BodyType
    parent_code: Optional[str] = None          # e.g. "MPCA" for divisions
    state: str = "Madhya Pradesh"
    seat: Optional[str] = None                 # HQ city
    founded_year: Optional[int] = None
    annual_grant_inr: float = 0.0              # standard annual grant they receive
    secretary_name: Optional[str] = None
    treasurer_name: Optional[str] = None
    notes: Optional[str] = None


class Body(BodyBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BodyCreate(BodyBase):
    pass


# ---------------- Phase III.6: Claims & Grant Workflow ----------------
# Models a grant claim that flows District → Division → MPCA per Art. 28(v).
# `approval_chain` is the maker-checker audit trail — append-only.

ClaimCategory = Literal["Annual_Grant", "Tournament_Expense", "Infrastructure", "Honorarium", "Special_Sanction"]
ClaimStatus = Literal[
    "Draft",                    # district sec is preparing
    "Submitted",                # forwarded to Division
    "Division_Recommended",     # division has signed off → MPCA queue
    "MPCA_Sanctioned",          # MPCA Treasurer sanctioned
    "Disbursed",                # cheque/NEFT released
    "Rejected",                 # rejected at any stage
    "Returned",                 # sent back for clarification
]


class ApprovalStep(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stage: str                          # "Submitted" / "Division_Recommended" / etc.
    actor_post: str                     # e.g. "Hon. Secretary"
    actor_name: Optional[str] = None
    actor_body_id: str                  # body the actor represents
    decision: Literal["Submitted", "Recommended", "Sanctioned", "Disbursed", "Rejected", "Returned"]
    notes: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ClaimBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str                            # submitting body (district / division)
    title: str
    description: Optional[str] = None
    category: ClaimCategory
    amount_inr: float
    fiscal_cycle: str = "2025-26"           # e.g. "2025-26"
    supporting_doc_url: Optional[str] = None
    supporting_doc_urls: List[str] = []     # multi-attachment (Phase III.7)


class Claim(ClaimBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    claim_no: str                            # "CLM-2025-26-001"
    status: ClaimStatus = "Draft"
    approval_chain: List[ApprovalStep] = []
    parent_body_id: Optional[str] = None    # division code, computed on submit
    created_by: Optional[str] = None         # actor name at creation
    # Phase III.7: filled when Disbursed
    disbursement_txn_id: Optional[str] = None
    disbursement_account_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # Step 2 · derived fields (computed on read, never persisted by the workflow itself)
    due_at: Optional[str] = None
    is_overdue: bool = False
    # Step 4 · AI Gatekeeper outputs (set when submit triggers validation)
    ai_decision: Optional[str] = None        # APPROVE_FAST_TRACK / APPROVE_STANDARD / HOLD_FOR_HUMAN / RETURN_TO_ORIGINATOR / AUTO_REJECT
    ai_reasoning: Optional[str] = None       # human-readable verdict
    ai_validated_at: Optional[str] = None    # ISO timestamp
    ai_missing_docs: List[str] = []          # convenience extract for the UI


class ClaimCreate(ClaimBase):
    created_by: Optional[str] = None


class ClaimAction(BaseModel):
    """Payload for any approval action (submit/recommend/sanction/disburse/reject/return)."""
    model_config = ConfigDict(extra="ignore")
    actor_post: str
    actor_name: Optional[str] = None
    actor_body_id: str
    notes: Optional[str] = None
    # 2-signatory support (Phase III.7) — only required when amount > ₹50,000 on Disburse
    co_signatory_post: Optional[str] = None
    co_signatory_name: Optional[str] = None
    # Optional override of the source bank account on Disburse
    source_account_id: Optional[str] = None


# ---------------- Phase III.7: Body Budget Ledger ----------------
# Tracks per-body annual budget consumption. Reconciled lazily on read against
# the live `claims` collection so we never have to worry about double-entry drift.

class BodyBudgetBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str
    fiscal_cycle: str
    annual_budget_inr: float = 0.0
    note: Optional[str] = None


class BodyBudget(BodyBudgetBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BodyBudgetCreate(BodyBudgetBase):
    pass


# ---------------- Phase III.7: Sanctioning Thresholds (Art. 28(v) excerpt) ----------------
# Drives the anti-fragmentation rule on POST /api/claims.

SANCTION_THRESHOLDS = [
    {"post": "District Secretary",  "limit_inr": 25_000,    "scope": "Within district, single sanction"},
    {"post": "District Committee",  "limit_inr": 200_000,   "scope": "District-level sanction with quorum"},
    {"post": "Division Secretary",  "limit_inr": 500_000,   "scope": "Division-level sanction"},
    {"post": "MPCA Hon. Treasurer", "limit_inr": 1_000_000, "scope": "Sole-Treasurer sanction"},
    {"post": "MPCA Managing Committee", "limit_inr": 5_000_000, "scope": "MC resolution required"},
    {"post": "MPCA AGM",            "limit_inr": float("inf"), "scope": "AGM approval required"},
]

# 2-signatory threshold on bank disbursement (per plan's Art. 28(v))
TWO_SIGNATORY_THRESHOLD_INR = 50_000


# ---------------- Phase III.8: Procurement Protocol ----------------
# Plan asks: 3 quotes for ₹1L-10L · QCBS for >₹75L · EMD + Security Deposit tracking.

ProcurementMethod = Literal["Direct", "Three_Quote", "QCBS", "Open_Tender"]
ProcurementStatus = Literal[
    "Draft",                 # capturing requirements & quotes
    "Quotes_Collected",      # ≥3 quotes attached
    "Awarded",               # vendor selected
    "Linked_To_Claim",       # tied to a claim that will pay it
    "Closed",                # fulfilled
    "Cancelled",
]


def _procurement_method_for(amount: float) -> ProcurementMethod:
    if amount < 100_000:
        return "Direct"
    if amount <= 1_000_000:
        return "Three_Quote"
    if amount <= 7_500_000:
        return "Three_Quote"          # 3 quotes still required, plus committee approval
    return "QCBS"                     # >75L


class Quotation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vendor_name: str
    vendor_gstin: Optional[str] = None
    quote_amount_inr: float
    quote_date: str
    notes: Optional[str] = None


class ProcurementRequestBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    title: str
    description: Optional[str] = None
    estimated_amount_inr: float
    fiscal_cycle: str = "2025-26"
    quotations: List[Quotation] = []
    awarded_vendor: Optional[str] = None
    awarded_amount_inr: Optional[float] = None
    emd_inr: float = 0.0                       # earnest money deposit collected
    security_deposit_inr: float = 0.0          # post-award security deposit
    linked_claim_id: Optional[str] = None
    notes: Optional[str] = None


class ProcurementRequest(ProcurementRequestBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pr_no: str                                  # "PR-2025-26-001"
    method: ProcurementMethod
    status: ProcurementStatus = "Draft"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProcurementRequestCreate(ProcurementRequestBase):
    pass


class AwardPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    awarded_vendor: str
    awarded_amount_inr: float
    security_deposit_inr: float = 0.0
    notes: Optional[str] = None


# ---------------- Phase IV: Player Module (M1) ----------------
# Per Plan's "Player Rules" tab:
#  - Categories: Local-MP / Born-Outside / Guest
#  - TW3 maturity test for guests
#  - Tournament-specific age caps enforced elsewhere (Tournament module)
#  - Disqualification flags: 2-year ban, lifetime ban, ₹50K division penalty
#  - Transfer NOC workflow

PlayerCategory = Literal["Local_MP", "Born_Outside", "Guest"]
PlayerRole = Literal["Batter", "Bowler", "All_Rounder", "Wicket_Keeper"]
PlayerBattingStyle = Literal["Right_Hand", "Left_Hand"]
PlayerBowlingStyle = Literal[
    "Right_Arm_Fast", "Right_Arm_Medium", "Right_Arm_Off_Spin", "Right_Arm_Leg_Spin",
    "Left_Arm_Fast", "Left_Arm_Medium", "Left_Arm_Orthodox", "Left_Arm_Chinaman", "None",
]
PlayerStatus = Literal["Pending", "Active", "Suspended", "Banned", "Transferred", "Retired"]
TransferStatus = Literal["Draft", "From_Body_Approved", "To_Body_Approved", "MPCA_Approved", "Completed", "Rejected"]


class DisqualificationFlag(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: Literal["Two_Year_Ban", "Lifetime_Ban", "Division_Penalty", "Age_Misrepresentation", "Other"]
    reason: str
    imposed_by: str            # body_id imposing
    imposed_on: str            # ISO date
    expires_on: Optional[str] = None  # for time-bound bans
    notes: Optional[str] = None


class PlayerBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str                                  # registering body (usually a district)
    full_name: str
    father_name: Optional[str] = None
    date_of_birth: str                            # ISO date YYYY-MM-DD
    place_of_birth: Optional[str] = None
    domicile_state: str = "Madhya Pradesh"
    address_district: Optional[str] = None        # MP district name
    category: PlayerCategory
    role: PlayerRole = "Batter"
    batting_style: PlayerBattingStyle = "Right_Hand"
    bowling_style: PlayerBowlingStyle = "None"
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    photo_url: Optional[str] = None
    bcci_player_id: Optional[str] = None          # set after BCCI sync
    aadhaar_last4: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None


class Player(PlayerBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player_id: str                                # MPCA/YR/SERIAL e.g. MPCA/2025/000123
    status: PlayerStatus = "Pending"
    disqualifications: List[DisqualificationFlag] = []
    registered_on: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    eligibility_notes: List[str] = []             # human-readable validator output
    tw3_verified: bool = False                    # TW3 maturity check (for Guests)


class PlayerCreate(PlayerBase):
    tw3_verified: bool = False


class TransferRequestBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_id: str                                 # the player.id (not the human-friendly player_id)
    from_body_id: str
    to_body_id: str
    reason: str
    fiscal_cycle: str = "2025-26"


class TransferRequest(TransferRequestBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    noc_no: str                                    # NOC-2025-26-001
    status: TransferStatus = "Draft"
    approval_chain: List[ApprovalStep] = []        # reuses III.6 ApprovalStep
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TransferCreate(TransferRequestBase):
    pass


# ---------------- Phase IV.2: Tournament Module (M2) ----------------
# Plan tabs: Modules (M2) + Player Rules (age caps + guest allowance per tournament).

TournamentFormat = Literal["Multi_Day", "One_Day", "T20", "Pink_Ball"]
TournamentStatus = Literal["Upcoming", "Squad_Selection", "In_Progress", "Completed", "Cancelled"]
TournamentScope = Literal["Inter_Divisional", "Inter_District", "Championship", "Invitational"]


class TournamentBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str                                   # e.g. "MY Memorial Trophy"
    short_name: Optional[str] = None
    format: TournamentFormat
    scope: TournamentScope
    fiscal_cycle: str = "2025-26"
    host_body_id: str = "MPCA"                  # who organises the tournament
    age_cap_years: Optional[int] = None          # e.g. 19 for U-19; None = senior
    age_floor_years: Optional[int] = None        # e.g. 14 for U-14
    allows_guests: bool = False                  # Guest-category players permitted?
    max_squad_size: int = 18                     # selection rule
    start_date: Optional[str] = None             # ISO YYYY-MM-DD
    end_date: Optional[str] = None
    venue: Optional[str] = None
    notes: Optional[str] = None


class Tournament(TournamentBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tournament_no: str                           # "TRN-2025-26-001"
    status: TournamentStatus = "Upcoming"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentCreate(TournamentBase):
    pass


class SquadMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_id: str                               # UUID id of Player
    player_no: str                               # human-friendly MPCA/.../...
    full_name: str
    role: str
    is_captain: bool = False
    is_keeper: bool = False
    added_on: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Squad(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tournament_id: str
    body_id: str                                  # the participating team's body (division/district)
    team_name: str
    members: List[SquadMember] = []
    eligibility_warnings: List[str] = []         # accumulated validator output
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SquadCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    body_id: str
    team_name: str


class SquadAddPlayer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_id: str                                # UUID id
    is_captain: bool = False
    is_keeper: bool = False


# ---------------- Helpers ----------------

CATEGORY_PREFIX = {
    "Individual": "IND",
    "Institutional": "INS",
    "Honorary": "HON",
    "Patron": "PAT",
}


async def next_uid(category: MemberCategory) -> str:
    prefix = CATEGORY_PREFIX[category]
    count = await db.members.count_documents({"category": category})
    return f"MPCA-{prefix}-{count + 1:04d}"


# ---------------- Routes: Members ----------------


@api_router.get("/members", response_model=List[Member])
async def list_members(category: Optional[MemberCategory] = None, search: Optional[str] = None, body_id: Optional[str] = None):
    query = {}
    if category:
        query["category"] = category
    if body_id:
        query["body_id"] = body_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"uid": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.members.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.get("/members/{member_id}", response_model=Member)
async def get_member(member_id: str):
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")
    return doc


@api_router.post("/members", response_model=Member)
async def create_member(payload: MemberCreate):
    uid = await next_uid(payload.category)
    member = Member(uid=uid, **payload.model_dump())
    await db.members.insert_one(member.model_dump())
    return member


@api_router.patch("/members/{member_id}", response_model=Member)
async def update_member(member_id: str, payload: MemberCreate):
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")
    update = payload.model_dump(exclude_unset=True)
    await db.members.update_one({"id": member_id}, {"$set": update})
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    return doc


@api_router.delete("/members/{member_id}")
async def delete_member(member_id: str):
    result = await db.members.delete_one({"id": member_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Member not found")
    return {"deleted": True}


# ---------------- Routes: Disclosures ----------------


@api_router.get("/disclosures", response_model=List[Disclosure])
async def list_disclosures(disclosure_type: Optional[DisclosureType] = None):
    query = {}
    if disclosure_type:
        query["disclosure_type"] = disclosure_type
    docs = await db.disclosures.find(query, {"_id": 0}).sort("issued_date", -1).to_list(500)
    return docs


@api_router.post("/disclosures", response_model=Disclosure)
async def create_disclosure(payload: DisclosureCreate):
    doc = Disclosure(**payload.model_dump())
    await db.disclosures.insert_one(doc.model_dump())
    return doc


@api_router.get("/disclosures/{disclosure_id}", response_model=Disclosure)
async def get_disclosure(disclosure_id: str):
    doc = await db.disclosures.find_one({"id": disclosure_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Disclosure not found")
    return doc


# ---------------- Routes: Dashboard ----------------


@api_router.get("/dashboard/stats")
async def dashboard_stats():
    total = await db.members.count_documents({})
    by_cat = {}
    for cat in ["Individual", "Institutional", "Honorary", "Patron"]:
        by_cat[cat] = await db.members.count_documents({"category": cat})
    active = await db.members.count_documents({"status": "Active"})
    pending = await db.members.count_documents({"status": "Pending"})
    disclosures_count = await db.disclosures.count_documents({})
    upcoming = await db.meetings.count_documents({"status": {"$in": ["Scheduled", "Notice_Issued"]}})
    elections_open = await db.elections.count_documents({"status": {"$in": ["Nominations_Open", "Voting_Open"]}})

    # Real fee collection percentage
    total_invoices = await db.fee_invoices.count_documents({})
    paid_invoices = await db.fee_invoices.count_documents({"status": "Paid"})
    fee_pct = round(100 * paid_invoices / total_invoices) if total_invoices else 0

    # Bank balance
    accts = await db.bank_accounts.find({}, {"_id": 0, "current_balance": 1}).to_list(50)
    total_balance = sum(a.get("current_balance", 0) for a in accts)

    return {
        "total_members": total,
        "by_category": by_cat,
        "active_members": active,
        "pending_members": pending,
        "total_disclosures": disclosures_count,
        "upcoming_meetings": upcoming,
        "elections_open": elections_open,
        "pending_grievances": 0,  # placeholder until Phase 4
        "fee_collection_pct": fee_pct,
        "total_invoices": total_invoices,
        "paid_invoices": paid_invoices,
        "total_bank_balance": total_balance,
    }


# ---------------- Routes: Meetings ----------------


def _next_meeting_no(meeting_type: str, count: int) -> str:
    year = datetime.now(timezone.utc).year
    prefix = {"AGM": "AGM", "SGM": "SGM", "Committee": "MC", "Sub_Committee": "SC"}[meeting_type]
    return f"{prefix}-{year}-{count + 1:03d}"


@api_router.get("/meetings", response_model=List[Meeting])
async def list_meetings(meeting_type: Optional[MeetingType] = None, status: Optional[MeetingStatus] = None):
    query = {}
    if meeting_type:
        query["meeting_type"] = meeting_type
    if status:
        query["status"] = status
    docs = await db.meetings.find(query, {"_id": 0}).sort("scheduled_date", -1).to_list(500)
    return docs


@api_router.get("/meetings/{meeting_id}", response_model=Meeting)
async def get_meeting(meeting_id: str):
    doc = await db.meetings.find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meeting not found")
    return doc


@api_router.post("/meetings", response_model=Meeting)
async def create_meeting(payload: MeetingCreate):
    count = await db.meetings.count_documents({"meeting_type": payload.meeting_type})
    meeting_no = _next_meeting_no(payload.meeting_type, count)
    meeting = Meeting(meeting_no=meeting_no, **payload.model_dump())
    await db.meetings.insert_one(meeting.model_dump())
    return meeting


@api_router.patch("/meetings/{meeting_id}", response_model=Meeting)
async def update_meeting(meeting_id: str, payload: MeetingCreate):
    doc = await db.meetings.find_one({"id": meeting_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Meeting not found")
    update = payload.model_dump(exclude_unset=True)
    await db.meetings.update_one({"id": meeting_id}, {"$set": update})
    return await db.meetings.find_one({"id": meeting_id}, {"_id": 0})


@api_router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str):
    result = await db.meetings.delete_one({"id": meeting_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Meeting not found")
    await db.resolutions.delete_many({"meeting_id": meeting_id})
    return {"deleted": True}


@api_router.get("/meetings/{meeting_id}/resolutions", response_model=List[Resolution])
async def list_resolutions(meeting_id: str):
    docs = await db.resolutions.find({"meeting_id": meeting_id}, {"_id": 0}).sort("number", 1).to_list(200)
    return docs


@api_router.post("/meetings/{meeting_id}/resolutions", response_model=Resolution)
async def add_resolution(meeting_id: str, payload: ResolutionCreate):
    payload_data = payload.model_dump()
    payload_data["meeting_id"] = meeting_id
    res = Resolution(**payload_data)
    await db.resolutions.insert_one(res.model_dump())
    return res


# ---------------- Routes: Elections ----------------


@api_router.get("/elections", response_model=List[Election])
async def list_elections(status: Optional[ElectionStatus] = None):
    query = {"status": status} if status else {}
    docs = await db.elections.find(query, {"_id": 0}).sort("voting_date", -1).to_list(200)
    return docs


@api_router.get("/elections/{election_id}", response_model=Election)
async def get_election(election_id: str):
    doc = await db.elections.find_one({"id": election_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Election not found")
    return doc


@api_router.post("/elections", response_model=Election)
async def create_election(payload: ElectionCreate):
    eligible = await db.members.count_documents({"status": "Active"})
    data = payload.model_dump()
    data["eligible_voters_count"] = eligible
    election = Election(**data)
    await db.elections.insert_one(election.model_dump())
    return election


@api_router.patch("/elections/{election_id}", response_model=Election)
async def update_election(election_id: str, payload: ElectionCreate):
    doc = await db.elections.find_one({"id": election_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Election not found")
    update = payload.model_dump(exclude_unset=True)
    await db.elections.update_one({"id": election_id}, {"$set": update})
    return await db.elections.find_one({"id": election_id}, {"_id": 0})


@api_router.get("/elections/{election_id}/candidates", response_model=List[Candidate])
async def list_candidates(election_id: str):
    docs = await db.candidates.find({"election_id": election_id}, {"_id": 0}).sort("votes_received", -1).to_list(200)
    return docs


@api_router.post("/elections/{election_id}/candidates", response_model=Candidate)
async def add_candidate(election_id: str, payload: CandidateCreate):
    # Verify member exists
    member = await db.members.find_one({"uid": payload.member_uid}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member UID not found")
    data = payload.model_dump()
    data["election_id"] = election_id
    data["member_name"] = member["name"]
    cand = Candidate(**data)
    await db.candidates.insert_one(cand.model_dump())
    return cand


@api_router.post("/elections/{election_id}/vote")
async def cast_vote(election_id: str, payload: VoteCast):
    # Check election is open
    election = await db.elections.find_one({"id": election_id}, {"_id": 0})
    if not election:
        raise HTTPException(404, "Election not found")
    if election["status"] != "Voting_Open":
        raise HTTPException(400, "Voting is not currently open for this election")

    # Check duplicate vote
    existing = await db.votes.find_one({"election_id": election_id, "voter_uid": payload.voter_uid})
    if existing:
        raise HTTPException(400, "This voter has already cast a vote in this election")

    # Check voter is a valid active member
    voter = await db.members.find_one({"uid": payload.voter_uid, "status": "Active"}, {"_id": 0})
    if not voter:
        raise HTTPException(400, "Voter UID is not an active member of MPCA")

    # Validate candidate
    cand = await db.candidates.find_one({"id": payload.candidate_id, "election_id": election_id}, {"_id": 0})
    if not cand:
        raise HTTPException(400, "Candidate not found in this election")

    vote = Vote(**payload.model_dump())
    await db.votes.insert_one(vote.model_dump())
    await db.candidates.update_one(
        {"id": payload.candidate_id}, {"$inc": {"votes_received": 1}}
    )
    return {"ok": True, "vote_id": vote.id, "candidate": cand["member_name"]}


@api_router.post("/elections/{election_id}/conclude")
async def conclude_election(election_id: str):
    election = await db.elections.find_one({"id": election_id}, {"_id": 0})
    if not election:
        raise HTTPException(404, "Election not found")
    candidates = await db.candidates.find({"election_id": election_id}, {"_id": 0}).sort("votes_received", -1).to_list(200)
    if not candidates:
        raise HTTPException(400, "No candidates to conclude on")
    winner_id = candidates[0]["id"]
    await db.candidates.update_one({"id": winner_id}, {"$set": {"status": "Elected"}})
    for c in candidates[1:]:
        if c["status"] not in ["Withdrawn", "Disqualified"]:
            await db.candidates.update_one({"id": c["id"]}, {"$set": {"status": "Defeated"}})
    await db.elections.update_one({"id": election_id}, {"$set": {"status": "Concluded"}})
    return {"ok": True, "winner": candidates[0]["member_name"]}


# ---------------- Public: Verify Member ----------------


@api_router.get("/verify/{uid}")
async def verify_member(uid: str):
    """Public endpoint — returns minimal verifiable info about a member by UID."""
    member = await db.members.find_one({"uid": uid}, {"_id": 0})
    if not member:
        return {"valid": False, "uid": uid}
    return {
        "valid": True,
        "uid": member["uid"],
        "name": member["name"],
        "category": member["category"],
        "sub_category": member.get("sub_category"),
        "membership_date": member.get("membership_date"),
        "effectiveness": member.get("effectiveness"),
        "status": member["status"],
        "is_active": member["status"] == "Active",
    }


# ---------------- Phase 3: Fees & Subscriptions ----------------


async def _next_invoice_no() -> str:
    year = datetime.now(timezone.utc).year
    count = await db.fee_invoices.count_documents({})
    return f"MPCA-FEE-{year}-{count + 1:04d}"


@api_router.get("/fees", response_model=List[FeeInvoice])
async def list_fee_invoices(status: Optional[FeeStatus] = None, cycle: Optional[str] = None, member_uid: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if cycle:
        query["cycle"] = cycle
    if member_uid:
        query["member_uid"] = member_uid
    docs = await db.fee_invoices.find(query, {"_id": 0}).sort("due_date", -1).to_list(2000)
    # Auto-flag Overdue (does not mutate DB)
    today_str = datetime.now(timezone.utc).date().isoformat()
    for d in docs:
        if d["status"] == "Pending" and d["due_date"] < today_str:
            d["status"] = "Overdue"
    return docs


@api_router.post("/fees", response_model=FeeInvoice)
async def create_fee_invoice(payload: FeeInvoiceCreate):
    member = await db.members.find_one({"uid": payload.member_uid}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member UID not found")
    data = payload.model_dump()
    data["member_name"] = member["name"]
    invoice_no = await _next_invoice_no()
    inv = FeeInvoice(invoice_no=invoice_no, **data)
    await db.fee_invoices.insert_one(inv.model_dump())
    return inv


@api_router.post("/fees/generate")
async def generate_invoices(cycle: str, amount: float = 3000.0, due_date: Optional[str] = None):
    """Bulk-generate invoices for the given cycle for every active Individual + Institutional member."""
    if not due_date:
        due_date = "2025-12-31"
    active = await db.members.find({"status": "Active", "category": {"$in": ["Individual", "Institutional"]}}, {"_id": 0}).to_list(2000)
    created = 0
    for m in active:
        existing = await db.fee_invoices.find_one({"member_uid": m["uid"], "cycle": cycle})
        if existing:
            continue
        # Use category-appropriate amount
        amt = 15000.0 if m["category"] == "Institutional" else amount
        invoice_no = await _next_invoice_no()
        inv = FeeInvoice(
            invoice_no=invoice_no,
            member_uid=m["uid"],
            member_name=m["name"],
            cycle=cycle,
            description=f"Subscription · {cycle}",
            amount=amt,
            due_date=due_date,
            status="Pending",
        )
        await db.fee_invoices.insert_one(inv.model_dump())
        created += 1
    return {"created": created, "cycle": cycle}


@api_router.post("/fees/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, payment_ref: Optional[str] = None):
    """Mock payment — marks invoice as Paid. In real life this would be Stripe/Razorpay."""
    inv = await db.fee_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv["status"] == "Paid":
        return {"already_paid": True, "invoice": inv}
    ref = payment_ref or f"MOCK-PAY-{uuid.uuid4().hex[:10].upper()}"
    paid_date = datetime.now(timezone.utc).date().isoformat()
    await db.fee_invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": "Paid", "paid_date": paid_date, "payment_ref": ref}},
    )
    updated = await db.fee_invoices.find_one({"id": invoice_id}, {"_id": 0})
    return {"ok": True, "invoice": updated, "receipt_no": ref}


@api_router.get("/fees/{invoice_id}", response_model=FeeInvoice)
async def get_invoice(invoice_id: str):
    doc = await db.fee_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Invoice not found")
    return doc


# ---------------- Phase 3: Bank Operations ----------------


@api_router.get("/bank/accounts", response_model=List[BankAccount])
async def list_bank_accounts():
    docs = await db.bank_accounts.find({}, {"_id": 0}).sort("name", 1).to_list(50)
    return docs


@api_router.post("/bank/accounts", response_model=BankAccount)
async def create_bank_account(payload: BankAccountCreate):
    data = payload.model_dump()
    if not data.get("current_balance"):
        data["current_balance"] = data.get("opening_balance", 0.0)
    acct = BankAccount(**data)
    await db.bank_accounts.insert_one(acct.model_dump())
    return acct


@api_router.get("/bank/accounts/{account_id}", response_model=BankAccount)
async def get_bank_account(account_id: str):
    doc = await db.bank_accounts.find_one({"id": account_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Account not found")
    return doc


@api_router.get("/bank/transactions", response_model=List[BankTransaction])
async def list_transactions(account_id: Optional[str] = None, limit: int = 200):
    query = {"account_id": account_id} if account_id else {}
    docs = await db.bank_txns.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    return docs


@api_router.post("/bank/transactions", response_model=BankTransaction)
async def add_transaction(payload: BankTransactionCreate):
    acct = await db.bank_accounts.find_one({"id": payload.account_id}, {"_id": 0})
    if not acct:
        raise HTTPException(404, "Account not found")
    delta = payload.amount if payload.txn_type == "Credit" else -payload.amount
    new_balance = round(acct["current_balance"] + delta, 2)
    txn = BankTransaction(balance_after=new_balance, **payload.model_dump())
    await db.bank_txns.insert_one(txn.model_dump())
    await db.bank_accounts.update_one(
        {"id": payload.account_id}, {"$set": {"current_balance": new_balance}}
    )
    return txn


# ---------------- Phase 3: Financial Powers ----------------

FINANCIAL_POWERS = [
    {
        "post": "President",
        "single_txn_limit": 500000,
        "approval_required": "None — within budget",
        "scope": "All heads, within sanctioned budget",
    },
    {
        "post": "Honorary Secretary",
        "single_txn_limit": 200000,
        "approval_required": "Joint with Hon. Treasurer above ₹50,000",
        "scope": "Administrative & operational expenditure",
    },
    {
        "post": "Honorary Treasurer",
        "single_txn_limit": 200000,
        "approval_required": "Joint with Hon. Secretary above ₹50,000",
        "scope": "All financial heads; bank signatory",
    },
    {
        "post": "Joint Secretary",
        "single_txn_limit": 25000,
        "approval_required": "Hon. Secretary",
        "scope": "Petty cash, office expenses",
    },
    {
        "post": "Managing Committee (Resolution)",
        "single_txn_limit": 5000000,
        "approval_required": "Resolution at duly-convened meeting",
        "scope": "Capital expenditure, grants, sanctions",
    },
    {
        "post": "Annual General Meeting (Resolution)",
        "single_txn_limit": None,
        "approval_required": "GBM Resolution",
        "scope": "Constitutional amendments, large capex, asset disposal",
    },
]


@api_router.get("/financial-powers")
async def get_financial_powers():
    return {"powers": FINANCIAL_POWERS}


# ---------------- Public: Member Profile + Pay Dues ----------------


@api_router.get("/member-profile/{uid}")
async def member_profile(uid: str):
    """Public profile for a member — includes outstanding invoices for self-service pay."""
    m = await db.members.find_one({"uid": uid}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Member not found")
    invoices = await db.fee_invoices.find(
        {"member_uid": uid}, {"_id": 0}
    ).sort("due_date", -1).to_list(500)
    today_str = datetime.now(timezone.utc).date().isoformat()
    for inv in invoices:
        if inv["status"] == "Pending" and inv["due_date"] < today_str:
            inv["status"] = "Overdue"
    total_outstanding = sum(
        i["amount"] + i.get("late_fee", 0)
        for i in invoices
        if i["status"] in ("Pending", "Overdue")
    )
    # Return minimal member info (don't expose phone/email publicly)
    return {
        "member": {
            "uid": m["uid"],
            "name": m["name"],
            "category": m["category"],
            "sub_category": m.get("sub_category"),
            "membership_date": m.get("membership_date"),
            "effectiveness": m.get("effectiveness"),
            "status": m["status"],
            "photo_url": m.get("photo_url"),
        },
        "invoices": invoices,
        "total_outstanding": total_outstanding,
    }


# ---------------- Routes: Org Structure (Multi-Tenant) ----------------


@api_router.get("/bodies", response_model=List[Body])
async def list_bodies(body_type: Optional[BodyType] = None, parent_code: Optional[str] = None):
    query: dict = {}
    if body_type:
        query["body_type"] = body_type
    if parent_code:
        query["parent_code"] = parent_code
    docs = await db.bodies.find(query, {"_id": 0}).sort("code", 1).to_list(200)
    return docs


@api_router.get("/bodies/tree")
async def bodies_tree():
    """Returns the entire MPCA org tree shaped for UI consumption."""
    docs = await db.bodies.find({}, {"_id": 0}).sort("code", 1).to_list(200)
    by_parent: dict = {}
    for d in docs:
        by_parent.setdefault(d.get("parent_code") or "ROOT", []).append(d)

    def build(parent_code: str):
        children = by_parent.get(parent_code, [])
        return [{**c, "children": build(c["code"])} for c in children]

    return build("ROOT")


@api_router.get("/bodies/{code}", response_model=Body)
async def get_body(code: str):
    doc = await db.bodies.find_one({"code": code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Body not found")
    return doc


@api_router.get("/bodies/{code}/summary")
async def body_summary(code: str):
    """Aggregates a body's footprint: children count, district count under it, total grant budget, etc."""
    doc = await db.bodies.find_one({"code": code}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Body not found")

    direct_children = await db.bodies.find({"parent_code": code}, {"_id": 0}).to_list(200)
    # Descendant district count for divisions
    district_count = 0
    if doc["body_type"] == "Division":
        district_count = await db.bodies.count_documents({"parent_code": code, "body_type": "District"})
    elif doc["body_type"] == "State":
        district_count = await db.bodies.count_documents({"body_type": "District"})
    division_count = 0
    if doc["body_type"] == "State":
        division_count = await db.bodies.count_documents({"body_type": "Division"})

    total_annual_grant = sum(c.get("annual_grant_inr", 0) for c in direct_children)

    return {
        "body": doc,
        "direct_children_count": len(direct_children),
        "division_count": division_count,
        "district_count": district_count,
        "total_annual_grant_inr_to_children": total_annual_grant,
    }


@api_router.post("/bodies", response_model=Body)
async def create_body(payload: BodyCreate):
    if await db.bodies.find_one({"code": payload.code}):
        raise HTTPException(400, f"Body with code {payload.code} already exists")
    body = Body(**payload.model_dump())
    await db.bodies.insert_one(body.model_dump())
    return body


# ---------------- Routes: Claims & Grant Workflow ----------------


async def _next_claim_no(cycle: str) -> str:
    count = await db.claims.count_documents({"fiscal_cycle": cycle})
    return f"CLM-{cycle}-{count + 1:03d}"


async def _resolve_parent_body(body_id: str) -> Optional[str]:
    body = await db.bodies.find_one({"code": body_id}, {"_id": 0, "parent_code": 1})
    return body.get("parent_code") if body else None


@api_router.get("/claims", response_model=List[Claim])
async def list_claims(
    body_id: Optional[str] = None,
    parent_body_id: Optional[str] = None,
    status: Optional[ClaimStatus] = None,
    fiscal_cycle: Optional[str] = None,
):
    """List claims. body_id filters claims submitted BY that body.
    parent_body_id filters claims pending review BY that body (for Division/MPCA inboxes)."""
    query: dict = {}
    if body_id:
        query["body_id"] = body_id
    if parent_body_id:
        query["parent_body_id"] = parent_body_id
    if status:
        query["status"] = status
    if fiscal_cycle:
        query["fiscal_cycle"] = fiscal_cycle
    docs = await db.claims.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_decorate_claim(d) for d in docs]


@api_router.get("/claims/{claim_id}", response_model=Claim)
async def get_claim(claim_id: str):
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    return _decorate_claim(doc)


@api_router.post("/claims", response_model=Claim)
async def create_claim(payload: ClaimCreate, force: bool = False):
    """Drafts a new claim. The submitting body must exist.

    Phase III.7: anti-fragmentation guard — if a body raises multiple
    sub-threshold claims within the same fiscal cycle whose cumulative value
    crosses the next sanctioning authority's limit, the call is rejected
    (with 400 and a clear message) unless ?force=true is passed."""
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")

    if not force and payload.amount_inr > 0:
        cumulative = payload.amount_inr
        cursor = db.claims.find(
            {
                "body_id": payload.body_id,
                "fiscal_cycle": payload.fiscal_cycle,
                "status": {"$nin": ["Rejected"]},
            },
            {"_id": 0, "amount_inr": 1},
        )
        async for c in cursor:
            cumulative += c.get("amount_inr", 0) or 0

        # Determine the sanctioning authority for the *new individual* claim
        single_auth = next(
            (t for t in SANCTION_THRESHOLDS if payload.amount_inr <= t["limit_inr"]),
            SANCTION_THRESHOLDS[-1],
        )
        cum_auth = next(
            (t for t in SANCTION_THRESHOLDS if cumulative <= t["limit_inr"]),
            SANCTION_THRESHOLDS[-1],
        )
        if cum_auth["post"] != single_auth["post"]:
            raise HTTPException(
                400,
                f"Anti-fragmentation: this claim is individually within "
                f"{single_auth['post']}'s limit, but the body's cumulative "
                f"open spend for cycle {payload.fiscal_cycle} would reach "
                f"₹{cumulative:,.0f} — requiring {cum_auth['post']}'s sanction. "
                "Either consolidate the claims or pass ?force=true with an MC note.",
            )

    cycle = payload.fiscal_cycle
    claim_no = await _next_claim_no(cycle)
    parent_id = await _resolve_parent_body(payload.body_id)
    claim = Claim(
        claim_no=claim_no,
        parent_body_id=parent_id,
        **payload.model_dump(),
    )
    await db.claims.insert_one(claim.model_dump())
    return claim


def _append_step(claim_doc: dict, step: ApprovalStep, new_status: ClaimStatus) -> dict:
    chain = claim_doc.get("approval_chain", []) or []
    chain.append(step.model_dump())
    return {
        "approval_chain": chain,
        "status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# Step 2 · Notification Spine + SLA / Due-dates / Red-flag
# Feb 2026 — G2 / G3 / G4 from ERP POINTS.pdf
# In-app bell only (per user choice). Email/SMS deferred.
# ============================================================

from datetime import timedelta as _td  # local alias to avoid clobbering anywhere else

# How many hours the holder of each queue has to act before a claim is "overdue".
SLA_HOURS_BY_STATUS: dict = {
    "Draft": 14 * 24,                  # District: 14 days to submit
    "Submitted": 7 * 24,               # Division: 7 days to recommend
    "Division_Recommended": 5 * 24,    # MPCA Treasurer: 5 days to sanction
    "MPCA_Sanctioned": 3 * 24,         # MPCA Treasurer: 3 days to disburse
    "Returned": 5 * 24,                # Originator: 5 days to act
}


class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    recipient_role_id: str               # "division-secretary" / "treasurer" / etc.
    recipient_body_id: str               # body the recipient operates at
    kind: Literal["claim_event", "sla_breach", "info"] = "claim_event"
    title: str
    message: str
    link: Optional[str] = None           # e.g. "/claims"
    related_type: Optional[str] = None   # "claim" / "procurement" / "transfer"
    related_id: Optional[str] = None
    severity: Literal["info", "warning", "critical"] = "info"
    read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


async def _create_notification(
    recipient_role_id: str,
    recipient_body_id: str,
    title: str,
    message: str,
    *,
    link: Optional[str] = None,
    related_type: Optional[str] = None,
    related_id: Optional[str] = None,
    severity: str = "info",
    kind: str = "claim_event",
) -> None:
    n = Notification(
        recipient_role_id=recipient_role_id,
        recipient_body_id=recipient_body_id,
        title=title,
        message=message,
        link=link,
        related_type=related_type,
        related_id=related_id,
        severity=severity,
        kind=kind,
    )
    await db.notifications.insert_one(n.model_dump())


def _recipient_for_new_status(claim_doc: dict, new_status: str):
    """Maps a claim transition to (recipient_role_id, recipient_body_id)."""
    body_id = claim_doc.get("body_id")
    parent_id = claim_doc.get("parent_body_id")
    if new_status == "Submitted":
        # If the submitter is a District, the parent (Division) sees it.
        # If the submitter is the State itself, treasurer at MPCA sees it.
        if parent_id and parent_id != "MPCA":
            return ("division-secretary", parent_id)
        return ("treasurer", "MPCA")
    if new_status == "Division_Recommended":
        return ("treasurer", "MPCA")
    if new_status == "MPCA_Sanctioned":
        return ("treasurer", "MPCA")     # self-reminder to disburse
    if new_status in ("Disbursed", "Rejected", "Returned"):
        return ("district-secretary", body_id)
    return None


async def _notify_for_claim(claim_doc: dict, new_status: str, actor_name: Optional[str]) -> None:
    target = _recipient_for_new_status(claim_doc, new_status)
    if not target:
        return
    role_id, body_id = target
    title_map = {
        "Submitted": f"New claim from {claim_doc.get('body_id')} awaits your recommendation",
        "Division_Recommended": "Claim recommended by Division — awaits MPCA sanction",
        "MPCA_Sanctioned": "Claim sanctioned — pending disbursement",
        "Disbursed": "Your claim has been disbursed",
        "Rejected": "Your claim was rejected",
        "Returned": "Your claim was returned for clarification",
    }
    severity_map = {"Rejected": "critical", "Returned": "warning"}
    msg = (
        f"{claim_doc.get('claim_no')} · {claim_doc.get('title')} · "
        f"₹{(claim_doc.get('amount_inr') or 0):,.0f}"
    )
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=body_id,
        title=title_map.get(new_status, new_status),
        message=msg,
        link="/claims",
        related_type="claim",
        related_id=claim_doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )


# ---- Step 2b · Notifications for Procurement (Phase III.8 module)
def _recipient_for_procurement(pr_doc: dict, new_status: str):
    body_id = pr_doc.get("body_id") or "MPCA"
    if new_status == "Awarded":
        # Vendor selected — notify Treasurer (so they expect a claim shortly)
        return ("treasurer", "MPCA")
    if new_status == "Linked_To_Claim":
        return ("treasurer", "MPCA")
    if new_status in ("Closed", "Cancelled"):
        # Originator (Secretary at the procuring body) hears the outcome
        prefix = body_id.split("-", 1)[0]
        if prefix == "DIST":
            return ("district-secretary", body_id)
        if prefix == "DIV":
            return ("division-secretary", body_id)
        return ("secretary", "MPCA")
    return None


async def _notify_for_procurement(pr_doc: dict, new_status: str, actor_name: Optional[str]) -> None:
    target = _recipient_for_procurement(pr_doc, new_status)
    if not target:
        return
    role_id, target_body = target
    title_map = {
        "Awarded": f"Procurement awarded by {pr_doc.get('body_id')} — claim expected",
        "Linked_To_Claim": "Procurement linked to a Grant Claim",
        "Closed": "Procurement closed",
        "Cancelled": "Procurement cancelled",
    }
    severity_map = {"Cancelled": "warning"}
    msg = (
        f"{pr_doc.get('pr_no')} · {pr_doc.get('title')} · "
        f"₹{(pr_doc.get('awarded_amount_inr') or pr_doc.get('estimated_amount_inr') or 0):,.0f}"
    )
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=target_body,
        title=title_map.get(new_status, f"Procurement: {new_status}"),
        message=msg,
        link="/procurement",
        related_type="procurement",
        related_id=pr_doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )


# ---- Step 2b · Notifications for Player Transfer NOC
def _recipient_for_transfer(tr_doc: dict, new_status: str):
    """Each NOC stage hands off to a different body's secretary."""
    from_body = tr_doc.get("from_body_id")
    to_body = tr_doc.get("to_body_id")

    def _role(body_id: Optional[str]):
        if not body_id:
            return None
        prefix = body_id.split("-", 1)[0]
        if prefix == "DIST":
            return ("district-secretary", body_id)
        if prefix == "DIV":
            return ("division-secretary", body_id)
        return ("secretary", body_id)

    if new_status == "From_Body_Approved":
        # Releasing body signed → notify receiving body
        return _role(to_body)
    if new_status == "To_Body_Approved":
        # Receiving body signed → notify MPCA secretary for final
        return ("secretary", "MPCA")
    if new_status == "MPCA_Approved":
        # MPCA signed → notify both bodies (we'll send 1 — to receiving body)
        return _role(to_body)
    if new_status == "Completed":
        return _role(from_body)
    if new_status == "Rejected":
        return _role(from_body)
    return None


async def _notify_for_transfer(tr_doc: dict, new_status: str, actor_name: Optional[str]) -> None:
    target = _recipient_for_transfer(tr_doc, new_status)
    if not target:
        return
    role_id, target_body = target
    title_map = {
        "From_Body_Approved": f"Player NOC released by {tr_doc.get('from_body_id')} — awaits your acceptance",
        "To_Body_Approved": "Player NOC accepted by receiving body — awaits MPCA approval",
        "MPCA_Approved": "Player NOC approved by MPCA — pending completion",
        "Completed": f"Player transfer to {tr_doc.get('to_body_id')} is complete",
        "Rejected": "Player NOC was rejected",
    }
    severity_map = {"Rejected": "critical"}
    msg = f"{tr_doc.get('noc_no')} · Reason: {(tr_doc.get('reason') or '')[:60]}"
    if actor_name:
        msg += f" · by {actor_name}"
    await _create_notification(
        recipient_role_id=role_id,
        recipient_body_id=target_body,
        title=title_map.get(new_status, new_status),
        message=msg,
        link="/players",
        related_type="transfer",
        related_id=tr_doc.get("id"),
        severity=severity_map.get(new_status, "info"),
    )


def _decorate_claim(doc: dict) -> dict:
    """Add derived `due_at` and `is_overdue` based on SLA + last action timestamp."""
    if not doc:
        return doc
    status = doc.get("status")
    sla_h = SLA_HOURS_BY_STATUS.get(status)
    if not sla_h or status in ("Disbursed", "Rejected"):
        doc["due_at"] = None
        doc["is_overdue"] = False
        return doc
    chain = doc.get("approval_chain") or []
    anchor = chain[-1].get("timestamp") if chain else doc.get("created_at")
    anchor_dt = None
    if anchor:
        try:
            anchor_dt = datetime.fromisoformat(anchor.replace("Z", "+00:00"))
        except Exception:
            anchor_dt = None
    if not anchor_dt:
        doc["due_at"] = None
        doc["is_overdue"] = False
        return doc
    due_dt = anchor_dt + _td(hours=sla_h)
    doc["due_at"] = due_dt.isoformat()
    doc["is_overdue"] = datetime.now(timezone.utc) > due_dt
    return doc


@api_router.post("/claims/{claim_id}/submit", response_model=Claim)
async def submit_claim(claim_id: str, action: ClaimAction):
    """District submits Draft claim → Division (Submitted)."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Draft", "Returned"):
        raise HTTPException(400, f"Cannot submit a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="Submitted",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Submitted",
        notes=action.notes,
    )
    update = _append_step(doc, step, "Submitted")
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Submitted", action.actor_name)

    # Step 4 · run AI gatekeeper on every submission (best-effort; failures degrade to HOLD)
    try:
        verdict = await _run_ai_validation(updated)
        updated = await _apply_ai_verdict(updated, verdict, action.actor_name)
    except Exception as e:
        # Never block submission if AI is down — just log a HOLD note
        logging.exception("AI gatekeeper failure on submit %s: %s", claim_id, e)

    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/recommend", response_model=Claim)
async def recommend_claim(claim_id: str, action: ClaimAction):
    """Division Secretary recommends a Submitted claim → MPCA queue."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "Submitted":
        raise HTTPException(400, f"Cannot recommend a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="Division_Recommended",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Recommended",
        notes=action.notes,
    )
    update = _append_step(doc, step, "Division_Recommended")
    # Once a Division has recommended, the parent for the MPCA queue is MPCA itself.
    update["parent_body_id"] = "MPCA"
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Division_Recommended", action.actor_name)
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/sanction", response_model=Claim)
async def sanction_claim(claim_id: str, action: ClaimAction):
    """MPCA Hon. Treasurer sanctions a Division-recommended claim."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "Division_Recommended":
        raise HTTPException(400, f"Cannot sanction a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="MPCA_Sanctioned",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Sanctioned",
        notes=action.notes,
    )
    update = _append_step(doc, step, "MPCA_Sanctioned")
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "MPCA_Sanctioned", action.actor_name)
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/disburse", response_model=Claim)
async def disburse_claim(claim_id: str, action: ClaimAction):
    """Marks the sanctioned claim as disbursed and atomically creates a
    BankTransaction debit against the source account. Two-signatory is
    enforced for amounts above the threshold (Art. 28(v))."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "MPCA_Sanctioned":
        raise HTTPException(400, f"Cannot disburse a claim in status {doc['status']}")

    amount = doc.get("amount_inr") or 0
    # Two-signatory rule
    if amount > TWO_SIGNATORY_THRESHOLD_INR and not (action.co_signatory_post and action.co_signatory_name):
        raise HTTPException(
            400,
            f"Disbursement above ₹{TWO_SIGNATORY_THRESHOLD_INR:,} requires two signatories "
            "(provide co_signatory_post and co_signatory_name).",
        )

    # Resolve source account — explicit override or the first MPCA General account
    source_account = None
    if action.source_account_id:
        source_account = await db.bank_accounts.find_one(
            {"id": action.source_account_id}, {"_id": 0},
        )
    if not source_account:
        source_account = await db.bank_accounts.find_one(
            {"body_id": "MPCA", "name": {"$regex": "General", "$options": "i"}}, {"_id": 0},
        )
    if not source_account:
        raise HTTPException(400, "No MPCA bank account available for disbursement")
    if (source_account.get("current_balance") or 0) < amount:
        raise HTTPException(
            400,
            f"Insufficient balance in {source_account['name']} "
            f"(₹{source_account['current_balance']:,.0f}) for disbursement of ₹{amount:,.0f}.",
        )

    # Append approval step (with co-signatory note if any)
    notes_with_cosig = (action.notes or "").strip()
    if action.co_signatory_post and action.co_signatory_name:
        cosig_line = f"Co-signed by {action.co_signatory_post} · {action.co_signatory_name}."
        notes_with_cosig = (notes_with_cosig + " " if notes_with_cosig else "") + cosig_line

    step = ApprovalStep(
        stage="Disbursed",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Disbursed",
        notes=notes_with_cosig or None,
    )
    update = _append_step(doc, step, "Disbursed")

    # Atomically debit the bank account and write a transaction with claim linkage
    new_balance = round((source_account.get("current_balance") or 0) - amount, 2)
    txn_ref = f"CLAIM/{doc['claim_no']}"
    bank_txn = BankTransaction(
        body_id="MPCA",
        account_id=source_account["id"],
        date=datetime.now(timezone.utc).date().isoformat(),
        txn_type="Debit",
        amount=amount,
        narration=f"Grant disbursement — {doc['claim_no']} · {doc['title']} → {doc['body_id']}",
        reference=txn_ref,
        approved_by=action.actor_post,
        balance_after=new_balance,
    )
    await db.bank_txns.insert_one(bank_txn.model_dump())
    await db.bank_accounts.update_one(
        {"id": source_account["id"]}, {"$set": {"current_balance": new_balance}},
    )

    # Link the txn id back into the claim for traceability
    update["disbursement_txn_id"] = bank_txn.id
    update["disbursement_account_id"] = source_account["id"]

    await db.claims.update_one({"id": claim_id}, {"$set": update})
    return await db.claims.find_one({"id": claim_id}, {"_id": 0})


@api_router.post("/claims/{claim_id}/reject", response_model=Claim)
async def reject_claim(claim_id: str, action: ClaimAction):
    """Reject at any non-terminal stage."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] in ("Disbursed", "Rejected"):
        raise HTTPException(400, f"Cannot reject a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="Rejected",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Rejected",
        notes=action.notes,
    )
    update = _append_step(doc, step, "Rejected")
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Rejected", action.actor_name)
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/return", response_model=Claim)
async def return_claim(claim_id: str, action: ClaimAction):
    """Send the claim back to the originator for clarification."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc["status"] not in ("Submitted", "Division_Recommended"):
        raise HTTPException(400, f"Cannot return a claim in status {doc['status']}")
    step = ApprovalStep(
        stage="Returned",
        actor_post=action.actor_post,
        actor_name=action.actor_name,
        actor_body_id=action.actor_body_id,
        decision="Returned",
        notes=action.notes,
    )
    update = _append_step(doc, step, "Returned")
    # When returned, the parent becomes the originating body so it shows in their queue
    update["parent_body_id"] = await _resolve_parent_body(doc["body_id"])
    await db.claims.update_one({"id": claim_id}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    await _notify_for_claim(updated, "Returned", action.actor_name)
    return _decorate_claim(updated)


@api_router.get("/claims-stats/summary")
async def claims_stats():
    """Top-of-page tile data: total / pending / disbursed / amount."""
    total = await db.claims.count_documents({})
    pending = await db.claims.count_documents({"status": {"$in": ["Submitted", "Division_Recommended"]}})
    disbursed = await db.claims.count_documents({"status": "Disbursed"})
    rejected = await db.claims.count_documents({"status": "Rejected"})

    pipeline = [
        {"$match": {"status": "Disbursed"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_inr"}}},
    ]
    cursor = db.claims.aggregate(pipeline)
    total_disbursed_amt = 0.0
    async for row in cursor:
        total_disbursed_amt = row.get("total", 0.0)

    pipeline2 = [
        {"$match": {"status": {"$in": ["Submitted", "Division_Recommended", "MPCA_Sanctioned"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_inr"}}},
    ]
    cursor2 = db.claims.aggregate(pipeline2)
    total_in_flight_amt = 0.0
    async for row in cursor2:
        total_in_flight_amt = row.get("total", 0.0)

    return {
        "total_claims": total,
        "pending_claims": pending,
        "disbursed_claims": disbursed,
        "rejected_claims": rejected,
        "amount_disbursed_inr": total_disbursed_amt,
        "amount_in_flight_inr": total_in_flight_amt,
    }


# ---------------- Routes: Body Budgets & Reconciliation (Phase III.7) ----------------


@api_router.get("/budgets")
async def list_budgets(fiscal_cycle: str = "2025-26", body_id: Optional[str] = None):
    """Returns every body's budget for a cycle, reconciled live against claims."""
    bodies_query: dict = {}
    if body_id:
        bodies_query["code"] = body_id
    bodies = await db.bodies.find(bodies_query, {"_id": 0}).sort("code", 1).to_list(200)

    # Pre-load all existing budget overrides
    budget_docs = await db.body_budgets.find(
        {"fiscal_cycle": fiscal_cycle}, {"_id": 0},
    ).to_list(500)
    budgets_by_body = {b["body_id"]: b for b in budget_docs}

    # Aggregate claim totals once
    pipeline = [
        {"$match": {"fiscal_cycle": fiscal_cycle}},
        {"$group": {
            "_id": {"body_id": "$body_id", "status": "$status"},
            "total": {"$sum": "$amount_inr"},
            "count": {"$sum": 1},
        }},
    ]
    sums: dict = {}
    async for row in db.claims.aggregate(pipeline):
        b = row["_id"]["body_id"]
        st = row["_id"]["status"]
        sums.setdefault(b, {}).setdefault(st, {"total": 0.0, "count": 0})
        sums[b][st]["total"] = row["total"]
        sums[b][st]["count"] = row["count"]

    rows = []
    for body in bodies:
        code = body["code"]
        override = budgets_by_body.get(code)
        # Default budget = the body's annual_grant_inr (state/BCCI are sources, not consumers)
        if body["body_type"] in ("BCCI", "State"):
            default_budget = 0.0
        else:
            default_budget = body.get("annual_grant_inr", 0.0)
        annual = override["annual_budget_inr"] if override else default_budget

        body_sums = sums.get(code, {})
        committed = sum(
            (body_sums.get(s, {}).get("total", 0.0))
            for s in ("Draft", "Submitted", "Division_Recommended", "MPCA_Sanctioned")
        )
        disbursed = body_sums.get("Disbursed", {}).get("total", 0.0)
        rejected = body_sums.get("Rejected", {}).get("total", 0.0)
        available = round(annual - committed - disbursed, 2)
        utilisation_pct = round(((committed + disbursed) / annual) * 100, 1) if annual else 0.0

        rows.append({
            "body_id": code,
            "body_name": body["name"],
            "body_type": body["body_type"],
            "fiscal_cycle": fiscal_cycle,
            "annual_budget_inr": annual,
            "committed_inr": round(committed, 2),
            "disbursed_inr": round(disbursed, 2),
            "rejected_inr": round(rejected, 2),
            "available_inr": available,
            "utilisation_pct": utilisation_pct,
            "claim_count": sum(v["count"] for v in body_sums.values()),
        })
    return rows


@api_router.get("/budgets/{body_id}")
async def get_budget(body_id: str, fiscal_cycle: str = "2025-26"):
    all_rows = await list_budgets(fiscal_cycle=fiscal_cycle, body_id=body_id)
    if not all_rows:
        raise HTTPException(404, f"Body {body_id} not found")
    return all_rows[0]


@api_router.post("/budgets", response_model=BodyBudget)
async def upsert_budget(payload: BodyBudgetCreate):
    """Set/override the annual budget for a body × cycle."""
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    existing = await db.body_budgets.find_one(
        {"body_id": payload.body_id, "fiscal_cycle": payload.fiscal_cycle}, {"_id": 0},
    )
    if existing:
        await db.body_budgets.update_one(
            {"id": existing["id"]},
            {"$set": {"annual_budget_inr": payload.annual_budget_inr, "note": payload.note}},
        )
        return await db.body_budgets.find_one({"id": existing["id"]}, {"_id": 0})
    doc = BodyBudget(**payload.model_dump())
    await db.body_budgets.insert_one(doc.model_dump())
    return doc


@api_router.get("/sanction-thresholds")
async def sanction_thresholds():
    """Public reference: Art. 28(v) sanctioning matrix and the 2-signatory threshold."""
    return {
        "thresholds": [{"post": t["post"], "limit_inr": t["limit_inr"] if t["limit_inr"] != float("inf") else None, "scope": t["scope"]} for t in SANCTION_THRESHOLDS],
        "two_signatory_threshold_inr": TWO_SIGNATORY_THRESHOLD_INR,
    }


# ---------------- Routes: Procurement (Phase III.8) ----------------


async def _next_pr_no(cycle: str) -> str:
    count = await db.procurement_requests.count_documents({"fiscal_cycle": cycle})
    return f"PR-{cycle}-{count + 1:03d}"


@api_router.get("/procurement", response_model=List[ProcurementRequest])
async def list_procurement(
    body_id: Optional[str] = None,
    status: Optional[ProcurementStatus] = None,
    method: Optional[ProcurementMethod] = None,
    fiscal_cycle: Optional[str] = None,
):
    query: dict = {}
    if body_id:
        query["body_id"] = body_id
    if status:
        query["status"] = status
    if method:
        query["method"] = method
    if fiscal_cycle:
        query["fiscal_cycle"] = fiscal_cycle
    docs = await db.procurement_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.get("/procurement/{pr_id}", response_model=ProcurementRequest)
async def get_procurement(pr_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    return doc


@api_router.post("/procurement", response_model=ProcurementRequest)
async def create_procurement(payload: ProcurementRequestCreate):
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    method = _procurement_method_for(payload.estimated_amount_inr)
    pr_no = await _next_pr_no(payload.fiscal_cycle)
    pr = ProcurementRequest(
        pr_no=pr_no,
        method=method,
        **payload.model_dump(),
    )
    await db.procurement_requests.insert_one(pr.model_dump())
    return pr


@api_router.post("/procurement/{pr_id}/quotations", response_model=ProcurementRequest)
async def add_quotation(pr_id: str, quote: Quotation):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] not in ("Draft", "Quotes_Collected"):
        raise HTTPException(400, f"Cannot add quotation in status {doc['status']}")
    quotations = doc.get("quotations", []) or []
    quotations.append(quote.model_dump())
    update = {
        "quotations": quotations,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # If this is the 3rd+ quote and method requires it, transition to Quotes_Collected
    if len(quotations) >= 3 and doc["method"] in ("Three_Quote", "QCBS"):
        update["status"] = "Quotes_Collected"
    elif doc["method"] == "Direct" and len(quotations) >= 1:
        update["status"] = "Quotes_Collected"
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    return await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})


@api_router.post("/procurement/{pr_id}/award", response_model=ProcurementRequest)
async def award_procurement(pr_id: str, payload: AwardPayload):
    """Award the contract — enforces 3-quote rule, QCBS rule, and L1-or-justify."""
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] not in ("Draft", "Quotes_Collected"):
        raise HTTPException(400, f"Cannot award in status {doc['status']}")

    quotations = doc.get("quotations", []) or []
    method = doc["method"]
    if method in ("Three_Quote", "QCBS") and len(quotations) < 3:
        raise HTTPException(
            400,
            f"Procurement method '{method}' requires at least 3 quotations "
            f"(currently {len(quotations)}). Please attach more quotations.",
        )

    # Verify awarded vendor is one of the quoted vendors
    quoted_vendors = {q["vendor_name"]: q for q in quotations}
    if payload.awarded_vendor not in quoted_vendors:
        raise HTTPException(400, f"Awarded vendor '{payload.awarded_vendor}' is not among the quoted vendors.")

    # L1 check — if awarded is not the lowest quote, demand a justification note
    lowest = min(quotations, key=lambda q: q["quote_amount_inr"])
    if payload.awarded_vendor != lowest["vendor_name"]:
        if not (payload.notes and len(payload.notes.strip()) > 10):
            raise HTTPException(
                400,
                f"Awarding to '{payload.awarded_vendor}' over L1 ('{lowest['vendor_name']}' "
                f"at ₹{lowest['quote_amount_inr']:,.0f}) requires a justification note "
                "(min 10 chars) recorded in `notes`.",
            )

    update = {
        "awarded_vendor": payload.awarded_vendor,
        "awarded_amount_inr": payload.awarded_amount_inr,
        "security_deposit_inr": payload.security_deposit_inr,
        "status": "Awarded",
        "notes": payload.notes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Awarded", None)
    return updated


@api_router.post("/procurement/{pr_id}/link-claim/{claim_id}", response_model=ProcurementRequest)
async def link_procurement_claim(pr_id: str, claim_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    claim = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Claim not found")
    if doc["status"] != "Awarded":
        raise HTTPException(400, "Only Awarded procurement requests may be linked to a claim")
    update = {
        "linked_claim_id": claim_id,
        "status": "Linked_To_Claim",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Linked_To_Claim", None)
    return updated


@api_router.post("/procurement/{pr_id}/close", response_model=ProcurementRequest)
async def close_procurement(pr_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] not in ("Awarded", "Linked_To_Claim"):
        raise HTTPException(400, f"Cannot close a procurement request in status {doc['status']}")
    update = {
        "status": "Closed",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Closed", None)
    return updated


@api_router.post("/procurement/{pr_id}/cancel", response_model=ProcurementRequest)
async def cancel_procurement(pr_id: str):
    doc = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Procurement request not found")
    if doc["status"] in ("Closed", "Cancelled"):
        raise HTTPException(400, f"Cannot cancel a procurement request in status {doc['status']}")
    update = {
        "status": "Cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.procurement_requests.update_one({"id": pr_id}, {"$set": update})
    updated = await db.procurement_requests.find_one({"id": pr_id}, {"_id": 0})
    await _notify_for_procurement(updated, "Cancelled", None)
    return updated


# ---------------- Routes: ABC Expenditure Analysis (Phase III.8) ----------------


@api_router.get("/finance/abc-analysis")
async def abc_analysis(fiscal_cycle: str = "2025-26"):
    """Pareto-style ABC bucketing of disbursed expenditure.
    A = top ~70% of value · B = next ~20% · C = trailing ~10%.

    Returns per-claim row with bucket + cumulative %, plus bucket totals."""
    pipeline = [
        {"$match": {"status": "Disbursed", "fiscal_cycle": fiscal_cycle}},
        {"$sort": {"amount_inr": -1}},
    ]
    rows: List[dict] = []
    async for c in db.claims.aggregate(pipeline):
        rows.append({
            "claim_id": c["id"],
            "claim_no": c["claim_no"],
            "title": c["title"],
            "category": c["category"],
            "body_id": c["body_id"],
            "amount_inr": c["amount_inr"],
        })
    total = sum(r["amount_inr"] for r in rows) or 1.0
    cumulative = 0.0
    out_rows = []
    buckets = {"A": {"count": 0, "total_inr": 0.0}, "B": {"count": 0, "total_inr": 0.0}, "C": {"count": 0, "total_inr": 0.0}}
    for r in rows:
        prev_cum_pct = cumulative / total * 100
        cumulative += r["amount_inr"]
        cum_pct = cumulative / total * 100
        # Bucket = the bucket the item crossed *into* (so the item that
        # pushes you past 70% is still an A-item; ABC pareto convention).
        if prev_cum_pct < 70:
            bucket = "A"
        elif prev_cum_pct < 90:
            bucket = "B"
        else:
            bucket = "C"
        r["bucket"] = bucket
        r["cum_pct"] = round(cum_pct, 1)
        r["share_pct"] = round(r["amount_inr"] / total * 100, 1)
        buckets[bucket]["count"] += 1
        buckets[bucket]["total_inr"] += r["amount_inr"]
        out_rows.append(r)
    return {
        "fiscal_cycle": fiscal_cycle,
        "total_disbursed_inr": total if rows else 0,
        "buckets": buckets,
        "rows": out_rows,
    }


# ---------------- Routes: Player Module (Phase IV — M1) ----------------


async def _next_player_id() -> str:
    """Format: MPCA/YYYY/SERIAL (6-digit, zero-padded)."""
    year = datetime.now(timezone.utc).year
    count = await db.players.count_documents({"player_id": {"$regex": f"^MPCA/{year}/"}})
    return f"MPCA/{year}/{count + 1:06d}"


def _age_years(dob: str) -> int:
    """Compute integer age from ISO date string (YYYY-MM-DD)."""
    try:
        d = datetime.strptime(dob, "%Y-%m-%d")
    except Exception:
        return 0
    today = datetime.now(timezone.utc)
    yrs = today.year - d.year
    if (today.month, today.day) < (d.month, d.day):
        yrs -= 1
    return yrs


def _validate_eligibility(p: PlayerCreate) -> tuple[bool, List[str]]:
    """Encodes the Player Rules tab. Returns (ok, [notes])."""
    notes: List[str] = []
    age = _age_years(p.date_of_birth)
    notes.append(f"Computed age: {age} years.")
    if age < 12:
        notes.append("Below the MPCA minimum playing age of 12 — registration permitted but eligibility for senior categories restricted.")
    if age > 60:
        notes.append("Above 60 — registration permitted for veterans/coaches stream only.")

    # Category-specific
    if p.category == "Local_MP":
        if p.domicile_state and p.domicile_state.lower() != "madhya pradesh":
            return False, notes + [
                f"Category 'Local_MP' requires MP domicile, but domicile_state is '{p.domicile_state}'. "
                "Switch category to 'Born_Outside' or update domicile."
            ]
        notes.append("Local-MP — full eligibility across MPCA tournaments.")
    elif p.category == "Born_Outside":
        notes.append("Born-Outside MP — eligible after 5 years of continuous MP residency (Plan §Player Rules).")
        if not p.address_district:
            notes.append("⚠ Address district missing — required to evidence residency.")
    else:  # Guest
        if not p.tw3_verified:
            return False, notes + [
                "Guest players require TW3 maturity verification (Plan §Player Rules). "
                "Set tw3_verified=true once the panel has cleared the player."
            ]
        notes.append("Guest — eligible only for guest-permitting tournaments; per-tournament cap applies.")

    # Identity essentials
    if not p.contact_phone and not p.guardian_phone:
        notes.append("⚠ Neither contact_phone nor guardian_phone provided — registration accepted but please update.")

    return True, notes


@api_router.get("/players", response_model=List[Player])
async def list_players(
    body_id: Optional[str] = None,
    category: Optional[PlayerCategory] = None,
    status: Optional[PlayerStatus] = None,
    search: Optional[str] = None,
):
    query: dict = {}
    if body_id:
        query["body_id"] = body_id
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"player_id": {"$regex": search, "$options": "i"}},
            {"contact_email": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.players.find(query, {"_id": 0}).sort("registered_on", -1).to_list(2000)
    return docs


@api_router.get("/players/{pid}", response_model=Player)
async def get_player(pid: str):
    """Fetch by either id (uuid) or player_id (MPCA/...)."""
    doc = await db.players.find_one({"$or": [{"id": pid}, {"player_id": pid}]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    return doc


@api_router.post("/players/check-eligibility")
async def check_eligibility(payload: PlayerCreate):
    """Dry-run eligibility validator. Returns ok + notes without inserting."""
    ok, notes = _validate_eligibility(payload)
    return {
        "ok": ok,
        "age_years": _age_years(payload.date_of_birth),
        "notes": notes,
    }


@api_router.post("/players", response_model=Player)
async def create_player(payload: PlayerCreate):
    """Register a new player. Runs eligibility validator first (hard-fails on category errors)."""
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    ok, notes = _validate_eligibility(payload)
    if not ok:
        raise HTTPException(400, " · ".join(notes))
    pid = await _next_player_id()
    player = Player(
        player_id=pid,
        eligibility_notes=notes,
        status="Pending",
        **payload.model_dump(),
    )
    await db.players.insert_one(player.model_dump())
    return player


@api_router.post("/players/{pid}/approve", response_model=Player)
async def approve_player(pid: str):
    """District/MPCA approves a Pending registration → Active."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] != "Pending":
        raise HTTPException(400, f"Cannot approve a player in status {doc['status']}")
    await db.players.update_one(
        {"id": pid},
        {"$set": {"status": "Active"}},
    )
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/disqualify", response_model=Player)
async def disqualify_player(pid: str, flag: DisqualificationFlag):
    """Append a disqualification flag (ban/penalty) and update status."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    flags = doc.get("disqualifications", []) or []
    flags.append(flag.model_dump())
    new_status = "Banned" if flag.kind == "Lifetime_Ban" else "Suspended"
    await db.players.update_one(
        {"id": pid},
        {"$set": {"disqualifications": flags, "status": new_status}},
    )
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.post("/players/{pid}/reinstate", response_model=Player)
async def reinstate_player(pid: str):
    """Reinstate a Suspended player back to Active."""
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Player not found")
    if doc["status"] not in ("Suspended",):
        raise HTTPException(400, f"Cannot reinstate from status {doc['status']}")
    await db.players.update_one({"id": pid}, {"$set": {"status": "Active"}})
    return await db.players.find_one({"id": pid}, {"_id": 0})


@api_router.get("/players-stats/summary")
async def players_stats():
    total = await db.players.count_documents({})
    active = await db.players.count_documents({"status": "Active"})
    pending = await db.players.count_documents({"status": "Pending"})
    suspended = await db.players.count_documents({"status": "Suspended"})
    by_cat = {}
    for cat in ("Local_MP", "Born_Outside", "Guest"):
        by_cat[cat] = await db.players.count_documents({"category": cat})
    return {
        "total_players": total,
        "active_players": active,
        "pending_players": pending,
        "suspended_players": suspended,
        "by_category": by_cat,
    }


# ---------------- Routes: Player Transfers (NOC Workflow) ----------------


async def _next_noc_no(cycle: str) -> str:
    count = await db.transfer_requests.count_documents({"fiscal_cycle": cycle})
    return f"NOC-{cycle}-{count + 1:03d}"


@api_router.get("/transfers", response_model=List[TransferRequest])
async def list_transfers(
    player_id: Optional[str] = None,
    from_body_id: Optional[str] = None,
    to_body_id: Optional[str] = None,
    status: Optional[TransferStatus] = None,
):
    query: dict = {}
    if player_id:
        query["player_id"] = player_id
    if from_body_id:
        query["from_body_id"] = from_body_id
    if to_body_id:
        query["to_body_id"] = to_body_id
    if status:
        query["status"] = status
    docs = await db.transfer_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.post("/transfers", response_model=TransferRequest)
async def create_transfer(payload: TransferCreate):
    player = await db.players.find_one({"id": payload.player_id}, {"_id": 0})
    if not player:
        raise HTTPException(404, "Player not found")
    if payload.from_body_id != player["body_id"]:
        raise HTTPException(400, f"Player is registered with {player['body_id']}, not {payload.from_body_id}")
    if payload.from_body_id == payload.to_body_id:
        raise HTTPException(400, "from_body_id and to_body_id must differ")
    from_body = await db.bodies.find_one({"code": payload.from_body_id}, {"_id": 0})
    to_body = await db.bodies.find_one({"code": payload.to_body_id}, {"_id": 0})
    if not from_body or not to_body:
        raise HTTPException(400, "from_body_id or to_body_id does not exist")
    noc_no = await _next_noc_no(payload.fiscal_cycle)
    tr = TransferRequest(noc_no=noc_no, **payload.model_dump())
    await db.transfer_requests.insert_one(tr.model_dump())
    return tr


async def _transfer_action(tr_id: str, new_status: TransferStatus, allowed_from: tuple, step: ApprovalStep):
    doc = await db.transfer_requests.find_one({"id": tr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Transfer request not found")
    if doc["status"] not in allowed_from:
        raise HTTPException(400, f"Cannot move from status {doc['status']} to {new_status}")
    chain = doc.get("approval_chain", []) or []
    chain.append(step.model_dump())
    update = {
        "status": new_status,
        "approval_chain": chain,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transfer_requests.update_one({"id": tr_id}, {"$set": update})
    updated = await db.transfer_requests.find_one({"id": tr_id}, {"_id": 0})
    await _notify_for_transfer(updated, new_status, step.actor_name)
    return updated


@api_router.post("/transfers/{tr_id}/approve-from", response_model=TransferRequest)
async def approve_from(tr_id: str, action: ClaimAction):
    """Releasing body (from_body_id) signs off."""
    step = ApprovalStep(stage="From_Body_Approved", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Recommended", notes=action.notes)
    return await _transfer_action(tr_id, "From_Body_Approved", ("Draft",), step)


@api_router.post("/transfers/{tr_id}/approve-to", response_model=TransferRequest)
async def approve_to(tr_id: str, action: ClaimAction):
    """Accepting body (to_body_id) confirms acceptance."""
    step = ApprovalStep(stage="To_Body_Approved", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Recommended", notes=action.notes)
    return await _transfer_action(tr_id, "To_Body_Approved", ("From_Body_Approved",), step)


@api_router.post("/transfers/{tr_id}/approve-mpca", response_model=TransferRequest)
async def approve_mpca_transfer(tr_id: str, action: ClaimAction):
    """MPCA final sign-off."""
    step = ApprovalStep(stage="MPCA_Approved", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Sanctioned", notes=action.notes)
    return await _transfer_action(tr_id, "MPCA_Approved", ("To_Body_Approved",), step)


@api_router.post("/transfers/{tr_id}/complete", response_model=TransferRequest)
async def complete_transfer(tr_id: str, action: ClaimAction):
    """Final action — moves the player's body_id and sets status='Transferred' on the previous record."""
    doc = await db.transfer_requests.find_one({"id": tr_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Transfer request not found")
    if doc["status"] != "MPCA_Approved":
        raise HTTPException(400, "Transfer must be MPCA-approved before completion")
    # Move the player
    await db.players.update_one(
        {"id": doc["player_id"]},
        {"$set": {"body_id": doc["to_body_id"]}},
    )
    step = ApprovalStep(stage="Completed", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Disbursed", notes=action.notes)
    return await _transfer_action(tr_id, "Completed", ("MPCA_Approved",), step)


@api_router.post("/transfers/{tr_id}/reject", response_model=TransferRequest)
async def reject_transfer(tr_id: str, action: ClaimAction):
    step = ApprovalStep(stage="Rejected", actor_post=action.actor_post, actor_name=action.actor_name, actor_body_id=action.actor_body_id, decision="Rejected", notes=action.notes)
    return await _transfer_action(tr_id, "Rejected", ("Draft", "From_Body_Approved", "To_Body_Approved", "MPCA_Approved"), step)


# ---------------- Routes: Tournaments (Phase IV.2 — M2) ----------------


async def _next_tournament_no(cycle: str) -> str:
    count = await db.tournaments.count_documents({"fiscal_cycle": cycle})
    return f"TRN-{cycle}-{count + 1:03d}"


@api_router.get("/tournaments", response_model=List[Tournament])
async def list_tournaments(
    status: Optional[TournamentStatus] = None,
    scope: Optional[TournamentScope] = None,
    fiscal_cycle: Optional[str] = None,
    format: Optional[TournamentFormat] = None,
):
    query: dict = {}
    if status:
        query["status"] = status
    if scope:
        query["scope"] = scope
    if fiscal_cycle:
        query["fiscal_cycle"] = fiscal_cycle
    if format:
        query["format"] = format
    docs = await db.tournaments.find(query, {"_id": 0}).sort("start_date", 1).to_list(200)
    return docs


@api_router.get("/tournaments/{tid}", response_model=Tournament)
async def get_tournament(tid: str):
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    return doc


@api_router.post("/tournaments", response_model=Tournament)
async def create_tournament(payload: TournamentCreate):
    host = await db.bodies.find_one({"code": payload.host_body_id}, {"_id": 0})
    if not host:
        raise HTTPException(400, f"Host body {payload.host_body_id} does not exist")
    if payload.age_floor_years and payload.age_cap_years and payload.age_floor_years > payload.age_cap_years:
        raise HTTPException(400, "age_floor_years cannot exceed age_cap_years")
    t = Tournament(
        tournament_no=await _next_tournament_no(payload.fiscal_cycle),
        **payload.model_dump(),
    )
    await db.tournaments.insert_one(t.model_dump())
    return t


@api_router.post("/tournaments/{tid}/status/{new_status}", response_model=Tournament)
async def set_tournament_status(tid: str, new_status: TournamentStatus):
    """Manually transition a tournament between Upcoming → Squad_Selection → In_Progress → Completed (or Cancelled)."""
    doc = await db.tournaments.find_one({"id": tid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Tournament not found")
    allowed = {
        "Upcoming": ["Squad_Selection", "Cancelled"],
        "Squad_Selection": ["In_Progress", "Upcoming", "Cancelled"],
        "In_Progress": ["Completed", "Cancelled"],
        "Completed": [],
        "Cancelled": [],
    }
    if new_status not in allowed.get(doc["status"], []):
        raise HTTPException(400, f"Cannot move tournament from {doc['status']} to {new_status}")
    await db.tournaments.update_one({"id": tid}, {"$set": {"status": new_status}})
    return await db.tournaments.find_one({"id": tid}, {"_id": 0})


# ---------------- Routes: Squads ----------------


@api_router.get("/tournaments/{tid}/squads", response_model=List[Squad])
async def list_squads(tid: str):
    docs = await db.squads.find({"tournament_id": tid}, {"_id": 0}).sort("team_name", 1).to_list(100)
    return docs


@api_router.post("/squads", response_model=Squad)
async def create_squad(payload: SquadCreate):
    t = await db.tournaments.find_one({"id": payload.tournament_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    body = await db.bodies.find_one({"code": payload.body_id}, {"_id": 0})
    if not body:
        raise HTTPException(400, f"Body {payload.body_id} does not exist")
    # Disallow duplicate squad per tournament × body
    existing = await db.squads.find_one({"tournament_id": payload.tournament_id, "body_id": payload.body_id})
    if existing:
        raise HTTPException(400, f"A squad for {payload.body_id} already exists in this tournament")
    squad = Squad(**payload.model_dump())
    await db.squads.insert_one(squad.model_dump())
    return squad


def _check_player_against_tournament(player: dict, t: dict) -> tuple[bool, List[str]]:
    """Returns (ok, [warnings])."""
    warnings: List[str] = []
    age = _age_years(player.get("date_of_birth") or "")
    if t.get("age_cap_years") and age > t["age_cap_years"]:
        return False, [f"Player age {age} exceeds tournament cap of U-{t['age_cap_years']}."]
    if t.get("age_floor_years") and age < t["age_floor_years"]:
        return False, [f"Player age {age} below tournament floor of {t['age_floor_years']}."]
    if player.get("category") == "Guest" and not t.get("allows_guests"):
        return False, [f"Tournament '{t['name']}' does not permit Guest-category players."]
    if player.get("status") in ("Suspended", "Banned"):
        return False, [f"Player is currently {player['status']} and cannot be selected."]
    if player.get("status") == "Pending":
        warnings.append("Player registration is still Pending — should be approved before tournament.")
    return True, warnings


@api_router.post("/squads/{squad_id}/players", response_model=Squad)
async def add_player_to_squad(squad_id: str, payload: SquadAddPlayer):
    squad = await db.squads.find_one({"id": squad_id}, {"_id": 0})
    if not squad:
        raise HTTPException(404, "Squad not found")
    t = await db.tournaments.find_one({"id": squad["tournament_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tournament not found")
    if t["status"] not in ("Upcoming", "Squad_Selection"):
        raise HTTPException(400, f"Cannot modify squad once tournament is {t['status']}")
    player = await db.players.find_one({"id": payload.player_id}, {"_id": 0})
    if not player:
        raise HTTPException(404, "Player not found")

    # Player must belong to the same body as the squad (or a descendant district under a Division squad)
    if squad["body_id"].startswith("DIV-"):
        # Division squad: any district under it is fine
        div_short = squad["body_id"][-3:]
        if not (player["body_id"] == squad["body_id"] or player["body_id"].endswith(div_short)):
            raise HTTPException(400, f"Player {player['player_id']} (body {player['body_id']}) does not belong to {squad['body_id']} or its districts.")
    elif squad["body_id"].startswith("DIST-"):
        if player["body_id"] != squad["body_id"]:
            raise HTTPException(400, f"Player {player['player_id']} (body {player['body_id']}) does not belong to {squad['body_id']}.")

    # Already in squad?
    if any(m["player_id"] == player["id"] for m in squad.get("members", [])):
        raise HTTPException(400, "Player is already in this squad")
    # Capacity check
    if len(squad.get("members", [])) >= t.get("max_squad_size", 18):
        raise HTTPException(400, f"Squad is full (max {t['max_squad_size']} members)")
    # Eligibility against tournament rules
    ok, warns = _check_player_against_tournament(player, t)
    if not ok:
        raise HTTPException(400, " · ".join(warns))

    # Captain uniqueness
    if payload.is_captain:
        for m in squad.get("members", []):
            m["is_captain"] = False

    new_member = SquadMember(
        player_id=player["id"],
        player_no=player["player_id"],
        full_name=player["full_name"],
        role=player["role"],
        is_captain=payload.is_captain,
        is_keeper=payload.is_keeper or player["role"] == "Wicket_Keeper",
    )
    members = (squad.get("members") or []) + [new_member.model_dump()]
    warnings = list(squad.get("eligibility_warnings", []) or [])
    if warns:
        warnings.append(f"{player['player_id']} · " + " · ".join(warns))
    await db.squads.update_one(
        {"id": squad_id},
        {"$set": {"members": members, "eligibility_warnings": warnings}},
    )
    return await db.squads.find_one({"id": squad_id}, {"_id": 0})


@api_router.delete("/squads/{squad_id}/players/{player_id}", response_model=Squad)
async def remove_player_from_squad(squad_id: str, player_id: str):
    squad = await db.squads.find_one({"id": squad_id}, {"_id": 0})
    if not squad:
        raise HTTPException(404, "Squad not found")
    t = await db.tournaments.find_one({"id": squad["tournament_id"]}, {"_id": 0})
    if t and t["status"] not in ("Upcoming", "Squad_Selection"):
        raise HTTPException(400, f"Cannot modify squad once tournament is {t['status']}")
    members = [m for m in (squad.get("members") or []) if m["player_id"] != player_id]
    if len(members) == len(squad.get("members") or []):
        raise HTTPException(404, "Player is not in this squad")
    await db.squads.update_one({"id": squad_id}, {"$set": {"members": members}})
    return await db.squads.find_one({"id": squad_id}, {"_id": 0})


@api_router.get("/tournaments-stats/summary")
async def tournament_stats():
    total = await db.tournaments.count_documents({})
    upcoming = await db.tournaments.count_documents({"status": "Upcoming"})
    selection = await db.tournaments.count_documents({"status": "Squad_Selection"})
    in_progress = await db.tournaments.count_documents({"status": "In_Progress"})
    completed = await db.tournaments.count_documents({"status": "Completed"})
    squads = await db.squads.count_documents({})
    # selected players (sum of member counts via aggregation)
    pipeline = [{"$project": {"sz": {"$size": {"$ifNull": ["$members", []]}}}}, {"$group": {"_id": None, "total": {"$sum": "$sz"}}}]
    selected = 0
    async for row in db.squads.aggregate(pipeline):
        selected = row.get("total", 0)
    return {
        "total_tournaments": total,
        "upcoming": upcoming,
        "in_selection": selection,
        "in_progress": in_progress,
        "completed": completed,
        "total_squads": squads,
        "total_players_selected": selected,
    }


@api_router.get("/")
async def root():
    return {"app": "MPCA ERP", "version": "4.1.0", "status": "ok"}


# ============================================================
# Step 2 · Notification endpoints (G3-a · in-app bell)
# ============================================================

@api_router.get("/notifications", response_model=List[Notification])
async def list_notifications(
    recipient_role_id: str,
    recipient_body_id: Optional[str] = None,
    unread_only: bool = False,
    limit: int = 100,
):
    q: dict = {"recipient_role_id": recipient_role_id}
    if recipient_body_id:
        q["recipient_body_id"] = recipient_body_id
    if unread_only:
        q["read"] = False
    docs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


@api_router.get("/notifications/stats")
async def notifications_stats(
    recipient_role_id: str,
    recipient_body_id: Optional[str] = None,
):
    q: dict = {"recipient_role_id": recipient_role_id, "read": False}
    if recipient_body_id:
        q["recipient_body_id"] = recipient_body_id
    unread = await db.notifications.count_documents(q)
    return {"unread": unread}


@api_router.post("/notifications/{nid}/read")
async def mark_notification_read(nid: str):
    result = await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}


@api_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    recipient_role_id: str,
    recipient_body_id: Optional[str] = None,
):
    q: dict = {"recipient_role_id": recipient_role_id, "read": False}
    if recipient_body_id:
        q["recipient_body_id"] = recipient_body_id
    result = await db.notifications.update_many(q, {"$set": {"read": True}})
    return {"ok": True, "updated": result.modified_count}


# ============================================================
# Step 3 · Real File Uploads (Feb 2026)
# Replaces mocked URL strings — prereq for AI grant validation
# Files stored on disk at /app/backend/uploads/<yyyy-mm>/<uuid>.<ext>
# Metadata in `uploads` collection
# ============================================================

UPLOAD_ROOT = ROOT_DIR / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.ms-excel",
}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024   # 20 MB cap

EXT_BY_MIME = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/msword": ".doc",
    "application/vnd.ms-excel": ".xls",
}


class UploadRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    original_name: str
    size_bytes: int
    mime_type: str
    body_id: Optional[str] = None
    uploaded_by: Optional[str] = None
    related_type: Optional[str] = None     # "claim" / "procurement" / "transfer"
    related_id: Optional[str] = None
    url: str                                # "/api/uploads/{id}"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@api_router.post("/uploads", response_model=UploadRecord)
async def upload_file(
    file: UploadFile = File(...),
    body_id: Optional[str] = Form(None),
    uploaded_by: Optional[str] = Form(None),
    related_type: Optional[str] = Form(None),
    related_id: Optional[str] = Form(None),
):
    if file.content_type not in ALLOWED_MIMES:
        raise HTTPException(
            400,
            f"Unsupported file type {file.content_type}. Allowed: PDF, JPEG/PNG/WebP, DOCX, XLSX, DOC, XLS.",
        )
    ext = EXT_BY_MIME.get(file.content_type, "")
    file_id = str(uuid.uuid4())
    yyyymm = datetime.now(timezone.utc).strftime("%Y-%m")
    target_dir = UPLOAD_ROOT / yyyymm
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{file_id}{ext}"

    # Stream-write with size cap
    total = 0
    chunk_size = 1024 * 1024
    with open(target_path, "wb") as out:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                out.close()
                target_path.unlink(missing_ok=True)
                raise HTTPException(413, f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB cap.")
            out.write(chunk)

    record = UploadRecord(
        id=file_id,
        original_name=file.filename or f"upload{ext}",
        size_bytes=total,
        mime_type=file.content_type,
        body_id=body_id,
        uploaded_by=uploaded_by,
        related_type=related_type,
        related_id=related_id,
        url=f"/api/uploads/{file_id}",
    )
    # Persist the disk path on the doc too (internal use only — not returned via response_model)
    rec_doc = record.model_dump()
    rec_doc["_path"] = str(target_path)
    await db.uploads.insert_one(rec_doc)
    return record


@api_router.get("/uploads/{file_id}")
async def serve_upload(file_id: str):
    doc = await db.uploads.find_one({"id": file_id})
    if not doc:
        raise HTTPException(404, "File not found")
    path = doc.get("_path")
    if not path or not Path(path).exists():
        raise HTTPException(410, "File no longer available")
    return FileResponse(
        path,
        media_type=doc.get("mime_type") or "application/octet-stream",
        filename=doc.get("original_name") or file_id,
    )


@api_router.get("/uploads/{file_id}/meta", response_model=UploadRecord)
async def upload_meta(file_id: str):
    doc = await db.uploads.find_one({"id": file_id}, {"_id": 0, "_path": 0})
    if not doc:
        raise HTTPException(404, "File not found")
    return doc


# ============================================================
# Step 4 · AI Gatekeeper for Grant Claims (Feb 2026)
# Reads APPROVAL_MATRIX.md + uploaded files (PDF + images via Gemini)
# Returns a structured decision that is appended to approval_chain
# as an "AI Gatekeeper" step. Never disburses — only routes & flags.
# ============================================================

from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    FileContentWithMimeType,
)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
AI_MODEL_PROVIDER = "gemini"
AI_MODEL_NAME = "gemini-3-flash-preview"
APPROVAL_MATRIX_PATH = Path("/app/memory/APPROVAL_MATRIX.md")

AI_DECISION_CODES = {
    "APPROVE_FAST_TRACK",
    "APPROVE_STANDARD",
    "HOLD_FOR_HUMAN",
    "RETURN_TO_ORIGINATOR",
    "AUTO_REJECT",
}

# Map decision codes to a workflow action.
# APPROVE_*  → stay in current chain (status unchanged from submit)
# HOLD_*     → stay in current chain but amber-flag
# RETURN_*   → auto-return to originator
# AUTO_REJECT→ auto-reject
AI_AUTO_ACTION = {
    "APPROVE_FAST_TRACK": "continue",
    "APPROVE_STANDARD": "continue",
    "HOLD_FOR_HUMAN": "continue",
    "RETURN_TO_ORIGINATOR": "return",
    "AUTO_REJECT": "reject",
}


def _load_approval_matrix() -> str:
    try:
        return APPROVAL_MATRIX_PATH.read_text(encoding="utf-8")
    except Exception:
        return "(Approval matrix file unavailable — apply universal sanity checks only.)"


async def _collect_claim_attachments(claim_doc: dict) -> List[FileContentWithMimeType]:
    """Look up each supporting_doc_url, find the upload record, return FileContentWithMimeType."""
    out: List[FileContentWithMimeType] = []
    for url in claim_doc.get("supporting_doc_urls") or []:
        # Expected shape: "/api/uploads/{id}"
        if not url or "/api/uploads/" not in url:
            continue
        file_id = url.rsplit("/", 1)[-1]
        rec = await db.uploads.find_one({"id": file_id})
        if not rec:
            continue
        path = rec.get("_path")
        mime = rec.get("mime_type") or "application/octet-stream"
        if not path or not Path(path).exists():
            continue
        out.append(FileContentWithMimeType(file_path=path, mime_type=mime))
    return out


def _parse_ai_response(raw: str) -> dict:
    """Pull the JSON object out of Gemini's response (may be wrapped in code-fences or prose)."""
    import json
    import re
    # 1) Try a clean parse
    try:
        return json.loads(raw)
    except Exception:
        pass
    # 2) Strip fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL | re.IGNORECASE)
    if fenced:
        try:
            return json.loads(fenced.group(1))
        except Exception:
            pass
    # 3) Last-resort: grab the first {...} block
    brace = re.search(r"(\{[\s\S]*\})", raw)
    if brace:
        try:
            return json.loads(brace.group(1))
        except Exception:
            pass
    # 4) Give up — degrade to HOLD with the raw text in reasoning
    return {
        "decision": "HOLD_FOR_HUMAN",
        "reasoning": f"Could not parse AI verdict cleanly. Raw output: {raw[:400]}",
        "missing_documents": [],
        "warnings": ["AI response parse failure"],
    }


AI_SYSTEM_MESSAGE = """You are the MPCA Grant Approval AI Gatekeeper.

Your job: read a grant claim submitted by a District or Division, evaluate the attached supporting documents against the MPCA Approval Matrix rulebook, and return a structured verdict that decides how the claim is routed.

You NEVER approve disbursement of money. You only set a routing decision that humans then act on. Your decision is auditable.

Always respond with a single JSON object — no prose before or after, no code fences. The JSON shape MUST be:

{
  "decision": "APPROVE_FAST_TRACK" | "APPROVE_STANDARD" | "HOLD_FOR_HUMAN" | "RETURN_TO_ORIGINATOR" | "AUTO_REJECT",
  "reasoning": "<2-6 sentence summary of why>",
  "missing_documents": ["<list of mandatory docs not provided>"],
  "warnings": ["<list of soft concerns>"],
  "amount_check": "ok" | "mismatch" | "unknown",
  "confidence": 0.0..1.0
}

Decision guidance:
- APPROVE_FAST_TRACK: All mandatory docs present, all universal checks pass, amount within District Sec single-claim limit (₹25,000).
- APPROVE_STANDARD: All mandatory docs present, all universal checks pass, normal routing.
- HOLD_FOR_HUMAN: One or more soft warnings (low OCR confidence, missing optional doc, unusual but not invalid amount).
- RETURN_TO_ORIGINATOR: One or more MANDATORY docs missing or invalid — claim is incomplete.
- AUTO_REJECT: Hard violation (wrong body_id consistency, duplicate bills, obvious fraud signal, amount on docs grossly mismatches claim amount).

Be strict but fair. Cite specific document names when explaining.
"""


def _build_ai_user_prompt(claim_doc: dict, matrix_text: str) -> str:
    return f"""APPROVAL MATRIX RULEBOOK (source of truth):

{matrix_text}

---

CLAIM TO EVALUATE:

- Claim No: {claim_doc.get('claim_no')}
- Title: {claim_doc.get('title')}
- Description: {claim_doc.get('description') or '(none)'}
- Category: {claim_doc.get('category')}
- Amount: INR {claim_doc.get('amount_inr'):,.2f}
- Body: {claim_doc.get('body_id')}
- Fiscal Cycle: {claim_doc.get('fiscal_cycle')}
- Created By: {claim_doc.get('created_by') or '(unknown)'}
- Attachments: {len(claim_doc.get('supporting_doc_urls') or [])} file(s) — see attached

Apply the rulebook to the attached documents and return your verdict JSON.
"""


async def _run_ai_validation(claim_doc: dict) -> dict:
    """Calls Gemini, parses the verdict, returns dict with keys: decision, reasoning, missing_documents, raw."""
    if not EMERGENT_LLM_KEY:
        return {
            "decision": "HOLD_FOR_HUMAN",
            "reasoning": "AI gatekeeper unavailable (no EMERGENT_LLM_KEY configured). Routed to human review.",
            "missing_documents": [],
            "warnings": ["AI not configured"],
            "amount_check": "unknown",
            "confidence": 0.0,
        }

    matrix_text = _load_approval_matrix()
    attachments = await _collect_claim_attachments(claim_doc)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"claim-{claim_doc.get('id')}",
        system_message=AI_SYSTEM_MESSAGE,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)

    msg = UserMessage(
        text=_build_ai_user_prompt(claim_doc, matrix_text),
        file_contents=attachments if attachments else None,
    )

    try:
        raw = await chat.send_message(msg)
    except Exception as e:
        return {
            "decision": "HOLD_FOR_HUMAN",
            "reasoning": f"AI gatekeeper error — routed to human review. ({type(e).__name__}: {str(e)[:200]})",
            "missing_documents": [],
            "warnings": ["AI call failed"],
            "amount_check": "unknown",
            "confidence": 0.0,
        }

    parsed = _parse_ai_response(raw if isinstance(raw, str) else str(raw))
    if parsed.get("decision") not in AI_DECISION_CODES:
        parsed["decision"] = "HOLD_FOR_HUMAN"
        parsed.setdefault("warnings", []).append("AI returned an unknown decision code; defaulted to HOLD.")
    parsed.setdefault("reasoning", "(no reasoning returned)")
    parsed.setdefault("missing_documents", [])
    parsed.setdefault("warnings", [])
    parsed.setdefault("amount_check", "unknown")
    parsed.setdefault("confidence", 0.0)
    return parsed


async def _apply_ai_verdict(claim_doc: dict, verdict: dict, actor_name: Optional[str]) -> dict:
    """Append the AI verdict to approval_chain and apply auto-action. Returns the updated claim doc."""
    decision = verdict["decision"]
    reasoning = verdict.get("reasoning") or ""
    auto_action = AI_AUTO_ACTION.get(decision, "continue")

    # Always log the AI step
    ai_step = ApprovalStep(
        stage="AI_Validated",
        actor_post="AI Gatekeeper",
        actor_name=f"Gemini · {AI_MODEL_NAME}",
        actor_body_id="MPCA",
        decision=(
            "Recommended" if auto_action == "continue"
            else "Returned" if auto_action == "return"
            else "Rejected"
        ),
        notes=f"[{decision}] {reasoning}",
    )
    chain = (claim_doc.get("approval_chain") or []) + [ai_step.model_dump()]

    update: dict = {
        "approval_chain": chain,
        "ai_decision": decision,
        "ai_reasoning": reasoning,
        "ai_validated_at": datetime.now(timezone.utc).isoformat(),
        "ai_missing_docs": verdict.get("missing_documents") or [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if auto_action == "return":
        update["status"] = "Returned"
        update["parent_body_id"] = await _resolve_parent_body(claim_doc["body_id"])
    elif auto_action == "reject":
        update["status"] = "Rejected"
    # auto-action "continue" keeps whatever status submit() already set (Submitted)

    await db.claims.update_one({"id": claim_doc["id"]}, {"$set": update})
    updated = await db.claims.find_one({"id": claim_doc["id"]}, {"_id": 0})

    # Notify on auto-actions so humans see them in the bell
    if auto_action == "return":
        await _notify_for_claim(updated, "Returned", "AI Gatekeeper")
    elif auto_action == "reject":
        await _notify_for_claim(updated, "Rejected", "AI Gatekeeper")
    elif decision == "HOLD_FOR_HUMAN":
        # Also notify the next approver that AI flagged this for review
        target = _recipient_for_new_status(updated, "Submitted") if updated.get("status") == "Submitted" else None
        if target:
            role_id, body_id = target
            await _create_notification(
                recipient_role_id=role_id,
                recipient_body_id=body_id,
                title=f"AI flagged claim {updated.get('claim_no')} for human review",
                message=(reasoning[:140] + ("…" if len(reasoning) > 140 else "")) or "AI requested human review",
                link="/claims",
                related_type="claim",
                related_id=updated.get("id"),
                severity="warning",
            )

    return updated


@api_router.post("/claims/{claim_id}/attach-docs", response_model=Claim)
async def attach_docs(claim_id: str, payload: dict):
    """Append additional supporting-doc URLs to an existing claim (typically before AI re-validation)."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    if doc.get("status") in ("Disbursed", "Rejected"):
        raise HTTPException(409, "Cannot attach documents to a terminal claim.")
    new_urls = payload.get("urls") or []
    if not isinstance(new_urls, list) or not all(isinstance(u, str) for u in new_urls):
        raise HTTPException(400, "Body must be {urls: string[]}.")
    merged = list((doc.get("supporting_doc_urls") or [])) + [u for u in new_urls if u]
    await db.claims.update_one(
        {"id": claim_id},
        {"$set": {
            "supporting_doc_urls": merged,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    return _decorate_claim(updated)


@api_router.post("/claims/{claim_id}/ai-validate", response_model=Claim)
async def ai_validate_claim(claim_id: str):
    """On-demand AI re-validation (useful after the originator uploads more docs and resubmits)."""
    doc = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Claim not found")
    verdict = await _run_ai_validation(doc)
    updated = await _apply_ai_verdict(doc, verdict, None)
    return _decorate_claim(updated)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------------- Seed Data ----------------


SEED_MEMBERS = [
    {
        "name": "Shri Abhilash Khandekar",
        "category": "Individual",
        "sub_category": "Life Member",
        "address": "12 Race Course Road, Indore, MP 452003",
        "phone": "+91 98260 12345",
        "email": "abhilash.k@example.com",
        "eligibility_factor": "Former Ranji Trophy player",
        "membership_date": "2008-04-15",
        "effectiveness": "Lifetime",
        "fee_structure": "₹25,000 one-time",
        "approving_authority": "Managing Committee Resolution dt. 12.04.2008",
        "status": "Active",
        "photo_url": "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400",
    },
    {
        "name": "Dr. Meera Verma",
        "category": "Individual",
        "sub_category": "Annual Member",
        "address": "B-7, Arera Colony, Bhopal, MP 462016",
        "phone": "+91 94250 67890",
        "email": "meera.verma@example.com",
        "eligibility_factor": "Sports Medicine Specialist",
        "membership_date": "2022-09-01",
        "effectiveness": "01.09.2024 – 31.08.2025",
        "fee_structure": "₹3,000/year",
        "approving_authority": "Hon. Secretary",
        "status": "Active",
        "photo_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400",
    },
    {
        "name": "Indore Gymkhana Cricket Club",
        "category": "Institutional",
        "sub_category": "Affiliated Club",
        "address": "Nehru Stadium Annexe, Indore, MP 452001",
        "phone": "+91 731 2545 678",
        "email": "secretary@indoregymkhana.org",
        "eligibility_factor": "BCCI-recognised District Club",
        "membership_date": "1985-06-21",
        "effectiveness": "Permanent (subject to annual renewal)",
        "fee_structure": "₹15,000/year",
        "representative_name": "Shri Vikram Singh Rathore",
        "representative_contact": "+91 98260 99887",
        "approving_authority": "AGM Resolution 1985-III",
        "status": "Active",
    },
    {
        "name": "Jabalpur District Cricket Association",
        "category": "Institutional",
        "sub_category": "District Association",
        "address": "Ranital Stadium, Jabalpur, MP 482002",
        "phone": "+91 761 2412 345",
        "email": "office@jdca-mp.org",
        "eligibility_factor": "Recognised District Body under MPCA Constitution Art. 5",
        "membership_date": "1968-03-10",
        "effectiveness": "Permanent",
        "fee_structure": "₹25,000/year",
        "representative_name": "Shri Anand Pandey",
        "representative_contact": "+91 94251 11223",
        "approving_authority": "Founding Member",
        "status": "Active",
    },
    {
        "name": "Captain (Retd.) Rajinder Pal Singh",
        "category": "Honorary",
        "sub_category": "Honorary Member for Services",
        "address": "Defence Colony, Bhopal, MP 462001",
        "phone": "+91 98101 22334",
        "email": "rps.cricket@example.com",
        "eligibility_factor": "Test cricketer, distinguished services to MP cricket",
        "membership_date": "2015-11-12",
        "effectiveness": "Lifetime",
        "fee_structure": "Nil — Honorary",
        "approving_authority": "AGM Resolution dt. 12.11.2015",
        "status": "Active",
    },
    {
        "name": "Shri Naveen Joshi",
        "category": "Individual",
        "sub_category": "Annual Member",
        "address": "27 Tulsi Nagar, Ujjain, MP 456001",
        "phone": "+91 97551 88990",
        "email": "naveen.j@example.com",
        "eligibility_factor": "Cricket Coach (BCCI Level-2)",
        "membership_date": "2024-09-15",
        "effectiveness": "01.09.2024 – 31.08.2025",
        "fee_structure": "₹3,000/year",
        "approving_authority": "Pending Hon. Secretary approval",
        "status": "Pending",
    },
    {
        "name": "Shri Devendra Bundela",
        "category": "Patron",
        "sub_category": "Founding Patron",
        "address": "Patron's Pavilion, Holkar Stadium, Indore",
        "phone": "+91 98260 00001",
        "email": "patron@mpca.in",
        "eligibility_factor": "Patron of MP cricket since 1972",
        "membership_date": "1972-01-01",
        "effectiveness": "Lifetime",
        "fee_structure": "Patron — Nil",
        "approving_authority": "Constitutional Patron",
        "status": "Active",
    },
]


SEED_DISCLOSURES = [
    {
        "title": "Notice of 78th Annual General Meeting",
        "disclosure_type": "AGM_Notice",
        "summary": "Notice is hereby given that the 78th AGM of the Madhya Pradesh Cricket Association will be held on Saturday, 21st September 2025 at the Holkar Stadium Conference Hall, Indore.",
        "content": "Agenda: (1) Confirmation of minutes of 77th AGM (2) Annual Report 2024-25 (3) Audited Statement of Accounts (4) Budget 2025-26 (5) Election of Office Bearers (6) Any other matter with the permission of the Chair.",
        "issued_date": "2025-08-20",
        "issued_by": "Hon. Secretary, MPCA",
    },
    {
        "title": "Minutes — Managing Committee Meeting (Aug 2025)",
        "disclosure_type": "Committee_Minutes",
        "summary": "Minutes of the Managing Committee meeting held on 5th August 2025 at MPCA Headquarters, Indore.",
        "content": "Resolutions passed: (i) Approval of selection committee for Ranji 2025-26 (ii) Sanction of grant of ₹15 lakh to District Associations (iii) Approval of revised umpire panel.",
        "issued_date": "2025-08-12",
        "issued_by": "Hon. Joint Secretary",
    },
    {
        "title": "Audited Statement of Accounts FY 2024-25",
        "disclosure_type": "Audited_Accounts",
        "summary": "Statutory audited financial statements for the financial year ended 31st March 2025, certified by M/s. Chaturvedi & Associates, Chartered Accountants.",
        "content": "Total receipts: ₹42.6 crore. Total expenditure: ₹38.1 crore. Surplus: ₹4.5 crore. Full ledger available at the registered office for member inspection.",
        "issued_date": "2025-07-30",
        "issued_by": "Hon. Treasurer",
    },
    {
        "title": "Selection Announcement — MP Ranji Squad 2025-26",
        "disclosure_type": "Selection_Announcement",
        "summary": "The Senior Selection Committee has announced the 16-member Madhya Pradesh squad for the 2025-26 Ranji Trophy.",
        "content": "Captain: Shubham Sharma. Vice-Captain: Venkatesh Iyer. Wicketkeeper: Himanshu Mantri. Full squad and reserves available in the attached document.",
        "issued_date": "2025-09-05",
        "issued_by": "Senior Selection Committee",
    },
    {
        "title": "Circular — Membership Renewal Cycle 2025-26",
        "disclosure_type": "Circular",
        "summary": "All members are requested to renew their membership for the 2025-26 cycle (1 Sept 2025 – 31 Aug 2026) on or before 30th September 2025.",
        "content": "Late renewals will attract a penalty of ₹500 as per Article 17(c) of the Constitution. Members in default beyond 31st December 2025 shall lose voting rights at the AGM.",
        "issued_date": "2025-08-25",
        "issued_by": "Hon. Treasurer",
    },
]


SEED_MEETINGS = [
    {
        "title": "78th Annual General Meeting",
        "meeting_type": "AGM",
        "scheduled_date": "2025-09-21",
        "scheduled_time": "11:00 AM",
        "venue": "Conference Hall, Holkar Stadium, Indore",
        "notice_date": "2025-08-20",
        "quorum_required": 35,
        "quorum_present": 0,
        "chairperson": "Shri Mahanaryaman Scindia",
        "convened_by": "Hon. Secretary",
        "status": "Notice_Issued",
        "agenda": [
            {"number": 1, "title": "Confirmation of minutes of 77th AGM", "description": "Read & confirm prior minutes."},
            {"number": 2, "title": "Annual Report 2024-25", "description": "Tabled by Hon. Secretary."},
            {"number": 3, "title": "Audited Statement of Accounts FY 2024-25", "description": "Tabled by Hon. Treasurer; auditor's certification."},
            {"number": 4, "title": "Approval of Budget 2025-26", "description": "Income & expenditure for the next fiscal."},
            {"number": 5, "title": "Election of Office Bearers", "description": "Conducted by appointed Electoral Officer."},
            {"number": 6, "title": "Any other matter", "description": "With the permission of the Chair."},
        ],
        "attendees": [],
    },
    {
        "title": "Managing Committee Meeting — August 2025",
        "meeting_type": "Committee",
        "scheduled_date": "2025-08-05",
        "scheduled_time": "4:00 PM",
        "venue": "Boardroom, MPCA Headquarters",
        "notice_date": "2025-07-25",
        "quorum_required": 9,
        "quorum_present": 11,
        "chairperson": "Shri Mahanaryaman Scindia",
        "convened_by": "Hon. Joint Secretary",
        "status": "Concluded",
        "agenda": [
            {"number": 1, "title": "Approval of Senior Selection Committee for Ranji 2025-26", "decided": True, "decision": "Approved unanimously."},
            {"number": 2, "title": "Grant-in-aid of ₹15 lakh to District Associations", "decided": True, "decision": "Approved with one abstention."},
            {"number": 3, "title": "Revised Umpire Panel 2025-26", "decided": True, "decision": "Approved; list to be circulated."},
        ],
        "attendees": [],
        "minutes": "The meeting commenced at 4:05 PM after confirming quorum of 11 against the required 9. All three agenda items were taken up in seriatim. Resolutions on selection committee constitution and district grants were carried. The meeting concluded at 6:30 PM with a vote of thanks.",
    },
    {
        "title": "Sub-Committee — Infrastructure & Stadium",
        "meeting_type": "Sub_Committee",
        "scheduled_date": "2026-02-12",
        "scheduled_time": "3:00 PM",
        "venue": "Holkar Stadium · Pavilion Lounge",
        "notice_date": "2026-02-01",
        "quorum_required": 5,
        "quorum_present": 0,
        "chairperson": "Capt. Rajinder Pal Singh",
        "convened_by": "Hon. Secretary",
        "status": "Scheduled",
        "agenda": [
            {"number": 1, "title": "Floodlight upgrade at Holkar Stadium", "description": "Tender evaluation."},
            {"number": 2, "title": "Indoor practice facility — Bhopal", "description": "Status report."},
        ],
        "attendees": [],
    },
]


SEED_ELECTIONS = [
    {
        "title": "Election of Hon. Treasurer · Term 2026-30",
        "post": "Honorary Treasurer",
        "tenure_years": 4,
        "cooling_period_years": 4,
        "electoral_officer": "Justice (Retd.) S.K. Awasthi",
        "nomination_open_date": "2026-01-15",
        "nomination_close_date": "2026-02-15",
        "voting_date": "2026-03-10",
        "status": "Voting_Open",
        "notes": "Conducted under Article XII of the MPCA Constitution. Single transferable vote not applicable; first-past-the-post.",
    },
]


SEED_BANK_ACCOUNTS = [
    {
        "name": "MPCA General Account",
        "bank": "State Bank of India",
        "branch": "Race Course Road, Indore",
        "account_no": "30215467881",
        "ifsc": "SBIN0030045",
        "account_type": "Current",
        "opening_balance": 12500000.00,
        "current_balance": 12500000.00,
        "signatories": ["President", "Hon. Secretary", "Hon. Treasurer"],
        "notes": "Primary operating account for the Association. Joint signature required above ₹50,000.",
    },
    {
        "name": "MPCA Tournament Reserves",
        "bank": "HDFC Bank",
        "branch": "Vijay Nagar, Indore",
        "account_no": "50100789456",
        "ifsc": "HDFC0001284",
        "account_type": "Savings",
        "opening_balance": 8500000.00,
        "current_balance": 8500000.00,
        "signatories": ["Hon. Secretary", "Hon. Treasurer"],
        "notes": "Reserves for Ranji Trophy and domestic tournaments.",
    },
]


SEED_TXNS_TEMPLATE = [
    {"date": "2025-09-01", "txn_type": "Credit", "amount": 2500000.0, "narration": "BCCI annual grant — Q2 FY 2025-26", "reference": "BCCI/GRANT/2025-Q2", "approved_by": "Hon. Treasurer"},
    {"date": "2025-09-15", "txn_type": "Debit", "amount": 1500000.0, "narration": "Honorarium to district associations — Aug 2025", "reference": "MC-2025-12-RES-2", "approved_by": "Managing Committee"},
    {"date": "2025-09-22", "txn_type": "Credit", "amount": 75000.0, "narration": "Subscription receipts (5 institutional members)", "reference": "FEE-BATCH-2509", "approved_by": "Hon. Treasurer"},
    {"date": "2025-10-05", "txn_type": "Debit", "amount": 380000.0, "narration": "Stadium maintenance — Holkar pitch reconditioning", "reference": "PO-2025-INF-44", "approved_by": "Hon. Secretary"},
    {"date": "2025-10-18", "txn_type": "Debit", "amount": 220000.0, "narration": "Selection committee honoraria — Ranji squad", "reference": "MC-2025-SEL-7", "approved_by": "Hon. Treasurer"},
]


async def seed_bodies():
    """Seed the BCCI → MPCA HQ → 10 Divisions → districts hierarchy."""
    if await db.bodies.count_documents({}) > 0:
        return
    logger.info("Seeding org hierarchy (BCCI, MPCA, 10 divisions, districts)…")

    bodies: List[dict] = [
        # ─── Apex ───
        {"code": "BCCI", "name": "Board of Control for Cricket in India", "body_type": "BCCI",
         "parent_code": None, "state": "All India", "seat": "Mumbai", "founded_year": 1928,
         "annual_grant_inr": 0.0},
        {"code": "MPCA", "name": "Madhya Pradesh Cricket Association",
         "body_type": "State", "parent_code": "BCCI", "seat": "Indore", "founded_year": 1957,
         "annual_grant_inr": 0.0,
         "secretary_name": "Shri Sanjeev Rao", "treasurer_name": "Smt. Meera Verma"},

        # ─── 10 Divisions (per MPCA setup diagram) ───
        # Each Division gets an annual grant of ₹30,000 from MPCA.
        {"code": "DIV-JBP", "name": "Jabalpur Division",      "body_type": "Division", "parent_code": "MPCA", "seat": "Jabalpur",     "annual_grant_inr": 30000.0},
        {"code": "DIV-RWA", "name": "Rewa Division",          "body_type": "Division", "parent_code": "MPCA", "seat": "Rewa",         "annual_grant_inr": 30000.0},
        {"code": "DIV-SHD", "name": "Shahdol Division",       "body_type": "Division", "parent_code": "MPCA", "seat": "Shahdol",      "annual_grant_inr": 30000.0},
        {"code": "DIV-BPL", "name": "Bhopal Division",        "body_type": "Division", "parent_code": "MPCA", "seat": "Bhopal",       "annual_grant_inr": 30000.0},
        {"code": "DIV-NMD", "name": "Narmadapuram Division",  "body_type": "Division", "parent_code": "MPCA", "seat": "Narmadapuram", "annual_grant_inr": 30000.0},
        {"code": "DIV-SAG", "name": "Sagar Division",         "body_type": "Division", "parent_code": "MPCA", "seat": "Sagar",        "annual_grant_inr": 30000.0},
        {"code": "DIV-UJN", "name": "Ujjain Division",        "body_type": "Division", "parent_code": "MPCA", "seat": "Ujjain",       "annual_grant_inr": 30000.0,
         "secretary_name": "Shri Vikram Patil"},
        {"code": "DIV-CHM", "name": "Chambal Division",       "body_type": "Division", "parent_code": "MPCA", "seat": "Morena",       "annual_grant_inr": 30000.0},
        {"code": "DIV-GWL", "name": "Gwalior Division",       "body_type": "Division", "parent_code": "MPCA", "seat": "Gwalior",      "annual_grant_inr": 30000.0},
        {"code": "DIV-IND", "name": "Indore Division",        "body_type": "Division", "parent_code": "MPCA", "seat": "Indore",       "annual_grant_inr": 30000.0,
         "secretary_name": "Shri Vikram Patil"},
    ]

    # ─── Districts (52 total — per MPCA plan v2.0) ───
    # Each district receives ₹1,10,000 annual grant via its parent Division.
    district_map = {
        "DIV-JBP": ["Jabalpur", "Katni", "Narsinghpur", "Chhindwara", "Seoni", "Mandla", "Dindori", "Balaghat"],
        "DIV-RWA": ["Rewa", "Satna", "Sidhi", "Singrauli", "Maihar", "Mauganj"],
        "DIV-SHD": ["Shahdol", "Anuppur", "Umaria"],
        "DIV-BPL": ["Bhopal", "Sehore", "Raisen", "Rajgarh", "Vidisha"],
        "DIV-NMD": ["Narmadapuram", "Harda", "Betul"],
        "DIV-SAG": ["Sagar", "Damoh", "Panna", "Tikamgarh", "Chhatarpur", "Niwari"],
        "DIV-UJN": ["Ujjain", "Dewas", "Shajapur", "Agar Malwa", "Mandsaur", "Neemuch", "Ratlam"],
        "DIV-CHM": ["Morena", "Bhind", "Sheopur"],
        "DIV-GWL": ["Gwalior", "Datia", "Shivpuri", "Guna", "Ashoknagar"],
        "DIV-IND": ["Indore", "Dhar", "Khargone", "Khandwa", "Burhanpur", "Barwani", "Alirajpur", "Jhabua"],
    }

    for div_code, districts in district_map.items():
        for dname in districts:
            # 4-char prefix to avoid collisions like Khargone/Khandwa or Gwalior/Guna
            slug = ''.join(ch for ch in dname.upper() if ch.isalpha())[:4]
            # Special-case Ujjain for the demo persona
            sec_name = "Shri Anil Sharma" if dname == "Ujjain" else None
            bodies.append({
                "code": f"DIST-{slug}-{div_code[-3:]}",
                "name": f"{dname} District Cricket Association",
                "body_type": "District",
                "parent_code": div_code,
                "seat": dname,
                "annual_grant_inr": 110000.0,
                "secretary_name": sec_name,
            })

    for b in bodies:
        body = Body(**b)
        await db.bodies.insert_one(body.model_dump())

    logger.info(f"Seeded {len(bodies)} bodies (BCCI, MPCA, 10 divisions, {sum(len(v) for v in district_map.values())} districts).")


async def migrate_body_ids():
    """Phase III.6 migration: backfill `body_id` = 'MPCA' on every existing record
    that predates the multi-tenant column. Idempotent."""
    collections_to_tag = [
        "members", "disclosures", "meetings", "elections",
        "fee_invoices", "bank_accounts", "bank_txns",
    ]
    total = 0
    for coll in collections_to_tag:
        result = await db[coll].update_many(
            {"body_id": {"$exists": False}},
            {"$set": {"body_id": "MPCA"}},
        )
        if result.modified_count:
            logger.info(f"Migrated {result.modified_count} records in '{coll}' to body_id=MPCA")
            total += result.modified_count
    if total:
        logger.info(f"Phase III.6 migration: tagged {total} legacy records with body_id=MPCA")


async def seed_claims():
    """Seed a realistic Phase III.6 demo of the grant workflow lifecycle."""
    if await db.claims.count_documents({}) > 0:
        return
    logger.info("Seeding sample grant claims across the workflow…")

    # Pull a few real district / division codes
    ujjain = await db.bodies.find_one({"code": "DIST-UJJA-UJN"}, {"_id": 0})
    indore_dist = await db.bodies.find_one({"code": "DIST-INDO-IND"}, {"_id": 0})
    jabalpur_dist = await db.bodies.find_one({"code": "DIST-JABA-JBP"}, {"_id": 0})

    samples = []

    # 1) Draft claim — Ujjain District, in progress (no submission yet)
    if ujjain:
        samples.append({
            "claim": ClaimBase(
                body_id="DIST-UJJA-UJN",
                title="U-15 Inter-District League — Travel & Boarding",
                description="3-night travel for the U-15 squad to the SM Khan zonal qualifier at Indore.",
                category="Tournament_Expense",
                amount_inr=87500.0,
                fiscal_cycle="2025-26",
            ),
            "stages": [],
            "status": "Draft",
            "creator": "Shri Anil Sharma",
        })

    # 2) Submitted claim — Indore District → Indore Division (awaiting recommendation)
    if indore_dist:
        samples.append({
            "claim": ClaimBase(
                body_id="DIST-INDO-IND",
                title="Annual District Grant 2025-26",
                description="Statutory annual district grant per MPCA constitution Art. 28(v).",
                category="Annual_Grant",
                amount_inr=110000.0,
                fiscal_cycle="2025-26",
            ),
            "stages": [
                ("Submitted", "Hon. Secretary", "Shri Rakesh Singh", "DIST-INDO-IND",
                 "Submitted", "Quarter-1 receipts attached, audited."),
            ],
            "status": "Submitted",
            "creator": "Shri Rakesh Singh",
        })

    # 3) Division_Recommended claim — Jabalpur District → MPCA queue
    if jabalpur_dist:
        samples.append({
            "claim": ClaimBase(
                body_id="DIST-JABA-JBP",
                title="Ranital Stadium — Pitch Roller Procurement",
                description="One heavy-duty pitch roller for Ranital stadium pre-season prep.",
                category="Infrastructure",
                amount_inr=425000.0,
                fiscal_cycle="2025-26",
            ),
            "stages": [
                ("Submitted", "Hon. Secretary", "Shri Anand Pandey", "DIST-JABA-JBP",
                 "Submitted", "Three quotations attached as per procurement protocol."),
                ("Division_Recommended", "Hon. Secretary", "Shri Devendra Tiwari", "DIV-JBP",
                 "Recommended", "Recommended; lowest L1 quote highlighted. Onward to MPCA."),
            ],
            "status": "Division_Recommended",
            "creator": "Shri Anand Pandey",
        })

    # 4) MPCA_Sanctioned + Disbursed example — historical Sehore District grant
    samples.append({
        "claim": ClaimBase(
            body_id="DIST-SEHO-BPL",
            title="Sehore District — Honorarium to local umpire panel",
            description="Honoraria to the 12-member panel for the inter-school tournament Aug 2025.",
            category="Honorarium",
            amount_inr=72000.0,
            fiscal_cycle="2025-26",
        ),
        "stages": [
            ("Submitted", "Hon. Secretary", "Shri Ramesh Yadav", "DIST-SEHO-BPL",
             "Submitted", "12 umpires × ₹6,000."),
            ("Division_Recommended", "Hon. Secretary", "Shri Praveen Mishra", "DIV-BPL",
             "Recommended", "List vetted; recommended in full."),
            ("MPCA_Sanctioned", "Hon. Treasurer", "Smt. Meera Verma", "MPCA",
             "Sanctioned", "Sanctioned per MC Resolution 2025-09-RES-3."),
            ("Disbursed", "Hon. Treasurer", "Smt. Meera Verma", "MPCA",
             "Disbursed", "NEFT released; ref MPCA/2025-26/HON/0044."),
        ],
        "status": "Disbursed",
        "creator": "Shri Ramesh Yadav",
    })

    cycle_counter: dict = {}
    for s in samples:
        cycle = s["claim"].fiscal_cycle
        cycle_counter[cycle] = cycle_counter.get(cycle, 0) + 1
        claim_no = f"CLM-{cycle}-{cycle_counter[cycle]:03d}"
        parent = await _resolve_parent_body(s["claim"].body_id)
        chain: List[dict] = []
        for stage, post, name, body_id, decision, notes in s["stages"]:
            chain.append(ApprovalStep(
                stage=stage, actor_post=post, actor_name=name, actor_body_id=body_id,
                decision=decision, notes=notes,
            ).model_dump())
        # When status is Division_Recommended or MPCA-stage, parent should be MPCA
        if s["status"] in ("Division_Recommended", "MPCA_Sanctioned", "Disbursed"):
            parent_for_inbox = "MPCA"
        else:
            parent_for_inbox = parent
        claim = Claim(
            claim_no=claim_no,
            status=s["status"],
            approval_chain=[ApprovalStep(**c) for c in chain],
            parent_body_id=parent_for_inbox,
            created_by=s["creator"],
            **s["claim"].model_dump(),
        )
        await db.claims.insert_one(claim.model_dump())
    logger.info(f"Seeded {len(samples)} sample claims.")


async def seed_procurement():
    """Phase III.8 — seed a few demo procurement requests."""
    if await db.procurement_requests.count_documents({}) > 0:
        return
    logger.info("Seeding sample procurement requests…")

    samples = [
        # Small Direct procurement at MPCA HQ
        {
            "body_id": "MPCA",
            "title": "Office stationery — Q3 replenishment",
            "description": "Routine stationery supplies for MPCA HQ administrative office.",
            "estimated_amount_inr": 35_000,
            "quotations": [
                Quotation(vendor_name="Indore Stationers", quote_amount_inr=33_400, quote_date="2025-09-15"),
            ],
            "awarded_vendor": "Indore Stationers",
            "awarded_amount_inr": 33_400,
            "security_deposit_inr": 0,
            "status": "Awarded",
        },
        # Three-Quote at Jabalpur Division — Pitch Roller (will tie to CLM-003)
        {
            "body_id": "DIST-JABA-JBP",
            "title": "Ranital Stadium — Pitch Roller procurement",
            "description": "Heavy-duty pitch roller, 1.2T, with 12-month warranty.",
            "estimated_amount_inr": 450_000,
            "quotations": [
                Quotation(vendor_name="GroundCraft India Pvt Ltd", vendor_gstin="23AABCG1234C1Z5", quote_amount_inr=425_000, quote_date="2025-08-20"),
                Quotation(vendor_name="Bhopal Sports Engg.",       vendor_gstin="23AABCB7890D1Z9", quote_amount_inr=448_000, quote_date="2025-08-21"),
                Quotation(vendor_name="Pune Maidan Works",          vendor_gstin="27AAACP1212F1Z3", quote_amount_inr=462_500, quote_date="2025-08-22"),
            ],
            "awarded_vendor": "GroundCraft India Pvt Ltd",
            "awarded_amount_inr": 425_000,
            "security_deposit_inr": 21_250,
            "emd_inr": 10_000,
            "status": "Awarded",
        },
        # Draft, no quotes yet — Sehore District equipment
        {
            "body_id": "DIST-SEHO-BPL",
            "title": "Sehore Cricket Kit Refresh",
            "description": "Bats, balls, helmets and pads for the U-15 squad.",
            "estimated_amount_inr": 140_000,
            "quotations": [],
            "status": "Draft",
        },
    ]

    for s in samples:
        method = _procurement_method_for(s["estimated_amount_inr"])
        pr_no = await _next_pr_no("2025-26")
        # Avoid passing keys to ProcurementRequest that conflict with constructor positionals
        pr = ProcurementRequest(
            pr_no=pr_no,
            method=method,
            **{k: v for k, v in s.items() if k != "method"},
        )
        await db.procurement_requests.insert_one(pr.model_dump())

    logger.info(f"Seeded {len(samples)} procurement requests.")


async def seed_players():
    """Phase IV — seed a small bench of demo players across multiple districts."""
    if await db.players.count_documents({}) > 0:
        return
    logger.info("Seeding sample players…")

    samples = [
        # Local MP — Indore District
        {
            "body_id": "DIST-INDO-IND",
            "full_name": "Aarav Sharma",
            "father_name": "Shri Manish Sharma",
            "date_of_birth": "2002-07-14",
            "place_of_birth": "Indore",
            "address_district": "Indore",
            "category": "Local_MP",
            "role": "Batter",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Off_Spin",
            "contact_phone": "+91-9425500011",
            "status": "Active",
        },
        # Local MP — Bhopal District, all-rounder
        {
            "body_id": "DIST-BHOP-BPL",
            "full_name": "Ishaan Khan",
            "father_name": "Shri Imran Khan",
            "date_of_birth": "2001-03-22",
            "place_of_birth": "Bhopal",
            "address_district": "Bhopal",
            "category": "Local_MP",
            "role": "All_Rounder",
            "batting_style": "Left_Hand",
            "bowling_style": "Left_Arm_Orthodox",
            "contact_phone": "+91-9425500022",
            "status": "Active",
        },
        # Local MP — U-19 wicket-keeper at Jabalpur
        {
            "body_id": "DIST-JABA-JBP",
            "full_name": "Devansh Pandey",
            "father_name": "Shri Anand Pandey",
            "date_of_birth": "2008-11-09",
            "place_of_birth": "Jabalpur",
            "address_district": "Jabalpur",
            "category": "Local_MP",
            "role": "Wicket_Keeper",
            "batting_style": "Right_Hand",
            "contact_phone": "+91-9425500033",
            "guardian_name": "Shri Anand Pandey",
            "guardian_phone": "+91-9425500033",
            "status": "Active",
        },
        # Born Outside — moved to Ujjain 5 years ago
        {
            "body_id": "DIST-UJJA-UJN",
            "full_name": "Karan Kapoor",
            "father_name": "Shri Sushil Kapoor",
            "date_of_birth": "1998-05-17",
            "place_of_birth": "Lucknow, UP",
            "address_district": "Ujjain",
            "category": "Born_Outside",
            "role": "Bowler",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Fast",
            "contact_phone": "+91-9425500044",
            "status": "Active",
        },
        # Guest — TW3 verified, registered at Indore
        {
            "body_id": "DIST-INDO-IND",
            "full_name": "Yuvraj Mehta",
            "father_name": "Shri Bharat Mehta",
            "date_of_birth": "2003-01-30",
            "place_of_birth": "Surat, Gujarat",
            "address_district": "Indore",
            "category": "Guest",
            "role": "Batter",
            "batting_style": "Left_Hand",
            "bowling_style": "None",
            "contact_phone": "+91-9425500055",
            "tw3_verified": True,
            "status": "Active",
        },
        # Pending — Sehore U-15
        {
            "body_id": "DIST-SEHO-BPL",
            "full_name": "Rishi Yadav",
            "father_name": "Shri Ramesh Yadav",
            "date_of_birth": "2010-08-12",
            "place_of_birth": "Sehore",
            "address_district": "Sehore",
            "category": "Local_MP",
            "role": "All_Rounder",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Leg_Spin",
            "guardian_name": "Shri Ramesh Yadav",
            "guardian_phone": "+91-9425500066",
            "status": "Pending",
        },
        # Suspended example — 2-year ban
        {
            "body_id": "DIST-GWAL-GWL",
            "full_name": "Sahil Verma",
            "father_name": "Shri Mukesh Verma",
            "date_of_birth": "1999-09-04",
            "address_district": "Gwalior",
            "category": "Local_MP",
            "role": "Bowler",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Medium",
            "contact_phone": "+91-9425500077",
            "status": "Suspended",
            "disqualifications": [DisqualificationFlag(
                kind="Two_Year_Ban",
                reason="Age misrepresentation in U-19 selection trials, Aug 2024.",
                imposed_by="MPCA",
                imposed_on="2024-09-12",
                expires_on="2026-09-11",
            ).model_dump()],
        },
    ]

    serial = 0
    year = datetime.now(timezone.utc).year
    for s in samples:
        serial += 1
        pid = f"MPCA/{year}/{serial:06d}"
        # run validator to populate notes
        try:
            _ok, notes = _validate_eligibility(PlayerCreate(**{k: v for k, v in s.items() if k not in ("status", "disqualifications")}))
        except Exception:
            notes = []
        player = Player(
            player_id=pid,
            eligibility_notes=notes,
            **s,
        )
        await db.players.insert_one(player.model_dump())

    logger.info(f"Seeded {len(samples)} players.")


async def seed_tournaments():
    """Phase IV.2 — seed the 10 named inter-divisional tournaments + 5 championship trophies."""
    if await db.tournaments.count_documents({}) > 0:
        return
    logger.info("Seeding MPCA tournament catalogue…")

    # 10 inter-divisional named tournaments (per MPCA plan + cricket history)
    samples = [
        # name, short, format, scope, age_cap, age_floor, allows_guests, dates
        ("MY Memorial Trophy",              "MYMT",     "Multi_Day",  "Inter_Divisional", None, None, False, "2025-11-10", "2025-11-28"),
        ("Madhavrao Scindia Trophy",        "MSchT",    "One_Day",    "Inter_Divisional", None, None, False, "2025-12-05", "2025-12-15"),
        ("Col. CK Nayudu Trophy (MP Leg)",  "CKNT",     "Multi_Day",  "Inter_Divisional", 25,   None, False, "2025-10-15", "2025-11-05"),
        ("JN Bhaya Trophy",                 "JNBT",     "One_Day",    "Inter_Divisional", 19,   None, False, "2025-10-01", "2025-10-12"),
        ("Parmanandbhai Patel Trophy",      "PPT",      "T20",        "Inter_Divisional", 19,   16,   False, "2025-09-20", "2025-09-30"),
        ("Hiralal Gaekwad Trophy",          "HGT",      "Multi_Day",  "Inter_Divisional", 16,   None, False, "2025-09-05", "2025-09-18"),
        ("SM Khan Trophy",                  "SMKT",     "One_Day",    "Inter_Divisional", 16,   None, False, "2025-08-22", "2025-09-02"),
        ("MM Jagdale Trophy",               "MMJT",     "T20",        "Inter_Divisional", 14,   None, False, "2025-08-10", "2025-08-18"),
        ("AW Kanmadikar Trophy",            "AWKT",     "One_Day",    "Inter_Divisional", 14,   12,   False, "2025-07-25", "2025-08-05"),
        ("JS Anand Memorial Trophy",        "JSAT",     "T20",        "Inter_Divisional", None, 35,   True,  "2025-12-20", "2025-12-28"),  # veterans, guests welcome
        # 5 championship trophies / MPCA-organised marquees
        ("Holkar Trophy",                   "HOLK",     "Multi_Day",  "Championship",     None, None, False, "2026-01-10", "2026-01-28"),
        ("MPCA Premier League (T20)",       "MPL",      "T20",        "Championship",     None, None, True,  "2026-02-15", "2026-03-10"),
        ("MP Women's One-Day Cup",          "MPWOD",    "One_Day",    "Championship",     None, None, False, "2025-12-12", "2025-12-22"),
        ("MP U-23 Challenge Cup",           "MPU23",    "Multi_Day",  "Championship",     23,   19,   False, "2025-11-20", "2025-12-05"),
        ("Holkar Pink-Ball Invitational",   "HPBI",     "Pink_Ball",  "Invitational",     None, None, True,  "2026-03-15", "2026-03-22"),
    ]

    serial = 0
    for name, short, fmt, scope, ac, af, ag, start, end in samples:
        serial += 1
        t = Tournament(
            tournament_no=f"TRN-2025-26-{serial:03d}",
            name=name,
            short_name=short,
            format=fmt,
            scope=scope,
            fiscal_cycle="2025-26",
            host_body_id="MPCA",
            age_cap_years=ac,
            age_floor_years=af,
            allows_guests=ag,
            max_squad_size=18,
            start_date=start,
            end_date=end,
            venue="Holkar Stadium, Indore" if scope == "Championship" else None,
            status="Upcoming",
        )
        await db.tournaments.insert_one(t.model_dump())

    logger.info(f"Seeded {len(samples)} tournaments.")


async def seed_data():
    await seed_bodies()
    await migrate_body_ids()
    # One-shot migration: refresh MPCA HQ office-bearers & founding year
    # to reflect the 2025 office-bearers (per official MPCA records).
    await db.bodies.update_one(
        {"code": "MPCA"},
        {"$set": {
            "founded_year": 1957,
            "secretary_name": "Shri Sanjeev Rao",
            "treasurer_name": "Smt. Meera Verma",
        }},
    )
    # Refresh chairperson on seeded meetings (idempotent).
    await db.meetings.update_many(
        {"chairperson": "Shri Abhilash Khandekar"},
        {"$set": {"chairperson": "Shri Mahanaryaman Scindia"}},
    )
    await seed_claims()
    await seed_procurement()
    await seed_players()
    await seed_tournaments()
    if await db.members.count_documents({}) == 0:
        logger.info("Seeding members…")
        for m in SEED_MEMBERS:
            uid = await next_uid(m["category"])
            member = Member(uid=uid, **m)
            await db.members.insert_one(member.model_dump())
    if await db.disclosures.count_documents({}) == 0:
        logger.info("Seeding disclosures…")
        for d in SEED_DISCLOSURES:
            doc = Disclosure(**d)
            await db.disclosures.insert_one(doc.model_dump())
    if await db.meetings.count_documents({}) == 0:
        logger.info("Seeding meetings…")
        for m in SEED_MEETINGS:
            count = await db.meetings.count_documents({"meeting_type": m["meeting_type"]})
            meeting = Meeting(meeting_no=_next_meeting_no(m["meeting_type"], count), **m)
            await db.meetings.insert_one(meeting.model_dump())
    if await db.elections.count_documents({}) == 0:
        logger.info("Seeding elections…")
        eligible = await db.members.count_documents({"status": "Active"})
        for e in SEED_ELECTIONS:
            data = dict(e)
            data["eligible_voters_count"] = eligible
            elec = Election(**data)
            await db.elections.insert_one(elec.model_dump())
            # Seed two candidates for the open election
            for cand_uid in ["MPCA-IND-0001", "MPCA-IND-0002"]:
                m = await db.members.find_one({"uid": cand_uid}, {"_id": 0})
                if m:
                    c = Candidate(
                        election_id=elec.id,
                        member_uid=m["uid"],
                        member_name=m["name"],
                        manifesto="Pledged to strengthen the financial discipline and transparent disclosures of the Association.",
                        status="Accepted",
                    )
                    await db.candidates.insert_one(c.model_dump())
    if await db.bank_accounts.count_documents({}) == 0:
        logger.info("Seeding bank accounts & transactions…")
        for a in SEED_BANK_ACCOUNTS:
            acct = BankAccount(**a)
            await db.bank_accounts.insert_one(acct.model_dump())
            # Apply sample transactions only to the General Account
            if "General" in a["name"]:
                running = acct.opening_balance
                for t in SEED_TXNS_TEMPLATE:
                    delta = t["amount"] if t["txn_type"] == "Credit" else -t["amount"]
                    running = round(running + delta, 2)
                    txn = BankTransaction(account_id=acct.id, balance_after=running, **t)
                    await db.bank_txns.insert_one(txn.model_dump())
                await db.bank_accounts.update_one({"id": acct.id}, {"$set": {"current_balance": running}})
    if await db.fee_invoices.count_documents({}) == 0:
        logger.info("Seeding fee invoices for cycle 2025-26…")
        active = await db.members.find({"status": "Active", "category": {"$in": ["Individual", "Institutional"]}}, {"_id": 0}).to_list(2000)
        for m in active:
            amt = 15000.0 if m["category"] == "Institutional" else 3000.0
            invoice_no = await _next_invoice_no()
            # First invoice for each — mark a couple as Paid for realistic dashboard
            already_paid = m["uid"] in ("MPCA-IND-0001", "MPCA-INS-0002")
            inv = FeeInvoice(
                invoice_no=invoice_no,
                member_uid=m["uid"],
                member_name=m["name"],
                cycle="2025-26",
                description="Subscription · 2025-26",
                amount=amt,
                due_date="2025-12-31",
                status="Paid" if already_paid else "Pending",
                paid_date="2025-09-12" if already_paid else None,
                payment_ref=f"NEFT-2025-{m['uid'][-4:]}" if already_paid else None,
            )
            await db.fee_invoices.insert_one(inv.model_dump())


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

