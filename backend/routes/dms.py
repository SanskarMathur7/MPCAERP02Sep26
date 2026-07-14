"""Sprint 4 · Document Management System (P7.1-P7.2).

Lightweight DMS layered on top of Sprint 2's KYC + PO attachments — treats every
uploaded document as a first-class object with:
  - folder (Legal · Statutory · Financial · HR · Contracts · Board · Other)
  - tags (free-text array for cross-cutting labels)
  - doc_type + expiry_date (drives Sprint 4's expiry reminders)
  - linkage back to source module (vendor / asset / employee / po / …)

No S3 dependency yet — documents carry `url` (external link or existing KYC URL).
When object storage lands (Sprint 7), this same model handles it via url pointing
to the presigned URL.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from core.shared_services import write_audit_log


DocFolder = Literal["Legal", "Statutory", "Financial", "HR", "Contracts", "Board", "Vendor_KYC", "Asset_Docs", "Other"]
DocStatus = Literal["Active", "Expired", "Archived"]


class DocumentBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    folder: DocFolder = "Other"
    tags: List[str] = []
    filename: str
    url: str
    doc_type: str  # free-text: e.g. "GST Certificate" / "Employment Contract" / "Board Resolution"
    expiry_date: Optional[str] = None
    related_module: Optional[str] = None  # vendor / asset / employee / po / meeting …
    related_id: Optional[str] = None
    related_code: Optional[str] = None
    notes: Optional[str] = None


class Document(DocumentBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    doc_no: str = ""  # DOC-2026-27-NNNNN (short readable)
    status: DocStatus = "Active"
    uploaded_by: Optional[str] = None
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DocumentCreate(DocumentBase):
    uploaded_by: Optional[str] = None


async def _sync_from_kyc():
    """One-time sync — index existing vendor KYC docs into the DMS if missing.
    Idempotent: keys off (related_module='vendor', related_id, filename)."""
    vendors = await db.vendors.find(
        {"kyc_docs": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "vendor_no": 1, "name": 1, "kyc_docs": 1, "kyc_expires_at": 1},
    ).to_list(500)
    inserted = 0
    for v in vendors:
        for d in v.get("kyc_docs") or []:
            filename = d.get("doc_type") + ".pdf"
            existing = await db.documents.find_one({
                "related_module": "vendor",
                "related_id": v["id"],
                "filename": filename,
            })
            if existing:
                continue
            doc = Document(
                body_id="MPCA",
                folder="Vendor_KYC",
                tags=[d.get("doc_type", ""), v.get("name", "")],
                filename=filename,
                url=d.get("url", ""),
                doc_type=d.get("doc_type", "unknown").replace("_", " ").title(),
                expiry_date=v.get("kyc_expires_at"),
                related_module="vendor",
                related_id=v["id"],
                related_code=v.get("vendor_no"),
                uploaded_by="System",
            )
            doc.doc_no = f"DOC-VND-{inserted+1:05d}"
            await db.documents.insert_one(doc.model_dump())
            inserted += 1
    return inserted


# ═══════════════════ CRUD ═══════════════════

@api_router.get("/documents", response_model=List[Document])
async def list_documents(folder: Optional[DocFolder] = None,
                          status: Optional[DocStatus] = None,
                          related_module: Optional[str] = None,
                          related_id: Optional[str] = None,
                          tag: Optional[str] = None,
                          search: Optional[str] = None):
    q: dict = {}
    if folder: q["folder"] = folder
    if status: q["status"] = status
    if related_module: q["related_module"] = related_module
    if related_id: q["related_id"] = related_id
    if tag: q["tags"] = tag
    if search:
        q["$or"] = [
            {"filename": {"$regex": search, "$options": "i"}},
            {"doc_type": {"$regex": search, "$options": "i"}},
            {"tags": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.documents.find(q, {"_id": 0}).sort("uploaded_at", -1).to_list(1000)
    # Lazy expiry status flip
    now = datetime.now(timezone.utc)
    for d in docs:
        if d.get("expiry_date") and d.get("status") == "Active":
            try:
                exp = datetime.fromisoformat(d["expiry_date"].replace("Z", "+00:00"))
                if exp <= now:
                    d["status"] = "Expired"
            except Exception:
                pass
    return docs


@api_router.get("/documents/{did}", response_model=Document)
async def get_document(did: str):
    doc = await db.documents.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@api_router.post("/documents", response_model=Document)
async def create_document(payload: DocumentCreate):
    count = await db.documents.count_documents({})
    d = Document(**payload.model_dump())
    d.doc_no = f"DOC-{datetime.now(timezone.utc).year}-{count+1:05d}"
    await db.documents.insert_one(d.model_dump())
    await write_audit_log(
        module="document", record_id=d.id, action="upload",
        actor={"name": payload.uploaded_by or "MPCA Accounts", "role": "mpca_accounts",
               "body_id": payload.body_id},
        details={"filename": d.filename, "folder": d.folder, "doc_type": d.doc_type,
                 "expiry_date": d.expiry_date},
    )
    return d


@api_router.post("/documents/{did}/archive", response_model=Document)
async def archive_document(did: str, note: str = ""):
    doc = await db.documents.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document not found")
    await db.documents.update_one({"id": did}, {"$set": {"status": "Archived"}})
    await write_audit_log(
        module="document", record_id=did, action="archive",
        actor={"name": "MPCA Accounts", "role": "mpca_accounts"},
        details={"filename": doc.get("filename"), "note": note},
    )
    return await db.documents.find_one({"id": did}, {"_id": 0})


# ═══════════════════ EXPIRING SOON ═══════════════════

@api_router.get("/documents-expiring")
async def expiring_soon(days: int = 60):
    """Documents expiring in the next N days (default 60), plus already-expired."""
    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(days=days)).isoformat()
    docs = await db.documents.find(
        {"expiry_date": {"$exists": True, "$ne": None, "$lte": horizon},
         "status": {"$ne": "Archived"}},
        {"_id": 0},
    ).sort("expiry_date", 1).to_list(500)
    expiring: List[dict] = []
    expired: List[dict] = []
    for d in docs:
        try:
            exp = datetime.fromisoformat(d["expiry_date"].replace("Z", "+00:00"))
        except Exception:
            continue
        days_left = (exp - now).days
        row = {**d, "days_left": days_left}
        if days_left < 0:
            expired.append(row)
        else:
            expiring.append(row)
    return {
        "horizon_days": days,
        "expired_count": len(expired),
        "expiring_count": len(expiring),
        "expired": expired[:100],
        "expiring": expiring[:100],
    }


@api_router.get("/dms-stats/summary")
async def dms_summary():
    docs = await db.documents.find({}, {"_id": 0}).to_list(3000)
    by_folder: dict = {}
    by_status: dict = {"Active": 0, "Expired": 0, "Archived": 0}
    now = datetime.now(timezone.utc)
    expiring_30 = 0
    for d in docs:
        by_folder[d.get("folder", "Other")] = by_folder.get(d.get("folder", "Other"), 0) + 1
        st = d.get("status", "Active")
        if d.get("expiry_date") and st == "Active":
            try:
                exp = datetime.fromisoformat(d["expiry_date"].replace("Z", "+00:00"))
                if exp <= now:
                    st = "Expired"
                elif (exp - now).days <= 30:
                    expiring_30 += 1
            except Exception:
                pass
        by_status[st] = by_status.get(st, 0) + 1
    return {
        "total": len(docs),
        "by_folder": by_folder,
        "by_status": by_status,
        "expiring_30d": expiring_30,
    }


@api_router.post("/dms/sync-from-kyc")
async def sync_from_kyc():
    """Idempotent — walk vendor KYC docs and index them into the DMS."""
    inserted = await _sync_from_kyc()
    return {"inserted": inserted, "message": f"Indexed {inserted} vendor KYC document(s) into DMS."}
