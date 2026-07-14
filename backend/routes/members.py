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
    MembershipAssignment,
    MembershipAssignmentCreate,
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
    data = payload.model_dump()
    # Seed a primary MembershipAssignment if the caller didn't send one.
    if not data.get("memberships"):
        primary = MembershipAssignment(
            category=payload.sub_category or payload.category,
            role=payload.role,
            start_date=payload.membership_date,
            is_primary=True,
        )
        data["memberships"] = [primary.model_dump()]
    member = Member(uid=uid, **data)
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


# ---------------- Routes: Membership Assignments (M6.1 · Multi-Category) ----------------


def _ensure_single_primary(assignments: list) -> list:
    """Guarantee at most one primary=true — the newest primary wins."""
    primaries = [a for a in assignments if a.get("is_primary")]
    if len(primaries) > 1:
        primaries.sort(key=lambda a: a.get("added_at") or "", reverse=True)
        keep = primaries[0]["id"]
        for a in assignments:
            if a.get("is_primary") and a.get("id") != keep:
                a["is_primary"] = False
    return assignments


@api_router.post("/members/{member_id}/memberships", response_model=Member)
async def add_membership_assignment(
    member_id: str,
    payload: MembershipAssignmentCreate,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
):
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")
    # RBAC: only office bearers add assignments (elected posts / committees)
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may add category / committee assignments.")

    assignment = MembershipAssignment(**payload.model_dump(), added_by=x_role_id or "system")
    existing = doc.get("memberships") or []
    existing.append(assignment.model_dump())
    _ensure_single_primary(existing)

    # If the added row is primary → sync top-level sub_category label
    updates = {
        "memberships": existing,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": x_role_id or "system",
    }
    if assignment.is_primary:
        updates["sub_category"] = assignment.category
        if assignment.role:
            updates["role"] = assignment.role
    await db.members.update_one({"id": member_id}, {"$set": updates})
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    return doc


