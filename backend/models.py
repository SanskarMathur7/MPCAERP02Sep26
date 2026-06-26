"""All Pydantic models + enum literals for the MPCA ERP."""
from datetime import datetime, timezone
from typing import List, Optional, Literal
import uuid
from pydantic import BaseModel, Field, ConfigDict


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
    # PF3 (Feb 2026) · Approved amount differential
    approved_amount_inr: Optional[float] = None    # set by Treasurer at sanction; defaults to amount_inr on disburse
    approved_amount_reason: Optional[str] = None   # mandatory when approved != claimed
    # PF2 (Feb 2026) · Last structured return reason code (for analytics + UI)
    return_reason_code: Optional[str] = None


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
    # PF3 (Feb 2026) · Approved amount differential — used on Sanction
    approved_amount_inr: Optional[float] = None
    approved_amount_reason: Optional[str] = None
    # PF2 (Feb 2026) · Structured send-back reason — used on Return
    return_reason_code: Optional[str] = None       # e.g. "DOCS_MISSING" / "AMOUNT_MISMATCH" / "BUDGET_HEAD_INVALID"
    return_reason_detail: Optional[str] = None     # free-text to add specifics


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


# ---------------- Notification ----------------
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


# ---------------- UploadRecord ----------------
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



# ---------------- F6a · Vendor Master + Vendor Bills (Feb 2026) ----------------
# Plan: capture every external vendor MPCA / Divisions / Districts pay — Hotels,
# Travel, Material, Infrastructure, Catering, Printing, Services. Bills follow a
# 4-stage workflow: Submitted → Verified (Accounts) → Sanctioned (Treasurer) → Paid.

VendorCategory = Literal[
    "Hotel", "Travel", "Material", "Infra", "Catering",
    "Printing", "Services", "Other",
]


class VendorBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"                  # owning body (vendor empanelled by)
    name: str
    category: VendorCategory
    gstin: Optional[str] = None
    pan: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    state: str = "Madhya Pradesh"
    pincode: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    is_blacklisted: bool = False
    blacklist_reason: Optional[str] = None
    notes: Optional[str] = None


class Vendor(VendorBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vendor_no: str                         # "VEND-2025-001"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VendorCreate(VendorBase):
    pass


VendorBillStatus = Literal[
    "Draft", "Submitted", "Verified", "Sanctioned", "Paid", "Rejected", "Returned",
]


class VendorBillBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str
    vendor_id: str
    vendor_name: Optional[str] = None     # snapshot for convenience
    category: VendorCategory
    fiscal_cycle: str = "2025-26"
    bill_no_external: Optional[str] = None      # vendor's own invoice number
    bill_date: str                              # ISO YYYY-MM-DD
    description: str
    base_amount_inr: float
    gst_inr: float = 0.0
    tds_inr: float = 0.0
    total_amount_inr: float
    procurement_id: Optional[str] = None        # PR this bill traces back to
    tournament_id: Optional[str] = None         # tournament if it's a tournament expense
    supporting_doc_urls: List[str] = []


class VendorBill(VendorBillBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bill_no: str                                # internal: "VB-2025-26-001"
    status: VendorBillStatus = "Draft"
    approval_chain: List[ApprovalStep] = []     # reuses ApprovalStep
    paid_via_txn_id: Optional[str] = None       # bank_txns id when Paid
    paid_via_account_id: Optional[str] = None
    return_reason_code: Optional[str] = None
    return_reason_detail: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VendorBillCreate(VendorBillBase):
    created_by: Optional[str] = None


class VendorBillAction(BaseModel):
    """Payload for verify/sanction/pay/reject/return actions on a vendor bill."""
    model_config = ConfigDict(extra="ignore")
    actor_post: str
    actor_name: Optional[str] = None
    actor_body_id: str
    notes: Optional[str] = None
    source_account_id: Optional[str] = None   # used on Pay
    return_reason_code: Optional[str] = None
    return_reason_detail: Optional[str] = None


# ---------------- Phase A · Tournament Auto-Budget (MoM 1 · Feb 2026) ----------------
# Division proposes a per-tournament budget → MPCA reviews → approves/returns/rejects.
# Budget has THREE strata:
#   1) Total ceiling INR (fixed cap MPCA cannot exceed via this budget)
#   2) Head-under sub-limits (Travel/Hotel/Road/TA-DA/Match Officials/Equipment/Ground/Misc)
#   3) Variable items (each line item case-by-case approvable by MPCA)
# All Phase-B claims will match against this approved budget envelope.

BudgetHead = Literal[
    "Travel", "Hotel", "Road_BLP_Lunch_Rain", "TA_DA",
    "Match_Officials", "Equipment", "Ground_Expenses", "Miscellaneous",
]

TournamentBudgetStatus = Literal[
    "Draft", "Submitted", "Approved", "Returned", "Rejected",
]

VariableItemStatus = Literal["Pending", "Approved", "Rejected"]


class BudgetHeadAllocation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    head: BudgetHead
    limit_inr: float = 0.0
    notes: Optional[str] = None


class VariableBudgetItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str                         # e.g., "Special insurance for outstation U-19 squad"
    proposed_amount_inr: float
    head: Optional[BudgetHead] = None        # optional: which head it falls under (or pure variable)
    status: VariableItemStatus = "Pending"
    approved_amount_inr: Optional[float] = None
    decided_by: Optional[str] = None         # actor name on approve/reject
    decision_notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    decided_at: Optional[str] = None


class TournamentBudgetBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str                       # Tournament.id
    body_id: str                             # Division (or District) raising the budget ask
    fiscal_cycle: str = "2025-26"
    total_ceiling_inr: float                 # fixed cap proposed by division
    head_allocations: List[BudgetHeadAllocation] = []   # sub-limits by head
    variable_items: List[VariableBudgetItem] = []        # case-by-case items
    notes: Optional[str] = None


class TournamentBudget(TournamentBudgetBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    budget_no: str                           # "TB-2025-26-001"
    tournament_name: Optional[str] = None    # snapshot
    body_name: Optional[str] = None          # snapshot
    status: TournamentBudgetStatus = "Draft"
    # MPCA-approved figures (may differ from proposed)
    approved_total_inr: Optional[float] = None
    approved_head_allocations: List[BudgetHeadAllocation] = []
    approval_chain: List[ApprovalStep] = []
    created_by: Optional[str] = None
    return_reason_code: Optional[str] = None
    return_reason_detail: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentBudgetCreate(TournamentBudgetBase):
    created_by: Optional[str] = None


class TournamentBudgetAction(BaseModel):
    """Payload for submit/approve/reject/return on the whole budget."""
    model_config = ConfigDict(extra="ignore")
    actor_post: str
    actor_name: Optional[str] = None
    actor_body_id: str
    notes: Optional[str] = None
    # MPCA can approve a different total + revised head limits at sanction
    approved_total_inr: Optional[float] = None
    approved_head_allocations: Optional[List[BudgetHeadAllocation]] = None
    return_reason_code: Optional[str] = None
    return_reason_detail: Optional[str] = None


class VariableItemDecision(BaseModel):
    """Payload for approving/rejecting an individual variable item."""
    model_config = ConfigDict(extra="ignore")
    decision: Literal["Approved", "Rejected"]
    approved_amount_inr: Optional[float] = None    # may approve a lower amount
    decided_by: str
    decision_notes: Optional[str] = None
