"""All Pydantic models + enum literals for the MPCA ERP."""
from datetime import datetime, timezone
from typing import List, Optional, Literal, Dict, Any
import uuid
from pydantic import BaseModel, Field, ConfigDict


MemberCategory = Literal["Individual", "Institutional", "Honorary", "Patron"]
MemberStatus = Literal["Active", "Suspended", "Lapsed", "Transferred", "Pending"]
MemberType = Literal["MPCA", "Division"]


class MembershipAssignment(BaseModel):
    """One category / role / committee posting held by a member.
    A member may hold many of these concurrently (Life Member + Vice President + Managing Committee).
    Historic (end_date < today) rows stay in the array for audit / tenure history.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str  # matches a MemberCategoryDef.name (e.g. "Office Bearer", "Managing Committee")
    role: Optional[str] = None  # e.g. "Vice President", "Member — West Zone"
    committee: Optional[str] = None  # optional committee name if the assignment is committee-scoped
    start_date: Optional[str] = None  # ISO
    end_date: Optional[str] = None  # ISO — null == open-ended / lifetime
    is_primary: bool = False  # exactly one row marked primary is used for fee/label
    term_ref: Optional[str] = None  # e.g. "AGM-2024" or election id
    notes: Optional[str] = None
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    added_by: Optional[str] = None  # role_id of who added the assignment


class MembershipAssignmentCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    category: str
    role: Optional[str] = None
    committee: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_primary: bool = False
    term_ref: Optional[str] = None
    notes: Optional[str] = None


class MemberBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    body_id: str = "MPCA"  # owning body — defaults to MPCA HQ
    name: str
    category: MemberCategory
    sub_category: Optional[str] = None  # dynamic — matches a MemberCategoryDef.name
    # M6 · Membership Upgrade
    member_type: MemberType = "MPCA"  # MPCA general body OR Division-linked
    division_body_id: Optional[str] = None  # required when member_type == "Division"
    role: Optional[str] = None  # e.g. "President", "Vice President", "Member"
    membership_id: Optional[str] = None  # external / legacy membership id from CSV
    memberships: List[MembershipAssignment] = Field(default_factory=list)  # M6.1 · multi-category
    address: str
    phone: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[str] = None  # M39b · ISO YYYY-MM-DD for birthday reminders
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
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None  # role_id of the last editor


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    """Partial update — every field is optional."""
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    category: Optional[MemberCategory] = None
    sub_category: Optional[str] = None
    member_type: Optional[MemberType] = None
    division_body_id: Optional[str] = None
    role: Optional[str] = None
    membership_id: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[str] = None
    eligibility_factor: Optional[str] = None
    membership_date: Optional[str] = None
    effectiveness: Optional[str] = None
    fee_structure: Optional[str] = None
    photo_url: Optional[str] = None
    signature_url: Optional[str] = None
    approving_authority: Optional[str] = None
    representative_name: Optional[str] = None
    representative_contact: Optional[str] = None
    status: Optional[MemberStatus] = None
    loss_reason: Optional[str] = None
    transferred_to: Optional[str] = None
    notes: Optional[str] = None


# ---- M6 · Dynamic Member Category Definitions ----
class MemberCategoryDefBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str  # display name, e.g. "Life Member", "Annual Member", "Office Bearer"
    code: Optional[str] = None  # short code used inside UID generation (auto-derived if omitted)
    description: Optional[str] = None
    applies_to: Literal["MPCA", "Division", "Both"] = "Both"
    base_category: MemberCategory = "Individual"  # anchors to one of the 4 constitutional buckets
    fee_amount_inr: Optional[float] = None
    display_order: int = 100
    active: bool = True


class MemberCategoryDef(MemberCategoryDefBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MemberCategoryDefCreate(MemberCategoryDefBase):
    pass


class BulkUploadReport(BaseModel):
    """Return payload for /members/bulk-upload."""
    total_rows: int
    inserted: int
    skipped: int
    errors: List[dict]  # each: {row: int, name: str, reason: str}


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
    # MPCA-113 · Sub-committee auto-attendee expansion. When set, the backend
    # resolves every member whose `positions[].committee == sub_committee_code`
    # and adds them to `attendees` on create. External attendees are people
    # who aren't in the MPCA member registry (guest speakers, BCCI officials,
    # legal advisors) but need to appear on the invitation + minutes.
    sub_committee_code: Optional[str] = None
    external_attendees: List[dict] = Field(default_factory=list)   # [{name, email, org?}]
    # MPCA-114 · Documents attached at meeting creation, visible to invitees.
    documents: List[dict] = Field(default_factory=list)            # [{name, url, uploaded_at, uploaded_by}]
    minutes: Optional[str] = None
    minutes_url: Optional[str] = None
    # M39f · Signed-minutes AI summarisation
    signed_minutes_url: Optional[str] = None
    signed_minutes_uploaded_at: Optional[str] = None
    signed_minutes_uploaded_by: Optional[str] = None
    ai_summary_status: Optional[str] = None      # "Pending" | "Completed" | "Failed"
    ai_summary_text: Optional[str] = None        # narrative summary
    ai_summary_generated_at: Optional[str] = None
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
    ai_generated: bool = False                   # M39f · true when created by AI summariser
    ai_source_agenda_no: Optional[int] = None    # links back to source agenda item


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

ClaimCategory = Literal[
    "Annual_Grant", "Tournament_Expense", "Infrastructure", "Honorarium", "Special_Sanction",
    # Phase B (MoM Feb 2026) — new grant categories
    "Admin_Grant",          # MPCA Admin Grant to Divisions / Districts
    "Coaching_Grant",       # Coaching Grant
    "Tournament_Funding",   # 1:1 matched tournament funding
    "District_Travel",      # District-level travel funding
    "MRA_Management",       # Match Referee / MRA management amount
]
ClaimPath = Literal[
    "As_per_Budget",   # claim is filed against an approved tournament budget envelope
    "Bulk_Budget",     # bulk / un-itemised claim (excess sanctions / ad-hoc)
]
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


class ClaimSubBill(BaseModel):
    """A single line item inside a Summary-Form claim (Travel/Hotel/Road/TA-DA breakdown)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    head: Literal[
        "Travel", "Hotel", "Road_BLP_Lunch_Rain", "TA_DA",
        "Match_Officials", "Equipment", "Ground_Expenses", "Miscellaneous",
    ]
    description: str
    amount_inr: float
    qty: Optional[float] = None               # e.g. 12 rooms × 3 nights → qty=36
    unit_note: Optional[str] = None           # e.g. "₹3,500 × 36 nights"


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
    # Phase B (MoM · Feb 2026) — claim path + summary-form structure
    claim_path: ClaimPath = "Bulk_Budget"
    tournament_budget_id: Optional[str] = None   # required when claim_path = "As_per_Budget"
    tournament_id: Optional[str] = None          # snapshot for convenience
    sub_bills: List[ClaimSubBill] = []           # Travel/Hotel/Road/TA-DA breakdown
    is_excess: bool = False                       # set True when sub_bills exceed an approved head limit
    excess_heads: List[dict] = []                 # [{head, claimed_inr, limit_inr, excess_inr}]


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
    opening_balance_inr: float = 0.0
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
GuestSubType = Literal["Education", "MP_Domicile_Junior", "MP_Domicile_Senior", "Out_Of_MP_Senior"]
PlayerGender = Literal["Male", "Female", "Other"]
PlayerProficiency = Literal["Beginner", "Club", "District", "State", "National"]
PlayerRole = Literal["Batter", "Bowler", "All_Rounder", "Wicket_Keeper"]
PlayerBattingStyle = Literal["Right_Hand", "Left_Hand"]
PlayerBowlingStyle = Literal[
    "Right_Arm_Fast", "Right_Arm_Medium", "Right_Arm_Off_Spin", "Right_Arm_Leg_Spin",
    "Left_Arm_Fast", "Left_Arm_Medium", "Left_Arm_Orthodox", "Left_Arm_Chinaman", "None",
]
# Phase M1-B: extended lifecycle for the review workflow
PlayerStatus = Literal[
    "Pending",                # initial registration, awaiting Division review
    "Under_Division_Review",  # Division has picked up the file
    "Discrepancy_Raised",     # Division sent it back for re-submission
    "Division_Approved",      # Division cleared → in MPCA queue
    "Active",                 # MPCA cleared / historical shortcut
    "Suspended",
    "Banned",
    "Transferred",
    "Retired",
]
TransferStatus = Literal["Draft", "From_Body_Approved", "To_Body_Approved", "MPCA_Approved", "Completed", "Rejected"]

# Standard document types for the registration portal
PLAYER_DOC_TYPES = [
    "birth_certificate", "aadhar", "pan", "passport",
    "marksheet_10", "marksheet_12", "samagra_id",
    "affidavit", "transfer_certificate", "hospital_cert",
    "photo", "signature",
]


