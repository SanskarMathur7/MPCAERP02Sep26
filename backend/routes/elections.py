"""Routes · Elections + Voting"""
from fastapi import HTTPException

from core.infra import api_router, db
from models import (
    Candidate,
    CandidateCreate,
    Election,
    ElectionCreate,
    ElectionStatus,
    Vote,
    VoteCast,
)


@api_router.get("/elections", response_model=list[Election])
async def list_elections(status: ElectionStatus | None = None):
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


@api_router.get("/elections/{election_id}/candidates", response_model=list[Candidate])
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

