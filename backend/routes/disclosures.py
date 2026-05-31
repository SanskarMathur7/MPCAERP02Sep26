"""Routes · Disclosures"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import Disclosure, DisclosureCreate, DisclosureType
from core.helpers import next_uid as _


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