@api_router.patch("/members/{member_id}/memberships/{assignment_id}", response_model=Member)
async def update_membership_assignment(
    member_id: str,
    assignment_id: str,
    payload: MembershipAssignmentCreate,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may modify assignments.")
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")
    existing = doc.get("memberships") or []
    hit = next((a for a in existing if a.get("id") == assignment_id), None)
    if not hit:
        raise HTTPException(404, "Assignment not found")
    changes = payload.model_dump(exclude_unset=True)
    hit.update(changes)
    _ensure_single_primary(existing)
    updates = {
        "memberships": existing,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": x_role_id or "system",
    }
    if hit.get("is_primary"):
        updates["sub_category"] = hit.get("category")
        if hit.get("role"):
            updates["role"] = hit["role"]
    await db.members.update_one({"id": member_id}, {"$set": updates})
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    return doc


@api_router.delete("/members/{member_id}/memberships/{assignment_id}", response_model=Member)
async def remove_membership_assignment(
    member_id: str,
    assignment_id: str,
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    if x_role_id and x_role_id not in _OFFICE_BEARER_ROLES:
        raise HTTPException(403, "Only office bearers may remove assignments.")
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")
    existing = doc.get("memberships") or []
    remaining = [a for a in existing if a.get("id") != assignment_id]
    if len(remaining) == len(existing):
        raise HTTPException(404, "Assignment not found")
    await db.members.update_one({"id": member_id}, {"$set": {
        "memberships": remaining,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": x_role_id or "system",
    }})
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    return doc





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
    "division_id": "division_body_id",
    "district_id": "body_id",
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


def _norm_name(s: str) -> str:
    """Fold to lowercase alphanumerics only — for fuzzy body name matching."""
    if not s:
        return ""
    return "".join(ch for ch in s.lower() if ch.isalnum())


async def _build_body_resolver():
    """Fetch all bodies once and build lookup dicts keyed by normalised names.
    Returns (div_by_name, dist_by_name, all_by_code)."""
    docs = await db.bodies.find({}, {"_id": 0}).to_list(500)
    div_by_name: dict = {}
    dist_by_name: dict = {}
    by_code: dict = {}
    for d in docs:
        by_code[d["code"]] = d
        # Match against a set of candidate aliases per body
        candidates = {d["name"], d["code"]}
        if d.get("seat"):
            candidates.add(d["seat"])
        # Also add short forms: "Indore Division" → "Indore"; "Indore District Cricket Association" → "Indore"
        n = d["name"]
        for suffix in [" division", " district cricket association", " dca", " district"]:
            if n.lower().endswith(suffix):
                candidates.add(n[: -len(suffix)].strip())
        target = div_by_name if d["body_type"] == "Division" else (dist_by_name if d["body_type"] == "District" else None)
        if target is not None:
            for c in candidates:
                key = _norm_name(c)
                if key:
                    target.setdefault(key, d["code"])
    return div_by_name, dist_by_name, by_code


@api_router.post("/members/bulk-upload", response_model=BulkUploadReport)
async def bulk_upload_members(
    file: UploadFile = File(...),
    dry_run: bool = Form(False),
    x_role_id: Optional[str] = Header(None, alias="X-Role-Id"),
):
    """Accepts a CSV file. Recognised (case-insensitive) columns:
    name*, category*, address*, email, phone, member_type (MPCA/Division),
    division (name or code), district (name or code — required for Division type),
    role, membership_id, sub_category, membership_date,
    status, notes, fee_structure, effectiveness, approving_authority,
    eligibility_factor, representative_name, representative_contact.
    Aliases like 'full_name', 'mobile', 'designation', 'joined' are auto-mapped.

    Name resolution: 'Indore' resolves to DIV-IND (Division) or DIST-INDO-IND (District)
    depending on the column. Codes are also accepted directly.
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

    # Build a body-name resolver once — used for the whole file
    div_by_name, dist_by_name, by_code = await _build_body_resolver()

    def _resolve_body(raw_value: Optional[str], expected_type: str) -> Optional[str]:
        """Return the body code or None. Accepts either a code (DIV-IND/DIST-INDO-IND)
        or a plain name ('Indore', 'Indore Division', 'Indore District Cricket Association')."""
        if not raw_value:
            return None
        v = raw_value.strip()
        # Direct code hit
        if v in by_code and by_code[v]["body_type"] == expected_type:
            return v
        # Name lookup
        key = _norm_name(v)
        pool = div_by_name if expected_type == "Division" else dist_by_name
        return pool.get(key)

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

        # Resolve division & district names → codes
        div_input = row.get("division") or row.get("division_body_id")
        dist_input = row.get("district") or row.get("body_id")

        div_code = _resolve_body(div_input, "Division")
        dist_code = _resolve_body(dist_input, "District")

        if div_input and not div_code:
            skipped += 1
            errors.append({"row": idx, "name": name, "reason": f"Unknown division '{div_input}'. Use one of {sorted(set(d['name'] for d in by_code.values() if d['body_type']=='Division'))}"})
            continue
        if dist_input and not dist_code:
            skipped += 1
            errors.append({"row": idx, "name": name, "reason": f"Unknown district '{dist_input}'."})
            continue

        if mtype == "Division":
            if not div_code:
                skipped += 1
                errors.append({"row": idx, "name": name, "reason": "member_type=Division requires 'division' column (name or code)"})
                continue
            if not dist_code:
                skipped += 1
                errors.append({"row": idx, "name": name, "reason": "member_type=Division requires 'district' column (name or code) — pick a district under " + div_code})
                continue
            # Validate that district belongs to the division
            dist_doc = by_code.get(dist_code) or {}
            if dist_doc.get("parent_code") != div_code:
                skipped += 1
                errors.append({"row": idx, "name": name, "reason": f"District {dist_code} does not belong to Division {div_code}"})
                continue

        address = row.get("address") or "—"

        # For Division members: body_id = district code (so they show on district page);
        # division_body_id = division code (so they show on division page too).
        # For MPCA members: body_id = MPCA; no division scoping.
        if mtype == "Division":
            resolved_body_id = dist_code
            resolved_division = div_code
        else:
            resolved_body_id = "MPCA"
            resolved_division = None

        payload = {
            "name": name,
            "category": cat,
            "sub_category": row.get("sub_category"),
            "member_type": mtype,
            "division_body_id": resolved_division,
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
            "body_id": resolved_body_id,
        }
        rows.append(payload)

    if dry_run:
        return BulkUploadReport(total_rows=inserted + skipped + len(rows), inserted=0, skipped=skipped, errors=errors + [{"row": 0, "name": "—", "reason": f"dry_run: {len(rows)} rows would be inserted / merged"}])

    merged = 0
    for row in rows:
        try:
            # M6.1 · Auto-merge: if a row's email matches an existing member,
            # append a MembershipAssignment instead of creating a duplicate row.
            email = (row.get("email") or "").strip().lower() or None
            existing = None
            if email:
                existing = await db.members.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
            if existing:
                new_assign = MembershipAssignment(
                    category=row.get("sub_category") or row["category"],
                    role=row.get("role"),
                    start_date=row.get("membership_date"),
                    is_primary=False,
                    notes=row.get("notes"),
                    added_by="bulk_upload",
                )
                assignments = existing.get("memberships") or []
                assignments.append(new_assign.model_dump())
                await db.members.update_one({"id": existing["id"]}, {"$set": {
                    "memberships": assignments,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_by": x_role_id or "bulk_upload",
                }})
                merged += 1
                errors.append({"row": 0, "name": row["name"], "reason": f"Merged as additional assignment on existing UID {existing['uid']}"})
                continue

            uid = await next_uid(row["category"])
            # Primary assignment mirrors sub_category / role for permanent record
            primary_assignment = MembershipAssignment(
                category=row.get("sub_category") or row["category"],
                role=row.get("role"),
                start_date=row.get("membership_date"),
                is_primary=True,
                added_by="bulk_upload",
            )
            row["memberships"] = [primary_assignment.model_dump()]
            m = Member(uid=uid, **row)
            await db.members.insert_one(m.model_dump())
            inserted += 1
        except Exception as ex:  # noqa: BLE001
            skipped += 1
            errors.append({"row": 0, "name": row.get("name") or "—", "reason": f"Insert failed: {ex}"})

    return BulkUploadReport(
        total_rows=inserted + skipped + merged,
        inserted=inserted + merged,
        skipped=skipped,
        errors=errors + ([{"row": 0, "name": "—", "reason": f"{merged} row(s) merged into existing members as additional assignments"}] if merged else []),
    )


@api_router.get("/members/bulk-upload/template")
async def bulk_upload_template():
    """Return a CSV template as text — the frontend downloads it as a file."""
    headers = [
        "name", "category", "member_type", "division", "district", "sub_category",
        "role", "membership_id", "address", "email", "phone",
        "membership_date", "status", "fee_structure", "effectiveness", "notes",
    ]
    samples = [
        # MPCA general body member — no division/district needed
        [
            "Shri Ramesh Kumar", "Individual", "MPCA", "", "", "Life Member",
            "President", "MPCA-LM-001", "12 Race Course Road, Indore", "ramesh@example.com",
            "9876543210", "2020-04-01", "Active", "Life Fee Paid", "Lifetime",
            "MPCA HQ life member since 2020",
        ],
        # Division-scoped member — division + district (names auto-resolved)
        [
            "Smt. Anita Verma", "Individual", "Division", "Indore", "Indore", "Annual Member",
            "Hon. Secretary", "IND-DCA-042", "23 MG Road, Indore", "anita@example.com",
            "9812340042", "2023-06-01", "Active", "₹3,000 Annual", "1 year",
            "Indore District Cricket Association",
        ],
        [
            "Shri Ravi Sharma", "Individual", "Division", "Jabalpur", "Katni", "Life Member",
            "Hon. Treasurer", "KAT-DCA-007", "Civil Lines, Katni", "ravi@example.com",
            "9876500007", "2018-04-01", "Active", "Life Fee Paid", "Lifetime",
            "Katni District under Jabalpur Division",
        ],
    ]
    csv_text = ",".join(headers) + "\n" + "\n".join(",".join(r) for r in samples) + "\n"
    return {"filename": "mpca_members_template.csv", "content": csv_text, "headers": headers}


# ---------------- Routes: Disclosures ----------------

