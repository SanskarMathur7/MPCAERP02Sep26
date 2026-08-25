"""Iter 130j · Seed tournament invoices with AI diff data for the audit screenshot."""
from __future__ import annotations
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
TID = "6c16eaa8-b8ae-42c0-92c8-80ba9e088262"  # Madhavrao Scindia Trophy


def _iso(days_ago=0):
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def _green(vendor, date, amount):
    return {
        "status": "green", "vendor_match": True, "date_match": True, "amount_match": True,
        "extracted_vendor": vendor, "extracted_date": date, "extracted_amount": amount,
        "typed_vendor": vendor, "typed_date": date, "typed_amount": amount,
        "mismatches": [], "confidence": 0.94, "checked_at": _iso(0), "error": None,
    }


def _amber(vendor, date, amount, typed_amount, reasons):
    return {
        "status": "amber", "vendor_match": True, "date_match": True,
        "amount_match": abs(amount - typed_amount) <= 1,
        "extracted_vendor": vendor, "extracted_date": date, "extracted_amount": amount,
        "typed_vendor": vendor, "typed_date": date, "typed_amount": typed_amount,
        "mismatches": reasons, "confidence": 0.88, "checked_at": _iso(0), "error": None,
    }


INVOICES = [
    # 8 clean · greens
    ("INV-2026-27-0201", "Sanskar Sports", "Equipment · match balls (24 doz)",       "2026-08-16", 42000, "green"),
    ("INV-2026-27-0202", "Hotel Sayaji · Bhopal", "Umpire lodging · 4 nights",       "2026-08-18", 58400, "green"),
    ("INV-2026-27-0203", "MB Fuels",     "Bus fuel · Gwalior team travel",           "2026-08-15", 18750, "green"),
    ("INV-2026-27-0204", "Ravi Umpire",  "Match fees · panel umpire (6 matches)",    "2026-08-20", 24000, "green"),
    ("INV-2026-27-0205", "Deep Refreshments","Refreshment · 62 players × 6 days",    "2026-08-17", 29760, "green"),
    ("INV-2026-27-0206", "Neelam Groundsmen","Roller + pitch prep · 6 match-days",   "2026-08-16", 36000, "green"),
    ("INV-2026-27-0207", "Ashok Xerox",  "Print + laminating · scorebooks",          "2026-08-14", 4200,  "green"),
    ("INV-2026-27-0208", "Doctor A. Verma","Medical officer · 4 match-days",         "2026-08-19", 16000, "green"),
    # 3 ambers
    ("INV-2026-27-0209", "Hotel Sayaji · Bhopal", "Team lodging · 4 rooms × 4 nights", "2026-08-18", 74400, "amber",
        69600, ["Amount claim exceeds AI-extracted ₹69,600 by ₹4,800 (6.9%)"]),
    ("INV-2026-27-0210", "PetroMart Fuel", "Ground vehicle fuel",                    "2026-08-13", 8600, "amber",
        8600, ["Invoice date 13-Aug lies outside tournament window 15-Aug → 31-Aug"]),
    ("INV-2026-27-0211", "Balaji Water Suppliers","Water cans · 15 cases",           "2026-08-17", 12500, "amber",
        11250, ["Amount claim ₹12,500 · AI-extracted ₹11,250 · variance ₹1,250 (11%)"]),
    # 1 rejected
    ("INV-2026-27-0212", "Unknown Vendor", "Miscellaneous",                          "2026-07-28", 22000, "rejected"),
]


async def go():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    # Clean prior demo invoices
    await db.tournament_invoices.delete_many({"invoice_ref": {"$regex": r"^INV-2026-27-02"}})

    for row in INVOICES:
        ref, vendor, note, dt, amt, tone, *rest = row
        typed_amount = rest[0] if rest else amt
        ai_diff = None
        status = "Submitted"
        if tone == "green":
            ai_diff = _green(vendor, dt, amt)
            status = "Approved"
        elif tone == "amber":
            reasons = rest[1] if len(rest) > 1 else []
            ai_diff = _amber(vendor, dt, amt, typed_amount, reasons)
            status = "Submitted"
        else:  # rejected
            status = "Rejected"

        doc = {
            "id": str(uuid.uuid4()),
            "invoice_ref": ref,
            "tournament_id": TID,
            "body_id": "DIV-GWL",
            "vendor_name": vendor,
            "invoice_no": ref.replace("INV-", ""),
            "invoice_date": dt,
            "amount_inr": float(typed_amount),
            "gst_inr": 0.0,
            "total_inr": float(typed_amount),
            "file_url": f"/api/uploads/dummy-{ref}",       # non-empty so audit rolls up
            "filename": f"{ref}.pdf",
            "notes": note,
            "status": status,
            "ai_extracted": True,
            "ai_diff": ai_diff,
            "manually_overridden": False,
            "over_budget_amount_inr": 0.0,
            "eligible_for_grant_inr": float(amt) if status != "Rejected" else 0.0,
            "ineligible_for_grant_inr": 0.0,
            "allocations": [],
            "created_at": _iso(0),
        }
        await db.tournament_invoices.insert_one(doc)

    print(f"Seeded {len(INVOICES)} tournament invoices for {TID}")
    client.close()


if __name__ == "__main__":
    asyncio.run(go())
