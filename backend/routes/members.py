"""Routes · Members + Dynamic Member Categories + Bulk Upload (M6)."""
import csv
import io
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, UploadFile, File, Form, Header

from core.infra import db, api_router
from models import (
    Member,
    MemberCreate,
    MemberCategory,
    MemberUpdate,
    MemberCategoryDef,
    MemberCategoryDefCreate,
    BulkUploadReport,
)
from core.helpers import next_uid


# Personas that can edit any member profile / manage categories / bulk-upload.
_OFFICE_BEARER_ROLES = {"president", "secretary", "treasurer", "division-secretary"}


def _actor(role_id: Optional[str], email: Optional[str]) -> dict:
    return {"role_id": role_id, "email": (email or "").strip().lower()}


# ---------------- Routes: Members ----------------


@api_router.get("/members", response_model=List[Member])
async def list_members(
    category: Optional[MemberCategory] = None,
    member_type: Optional[str] = None,
    division_body_id: Optional[str] = None,
    search: Optional[str] = None,
    body_id: Optional[str] = None,
):
    query = {}
    if category:
        query["category"] = category
    if member_type:
        query["member_type"] = member_type
    if division_body_id:
        query["division_body_id"] = division_body_id
    if body_id:
        query["body_id"] = body_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"uid": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"membership_id": {"$regex": search, "$options": "i"}},
            {"role": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.members.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return docs


@api_router.get("/members/stats")
async def member_stats():
    """Aggregate counts by member_type, category and division for the dashboard filters."""
    pipeline_type = [{"$group": {"_id": "$member_type", "count": {"$sum": 1}}}]
    pipeline_cat = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    pipeline_status = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    type_agg = await db.members.aggregate(pipeline_type).to_list(20)
    cat_agg = await db.members.aggregate(pipeline_cat).to_list(20)
    status_agg = await db.members.aggregate(pipeline_status).to_list(20)
    total = await db.members.count_documents({})
    return {
        "total": total,
        "by_type": {(x["_id"] or "MPCA"): x["count"] for x in type_agg},
        "by_category": {(x["_id"] or "—"): x["count"] for x in cat_agg},
        "by_status": {(x["_id"] or "—"): x["count"] for x in status_agg},
    }


@api_router.get("/members/{member_id}", response_model=Member)
async def get_member(member_id: str):
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")
    return doc


@api_router.post("/members", response_model=Member)
async def create_member(payload: MemberCreate):
    if payload.member_type == "Division" and not payload.division_body_id:
        raise HTTPException(400, "division_body_id is required for Division-scoped members")
    uid = await next_uid(payload.category)
    member = Member(uid=uid, **payload.model_dump())
    await db.members.insert_one(member.model_dump())
    return member


@api_router.patch("/members/{member_id}", response_model=Member)
async def update_member(
    member_id: str,
    payload: MemberUpdate,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
):
    """RBAC:
    · Office bearers (president/secretary/treasurer/division-secretary) may edit any member.
    · Otherwise, the caller may only edit their own record — matched by email
      (X-User-Email header vs. member.email).
    · When no headers are supplied (legacy callers), edit is allowed (backwards compatible
      with existing dev flows, but the UI hides the edit action for non-bearers).
    """
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")

    actor = _actor(x_role_id, x_user_email)
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        # non-bearer: must own the row via email
        if not actor["email"] or actor["email"] != (doc.get("email") or "").strip().lower():
            raise HTTPException(403, "You may only edit your own member record.")

    update = payload.model_dump(exclude_unset=True)
    if update.get("member_type") == "Division" and not (update.get("division_body_id") or doc.get("division_body_id")):
        raise HTTPException(400, "division_body_id is required when member_type is Division")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = x_role_id or "system"
    await db.members.update_one({"id": member_id}, {"$set": update})
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    return doc


@api_router.delete("/members/{member_id}")
async def delete_member(
    member_id: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may remove members.")
    result = await db.members.delete_one({"id": member_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Member not found")
    return {"deleted": True}


# ---------------- Routes: Dynamic Member Categories (M6) ----------------


@api_router.get("/member-categories", response_model=List[MemberCategoryDef])
async def list_member_categories(active_only: bool = False):
    q = {"active": True} if active_only else {}
    docs = await db.member_categories.find(q, {"_id": 0}).sort([("display_order", 1), ("name", 1)]).to_list(200)
    return docs


@api_router.post("/member-categories", response_model=MemberCategoryDef)
async def create_member_category(
    payload: MemberCategoryDefCreate,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may manage member categories.")
    existing = await db.member_categories.find_one({"name": payload.name}, {"_id": 0})
    if existing:
        raise HTTPException(400, f"Category '{payload.name}' already exists.")
    data = payload.model_dump()
    if not data.get("code"):
        data["code"] = "".join(w[0] for w in payload.name.split() if w)[:5].upper() or "CAT"
    cat = MemberCategoryDef(**data)
    await db.member_categories.insert_one(cat.model_dump())
    return cat


@api_router.patch("/member-categories/{cat_id}", response_model=MemberCategoryDef)
async def update_member_category(
    cat_id: str,
    payload: MemberCategoryDefCreate,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may manage member categories.")
    doc = await db.member_categories.find_one({"id": cat_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Category not found")
    await db.member_categories.update_one({"id": cat_id}, {"$set": payload.model_dump(exclude_unset=True)})
    doc = await db.member_categories.find_one({"id": cat_id}, {"_id": 0})
    return doc


@api_router.delete("/member-categories/{cat_id}")
async def delete_member_category(
    cat_id: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may manage member categories.")
    r = await db.member_categories.delete_one({"id": cat_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Category not found")
    return {"deleted": True}


# ---------------- Routes: Bulk Upload (M6) ----------------


_CSV_ALIAS = {
    "full_name": "name",
    "member_name": "name",
    "e-mail": "email",
    "mail": "email",
    "mobile": "phone",
    "phone_number": "phone",
    "contact": "phone",
    "type": "member_type",
    "membership_type": "member_type",
    "division": "division_body_id",
    "division_id": "division_body_id",
    "designation": "role",
    "post": "role",
    "member_id": "membership_id",
    "id_no": "membership_id",
    "joined": "membership_date",
    "date_of_joining": "membership_date",
    "joining_date": "membership_date",
    "member_category": "sub_category",
    "sub-category": "sub_category",
}
_VALID_CATS = {"Individual", "Institutional", "Honorary", "Patron"}
_VALID_TYPES = {"MPCA", "Division"}
_VALID_STATUS = {"Active", "Suspended", "Lapsed", "Transferred", "Pending"}


def _norm_key(k: str) -> str:
    k = (k or "").strip().lower().replace(" ", "_").replace("-", "_")
    return _CSV_ALIAS.get(k, k)


def _clean_val(v):
    if v is None:
        return None
    v = str(v).strip()
    return v if v else None


@api_router.post("/members/bulk-upload", response_model=BulkUploadReport)
async def bulk_upload_members(
    file: UploadFile = File(...),
    dry_run: bool = Form(False),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    """Accepts a CSV file. Recognised (case-insensitive) columns:
    name*, category*, address*, email, phone, member_type (MPCA/Division),
    division_body_id, role, membership_id, sub_category, membership_date,
    status, notes, fee_structure, effectiveness, approving_authority,
    eligibility_factor, representative_name, representative_contact.
    Aliases like 'full_name', 'mobile', 'designation', 'joined' are auto-mapped.
    """
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may bulk-upload members.")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Uploaded file is empty.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "CSV missing header row.")

    inserted = 0
    skipped = 0
    errors: List[dict] = []
    rows: List[dict] = []

    for idx, raw_row in enumerate(reader, start=2):  # header is row 1
        row = {_norm_key(k): _clean_val(v) for k, v in raw_row.items() if k}
        name = row.get("name")
        if not name:
            skipped += 1
            errors.append({"row": idx, "name": "—", "reason": "Missing 'name'"})
            continue

        cat = (row.get("category") or "Individual").title()
        if cat not in _VALID_CATS:
            skipped += 1
            errors.append({"row": idx, "name": name, "reason": f"Invalid category '{cat}'. Allowed: {sorted(_VALID_CATS)}"})
            continue

        mtype = (row.get("member_type") or "MPCA").upper()
        # normalise: users may write 'mpca' or 'division'
        mtype = "Division" if mtype.startswith("DIV") else "MPCA"
        if mtype not in _VALID_TYPES:
            mtype = "MPCA"

        status = (row.get("status") or "Active").title()
        if status not in _VALID_STATUS:
            status = "Active"

        div_body = row.get("division_body_id")
        if mtype == "Division" and not div_body:
            skipped += 1
            errors.append({"row": idx, "name": name, "reason": "member_type=Division requires division_body_id"})
            continue

        address = row.get("address") or "—"

        payload = {
            "name": name,
            "category": cat,
            "sub_category": row.get("sub_category"),
            "member_type": mtype,
            "division_body_id": div_body,
            "role": row.get("role"),
            "membership_id": row.get("membership_id"),
            "address": address,
            "phone": row.get("phone"),
            "email": row.get("email"),
            "eligibility_factor": row.get("eligibility_factor"),
            "membership_date": row.get("membership_date"),
            "effectiveness": row.get("effectiveness"),
            "fee_structure": row.get("fee_structure"),
            "approving_authority": row.get("approving_authority"),
            "representative_name": row.get("representative_name"),
            "representative_contact": row.get("representative_contact"),
            "status": status,
            "notes": row.get("notes"),
            "body_id": div_body if mtype == "Division" and div_body else "MPCA",
        }
        rows.append(payload)

    if dry_run:
        return BulkUploadReport(total_rows=inserted + skipped + len(rows), inserted=0, skipped=skipped, errors=errors + [{"row": 0, "name": "—", "reason": f"dry_run: {len(rows)} rows would be inserted"}])

    for row in rows:
        try:
            uid = await next_uid(row["category"])
            m = Member(uid=uid, **row)
            await db.members.insert_one(m.model_dump())
            inserted += 1
        except Exception as ex:  # noqa: BLE001
            skipped += 1
            errors.append({"row": 0, "name": row.get("name") or "—", "reason": f"Insert failed: {ex}"})

    return BulkUploadReport(
        total_rows=inserted + skipped,
        inserted=inserted,
        skipped=skipped,
        errors=errors,
    )


@api_router.get("/members/bulk-upload/template")
async def bulk_upload_template():
    """Return a CSV template as text — the frontend downloads it as a file."""
    headers = [
        "name", "category", "member_type", "division_body_id", "sub_category",
        "role", "membership_id", "address", "email", "phone",
        "membership_date", "status", "fee_structure", "effectiveness", "notes",
    ]
    sample = [
        "Shri Ramesh Kumar", "Individual", "MPCA", "", "Life Member",
        "President", "MPCA-LM-001", "12 Race Course Road, Indore", "ramesh@example.com",
        "9876543210", "2020-04-01", "Active", "Life Fee Paid", "Lifetime",
        "Life member since 2020",
    ]
    csv_text = ",".join(headers) + "\n" + ",".join(sample) + "\n"
    return {"filename": "mpca_members_template.csv", "content": csv_text, "headers": headers}


# ---------------- Routes: Disclosures ----------------

