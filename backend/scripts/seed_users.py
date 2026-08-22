"""Feb 2026 · Iter 114 — Seed the REAL MPCA roster from `MPCA_Contact_Details.xlsx`.

Runs at backend startup. Idempotent:
  · Creates on first boot with `DEFAULT_USER_PASSWORD` from env
  · Refreshes the password hash when that env var changes
  · **Purges any legacy dummy user rows** that are NOT in this real roster
    (except the sysadmin testing account)

Sample users retired (Feb 22 2026):
  Sanjeev Dua/Secretary, Naveen Mittal/Treasurer, Kailash Vijayvargiya (Gwalior),
  Rajesh Kulkarni (Indore District), Chandrakant Pandit (Match Official),
  Ramesh Agarwal/CAO, Amit Bhargava/Joint Sec, Vikram Rathi/Manager,
  Anil Deshmukh/Selection Chair, Suresh Chauhan/Cricket Manager.

Real roster is 17 people: 7 MPCA HQ office bearers + 10 Division Honorary
Secretaries. All are seeded with `force_password_reset=True` so their first
login redirects them to `/change-password`. The sysadmin account is kept as
a stable back-door for QA and does NOT force-reset.
"""
import os
import uuid
from datetime import datetime, timezone

from routes.auth import hash_password, verify_password


# ═════════════════════════════════════════════════════════════════════
# MPCA HQ · 7 office bearers (Excel Sheet 1 · S.No 0-6)
# ═════════════════════════════════════════════════════════════════════
_HQ = [
    {
        "id": "president",
        "email": "president@mpcaonline.com",
        "title": "President",
        "honorific": "Shri",
        "name": "Mahanaaryaman Scindia",
        "post": "President, MPCA",
        "post_title": "President",
        "scope": "Full executive — sees all divisions & districts",
        "privileges": ["Read All", "Approve", "Chair Meetings", "Sign Resolutions"],
        "accent": "navy",
    },
    {
        "id": "vice-president",
        "email": "vicepresident@mpcaonline.com",
        "title": "Vice President",
        "honorific": "Shri",
        "name": "Vineet Sethia",
        "post": "Vice President, MPCA",
        "post_title": "Vice President",
        "scope": "Deputises President — full read + designated approvals",
        "privileges": ["Read All", "Approve on delegation"],
        "accent": "navy",
    },
    {
        "id": "secretary",
        "email": "secretary@mpcaonline.com",
        "title": "Hon. Secretary",
        "honorific": "Shri",
        "name": "Sudhir Asnani",
        "post": "Honorary Secretary, MPCA",
        "post_title": "Hon. Secretary",
        "scope": "Membership, AGM, register custody — state-wide",
        "privileges": ["Manage Members", "Convene Meetings", "Issue Notices"],
        "accent": "saffron",
    },
    {
        "id": "joint-secretary",
        "email": "jointsecretary@mpcaonline.com",
        "title": "Hon. Joint Secretary",
        "honorific": "Smt.",
        "name": "Arundhati Kirkire",
        "post": "Honorary Joint Secretary, MPCA",
        "post_title": "Joint Secretary",
        "scope": "Assists Hon. Secretary; day-to-day operations",
        "privileges": ["Draft Documents", "Coordinate"],
        "accent": "saffron",
    },
    {
        "id": "treasurer",
        "email": "treasurer@mpcaonline.com",
        "title": "Hon. Treasurer",
        "honorific": "Shri",
        "name": "Sanjeev Dua",
        "post": "Honorary Treasurer, MPCA",
        "post_title": "Hon. Treasurer",
        "scope": "State bank operations, grants, audit",
        "privileges": ["Financial Powers", "Approve Grants", "Bank Signatory"],
        "accent": "marigold",
    },
    {
        "id": "cao-mpca",
        "email": "panditrdpandit@gmail.com",
        "title": "Chief Accounts Officer",
        "honorific": "Shri",
        "name": "Rohit Pandit",
        "post": "Chief Accounts Officer, MPCA",
        "post_title": "Chief Accounts Officer",
        "scope": "Financial books, vouchers, ledger custody",
        "privileges": ["Prepare Financials", "Book-keeping"],
        "accent": "navy",
    },
    {
        "id": "internal-auditor",
        "email": "accounts@mpcaonline.com",
        "title": "Internal Auditor",
        "honorific": "Shri",
        "name": "Nitin Batra",
        "post": "Internal Auditor, MPCA",
        "post_title": "Internal Auditor",
        "scope": "Independent review of accounts, vouchers, ledgers",
        "privileges": ["Read Financials", "Raise Observations"],
        "accent": "brass",
    },
]

for u in _HQ:
    u.update({"body_type": "State", "body_code": "MPCA", "body_name": "MPCA Headquarters"})


