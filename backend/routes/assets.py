"""Sprint 3 · Fixed Asset Register (P5.x).

Asset master with straight-line depreciation, tag/QR support, and disposal flow.

Depreciation: SLM only (India-common for institutional bodies). Monthly rate =
cost / useful_life_months. Book value = cost − Σ(monthly depreciation up to as-on
date), floored at salvage_value_inr.

Categories per BCCI/state association practice: Land · Building · Vehicle ·
Equipment · Furniture · Computer · Networking · Sports_Equipment · Other.
"""
from datetime import datetime, timezone
from typing import List, Literal, Optional
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router, logger
from core.shared_services import next_code, write_audit_log, indian_fy


AssetCategory = Literal[
    "Land", "Building", "Vehicle", "Equipment", "Furniture",
    "Computer", "Networking", "Sports_Equipment", "Other",
]
AssetStatus = Literal["Active", "Under_Repair", "Idle", "Disposed", "Written_Off"]

# Default useful life (years) per category — India AS-10 style institutional benchmark.
DEFAULT_LIFE_YEARS = {
    "Land": 0,  # Land is non-depreciable
    "Building": 30,
    "Vehicle": 8,
    "Equipment": 10,
    "Furniture": 10,
    "Computer": 3,
    "Networking": 5,
    "Sports_Equipment": 5,
    "Other": 5,
}


class AssetBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    category: AssetCategory
    description: str
    location: Optional[str] = None
    purchase_date: str  # ISO date
    fiscal_cycle: str = Field(default_factory=indian_fy)
    cost_inr: float = Field(gt=0)
    salvage_value_inr: float = 0.0
    useful_life_years: Optional[int] = None  # default from category if None
    depreciation_method: Literal["SLM"] = "SLM"
    tag_no: Optional[str] = None  # QR/barcode / MPCA physical tag
    vendor_id: Optional[str] = None
    po_id: Optional[str] = None
    invoice_ref: Optional[str] = None
    gl_account: Optional[str] = None
    notes: Optional[str] = None


class Asset(AssetBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    asset_no: str = ""  # ASS/MPCA/2026-27/00001
    status: AssetStatus = "Active"
    accumulated_depreciation_inr: float = 0.0
    book_value_inr: float = 0.0  # cached; also recomputed on read
    disposal_date: Optional[str] = None
    disposal_amount_inr: Optional[float] = None
    disposal_reason: Optional[str] = None
    gain_loss_on_disposal_inr: Optional[float] = None  # +ve = gain, -ve = loss
    created_by_name: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None


class AssetCreate(AssetBase):
    created_by_name: Optional[str] = None


class DisposePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    disposal_date: Optional[str] = None
    disposal_amount_inr: float = 0.0
    disposal_reason: str
    actor_name: Optional[str] = "MPCA Accounts"


def _months_between(d1: datetime, d2: datetime) -> int:
    return max(0, (d2.year - d1.year) * 12 + (d2.month - d1.month))


def _compute_depreciation(asset: dict, as_on: Optional[datetime] = None) -> dict:
    """Returns {accumulated_depreciation_inr, book_value_inr, months_used, monthly_dep}."""
    as_on = as_on or datetime.now(timezone.utc)
    cost = float(asset["cost_inr"])
    salvage = float(asset.get("salvage_value_inr") or 0)
    life_years = asset.get("useful_life_years") or DEFAULT_LIFE_YEARS.get(asset["category"], 5)
    if asset["category"] == "Land" or life_years == 0:
        return {"accumulated_depreciation_inr": 0.0, "book_value_inr": round(cost, 2),
                "months_used": 0, "monthly_dep_inr": 0.0, "life_years": 0}
    total_months = max(1, life_years * 12)
    depreciable = max(0.0, cost - salvage)
    monthly = round(depreciable / total_months, 2)
    try:
        purchase = datetime.fromisoformat(asset["purchase_date"])
        if purchase.tzinfo is None:
            purchase = purchase.replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.warning("assets: unparseable purchase_date %r on asset %s (%s); using as_on", asset.get("purchase_date"), asset.get("id"), e)
        purchase = as_on
    # For disposed assets, cap the months at disposal
    end = as_on
    if asset.get("status") == "Disposed" and asset.get("disposal_date"):
        try:
            end = datetime.fromisoformat(asset["disposal_date"]).replace(tzinfo=timezone.utc)
        except Exception as e:
            logger.warning("assets: unparseable disposal_date %r on asset %s (%s)", asset.get("disposal_date"), asset.get("id"), e)
    months_used = min(_months_between(purchase, end), total_months)
    accumulated = min(depreciable, round(monthly * months_used, 2))
    book = round(cost - accumulated, 2)
    return {
        "accumulated_depreciation_inr": accumulated,
        "book_value_inr": book,
        "months_used": months_used,
        "monthly_dep_inr": monthly,
        "life_years": life_years,
        "total_months": total_months,
    }


async def _get(aid: str) -> dict:
    doc = await db.assets.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Asset not found")
    return doc


# ═════════════ CRUD ═════════════

@api_router.get("/assets", response_model=List[Asset])
async def list_assets(body_id: Optional[str] = None,
                      category: Optional[AssetCategory] = None,
                      status: Optional[AssetStatus] = None,
                      fiscal_cycle: Optional[str] = None,
                      skip: int = 0,
                      limit: int = 2000):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    if category: q["category"] = category
    if status: q["status"] = status
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.assets.find(q, {"_id": 0}).sort("purchase_date", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))
    # Refresh book values on read
    for d in docs:
        if d.get("status") != "Disposed":
            calc = _compute_depreciation(d)
            d["accumulated_depreciation_inr"] = calc["accumulated_depreciation_inr"]
            d["book_value_inr"] = calc["book_value_inr"]
    return docs


