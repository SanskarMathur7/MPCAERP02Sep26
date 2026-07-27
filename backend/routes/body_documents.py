"""Routes · Body Data Warehouse (M33)

Per-body document vault — each Division / District / MPCA / BCCI body owns a
document folder ("Data Warehouse") where they store legal + financial docs
(GST cert, PAN card, bank account details, financial statements, etc.).

Access rules
────────────
* Body users can read + write only their own vault.
* State (MPCA) can read every vault beneath it.
* BCCI can read every vault.
* Everyone else → 403.

Docs are stored via the existing /api/uploads pipeline; this route only tracks
the metadata (kind, label, structured fields like GSTIN / PAN / IFSC etc.) and
the reference to the upload record.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Literal
import uuid

from fastapi import HTTPException, Header
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router


DOC_KINDS = Literal[
    "GST_Certificate",
    "PAN_Card",
    "Bank_Account",
    "Balance_Sheet",
    "Profit_Loss",
    "Audit_Report",
    "Constitution_Bye_Laws",
    "MOA_AOA",
    "Registration_Certificate",
    "Board_Resolution",
    "Address_Proof",
    "Insurance_Policy",
    "Other",
]

MPCA_READ_ROLES = {"secretary", "president", "treasurer", "hr_officer", "compliance_officer"}


class BodyDocument(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    body_code: str
    doc_kind: str = "Other"
    label: str                                    # human-readable name
    doc_no: Optional[str] = None                  # GSTIN / PAN / A/C no. / policy no.
    file_url: Optional[str] = None                # /api/uploads/<id>
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)  # bank branch/ifsc/etc.
    issued_on: Optional[str] = None
    expires_on: Optional[str] = None
    uploaded_by: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BodyDocumentCreate(BaseModel):
    doc_kind: str = "Other"
    label: str
    doc_no: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    issued_on: Optional[str] = None
    expires_on: Optional[str] = None
    uploaded_by: Optional[str] = None
    notes: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class BodyDocumentPatch(BaseModel):
    doc_kind: Optional[str] = None
    label: Optional[str] = None
    doc_no: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    issued_on: Optional[str] = None
    expires_on: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    model_config = ConfigDict(extra="ignore")


async def _ensure_body(body_code: str) -> Dict[str, Any]:
    body = await db.bodies.find_one({"code": body_code}, {"_id": 0})
    if not body:
        raise HTTPException(404, f"Body {body_code} not found")
    return body


def _can_read(body: Dict[str, Any], caller_body: Optional[str], caller_role: Optional[str]) -> bool:
    if caller_body == body["code"]:
        return True
    # MPCA sees every vault; BCCI sees every vault
    if caller_body == "MPCA" and caller_role in MPCA_READ_ROLES:
        return True
    if caller_body == "BCCI":
        return True
    # Divisions can see their child districts' vaults (parent scope)
    if body.get("parent_code") == caller_body:
        return True
    return False


def _can_write(body: Dict[str, Any], caller_body: Optional[str]) -> bool:
    return caller_body == body["code"]


# ────────────────── Endpoints ──────────────────

@api_router.get("/bodies/{body_code}/documents", response_model=List[BodyDocument])
async def list_body_documents(
    body_code: str,
    include_inactive: bool = False,
    doc_kind: Optional[str] = None,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    body = await _ensure_body(body_code)
    if not _can_read(body, x_user_body_code, x_role_id):
        raise HTTPException(403, f"You may only view {body_code}'s vault if you belong to that body or MPCA.")
    q: Dict[str, Any] = {"body_code": body_code}
    if not include_inactive:
        q["is_active"] = True
    if doc_kind:
        q["doc_kind"] = doc_kind
    docs = await db.body_documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.post("/bodies/{body_code}/documents", response_model=BodyDocument)
async def add_body_document(
    body_code: str,
    payload: BodyDocumentCreate,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
):
    body = await _ensure_body(body_code)
    if not _can_write(body, x_user_body_code):
        raise HTTPException(403, f"Only members of {body_code} may add documents to its vault.")
    row = BodyDocument(body_code=body_code, **payload.model_dump(exclude_unset=True))
    await db.body_documents.insert_one(row.model_dump())
    return row


@api_router.patch("/bodies/{body_code}/documents/{doc_id}", response_model=BodyDocument)
async def patch_body_document(
    body_code: str,
    doc_id: str,
    patch: BodyDocumentPatch,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
):
    body = await _ensure_body(body_code)
    if not _can_write(body, x_user_body_code):
        raise HTTPException(403, "Only the owning body may edit its own documents.")
    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "Empty patch")
    updates["updated_at"] = now_iso
    r = await db.body_documents.update_one({"id": doc_id, "body_code": body_code}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Document not found in this vault")
    return await db.body_documents.find_one({"id": doc_id}, {"_id": 0})


@api_router.delete("/bodies/{body_code}/documents/{doc_id}")
async def delete_body_document(
    body_code: str,
    doc_id: str,
    hard: bool = False,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
):
    body = await _ensure_body(body_code)
    if not _can_write(body, x_user_body_code):
        raise HTTPException(403, "Only the owning body may delete its documents.")
    if hard:
        r = await db.body_documents.delete_one({"id": doc_id, "body_code": body_code})
        if r.deleted_count == 0:
            raise HTTPException(404, "Document not found")
        return {"deleted": True, "hard": True}
    r = await db.body_documents.update_one(
        {"id": doc_id, "body_code": body_code},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Document not found")
    return {"deleted": True, "hard": False}


@api_router.get("/bodies/{body_code}/documents/kinds/summary")
async def body_documents_kinds_summary(
    body_code: str,
    x_user_body_code: Optional[str] = Header(None, alias="X-User-Body-Code"),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    """Rollup of doc_kind → count for the body — used to render the vault header
    ("GST · 1  ·  PAN · 1  ·  Bank · 2 …") and drive completeness badges."""
    body = await _ensure_body(body_code)
    if not _can_read(body, x_user_body_code, x_role_id):
        raise HTTPException(403, "Not permitted to read this vault.")
    pipeline = [
        {"$match": {"body_code": body_code, "is_active": True}},
        {"$group": {"_id": "$doc_kind", "count": {"$sum": 1}}},
    ]
    counts: Dict[str, int] = {}
    async for row in db.body_documents.aggregate(pipeline):
        counts[row["_id"]] = row["count"]
    # Completeness of the "essential four": GST, PAN, Bank_Account, Constitution
    essential = ["GST_Certificate", "PAN_Card", "Bank_Account", "Constitution_Bye_Laws"]
    filled = sum(1 for k in essential if counts.get(k, 0) > 0)
    return {
        "body_code": body_code,
        "counts": counts,
        "essential_filled": filled,
        "essential_total": len(essential),
        "essential_missing": [k for k in essential if not counts.get(k)],
    }
