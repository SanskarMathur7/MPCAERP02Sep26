"""Feb 2026 · Seed the 7 existing personas as user accounts.

Runs at backend startup. Idempotent — creates on first boot, updates the
password hash if DEFAULT_USER_PASSWORD in .env changes.
"""
import os
import uuid
from datetime import datetime, timezone

from routes.auth import hash_password, verify_password


# Seven office-bearer personas mirroring frontend/src/context/AuthContext.jsx.
# Each user carries the same persona shape the frontend already knows so no
# scoping/header code needs to change.
PERSONA_USERS = [
    {
        "id": "president",
        "email": "president@mpca.in",
        "title": "President",
        "honorific": "Shri",
        "name": "Mahanaryaman Scindia",
        "post": "President, MPCA",
        "post_title": "President",
        "scope": "Full executive — sees all divisions & districts",
        "privileges": ["Read All", "Approve", "Chair Meetings", "Sign Resolutions"],
        "accent": "navy",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
    {
        "id": "secretary",
        "email": "secretary@mpca.in",
        "title": "Hon. Secretary",
        "honorific": "Shri",
        "name": "Sanjeev Dua",
        "post": "Honorary Secretary, MPCA",
        "post_title": "Hon. Secretary",
        "scope": "Membership, AGM, register custody — state-wide",
        "privileges": ["Manage Members", "Convene Meetings", "Issue Notices"],
        "accent": "saffron",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
    {
        "id": "treasurer",
        "email": "treasurer@mpca.in",
        "title": "Hon. Treasurer",
        "honorific": "Shri",
        "name": "Naveen Mittal",
        "post": "Honorary Treasurer, MPCA",
        "post_title": "Hon. Treasurer",
        "scope": "State bank operations, grants, audit",
        "privileges": ["Financial Powers", "Approve Grants", "Bank Signatory"],
        "accent": "marigold",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
    {
        "id": "division-secretary",
        "email": "indore.secretary@mpca.in",
        "title": "Division Secretary",
        "honorific": "Shri",
        "name": "Devashish Nilosey",
        "post": "Hon. Secretary, Indore Division",
        "post_title": "Hon. Secretary",
        "scope": "Indore Division — 8 districts under jurisdiction",
        "privileges": ["Recommend Grants", "Review Districts", "Submit Claims"],
        "accent": "maroon",
        "body_type": "Division",
        "body_code": "DIV-IND",
        "body_name": "Indore Division",
    },
    {
        "id": "division-secretary-gwl",
        "email": "gwalior.secretary@mpca.in",
        "title": "Division Secretary",
        "honorific": "Shri",
        "name": "Kailash Vijayvargiya",
        "post": "Hon. Secretary, Gwalior Division",
        "post_title": "Hon. Secretary",
        "scope": "Gwalior Division — 5 districts",
        "privileges": ["Recommend Grants", "Review Districts", "Submit Claims"],
        "accent": "navy",
        "body_type": "Division",
        "body_code": "DIV-GWL",
        "body_name": "Gwalior Division",
    },
    {
        "id": "district-secretary",
        "email": "indore.district@mpca.in",
        "title": "District Secretary",
        "honorific": "Shri",
        "name": "Rajesh Kulkarni",
        "post": "Hon. Secretary, Indore District",
        "post_title": "Hon. Secretary",
        "scope": "Indore District — submits claims to Indore Division",
        "privileges": ["Submit Claims", "Manage Local Players", "Sign Receipts"],
        "accent": "navy-light",
        "body_type": "District",
        "body_code": "DIST-INDO-IND",
        "body_name": "Indore District",
    },
    {
        "id": "match-official",
        "email": "official@mpca.in",
        "title": "Match Official",
        "honorific": "Shri",
        "name": "Chandrakant Pandit",
        "post": "State Panel Umpire, MPCA",
        "post_title": "Match Official",
        "scope": "Own DA / TA forms · Submit days for tournaments assigned",
        "privileges": ["Submit DA Forms", "View Assigned Fixtures"],
        "accent": "brass",
        "body_type": "Official",
        "body_code": "MPCA",
        "body_name": "MPCA Match Official Panel",
    },
    # ─── Additional MPCA internal posts (Feb 2026 · Iter 109 · M&C) ───
    {
        "id": "cao-mpca",
        "email": "cao@mpca.in",
        "title": "Chief Accounts Officer",
        "honorific": "Shri",
        "name": "Ramesh Agarwal",
        "post": "Chief Accounts Officer, MPCA",
        "post_title": "Chief Accounts Officer",
        "scope": "Financial books, vouchers, ledger custody",
        "privileges": ["Prepare Financials", "Book-keeping"],
        "accent": "navy",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
    {
        "id": "joint-secretary",
        "email": "joint.secretary@mpca.in",
        "title": "Joint Secretary",
        "honorific": "Shri",
        "name": "Amit Bhargava",
        "post": "Joint Secretary, MPCA",
        "post_title": "Joint Secretary",
        "scope": "Assists Hon. Secretary; day-to-day operations",
        "privileges": ["Draft Documents", "Coordinate"],
        "accent": "saffron",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
    {
        "id": "manager-mpca",
        "email": "manager@mpca.in",
        "title": "Manager",
        "honorific": "Shri",
        "name": "Vikram Rathi",
        "post": "Manager, MPCA",
        "post_title": "Manager",
        "scope": "Administration + operations",
        "privileges": ["Ops", "Admin"],
        "accent": "brass",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
    {
        "id": "selection-chair",
        "email": "selection.chair@mpca.in",
        "title": "Selection Committee Chairperson",
        "honorific": "Shri",
        "name": "Anil Deshmukh",
        "post": "Chairperson, Selection Committee (MPCA)",
        "post_title": "Selection Chairperson",
        "scope": "Squad selection · state teams",
        "privileges": ["Chair Selection", "Recommend Squad"],
        "accent": "maroon",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Selection Committee",
    },
    {
        "id": "cricket-manager",
        "email": "cricket.manager@mpca.in",
        "title": "Cricket Manager",
        "honorific": "Shri",
        "name": "Suresh Chauhan",
        "post": "Cricket Manager, MPCA",
        "post_title": "Cricket Manager",
        "scope": "Cricket ops · fixtures · officials",
        "privileges": ["Fixtures", "Officials"],
        "accent": "navy",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
    # ─── System Administrator (Iter 110 · master-data custodian) ───
    {
        "id": "system-administrator",
        "email": "sysadmin@mpca.in",
        "title": "System Administrator",
        "honorific": "Shri",
        "name": "Vikas Yadav",
        "post": "System Administrator, MPCA",
        "post_title": "System Administrator",
        "role": "sys_admin",
        "scope": "Masters, Wiring, Rate Cards, RBAC, Maker-Checker · full technical control",
        "privileges": ["Manage Masters", "RBAC", "Workflow Config", "System Settings"],
        "accent": "brass",
        "body_type": "State",
        "body_code": "MPCA",
        "body_name": "MPCA Headquarters",
    },
]


async def seed_users_from_personas(db) -> dict:
    """Ensure the 7 office-bearer accounts exist. Idempotent.

    · Creates any missing account with `DEFAULT_USER_PASSWORD` from env.
    · If the default password in env has been rotated and doesn't match the
      stored hash, updates the hash for the existing accounts too (so ops
      can force a rotation by editing .env and restarting the backend).
    """
    default_pw = os.environ.get("DEFAULT_USER_PASSWORD")
    if not default_pw:
        raise RuntimeError("DEFAULT_USER_PASSWORD not set in backend/.env")

    # One-time index (safe to recreate)
    try:
        await db.users.create_index("email", unique=True)
    except Exception:
        pass

    created, refreshed, kept = [], [], []
    now = datetime.now(timezone.utc).isoformat()
    for p in PERSONA_USERS:
        existing = await db.users.find_one({"id": p["id"]}, {"password_hash": 1, "email": 1})
        if existing is None:
            doc = {
                **p,
                "_id_pass_through": str(uuid.uuid4()),
                "password_hash": hash_password(default_pw),
                "is_active": True,
                "created_at": now,
            }
            await db.users.insert_one(doc)
            created.append(p["email"])
        else:
            # Existing row from an older seeder (e.g. Sprint M21 RBAC bootstrap
            # left email/name/post as None). Upsert ALL persona fields plus
            # rotate the password hash so the row is fully populated.
            fields_ok = existing.get("email") == p["email"]
            pw_ok = verify_password(default_pw, existing.get("password_hash") or "")
            has_post_title = bool(existing.get("post_title"))  # Iter 109
            if not fields_ok or not pw_ok or not has_post_title:
                await db.users.update_one(
                    {"id": p["id"]},
                    {"$set": {
                        **p,
                        "password_hash": hash_password(default_pw),
                        "is_active": True,
                        "updated_at": now,
                    }},
                )
                refreshed.append(p["email"])
            else:
                kept.append(p["email"])

    return {"created": created, "refreshed": refreshed, "kept": kept}