@api_router.get("/assets/{aid}", response_model=Asset)
async def get_asset(aid: str):
    d = await _get(aid)
    if d.get("status") != "Disposed":
        calc = _compute_depreciation(d)
        d["accumulated_depreciation_inr"] = calc["accumulated_depreciation_inr"]
        d["book_value_inr"] = calc["book_value_inr"]
    return d


@api_router.post("/assets", response_model=Asset)
async def create_asset(payload: AssetCreate):
    if payload.salvage_value_inr >= payload.cost_inr:
        raise HTTPException(400, "Salvage value cannot be ≥ cost")
    a = Asset(**payload.model_dump())
    if a.useful_life_years is None:
        a.useful_life_years = DEFAULT_LIFE_YEARS.get(a.category, 5)
    a.asset_no = await next_code("asset", org_short=payload.body_id or "MPCA", fy=a.fiscal_cycle)
    calc = _compute_depreciation(a.model_dump())
    a.accumulated_depreciation_inr = calc["accumulated_depreciation_inr"]
    a.book_value_inr = calc["book_value_inr"]
    await db.assets.insert_one(a.model_dump())
    await write_audit_log(
        module="asset", record_id=a.id, action="create",
        actor={"name": payload.created_by_name or "MPCA Accounts", "role": "mpca_accounts",
               "body_id": payload.body_id},
        details={"asset_no": a.asset_no, "category": a.category, "cost_inr": a.cost_inr},
    )
    return a