# ═════════════════════════════════════════════════════════════════════
# 10 Division Honorary Secretaries (Excel Sheet 2)
# ═════════════════════════════════════════════════════════════════════
_DIVISIONS = [
    ("indore",       "Devashish Nilesey",       "ind.hs@mpcaonline.com", "9300077022", "DIV-IND", "Indore Division",       "Shri"),
    ("jabalpur",     "Sushil Rajak",            "jbp.hs@mpcaonline.com", "9424308991", "DIV-JBP", "Jabalpur Division",     "Shri"),
    ("shahdol",      "Ajay Dwivedi",            "shd.hs@mpcaonline.com", "9424333469", "DIV-SHD", "Shahdol Division",      "Shri"),
    ("narmadapuram", "Pradeep Tomar",           "npm.hs@mpcaonline.com", "9425044713", "DIV-NMD", "Narmadapuram Division", "Shri"),
    ("sagar",        "Vinay Shukla",            "sag.hs@mpcaonline.com", "",           "DIV-SAG", "Sagar Division",        "Shri"),
    ("gwalior",      "Vijay Prakash Sharma",    "gwl.hs@mpcaonline.com", "9893081273", "DIV-GWL", "Gwalior Division",      "Shri"),
    ("chambal",      "Tasleem Khan",            "chb.hs@mpcaonline.com", "9300603708", "DIV-CHM", "Chambal Division",      "Shri"),
    ("rewa",         "Kamal Shrivastava",       "rew.hs@mpcaonline.com", "9425185596", "DIV-RWA", "Rewa Division",         "Shri"),
    ("bhopal",       "Shanti Kumar Jain",       "bhp.hs@mpcaonline.com", "9893023583", "DIV-BPL", "Bhopal Division",       "Shri"),
    ("ujjain",       "Surendra Kabra",          "uji.hs@mpcaonline.com", "9826311876", "DIV-UJN", "Ujjain Division",       "Shri"),
]

_DIV_USERS = [
    {
        "id": f"div-sec-{slug}",
        "email": email,
        "phone": phone,
        "title": "Division Secretary",
        "honorific": honorific,
        "name": name,
        "post": f"Hon. Secretary, {body_name}",
        "post_title": "Hon. Secretary",
        "scope": f"{body_name} — division scope",
        "privileges": ["Recommend Grants", "Review Districts", "Submit Claims"],
        "accent": "maroon",
        "body_type": "Division",
        "body_code": body_code,
        "body_name": body_name,
    }
    for slug, name, email, phone, body_code, body_name, honorific in _DIVISIONS
]


# ═════════════════════════════════════════════════════════════════════
# SysAdmin (kept for QA and master-data ops — no force-reset on this one)
# ═════════════════════════════════════════════════════════════════════
_SYSADMIN = {
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
}


PERSONA_USERS = _HQ + _DIV_USERS + [_SYSADMIN]

# The 17 real users need to change their password on first login. SysAdmin does not.
_FORCE_RESET_IDS = {u["id"] for u in _HQ + _DIV_USERS}

# Canonical set of IDs that are allowed to exist in `users`. Anything else is
# a legacy dummy row and gets purged on boot.
_ALLOWED_USER_IDS = {u["id"] for u in PERSONA_USERS}


async def seed_users_from_personas(db) -> dict:
    """Purge legacy dummy users, then upsert the 17 real MPCA personas + sysadmin.

    · Every real MPCA row (President, VP, Secretary, ..., Div Secretaries) is
      seeded with `force_password_reset=True`. Their first login bounces them
      through the `/change-password` page.
    · The sysadmin account is idempotent-refresh only, never force-reset.
    · Any row in `users` whose id is not in `_ALLOWED_USER_IDS` is deleted —
      that includes the retired dummy accounts (Naveen Mittal, Kailash V., etc.).
    """
    default_pw = os.environ.get("DEFAULT_USER_PASSWORD")
    if not default_pw:
        raise RuntimeError("DEFAULT_USER_PASSWORD not set in backend/.env")

    # One-time index (safe to recreate)
    try:
        await db.users.create_index("email", unique=True)
    except Exception:
        pass

    # ── Purge legacy dummy users ────────────────────────────────────
    purge_res = await db.users.delete_many({"id": {"$nin": list(_ALLOWED_USER_IDS)}})

    # ── Upsert real roster ──────────────────────────────────────────
    created, refreshed, kept = [], [], []
    now = datetime.now(timezone.utc).isoformat()
    for p in PERSONA_USERS:
        # Mirror `name` → `display_name` so the RBAC table (which reads
        # `display_name` first) always shows the current roster name.
        p = {**p, "display_name": p["name"]}
        needs_force_reset = p["id"] in _FORCE_RESET_IDS
        existing = await db.users.find_one(
            {"id": p["id"]},
            {"password_hash": 1, "email": 1, "force_password_reset": 1, "post_title": 1, "display_name": 1, "name": 1},
        )
        if existing is None:
            doc = {
                **p,
                "_id_pass_through": str(uuid.uuid4()),
                "password_hash": hash_password(default_pw),
                "is_active": True,
                "force_password_reset": needs_force_reset,
                "created_at": now,
            }
            await db.users.insert_one(doc)
            created.append(p["email"])
        else:
            # Refresh persona fields + rotate password if env password changed
            pw_ok = verify_password(default_pw, existing.get("password_hash") or "")
            fields_ok = (
                existing.get("email") == p["email"]
                and existing.get("post_title") == p["post_title"]
                and existing.get("display_name") == p["display_name"]
                and existing.get("name") == p["name"]
            )
            if not fields_ok or not pw_ok:
                set_doc = {
                    **p,
                    "password_hash": hash_password(default_pw) if not pw_ok else existing["password_hash"],
                    "is_active": True,
                    "updated_at": now,
                }
                # Only (re)assert force_password_reset for real users if the row
                # has never had it set (avoid clobbering a user who already changed pw).
                if needs_force_reset and "force_password_reset" not in existing:
                    set_doc["force_password_reset"] = True
                await db.users.update_one({"id": p["id"]}, {"$set": set_doc})
                refreshed.append(p["email"])
            else:
                kept.append(p["email"])

    return {
        "purged": purge_res.deleted_count,
        "created": created,
        "refreshed": refreshed,
        "kept": kept,
    }
