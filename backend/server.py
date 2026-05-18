"""MPCA ERP Backend — Phase 1 MVP

Modules implemented:
- Members (Individual / Institutional / Honorary)
- Disclosures (AGM notices, minutes, audited accounts, selection announcements)
- Dashboard stats
"""
from fastapi import FastAPI, APIRouter, HTTPException
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
async def list_members(category: Optional[MemberCategory] = None, search: Optional[str] = None):
    query = {}
    if category:
        query["category"] = category
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


@api_router.get("/")
async def root():
    return {"app": "MPCA ERP", "version": "3.5.0", "status": "ok"}


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
        "chairperson": "Shri Abhilash Khandekar",
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
        "chairperson": "Shri Abhilash Khandekar",
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
         "body_type": "State", "parent_code": "BCCI", "seat": "Indore", "founded_year": 1956,
         "annual_grant_inr": 0.0,
         "secretary_name": "Shri Sanjay Jagdale", "treasurer_name": "Smt. Meera Verma"},

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


async def seed_data():
    await seed_bodies()
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