@api_router.get("/assets/{aid}/depreciation-schedule")
async def depreciation_schedule(aid: str, months: int = 60):
    """Month-by-month depreciation projection (default 5 years / 60 months)."""
    a = await _get(aid)
    calc = _compute_depreciation(a)
    if calc["monthly_dep_inr"] == 0:
        return {"asset_no": a["asset_no"], "note": "Non-depreciable (Land or life=0)", "rows": []}
    cost = float(a["cost_inr"])
    salvage = float(a.get("salvage_value_inr") or 0)
    try:
        purchase = datetime.fromisoformat(a["purchase_date"])
    except Exception as e:
        logger.warning("assets: unparseable purchase_date %r on asset %s (%s); using now", a.get("purchase_date"), a.get("id"), e)
        purchase = datetime.now(timezone.utc)
    rows = []
    accumulated = 0.0
    for m in range(1, min(months, calc["total_months"]) + 1):
        dep = calc["monthly_dep_inr"]
        if accumulated + dep > max(0.0, cost - salvage):
            dep = round(max(0.0, cost - salvage - accumulated), 2)
        accumulated = round(accumulated + dep, 2)
        book = round(cost - accumulated, 2)
        # Calendar month at position m
        month_end = (purchase.month + m - 1) % 12 + 1
        year = purchase.year + (purchase.month + m - 1) // 12
        rows.append({
            "period_index": m,
            "period_label": f"{year}-{month_end:02d}",
            "depreciation_inr": dep,
            "accumulated_inr": accumulated,
            "book_value_inr": book,
        })
        if accumulated >= (cost - salvage):
            break
    return {
        "asset_no": a["asset_no"], "description": a["description"],
        "cost_inr": cost, "salvage_value_inr": salvage,
        "life_years": calc["life_years"], "monthly_dep_inr": calc["monthly_dep_inr"],
        "rows": rows,
    }


@api_router.post("/assets/{aid}/dispose", response_model=Asset)
async def dispose_asset(aid: str, payload: DisposePayload):
    if not payload.disposal_reason:
        raise HTTPException(400, "Disposal reason required")
    a = await _get(aid)
    if a["status"] == "Disposed":
        raise HTTPException(400, "Asset already disposed")
    disposal_date = payload.disposal_date or datetime.now(timezone.utc).date().isoformat()
    a_before_dep = dict(a)
    a_before_dep["disposal_date"] = disposal_date
    a_before_dep["status"] = "Disposed"
    calc = _compute_depreciation(a_before_dep)
    gain_loss = round(payload.disposal_amount_inr - calc["book_value_inr"], 2)

    await db.assets.update_one(
        {"id": aid},
        {"$set": {
            "status": "Disposed",
            "disposal_date": disposal_date,
            "disposal_amount_inr": payload.disposal_amount_inr,
            "disposal_reason": payload.disposal_reason,
            "accumulated_depreciation_inr": calc["accumulated_depreciation_inr"],
            "book_value_inr": calc["book_value_inr"],
            "gain_loss_on_disposal_inr": gain_loss,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await write_audit_log(
        module="asset", record_id=aid, action="dispose",
        actor={"name": payload.actor_name, "role": "mpca_accounts"},
        details={"asset_no": a.get("asset_no"), "disposal_amount_inr": payload.disposal_amount_inr,
                 "book_value_inr": calc["book_value_inr"], "gain_loss": gain_loss,
                 "reason": payload.disposal_reason},
    )
    return await _get(aid)


@api_router.get("/assets-stats/summary")
async def assets_summary(body_id: Optional[str] = None):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    docs = await db.assets.find(q, {"_id": 0}).to_list(3000)
    total_cost = 0.0
    total_book = 0.0
    total_acc = 0.0
    by_category: dict = {}
    by_status: dict = {}
    for d in docs:
        calc = _compute_depreciation(d) if d.get("status") != "Disposed" else {
            "accumulated_depreciation_inr": d.get("accumulated_depreciation_inr") or 0,
            "book_value_inr": d.get("book_value_inr") or 0,
        }
        total_cost += float(d.get("cost_inr") or 0)
        total_acc += float(calc["accumulated_depreciation_inr"])
        total_book += float(calc["book_value_inr"])
        cat = d.get("category") or "Other"
        by_category[cat] = by_category.get(cat, 0) + 1
        st = d.get("status") or "Active"
        by_status[st] = by_status.get(st, 0) + 1
    return {
        "count": len(docs),
        "gross_block_inr": round(total_cost, 2),
        "accumulated_depreciation_inr": round(total_acc, 2),
        "net_block_inr": round(total_book, 2),
        "by_category": by_category, "by_status": by_status,
    }