class DisqualificationFlag(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: Literal["Two_Year_Ban", "Lifetime_Ban", "Division_Penalty", "Age_Misrepresentation", "Fake_Document", "Repeat_Offender", "Other"]
    reason: str
    imposed_by: str            # body_id imposing
    imposed_on: str            # ISO date
    expires_on: Optional[str] = None  # for time-bound bans
    penalty_inr: float = 0.0    # e.g. ₹50,000 division penalty
    notes: Optional[str] = None


class PlayerDocument(BaseModel):
    """Uploaded doc slot on the registration portal."""
    model_config = ConfigDict(extra="ignore")
    doc_type: str              # one of PLAYER_DOC_TYPES
    url: str                   # /api/uploads/{id}
    filename: Optional[str] = None
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    verified: bool = False     # Division marks verified
    verified_by: Optional[str] = None
    verified_at: Optional[str] = None


class PlayerAuditEvent(BaseModel):
    """Append-only trail of every mutation on a player record."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event: str                 # "created" / "updated" / "reviewed" / "discrepancy" / "approved" / "reopened" / "disqualified"
    actor_name: Optional[str] = None
    actor_body_id: Optional[str] = None
    actor_post: Optional[str] = None
    notes: Optional[str] = None
    diff: Optional[dict] = None  # {"field": ["old", "new"]}
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PlayerBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str                                  # registering body (usually a district)
    full_name: str
    father_name: Optional[str] = None
    # Phase M1-A: extended parentage & profile
    mother_name: Optional[str] = None
    sibling_names: Optional[str] = None           # comma-separated names, brief
    gender: PlayerGender = "Male"
    proficiency: PlayerProficiency = "Club"
    club_academy: Optional[str] = None
    date_of_birth: str                            # ISO date YYYY-MM-DD
    place_of_birth: Optional[str] = None
    domicile_state: str = "Madhya Pradesh"
    address_district: Optional[str] = None        # MP district name
    address_line: Optional[str] = None            # full postal address
    residency_since: Optional[str] = None         # ISO date; used for 3-month / 1-year eligibility
    employment: Optional[str] = None              # company/occupation for guest quota
    education: Optional[str] = None               # school/college for education-guest
    category: PlayerCategory
    guest_subtype: Optional[GuestSubType] = None  # only for Guest category
    guest_disclosure_signed: bool = False         # mandatory when category=Guest
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
    # Phase M1-A: court order flag
    court_order_flag: bool = False
    court_order_ref: Optional[str] = None         # case number / court name
    # MPCA-151 · Feb 2026 · Fields carried across from the registration form
    place_of_birth_city: Optional[str] = None
    place_of_birth_state: Optional[str] = None
    last_season_division_code: Optional[str] = None
    bcci_registered: bool = False
    bcci_registration_year: Optional[int] = None
    is_employed: bool = False
    # Additional Division/MPCA notes NOT captured on the registration form.
    # Free-form key/value pairs so bodies can annotate without a schema change.
    extra_info: Dict[str, str] = Field(default_factory=dict)


class Player(PlayerBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player_id: str                                # MPCA/YR/SERIAL e.g. MPCA/2025/000123
    # Phase M1-A: new formatted display id  YYYY/DD-MM-YY/SEQ
    player_display_id: Optional[str] = None
    first_registration_year: Optional[int] = None
    season_year: Optional[str] = "2025-26"        # division-wise folder key
    division_folder: Optional[str] = None         # DIV-XXX derived from body
    status: PlayerStatus = "Pending"
    disqualifications: List[DisqualificationFlag] = []
    disqualification_count: int = 0               # for repeat-offender detection
    documents: List[PlayerDocument] = []          # portal uploads
    review_notes: List[str] = []                  # discrepancies raised by Division
    audit_trail: List[PlayerAuditEvent] = []
    ai_document_validation: Optional[dict] = None    # last AI verdict (see core.ai_validator._run_player_doc_validation)
    ai_validated_at: Optional[str] = None
    registered_on: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    eligibility_notes: List[str] = []             # human-readable validator output
    tw3_verified: bool = False                    # TW3 maturity check (for Guests)
    submission_locked: bool = False               # no edits after submission unless reopened
    # M12 · Selection Console — rich stats bundle (yo-yo, form, index components, career splits)
    selection_meta: Optional[dict] = None
    # MPCA-108 · Medical clearance from MPCA. Selection Console blinks a MED
    # badge on players whose `medical_cleared_at` is empty when the tournament
    # has `medical_required=True`.
    medical_cleared_at: Optional[str] = None
    medical_cleared_by: Optional[str] = None
    # MPCA-209 · Eligibility Tag (per MPCA_Eligibility_Checks doc, Season 2025-26).
    # One of: Local/Birth, Local/Residence, Local/Employment, Local/Education,
    # Guest/MP-Domicile, Guest/Education, Guest/Out-of-MP, Ineligible.
    eligibility_tag: Optional[str] = None
    eligibility_reasons: List[str] = Field(default_factory=list)
    eligibility_computed_at: Optional[str] = None


class PlayerCreate(PlayerBase):
    tw3_verified: bool = False
    documents: List[PlayerDocument] = []


class PlayerReviewAction(BaseModel):
    """Division / MPCA reviewer action payload."""
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_body_id: str
    actor_post: Optional[str] = None
    notes: Optional[str] = None


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

TournamentFormat = Literal[
    # Legacy generic formats (kept for backward compat with existing seeded data)
    "Multi_Day", "One_Day", "T20", "Pink_Ball",
    # Phase C · MoM 12-format taxonomy (4-Day · 1-Day · T20 variants)
    "FourDay_Senior", "FourDay_U23", "FourDay_U19",                    # 4-day formats
    "OneDay_Senior", "OneDay_U23", "OneDay_U19", "OneDay_Womens",      # 1-day formats
    "T20_Senior", "T20_U23", "T20_U19", "T20_Womens",                  # T20 formats
    "U16_League",                                                       # additional youth
    # M2-A · fixture length variants used by BCCI norms
    "FiveDay", "ThreeDay", "FortyOver", "ThirtyOver",
]
# M2-A: overall status extended with approval flow before Upcoming
TournamentStatus = Literal[
    "Draft", "Awaiting_Approval", "Approved",
    "Upcoming", "Squad_Selection", "In_Progress", "Completed", "Cancelled",
    "Rejected",
]
TournamentScope = Literal["Inter_Divisional", "Inter_District", "Championship", "Invitational"]
# M2-A: source/type tag — which catalogue does this tournament belong to
TournamentType = Literal[
    "MPCA_InterDivisional",       # MY Memorial, Madhavrao Scindia, JN Bhaya, etc.
    "MPCA_Championship",          # CT Sarwate, CS Nayudu, Bhausaheb Nimbalkar, etc.
    "BCCI",                       # U-14/16/19/23, Ranji, ODI/T20
    "Invitational",
    "Other",
]


# MPCA-205 · Master Tournament Registry — canonical list of tournament names
# grouped by category, feeds the create-tournament wizard's name dropdown.
TournamentMasterCategory = Literal[
    "BCCI",
    "Inter_Divisional",
    "Inter_District",
]


class TournamentMaster(BaseModel):
    """A canonical tournament name in the master registry.
    Pre-Tournament Camps auto-mirror the `Inter_Divisional` entries — they
    have no independent registry rows.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: TournamentMasterCategory                       # BCCI / Inter_Divisional / Inter_District
    name: str                                                # e.g. "MY Memorial"
    short_name: Optional[str] = None
    description: Optional[str] = None
    # MPCA-206 · Master row taxonomy — surfaces in Registry table AND auto-fills the create form
    gender: Optional[Literal["Men", "Women"]] = None         # Men / Women
    age_grp: Optional[str] = None                            # Senior / U22 / U19 / U18 / U15 / U14
    play_type: Optional[Literal["Multi_Day", "Limited_Overs"]] = None
    # MPCA-207 · Player-age eligibility (drives Player Profile → Eligible Tournaments panel)
    born_on_or_before: Optional[str] = None                  # ISO date; latest DOB allowed
    born_on_or_after: Optional[str] = None                   # ISO date; earliest DOB allowed
    # MPCA-211 · Squad restrictions — max Guest players allowed per Guest sub-tag
    max_guest_mp_domicile: int = 0
    max_guest_education: int = 0
    max_guest_out_of_mp: int = 0
    medical_required: bool = False
    default_format: Optional[TournamentFormat] = None
    default_scope: Optional[TournamentScope] = None
    is_active: bool = True
    sort_order: int = 100
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None


class TournamentMasterCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    category: TournamentMasterCategory
    name: str
    short_name: Optional[str] = None
    description: Optional[str] = None
    gender: Optional[Literal["Men", "Women"]] = None
    age_grp: Optional[str] = None
    play_type: Optional[Literal["Multi_Day", "Limited_Overs"]] = None
    born_on_or_before: Optional[str] = None
    born_on_or_after: Optional[str] = None
    max_guest_mp_domicile: Optional[int] = None
    max_guest_education: Optional[int] = None
    max_guest_out_of_mp: Optional[int] = None
    medical_required: Optional[bool] = None
    default_format: Optional[TournamentFormat] = None
    default_scope: Optional[TournamentScope] = None
    sort_order: int = 100


class TournamentMasterPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    short_name: Optional[str] = None
    description: Optional[str] = None
    gender: Optional[Literal["Men", "Women"]] = None
    age_grp: Optional[str] = None
    play_type: Optional[Literal["Multi_Day", "Limited_Overs"]] = None
    born_on_or_before: Optional[str] = None
    born_on_or_after: Optional[str] = None
    max_guest_mp_domicile: Optional[int] = None
    max_guest_education: Optional[int] = None
    max_guest_out_of_mp: Optional[int] = None
    medical_required: Optional[bool] = None
    default_format: Optional[TournamentFormat] = None
    default_scope: Optional[TournamentScope] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


# ─────────────────── MPCA-215 · Unified Rate Card ───────────────────
# One rate card per (tournament_type, format_group, season). Editable only by
# MPCA. Feeds the unified per-match budget engine.
#
# BUDGET_HEADS + TRAVEL_HEADS mirror the MPCA Inter-Division Utility HTML — 17
# tournament heads + 8 travel-grant heads. `owner_tag` classifies who bears
# the cost (Host, Visitor, Officials, Common) so downstream rollups can
# attribute expenses per body.

BUDGET_HEAD_KEYS = Literal[
    "hotel_team", "hotel_off", "food_on", "food_off", "food_nmd", "tent",
    "conv_team", "conv_off", "labour", "local_mgr", "doctor", "ambulance",
    "coach_mgr", "scoreboard", "water", "drinks", "mom",
]

TRAVEL_HEAD_KEYS = Literal[
    "travel_rt", "coach", "manager", "trainer", "local_conveyance",
    "medical", "misc_journey", "other",
]

# Public metadata used by frontend + compute engine (single source of truth).
BUDGET_HEADS_META: List[Dict[str, Any]] = [
    {"key": "hotel_team",  "name": "Hotel — team",          "driver": "AwayTeamPax",        "rooms": True,  "basis": "MatchDays", "owner": "Visitor"},
    {"key": "hotel_off",   "name": "Hotel — officials",     "driver": "MatchOfficialsPax",  "rooms": True,  "basis": "MatchDays", "owner": "Officials"},
    {"key": "food_on",     "name": "Food — on the ground",  "driver": "AllPax",             "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "food_off",    "name": "Food — off the ground", "driver": "AwayTeamPax",        "rooms": False, "basis": "MatchDays", "owner": "Visitor"},
    {"key": "food_nmd",    "name": "Food — non-match day",  "driver": "AwayTeamPax",        "rooms": False, "basis": "MatchDays", "owner": "Visitor"},
    {"key": "tent",        "name": "Tent",                  "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "conv_team",   "name": "Conveyance — team",     "driver": "TeamCount",          "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "conv_off",    "name": "Conveyance — official", "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Officials"},
    {"key": "labour",      "name": "Labour",                "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "local_mgr",   "name": "Local manager",         "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "doctor",      "name": "Doctor",                "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "ambulance",   "name": "Ambulance",             "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "coach_mgr",   "name": "Coach & manager trainer","driver": "HostTeamCount",     "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "scoreboard",  "name": "Score board",           "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "water",       "name": "Water",                 "driver": None,                 "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "drinks",      "name": "Match drinks, ice, refreshment, medical, fuel etc.", "driver": None, "rooms": False, "basis": "MatchDays", "owner": "Host"},
    {"key": "mom",         "name": "Man of the Match",      "driver": None,                 "rooms": False, "basis": "Match",     "owner": "Common"},
]

TRAVEL_HEADS_META: List[Dict[str, Any]] = [
    {"key": "travel_rt",         "name": "Round-trip travel",     "basis": "trip_pax", "hint": "Round-trip fare per team member, once per trip"},
    {"key": "coach",             "name": "Coach fee",             "basis": "day",      "hint": "Per match day / non-match day"},
    {"key": "manager",           "name": "Manager fee",           "basis": "day",      "hint": "Per match day / non-match day"},
    {"key": "trainer",           "name": "Trainer fee",           "basis": "day",      "hint": "Per match day / non-match day"},
    {"key": "local_conveyance",  "name": "Local conveyance",      "basis": "trip",     "hint": "Per trip"},
    {"key": "medical",           "name": "Medical",               "basis": "trip",     "hint": "Per trip"},
    {"key": "misc_journey",      "name": "Misc journey expense",  "basis": "trip",     "hint": "Per trip"},
    {"key": "other",             "name": "Other",                 "basis": "trip",     "hint": "Per trip"},
]

# Tournament-type categories the rate card supports. Kept broad so BCCI +
# camps can adopt the same engine later.
RateCardTournamentType = Literal[
    "Inter_Divisional", "Inter_District", "BCCI", "Championship",
    "Pre_Tournament_Camp", "Coaching_Camp", "Invitational",
]

RateCardFormatGroup = Literal["ltd_overs", "multi_day"]


class RateHead(BaseModel):
    """A single rate row — md (match-day) and nmd (non-match-day) rates."""
    model_config = ConfigDict(extra="ignore")
    md: float = 0.0
    nmd: float = 0.0


class RateCard(BaseModel):
    """MPCA-215 · Rate card for one (tournament_type, format_group, season).

    Persisted per tuple. Only MPCA-scope personas may edit. Feeds the unified
    per-match budget engine.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tournament_type: RateCardTournamentType
    format_group: RateCardFormatGroup
    season: str = "2026-27"
    budget_rates: Dict[str, RateHead] = Field(default_factory=dict)   # {head_key: RateHead}
    travel_rates: Dict[str, RateHead] = Field(default_factory=dict)   # {head_key: RateHead}
    # MPCA-223 · Custom line items — MPCA may extend the default 17 heads
    # with tournament-type-specific rows (e.g. VIP hospitality, Trophy engraving).
    # Each dict shape: {key, name, driver, rooms, basis, owner, md_rate, nmd_rate}
    custom_heads: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class RateCardCustomHead(BaseModel):
    """Payload for POST /rate-cards/{id}/custom-heads (add a new line item)."""
    model_config = ConfigDict(extra="ignore")
    name: str
    driver: Optional[str] = None   # None = flat; else "AwayTeamPax"/"HostTeamPax"/etc
    rooms: bool = False
    basis: str = "MatchDays"        # "MatchDays" | "Match"
    owner: str = "Host"             # "Host" | "Visitor" | "Officials" | "Common"
    md_rate: float = 0.0
    nmd_rate: float = 0.0


class RateCardPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    budget_rates: Optional[Dict[str, RateHead]] = None
    travel_rates: Optional[Dict[str, RateHead]] = None


class SquadTimeline(BaseModel):
    """Squad announcement timelines per MPCA plan."""
    model_config = ConfigDict(extra="ignore")
    provisional_squad_days_before: int = 30       # age-verified squad
    open_squad_days_before: int = 15              # open squad
    transfer_window_days: int = 5
    form_submission_days_before: int = 15         # 10-20 range; midpoint


class TournamentBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str                                   # e.g. "MY Memorial Trophy"
    short_name: Optional[str] = None
    format: TournamentFormat
    scope: TournamentScope
    tournament_type: TournamentType = "MPCA_InterDivisional"
    # Sprint M19 · Utility Catalog code — e.g. inter_div / inter_district / bcci_staging / away_participation etc.
    tournament_type_code: Optional[str] = None
    trophy_name: Optional[str] = None            # e.g. "CT Sarwate Trophy"
    fiscal_cycle: str = "2025-26"
    host_body_id: str = "MPCA"                  # who organises the tournament
    age_cap_years: Optional[int] = None          # e.g. 19 for U-19; None = senior
    age_floor_years: Optional[int] = None        # e.g. 14 for U-14
    allows_guests: bool = False                  # Guest-category players permitted?
    is_womens: bool = False                      # M2-A: JS Anand, Women's Cup etc.
    # MPCA-108 · Some tournaments (esp. BCCI-facing, MPCA age-group camps)
    # require players to clear a medical check before squad selection. When
    # true, the Selection Console flags players without a `medical_cleared`
    # stamp on their profile.
    medical_required: bool = False
    max_squad_size: int = 18                     # selection rule
    # M2-A: Championship 3-team format (Winner + Rest of MP A + B)
    is_three_team_format: bool = False
    start_date: Optional[str] = None             # ISO YYYY-MM-DD
    end_date: Optional[str] = None
    venue: Optional[str] = None                  # legacy free-text
    venue_id: Optional[str] = None               # M8: link to Venue.id
    ground_id: Optional[str] = None              # M8: link to Ground.id (a Venue has multiple Grounds)
    venue_name_snapshot: Optional[str] = None    # M8: denormalised for quick display
    ground_name_snapshot: Optional[str] = None
    # T-RIM: MPCA reimbursement scheme code (e.g. "2-D" for Inter-Divisional Hosting)
    scheme_code: Optional[str] = None
    # M39l · Bug 3 · Separate schemes for host vs visiting participants.
    # `scheme_code` remains as legacy/default; `host_scheme_code` (falls back
    # to scheme_code) applies to the host body's budget; `visiting_scheme_code`
    # applies to every non-host participant's budget so they see input
    # variables relevant to travel-subsidy (2-C) rather than hosting-subsidy.
    host_scheme_code: Optional[str] = None
    visiting_scheme_code: Optional[str] = None
    # M39m · MPCA-set default scheme input variables (e.g. squad size, days,
    # match count) that Divisions inherit as pre-filled defaults when they
    # open the scheme calculator. Divisions may still edit before submitting.
    default_scheme_inputs: Dict[str, Any] = Field(default_factory=dict)
    # Sprint M24 · Setup meta captures the MPCA 7-step process fields
    # (category, age group, grounds, teams/pools, camp player group).
    setup_meta: Dict[str, Any] = Field(default_factory=dict)
    # Sprint M19 · Utility-form input variables (days_per_match, teams, squad_size, etc.)
    input_variables: Dict[str, Any] = Field(default_factory=dict)
    # M39s · Per-pool IV overrides for multi-pool tournaments. Keyed by pool_id.
    # Falls back to `input_variables` when a pool has no override entry.
    pool_input_variables: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    # Sprint M19 · Explicit user-action flags (progress bar derives from these)
    calendar_fixed: bool = False                 # set true by "Lock Calendar" action
    closure_letter_generated_at: Optional[str] = None
    closure_letter_url: Optional[str] = None
    # M2-A: squad announcement timelines
    timelines: SquadTimeline = Field(default_factory=SquadTimeline)
    # M2-A: portal slot config for this tournament (division-shared registration link)
    portal_slot_limit: Optional[int] = None      # e.g. 50 for U-13, 30 for Sr Men
    notes: Optional[str] = None


class TournamentAcceptanceEntry(BaseModel):
    """M11 · One acceptance/rejection stamp per required body."""
    model_config = ConfigDict(extra="ignore")
    body_code: str                        # e.g. "DIV-IND" or "DIST-INDO-IND"
    action: Literal["accept", "reject"]
    by_role_id: Optional[str] = None      # persona.id who acted (division-secretary / district-secretary)
    by_name: Optional[str] = None
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    note: Optional[str] = None


class TournamentAcceptance(BaseModel):
    """M11 · Rolled-up acceptance state on a Tournament allotted to a Division/District."""
    model_config = ConfigDict(extra="ignore")
    required_from: List[str] = []                     # body codes that must accept
    entries: List[TournamentAcceptanceEntry] = []     # every accept/reject stamp (audit log)
    status: Literal["Not_Required", "Pending", "Accepted", "Rejected"] = "Not_Required"


class Tournament(TournamentBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tournament_no: str                           # "TRN-2025-26-001"
    status: TournamentStatus = "Upcoming"
    # M2-A: approval trail
    approval_chain: List[ApprovalStep] = []
    # T1: Tournament Plan (Division submits for MPCA approval)
    plan: Optional["TournamentPlan"] = None
    plan_status: "TournamentPlanStatus" = "Draft"
    plan_approval_chain: List[ApprovalStep] = []
    auto_budget_id: Optional[str] = None         # linked TournamentBudget auto-generated
    # T5: expense events — log of every extra-expense request + action
    expense_events: List[ApprovalStep] = []
    # M11: Division/District host-acceptance workflow
    acceptance: TournamentAcceptance = Field(default_factory=TournamentAcceptance)
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentCreate(TournamentBase):
    pass


class SquadMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_id: str                               # UUID id of Player
    player_no: str                               # human-friendly MPCA/.../...
    full_name: str
    role: str
    guest_subtype: Optional[str] = None          # snapshot for quota enforcement
    is_captain: bool = False
    is_vice_captain: bool = False                # M12
    is_keeper: bool = False
    added_on: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# M12 · Selection Console models
class MatchOfficials(BaseModel):
    """Officials assigned to a tournament fixture by the Division at squad-submit."""
    model_config = ConfigDict(extra="ignore")
    manager: Optional[str] = None
    coach: Optional[str] = None
    trainer: Optional[str] = None
    physio: Optional[str] = None
    umpire_1: Optional[str] = None
    umpire_2: Optional[str] = None
    scorer: Optional[str] = None
    referee: Optional[str] = None


SquadSubmissionStatus = Literal["Draft", "Awaiting_MPCA_Approval", "Approved", "Rejected"]


class SquadWaiver(BaseModel):
    """Recorded waiver for a player selected despite a red-flag (e.g. NOC missing)."""
    model_config = ConfigDict(extra="ignore")
    player_id: str
    reason: str
    recorded_by: Optional[str] = None
    recorded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# MPCA-140 · Per-player decision recorded by MPCA during squad review.
# When MPCA reviews a Division-submitted squad, they mark each player
# Approved or Rejected with a reason. All players must have a decision
# before the whole list can be finalised.
MemberDecisionValue = Literal["Approved", "Rejected"]


class MemberDecision(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_id: str
    decision: MemberDecisionValue
    reason: Optional[str] = None
    decided_by: Optional[str] = None
    decided_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Squad(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tournament_id: str
    body_id: str                                  # the participating team's body (division/district)
    participant_body_code: Optional[str] = None   # M28 · mirrors body_id when this squad belongs to a tournament participant row
    team_name: str
    members: List[SquadMember] = []
    eligibility_warnings: List[str] = []         # accumulated validator output
    # M12 · Selection console state
    shortlist_ids: List[str] = []                # players moved from Pool → Shortlist
    votes: dict = Field(default_factory=dict)    # {player_id: [voter_role_id,...]}
    voters: List[str] = []                       # committee member role ids present
    match_officials: MatchOfficials = Field(default_factory=MatchOfficials)
    waivers: List[SquadWaiver] = []
    # MPCA-140 · Per-player review decisions captured by MPCA. Empty list until
    # MPCA opens review. When populated, every nominated member must have an
    # entry before the squad may be Approved (whole-list). Rejected members
    # are dropped from `members` at Approve-time and archived in this list.
    member_decisions: List[MemberDecision] = []
    notes: Optional[str] = None
    submission_status: SquadSubmissionStatus = "Draft"
    submitted_at: Optional[str] = None
    submitted_by: Optional[str] = None
    submitted_by_body: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    review_note: Optional[str] = None
    signed_copy_url: Optional[str] = None      # M37 · Mandatory signed nomination PDF for Division/District submissions
    signed_copy_uploaded_at: Optional[str] = None
    signed_copy_uploaded_by: Optional[str] = None
    # M39g · AI review of signed squad PDF
    ai_review_status: Optional[str] = None       # "Pending" | "Completed" | "Failed"
    ai_review_verdict: Optional[str] = None      # "Looks_Good" | "Needs_Attention" | "Reject_Recommended"
    ai_review_comments: List[str] = []           # bullet points
    ai_review_confidence: Optional[float] = None
    ai_review_generated_at: Optional[str] = None
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
    kind: Literal["claim_event", "sla_breach", "info", "squad_review"] = "claim_event"
    title: str
    message: str
    link: Optional[str] = None           # e.g. "/claims"
    related_type: Optional[str] = None   # "claim" / "procurement" / "transfer"
    related_id: Optional[str] = None
    severity: Literal["info", "warning", "critical", "success"] = "info"
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

# NOTE: VendorCategory Literal is kept only for the write-path (VendorCreate) to
# enforce canonical categories at creation time. The Vendor read model (`category`
# below) is intentionally widened to `str` so historical data drift or manual DB
# imports outside the enum do not break /api/vendors listings.
VendorCategory = Literal[
    "Hotel", "Travel", "Material", "Infra", "Catering",
    "Printing", "Services", "Other",
]


class VendorBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"                  # owning body (vendor empanelled by)
    name: str
    category: str                          # widened; VendorCategory is enforced on write
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
    # Sprint 2 · Vendor KYC lifecycle fields
    kyc_status: Optional[str] = "Not_Started"       # Not_Started · Docs_Submitted · KYC_Verified · Rejected · Expired
    kyc_docs: List[dict] = []
    kyc_submitted_at: Optional[str] = None
    kyc_verified_at: Optional[str] = None
    kyc_verified_by: Optional[str] = None
    kyc_expires_at: Optional[str] = None
    kyc_rejected_at: Optional[str] = None
    kyc_rejected_reason: Optional[str] = None
    msme_registered: bool = False
    msme_udyam_no: Optional[str] = None
    tds_applicable: bool = True
    tds_rate_pct: float = 2.0


class Vendor(VendorBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vendor_no: str                         # "VEND-2025-001"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VendorCreate(VendorBase):
    # Enforce canonical category enum on write only.
    category: VendorCategory = "Other"


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
    # Legacy heads (Phase A)
    "Travel", "Hotel", "Road_BLP_Lunch_Rain", "TA_DA",
    "Match_Officials", "Equipment", "Ground_Expenses", "Miscellaneous",
    # Phase T2 · Grant Scheme heads (map 1:1 to head_code of GrantSchemeRate)
    "Match Official DA", "Match Official Travel",
    "Player DA / Food", "Player Travel", "Player Stay (Hotel)",
    "Ground Fees", "Balls / Kit Consumables",
    "Umpire Honorarium", "Scorer Honorarium", "Physio Honorarium",
    "Contingency",
]

TournamentBudgetStatus = Literal[
    "Draft", "Submitted", "Approved", "Returned", "Rejected", "Cancelled",
    # M39r · MPCA-owned budget flow (new console)
    "Sent_To_Division",       # MPCA has sent the prepared budget; awaiting Division acceptance
    "Accepted_By_Division",   # Division accepted; awaiting MPCA final sanction
    "Revision_Requested",     # Division asked for changes; back with MPCA
]

VariableItemStatus = Literal["Pending", "Approved", "Rejected"]


class BudgetHeadAllocation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    head: str                                    # head_label from GrantSchemeRate or new head from extra-expense request
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
    participant_body_code: Optional[str] = None   # M26 · links to tournament_participations row
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
    # M32 · Snapshot of the input_variables that generated this budget — used by
    # MPCA review to show diff highlights vs the tournament master IV.
    input_variables_snapshot: Optional[Dict[str, Any]] = None
    submitted_by_body: Optional[str] = None
    submitted_by_name: Optional[str] = None
    submitted_at: Optional[str] = None
    # M39r · MPCA-owned flow — audit stamps for the new console
    prepared_by_name: Optional[str] = None         # MPCA officer who prepared the budget
    sent_at: Optional[str] = None                  # when MPCA pushed it to the Division
    division_accepted_by: Optional[str] = None
    division_accepted_at: Optional[str] = None
    revision_requested_by: Optional[str] = None
    revision_requested_at: Optional[str] = None
    revision_reason: Optional[str] = None
    sanctioned_by: Optional[str] = None
    sanctioned_at: Optional[str] = None
    role_flavour: Optional[Literal["Host", "Visitor"]] = None  # snapshot for the console
    # M39s · Multi-pool support — one host budget per pool + one visitor budget
    # per (pool, body). For single-pool tournaments these are None.
    pool_id: Optional[str] = None
    pool_name: Optional[str] = None
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


# ---------------- Phase C · Venue + Ground Master (MoM 3+4 · Feb 2026) ----------------
# A Venue is a stadium / sports complex (e.g., Holkar Stadium). A Ground is a playable
# field inside a venue (Stadium has Main Ground + Practice Grounds A/B). Tournaments map
# to Ground (not just Venue). Ground Expenses track salaries + maintenance per ground.

VenueCategory = Literal[
    "BCCI_International",   # Test/ODI/T20I venues e.g. Holkar Stadium
    "BCCI_Domestic_A",      # Ranji Trophy / first-class hosts
    "BCCI_Domestic_B",      # List-A approved
    "MPCA_State",           # MPCA-managed state-level grounds
    "Divisional",           # division-owned grounds
    "District",             # district-owned grounds
    "Private",              # private grounds hired on need basis
]

# M9 · Ownership vs management model
# A ground/venue can be OWNED by one body (usually MPCA HQ) but MANAGED day-to-day
# by another (usually a Division). BCCI approval is a separate accreditation dimension
# — a venue may hold approval for Domestic-only or International matches.
BCCIApproval = Literal["None", "Domestic", "International"]

GroundType = Literal["Main", "Practice_A", "Practice_B", "Net_Practice", "Other"]


class VenueBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    category: VenueCategory
    body_id: str = "MPCA"                  # deprecated alias — kept for back-compat, mirrors owner_body_id
    # M9 · explicit ownership + management
    owner_body_id: str = "MPCA"            # who OWNS the venue (usually MPCA HQ)
    managed_by_body_id: Optional[str] = None  # who MANAGES it day-to-day. None ⇒ same as owner.
    bcci_approval: BCCIApproval = "None"   # rolled up from grounds; also editable at venue level
    address_line: Optional[str] = None
    city: str
    pincode: Optional[str] = None
    capacity_seats: Optional[int] = None
    floodlights: bool = False
    bcci_calendar_eligible: bool = False   # legacy boolean — retained; equivalent to bcci_approval != "None"
    notes: Optional[str] = None


class Venue(VenueBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    venue_no: str                          # "VEN-2025-001"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VenueCreate(VenueBase):
    pass


class GroundStaffMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str                              # "Head Groundsman", "Pitch Curator", "Helper" etc.
    monthly_salary_inr: float = 0.0
    phone: Optional[str] = None
    joined_date: Optional[str] = None       # ISO date


class GroundBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    # M39e · Grounds are now the sole entity — Venues collection is deprecated.
    # `venue_id` retained only for legacy read-side lookups; new grounds omit it.
    venue_id: Optional[str] = None
    name: str                              # "Main Ground", "Practice A"
    type: GroundType = "Main"
    pitch_type: Optional[str] = None       # "Red Soil", "Black Soil", "Turf", "Matting"
    boundaries_metres: Optional[int] = None
    suitable_formats: List[TournamentFormat] = []  # which formats this ground supports
    # M39e · which types of tournament this ground may host (Inter-Divisional / Ranji /
    # Invitational etc.). Empty list ⇒ any type permitted.
    allowed_tournament_types: List[TournamentType] = []
    # M9 · per-ground BCCI accreditation + optional override of managing body.
    bcci_approval: BCCIApproval = "None"
    managed_by_body_id: Optional[str] = None  # None ⇒ inherit from venue.managed_by_body_id
    # M39e · owner + location fields moved down from Venue so Grounds are self-contained.
    owner_body_id: str = "MPCA"            # who OWNS this ground (usually MPCA)
    owner_name: Optional[str] = None       # free-text owner label (e.g. "Indore District Cricket Assoc.")
    category: Optional[VenueCategory] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    capacity_seats: Optional[int] = None
    floodlights: bool = False
    is_active: bool = True
    notes: Optional[str] = None


class Ground(GroundBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ground_no: str                         # "GRD-VEN-IND-MAIN-001"
    venue_name: Optional[str] = None       # snapshot
    ground_staff: List[GroundStaffMember] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class GroundCreate(GroundBase):
    ground_staff: List[GroundStaffMember] = []


GroundExpenseType = Literal[
    "Staff_Salary", "Pitch_Maintenance", "Equipment_Repair",
    "Water_Electricity", "Cleaning", "Security", "Miscellaneous",
]

GroundExpenseStatus = Literal[
    "Draft", "Submitted", "Approved", "Rejected", "Paid",
]


class GroundExpenseBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ground_id: str
    body_id: str = "MPCA"
    fiscal_cycle: str = "2025-26"
    expense_type: GroundExpenseType
    expense_date: str                      # ISO YYYY-MM-DD
    description: str
    amount_inr: float
    tournament_id: Optional[str] = None    # if tied to a specific tournament
    tournament_format: Optional[TournamentFormat] = None
    supporting_doc_urls: List[str] = []


class GroundExpense(GroundExpenseBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    expense_no: str                        # "GE-2025-26-001"
    venue_name: Optional[str] = None       # snapshot
    ground_name: Optional[str] = None      # snapshot
    status: GroundExpenseStatus = "Draft"
    approval_chain: List[ApprovalStep] = []
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class GroundExpenseCreate(GroundExpenseBase):
    created_by: Optional[str] = None


class GroundExpenseAction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_post: str
    actor_name: Optional[str] = None
    actor_body_id: str
    notes: Optional[str] = None



# ---------------- Phase D · Player Selection Funnel (MoM 6 · Feb 2026) ----------------
# Annual seasonal re-registration + a 4-stage selection funnel per (tournament × format).
# Funnel: LongList(≤150) → ShortList(≤30) → Pool(≤20) → Squad(≤12)
# Each stage has a cap. Selectors can include/exclude players. Final squad is "Submitted
# to BCCI App" (placeholder marker until BCCI integration ships).

SeasonRegStatus = Literal["Pending", "Approved", "Lapsed", "Rejected"]


class SeasonRegistrationBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_id: str
    season_year: str                       # e.g. "2025-26"
    body_id: str                           # registering body (district / division)
    fees_paid_inr: float = 0.0
    notes: Optional[str] = None


class SeasonRegistration(SeasonRegistrationBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    registration_no: str                   # "SR-2025-26-DIV-IND-00012"
    player_name: Optional[str] = None      # snapshot
    status: SeasonRegStatus = "Pending"
    registered_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SeasonRegistrationCreate(SeasonRegistrationBase):
    pass


SelectionStage = Literal["LongList", "ShortList", "Pool", "Squad", "Submitted"]
STAGE_LIMITS = {"LongList": 150, "ShortList": 30, "Pool": 20, "Squad": 12}
STAGE_NEXT = {"LongList": "ShortList", "ShortList": "Pool", "Pool": "Squad", "Squad": "Submitted"}


class SelectionEntry(BaseModel):
    """A player at a specific stage of the funnel."""
    model_config = ConfigDict(extra="ignore")
    player_id: str
    player_name: Optional[str] = None
    age: Optional[int] = None
    role: Optional[str] = None             # batsman / bowler / etc. (snapshot from Player)
    stage: SelectionStage
    notes: Optional[str] = None
    added_by: Optional[str] = None
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SelectionFunnelBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    format: TournamentFormat               # which format the funnel is for
    season_year: str = "2025-26"
    is_international: bool = False         # MoM: Division→MPCA validation for international
    division_body_id: Optional[str] = None # the division proposing (for international flow)
    notes: Optional[str] = None


class SelectionFunnel(SelectionFunnelBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    funnel_no: str                         # "SF-2025-26-001"
    tournament_name: Optional[str] = None  # snapshot
    current_stage: SelectionStage = "LongList"
    entries: List[SelectionEntry] = []
    # Phase D · MoM Division→MPCA validation for international tournaments
    division_recommended_at: Optional[str] = None
    division_recommended_by: Optional[str] = None
    mpca_validated_at: Optional[str] = None
    mpca_validated_by: Optional[str] = None
    bcci_submission_ref: Optional[str] = None    # set when squad is "submitted to BCCI App"
    bcci_submitted_at: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SelectionFunnelCreate(SelectionFunnelBase):
    created_by: Optional[str] = None


class SelectionAddPlayers(BaseModel):
    """Bulk add players to the current stage of the funnel."""
    model_config = ConfigDict(extra="ignore")
    player_ids: List[str]
    added_by: Optional[str] = None
    notes: Optional[str] = None


class SelectionAdvance(BaseModel):
    """Advance a subset of players from current_stage to the next stage."""
    model_config = ConfigDict(extra="ignore")
    player_ids: List[str]                  # which players advance to next stage
    actor_name: str
    actor_post: Optional[str] = None
    notes: Optional[str] = None


class SelectionRemovePlayer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    player_id: str
    actor_name: str
    notes: Optional[str] = None


class SelectionBCCISubmit(BaseModel):
    """Submit the final squad to BCCI App (placeholder)."""
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    bcci_submission_ref: Optional[str] = None   # external ref if provided manually



# ---------------- Phase M2-B · Fixtures + Match Results + Rankings ----------------
# A Fixture is a scheduled match within a tournament. MatchResult captures scorecard
# highlights + special performances. Rankings are aggregated on demand.

FixtureStatus = Literal["Scheduled", "In_Progress", "Completed", "Abandoned", "Cancelled"]
MatchOfficialRole = Literal[
    "Umpire_On_Field_1", "Umpire_On_Field_2", "Umpire_Third", "Umpire_Reserve",
    "Match_Referee", "Scorer_1", "Scorer_2", "Physio", "Ground_Manager", "Curator",
]


class MatchOfficialAllocation(BaseModel):
    """A person allocated to a fixture (umpire, scorer, HR, etc.)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: MatchOfficialRole
    name: str
    body_id: Optional[str] = None                 # if from a body/division
    phone: Optional[str] = None
    honorarium_inr: float = 0.0                   # per-match honorarium
    work_hours: float = 0.0                       # logged after match
    hours_note: Optional[str] = None


class FixtureBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    round: str                                    # "Group A · Match 1" or "Semi-Final 1"
    home_squad_id: Optional[str] = None
    away_squad_id: Optional[str] = None
    home_team: str                                # snapshot name
    away_team: str
    scheduled_date: str                           # ISO date
    scheduled_time: Optional[str] = None
    ground_id: Optional[str] = None
    venue_name: Optional[str] = None              # snapshot
    ground_name: Optional[str] = None
    format: TournamentFormat
    days: int = 1                                 # 1 for LO, 3/4/5 for Multi-Day
    notes: Optional[str] = None
    # MPCA-217 · Days engine inputs (feed unified budget calculator)
    # `actual_days` — for multi-day matches that ended early (e.g. Ranji Day-2
    # finish). Falls back to `days` if null/empty.
    actual_days: Optional[int] = None
    # `nmd_manual` — manual override for non-match days (arrival + break
    # inference is otherwise automatic).
    nmd_manual: Optional[int] = None
    # `other_pax` — ground staff / guests / VIPs counted in `AllPax` driver.
    other_pax: int = 0
    # `pool_id` — the pool this fixture belongs to (mirrors setup_meta pools).
    pool_id: Optional[str] = None


class Fixture(FixtureBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    fixture_no: str                               # "FX-2025-26-001"
    tournament_name: Optional[str] = None         # snapshot
    status: FixtureStatus = "Scheduled"
    officials: List[MatchOfficialAllocation] = []
    result_id: Optional[str] = None               # linked MatchResult
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class FixtureCreate(FixtureBase):
    pass


class SpecialPerformance(BaseModel):
    """5-fer, century, MoM, etc. — bubbled up to rankings + placards."""
    model_config = ConfigDict(extra="ignore")
    player_id: str
    player_name: str
    achievement: Literal["Century", "Double_Century", "Five_Wickets", "Ten_Wickets_Match", "Man_of_the_Match", "Fifty", "Hat_Trick"]
    value: Optional[str] = None                    # "104 (89b)" or "5/23"
    innings: Optional[int] = None                  # 1 or 2


class PlayerMatchStat(BaseModel):
    """Per-player scorecard row for a match — feeds rankings."""
    model_config = ConfigDict(extra="ignore")
    player_id: str
    player_name: str
    team: str
    runs: int = 0
    balls_faced: int = 0
    fours: int = 0
    sixes: int = 0
    dismissal: Optional[str] = None                # "c Sharma b Khan"
    overs_bowled: float = 0.0
    runs_conceded: int = 0
    wickets: int = 0
    maidens: int = 0
    catches: int = 0
    stumpings: int = 0


class MatchResultBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    fixture_id: str
    tournament_id: str
    home_team: str
    away_team: str
    home_score: str                                # "312/8 (90)" or "312 & 189/4"
    away_score: str
    toss_won_by: Optional[str] = None
    toss_decision: Optional[Literal["Bat", "Bowl"]] = None
    result_text: str                               # "Indore Div won by 5 wickets"
    winner_team: Optional[str] = None              # None if tie/draw/no-result
    man_of_the_match: Optional[str] = None
    player_stats: List[PlayerMatchStat] = []
    special_performances: List[SpecialPerformance] = []
    notes: Optional[str] = None


class MatchResult(MatchResultBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entered_by: Optional[str] = None
    entered_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MatchResultCreate(MatchResultBase):
    entered_by: Optional[str] = None


# ---------------- Phase T1-T4 · Tournament Lifecycle (Feb 2026) ----------------
# Full flow: Plan Submission → Auto Budget → MPCA Approval → AI Invoice Entry
# → Match-Official DA → Grant Eligibility Tracking.

TournamentPlanStatus = Literal["Draft", "Plan_Submitted", "Plan_Approved", "Plan_Returned", "Plan_Rejected"]
RateCardUnit = Literal[
    "per_official_per_day", "per_official_per_match", "per_official_lump",
    "per_player_per_day", "per_player_lump", "per_player_per_match",
    "per_match_day", "per_day",
    "percent_of_subtotal",
]


class GrantSchemeRate(BaseModel):
    """Editable rate card master used to auto-generate tournament budgets."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    head_code: str                              # unique key e.g. "MATCH_OFFICIAL_DA"
    head_label: str                             # display "Match Official DA"
    unit: RateCardUnit
    rate_inr: float
    fiscal_cycle: str = "2025-26"
    is_active: bool = True
    notes: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentPlan(BaseModel):
    """Embedded on Tournament — submitted by Division for MPCA approval."""
    model_config = ConfigDict(extra="ignore")
    days: int = 0                                # total tournament days
    tournament_type_note: Optional[str] = None   # "4-Day Multi-Day", etc.
    num_teams: int = 0
    num_players_per_team: int = 18
    num_match_officials: int = 0                 # umpires + scorers + physio + referee
    num_umpires: int = 0
    num_scorers: int = 0
    match_days: int = 0                          # actual playing days across all matches
    venue_place: Optional[str] = None            # city / place
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    proposed_squad_ids: List[str] = []           # snapshot of selected player ids
    proposed_official_ids: List[str] = []        # match_official allocations
    remarks: Optional[str] = None


class TournamentPlanAction(BaseModel):
    """Actor payload for plan submit/approve/return/reject."""
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_body_id: str
    actor_post: Optional[str] = None
    notes: Optional[str] = None
    revised_days: Optional[int] = None           # MPCA may cut days
    revised_num_officials: Optional[int] = None


# ---------- Tournament Invoice (Phase T3) ----------
TournamentInvoiceStatus = Literal["Draft", "Submitted", "Approved", "Rejected"]


class InvoiceHeadAllocation(BaseModel):
    """Sprint T-RIM: one invoice can span multiple budget heads (e.g. hotel bill →
    Accommodation + Food + GST). Each allocation row records the amount going to a head."""
    model_config = ConfigDict(extra="ignore")
    head_code: str
    head_label: str
    amount_inr: float
    notes: Optional[str] = None


class AIInvoiceExtraction(BaseModel):
    """Full AI extraction output stored for audit."""
    model_config = ConfigDict(extra="ignore")
    vendor_name: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    amount_inr: Optional[float] = None
    gst_inr: Optional[float] = None
    total_inr: Optional[float] = None
    suggested_head_code: Optional[str] = None
    line_items: List[dict] = []
    confidence: float = 0.0
    raw: Optional[str] = None                    # AI raw response
    error: Optional[str] = None


class TournamentInvoiceBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    body_id: str                                 # spending body (usually a Division)
    participant_body_code: Optional[str] = None  # M26 · links to tournament_participations row
    budget_id: Optional[str] = None              # linked TournamentBudget
    budget_head_code: Optional[str] = None       # legacy: single head (kept for back-compat)
    allocations: List[InvoiceHeadAllocation] = []  # NEW · multi-head splits (Sprint T-RIM)
    vendor_name: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    amount_inr: float = 0.0
    gst_inr: float = 0.0
    total_inr: float = 0.0
    file_url: Optional[str] = None               # /api/uploads/{id}
    filename: Optional[str] = None
    notes: Optional[str] = None


class TournamentInvoice(TournamentInvoiceBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_ref: str                             # "INV-2025-26-0001"
    status: TournamentInvoiceStatus = "Draft"
    ai_extraction: Optional[AIInvoiceExtraction] = None
    ai_extracted: bool = False
    manually_overridden: bool = False
    over_budget_amount_inr: float = 0.0
    eligible_for_grant_inr: float = 0.0
    ineligible_for_grant_inr: float = 0.0
    entered_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentInvoiceCreate(TournamentInvoiceBase):
    entered_by: Optional[str] = None


# ---------- Match Official DA (Phase T4) ----------
DAStatus = Literal["Draft", "Submitted", "Approved", "Rejected", "Paid"]


class DATravelSegment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    from_place: str = ""
    to_place: str = ""
    fare_class: str = "III_AC"        # III_AC | II_AC | I_AC | Air | Bus | Own_Vehicle
    one_way_fare_inr: float = 0.0
    both_ways_amount_inr: float = 0.0
    ticket_url: Optional[str] = None  # supporting ticket / e-ticket


class DAMiscItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    description: str = ""
    amount_inr: float = 0.0
    receipt_url: Optional[str] = None


class DAAttachment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: str = ""
    url: str = ""


class DAComplianceFlag(BaseModel):
    model_config = ConfigDict(extra="ignore")
    field: str                          # "da_rate_inr" | "journey_rate_per_12h_inr" | "conveyance_rate_inr" | "night_halt_amount_inr"
    claimed: float
    scheme_ceiling: Optional[float] = None
    severity: str = "warning"           # warning | info
    note: str


class MatchOfficialDA(BaseModel):
    """Pre-built DA form per allocated official; official fills + submits.

    Mirrors the MPCA physical **T.A. & D.A. Claim Form (FMPCA 037)** — 8
    sections: Header · Travel-fare segments · Journey expenses · DA
    (days×rate) · Conveyance · Incidental · Night Halt · Misc.  A compliance
    snapshot is stamped on submit so MPCA/Division reviewers can see which
    lines exceed the scheme rate.
    """
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    da_ref: str                                  # "DA-2025-26-0001"
    tournament_id: str
    tournament_name: Optional[str] = None
    # ── Header (auto-filled from match_officials profile) ──
    official_id: Optional[str] = None            # link back to match_officials.id
    official_name: str
    official_role: str                           # umpire/scorer/etc.
    official_phone: Optional[str] = None
    body_id: Optional[str] = None                # owning division/district
    association_division: Optional[str] = None   # display name of body (e.g. "Rewa Division")
    place_of_visit: Optional[str] = None         # e.g. "Gwalior"
    purpose_of_visit: Optional[str] = None       # e.g. "Umpiring · Girls U-18 LO Overs Inter-Div Trophy 2025-26"
    # ── Travel Fare (multiple legs) ──
    travel_segments: List[DATravelSegment] = Field(default_factory=list)
    travel_amount_inr: float = 0.0               # sum of segments (auto)
    # ── Journey Expenses (₹300 / 12 hrs) ──
    journey_hours: float = 0.0
    journey_rate_per_12h_inr: float = 300.0
    journey_amount_inr: float = 0.0              # rate × ceil(hours/12) (auto)
    # ── DA (played days × rate) ──
    # MPCA-202 · Split scheduled vs played days.
    #   scheduled_days = total match-days on the schedule (drives Match-Officials Fee — paid even if cancelled)
    #   played_days    = days actually played (drives DA/TA — paid only for actually played days)
    # Legacy `days` mirrors `played_days` for backward-compat.
    scheduled_days: int = 0
    played_days: int = 0
    days: int = 0                                # legacy alias — kept in sync with played_days
    match_fee_rate_inr: float = 0.0              # per-day officiating fee (from scheme)
    match_fee_amount_inr: float = 0.0            # scheduled_days × match_fee_rate_inr (auto)
    da_rate_inr: float = 0.0                     # per-day rate from rate card
    da_amount_inr: float = 0.0                   # played_days × da_rate_inr (auto)
    da_date_from: Optional[str] = None
    da_date_to: Optional[str] = None
    # ── Conveyance Allowance ──
    conveyance_rate_inr: float = 0.0             # per-trip rate (e.g. ₹200)
    conveyance_count: int = 0                    # number of trips
    conveyance_amount_inr: float = 0.0           # rate × count (auto)
    # ── Incidental Charges ──
    incidental_rate_inr: float = 0.0             # per-day rate
    incidental_days: int = 0
    incidental_amount_inr: float = 0.0           # rate × days (auto)
    # ── Night Halt ──
    night_halt_place: Optional[str] = None
    night_halt_amount_inr: float = 0.0
    night_halt_bill_url: Optional[str] = None    # hotel bill
    # ── Misc Expenses (multi-line) ──
    misc_items: List[DAMiscItem] = Field(default_factory=list)
    misc_amount_inr: float = 0.0                 # sum of misc_items (auto)
    # legacy — kept for backward-compat with old rows
    food_amount_inr: float = 0.0
    # ── Totals ──
    total_inr: float = 0.0                       # grand total (auto)
    total_in_words: Optional[str] = None
    # ── Attachments (overflow bucket) ──
    attachments: List[DAAttachment] = Field(default_factory=list)
    # ── Bank + PAN ──
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pan: Optional[str] = None
    # ── Workflow ──
    status: DAStatus = "Draft"
    compliance_flags: List[DAComplianceFlag] = Field(default_factory=list)   # stamped on submit
    submitted_at: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MatchOfficialDAUpdate(BaseModel):
    """Payload the official uses to fill their DA before submitting.
    All fields optional; server recomputes derived totals + compliance."""
    model_config = ConfigDict(extra="ignore")
    place_of_visit: Optional[str] = None
    purpose_of_visit: Optional[str] = None
    travel_segments: Optional[List[DATravelSegment]] = None
    journey_hours: Optional[float] = None
    journey_rate_per_12h_inr: Optional[float] = None
    days: Optional[int] = None
    scheduled_days: Optional[int] = None
    played_days: Optional[int] = None
    match_fee_rate_inr: Optional[float] = None
    da_rate_inr: Optional[float] = None
    da_date_from: Optional[str] = None
    da_date_to: Optional[str] = None
    conveyance_rate_inr: Optional[float] = None
    conveyance_count: Optional[int] = None
    incidental_rate_inr: Optional[float] = None
    incidental_days: Optional[int] = None
    night_halt_place: Optional[str] = None
    night_halt_amount_inr: Optional[float] = None
    night_halt_bill_url: Optional[str] = None
    misc_items: Optional[List[DAMiscItem]] = None
    attachments: Optional[List[DAAttachment]] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pan: Optional[str] = None
    notes: Optional[str] = None
    # ── Legacy single-value fallbacks (kept so old MyDAForms UI still works) ──
    travel_amount_inr: Optional[float] = None
    food_amount_inr: Optional[float] = None
    misc_amount_inr: Optional[float] = None

# ---------------- Phase T5 · Extra Expense Approval ----------------
# Division requests MPCA approval for expenses NOT covered by the original
# auto-budget (either a new head, or extra limit on an existing head).
# Every action is logged on the Tournament.expense_events for full audit.

ExtraExpenseStatus = Literal["Draft", "Submitted", "Approved", "Rejected", "Info_Requested"]


class ExtraExpenseRequestBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    body_id: str                                 # requesting body (Division)
    head_code: str                               # existing head_code OR new (free text)
    head_label: str                              # display label
    is_new_head: bool = False                    # true if head_code not in rate card
    amount_inr: float                            # additional amount requested
    justification: str                           # why over-budget?
    linked_invoice_id: Optional[str] = None      # if triggered by an invoice
    linked_invoice_ref: Optional[str] = None
    supporting_file_url: Optional[str] = None    # optional attachment


class ExtraExpenseRequest(ExtraExpenseRequestBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_ref: str                             # "EER-2025-26-0001"
    status: ExtraExpenseStatus = "Draft"
    approval_chain: List[ApprovalStep] = []
    requested_by: Optional[str] = None
    approved_amount_inr: float = 0.0             # MPCA may sanction less than requested
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    info_request_notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ExtraExpenseCreate(ExtraExpenseRequestBase):
    requested_by: Optional[str] = None


class ExtraExpenseAction(BaseModel):
    """Actor payload for submit/approve/reject/info request."""
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_body_id: str = "MPCA"
    actor_post: Optional[str] = None
    notes: Optional[str] = None
    approved_amount_inr: Optional[float] = None  # MPCA can sanction less



# ═══════════════════════════════════════════════════════════════════════════
# Sprint T-RIM · Tournament Reimbursement Matrix (Feb 2026)
# ═══════════════════════════════════════════════════════════════════════════

# ---------- Reimbursement Scheme (from MPCA Master Document) ----------
class ReimbursementSchemeHead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str                                     # "ACCOMMODATION", "UMPIRE_FEES" etc.
    label: str                                    # Display label
    unit: str = "at_actuals"                      # "per_day", "per_person_per_day" etc.
    rate_inr: float = 0.0                         # Base rate from scheme (0 for lump/varies)
    rate_display: Optional[str] = None            # Human-readable rate ("₹5,000 / day")


class ReimbursementScheme(BaseModel):
    """Master data: MPCA reimbursement/grant scheme with budget heads (from HTML seed)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scheme_code: str                              # "1-A", "2-D", "6-A" etc. — unique
    name: str
    description: Optional[str] = None
    scheme_type: str = "Reimbursement"            # "Reimbursement" | "Annual_Grant" | "Award" | "Camp" | "Welfare" | "Infrastructure"
    eligible_bodies: List[str] = ["All"]          # ["Division"], ["District"], ["All"]
    categories: List[str] = []                    # ["Open", "U-23"] etc.
    heads: List[ReimbursementSchemeHead] = []
    conditions: List[str] = []                    # eligibility_conditions
    required_documents: List[str] = []            # docs to submit for claim
    frequency: str = "Annual"                     # "Annual" | "One_time" | "Per_tournament" | "Half_yearly" | "Monthly"
    is_active: bool = True
    fiscal_cycle: str = "2026-27"
    revision_history: List[dict] = []              # [{version, changed_at, changed_by, note, changed_fields}]
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------- Tournament Reimbursement Claim ----------
# Division submits at tournament completion — bundles all invoices +
# extra-expense approvals into a single claim to MPCA. MPCA Secretary
# reviews with commentary, approves or rejects.

TournamentReimbursementStatus = Literal[
    "Draft", "Submitted", "Under_Review", "Approved", "Rejected",
]


class ReimbursementComment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    author_name: str
    author_role: str                              # "MPCA Secretary" / "Division Secretary"
    author_body_id: str
    text: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MpcaHeadDeduction(BaseModel):
    """MPCA-168 (v2) · A deduction MPCA applies against a single budget head
    on a Division's reimbursement claim. Multiple deductions can hit the
    same head. Total accepted for a head = spent_by_division − Σ deductions."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    head: str
    amount_inr: float
    reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MpcaInvoiceReview(BaseModel):
    """MPCA-168 · One line-item decision by MPCA on a single invoice inside a
    tournament reimbursement claim. MPCA records how much they ACCEPT from
    the invoice (default = full amount) and an optional reason. The claim's
    approved_amount_inr is computed as the sum of accepted amounts across
    every invoice review at approve-time."""
    model_config = ConfigDict(extra="ignore")
    invoice_id: str
    accepted_inr: float = 0.0
    reason: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentReimbursementClaimBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tournament_id: str
    body_id: str                                  # Division submitting the claim
    participant_body_code: Optional[str] = None   # M26 · links to tournament_participations row
    fiscal_cycle: str = "2025-26"
    scheme_code: Optional[str] = None
    notes: Optional[str] = None


class TournamentReimbursementClaim(TournamentReimbursementClaimBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    claim_ref: str                                # "TRC-2025-26-0001"
    tournament_name: Optional[str] = None         # snapshot
    body_name: Optional[str] = None
    status: TournamentReimbursementStatus = "Draft"

    # M39z.d · District Consolidator ─────────────────────────────
    # District claims are submitted to their parent Division (not MPCA).
    # The Division then aggregates every Approved District claim + their own
    # into a single "master" claim that is submitted upward to MPCA.
    route_to_body_id: Optional[str] = None        # where a Submit lands: parent Division code (Districts) or "MPCA" (Divisions)
    review_stage: Optional[str] = None            # "Division" | "MPCA" — what body reviews this claim
    parent_claim_id: Optional[str] = None         # District claim → the Division master claim once consolidated
    child_claim_ids: List[str] = []               # Division master → the District claims rolled into it
    is_master: bool = False                       # true only for the Division-level consolidated claim

    # Auto-generated summary sheet (computed at submit)
    summary: dict = Field(default_factory=dict)
    # Structure:
    # {
    #   "budget_total_inr": float, "invoiced_total_inr": float, "eligible_total_inr": float,
    #   "over_budget_inr": float, "invoice_count": int,
    #   "heads": [{"head":..,"limit_inr":..,"spent_inr":..,"over_inr":..}],
    #   "extra_expense_approved_inr": float
    # }

    invoice_ids: List[str] = []                   # snapshot of tournament_invoices referenced
    extra_expense_ids: List[str] = []
    da_form_ids: List[str] = []                   # M37 · Match Official DA forms bundled into this claim

    submitted_by: Optional[str] = None
    submitted_at: Optional[str] = None
    # M39m · Signed-PDF workflow before final submission — Division prints the
    # claim summary PDF, physically signs it, uploads back, then submits.
    signed_pdf_url: Optional[str] = None
    signed_pdf_uploaded_at: Optional[str] = None
    signed_pdf_uploaded_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_amount_inr: Optional[float] = None   # MPCA can sanction lower than eligible
    # MPCA-168 · Per-invoice line-item review by MPCA (Phase A).
    # Each entry records how much MPCA has accepted from that invoice.
    # `approved_amount_inr` at Approve-time = sum of accepted_inr across all reviews.
    mpca_invoice_reviews: List[MpcaInvoiceReview] = []
    # MPCA-168 v2 · Head-level deduction rows (replaces per-invoice review flow).
    mpca_deductions: List[MpcaHeadDeduction] = []
    # MPCA's signed decision PDF — Sign & upload gate before final approve.
    mpca_signed_pdf_url: Optional[str] = None
    mpca_signed_pdf_uploaded_at: Optional[str] = None
    mpca_signed_pdf_uploaded_by: Optional[str] = None
    # MPCA-168 · Division may attach a free-text remark per budget head
    # (e.g. "Bill missing GST", "Approved via extra-expense request X").
    # Rendered on the Division reimbursement PDF's head-wise table.
    division_head_remarks: Dict[str, str] = Field(default_factory=dict)
    comments: List[ReimbursementComment] = []
    approval_chain: List[ApprovalStep] = []

    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TournamentReimbursementCreate(TournamentReimbursementClaimBase):
    submitted_by: Optional[str] = None


class TournamentReimbursementAction(BaseModel):
    """Payload for submit / approve / reject / add-comment."""
    model_config = ConfigDict(extra="ignore")
    actor_name: str
    actor_role: str
    actor_body_id: str
    notes: Optional[str] = None
    approved_amount_inr: Optional[float] = None
    comment_text: Optional[str] = None
