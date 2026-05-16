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
    return {
        "total_members": total,
        "by_category": by_cat,
        "active_members": active,
        "pending_members": pending,
        "total_disclosures": disclosures_count,
        "upcoming_meetings": upcoming,
        "elections_open": elections_open,
        "pending_grievances": 0,  # placeholder until Phase 4
        "fee_collection_pct": 78,  # placeholder until Phase 3
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


@api_router.get("/")
async def root():
    return {"app": "MPCA ERP", "version": "2.0.0", "status": "ok"}


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


async def seed_data():
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
                        manifesto=f"Pledged to strengthen the financial discipline and transparent disclosures of the Association.",
                        status="Accepted",
                    )
                    await db.candidates.insert_one(c.model_dump())


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
