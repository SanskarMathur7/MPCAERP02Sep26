"""Sprint 4 · Compliance Register (P7.3).

Statutory filing calendar for MPCA — GST · TDS · PF · ESI · ROC / Income Tax /
Society-Registrar / Auditor filings. Each ComplianceItem carries:
  - name / authority (GSTN / IT Dept / EPFO / ESIC / Registrar of Societies)
  - frequency (Monthly / Quarterly / Half_Yearly / Yearly / One_Time)
  - due_rule (e.g. "10 of next month", "31-Jul-YYYY") stored as `due_day` +
    `frequency` — we compute the next-due-date on the fly.
  - filed_history[] with dates + acknowledgement refs + optional PDF url.

Sprint 4 focuses on the register itself + due-date maths. Sprint 5 will wire
this into dashboard reminder tiles.
"""
from datetime import datetime, timezone, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import List, Literal, Optional
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from core.shared_services import write_audit_log


Frequency = Literal["Monthly", "Quarterly", "Half_Yearly", "Yearly", "One_Time"]
ComplianceStatus = Literal["Active", "Suspended"]


class FiledRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period: str  # e.g. "2026-01" / "Q1 2026-27" / "2025-26"
    filed_date: str
    filed_by: str
    ack_ref: Optional[str] = None
    filing_url: Optional[str] = None
    amount_inr: Optional[float] = None
    notes: Optional[str] = None


class ComplianceItemBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    name: str
    authority: str
    frequency: Frequency
    due_day: int = 10  # e.g. 10 = filed by 10th of next period
    due_month: Optional[int] = None  # for Yearly (e.g. 7 for July)
    section_ref: Optional[str] = None  # e.g. "GSTR-3B" / "Section 200 · TDS"
    penalty_note: Optional[str] = None
    notes: Optional[str] = None


class ComplianceItem(ComplianceItemBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: ComplianceStatus = "Active"
    filed_history: List[FiledRecord] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ComplianceItemCreate(ComplianceItemBase):
    pass


class FilePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period: str
    filed_date: Optional[str] = None
    filed_by: str
    ack_ref: Optional[str] = None
    filing_url: Optional[str] = None
    amount_inr: Optional[float] = None
    notes: Optional[str] = None


def _next_due_date(item: dict, today: Optional[date] = None) -> Optional[date]:
    """Compute the next due date based on frequency + due_day + filed_history."""
    today = today or datetime.now(timezone.utc).date()
    freq = item.get("frequency")
    due_day = int(item.get("due_day") or 10)
    filed_periods = {f["period"] for f in (item.get("filed_history") or [])}

    if freq == "Monthly":
        # Compute current-period unfiled month
        for months_back in range(0, 24):
            probe = today - relativedelta(months=months_back + 1)
            period = probe.strftime("%Y-%m")
            if period not in filed_periods:
                # Due 10th of next month after `probe`
                due_month = probe + relativedelta(months=1)
                try:
                    return due_month.replace(day=due_day)
                except ValueError:
                    return due_month.replace(day=28)
        return None
    if freq == "Quarterly":
        # Quarter periods: 2026-27 Q1..Q4
        for months_back in range(0, 24, 3):
            probe = today - relativedelta(months=months_back + 3)
            q = ((probe.month - 1) // 3) + 1
            fy_start = probe.year if probe.month >= 4 else probe.year - 1
            fy = f"{fy_start}-{str(fy_start + 1)[-2:]}"
            period = f"Q{q} {fy}"
            if period not in filed_periods:
                # Due last day of month after quarter close
                q_end_month = q * 3
                due_calendar = probe.replace(month=q_end_month, day=1) + relativedelta(months=1)
                try:
                    return due_calendar.replace(day=due_day)
                except ValueError:
                    return due_calendar.replace(day=28)
        return None
    if freq == "Half_Yearly":
        # H1 = Apr-Sep, H2 = Oct-Mar
        current_h = "H1" if 4 <= today.month <= 9 else "H2"
        for delta_h in range(0, 8):
            probe = today - relativedelta(months=6 * (delta_h + 1))
            h_label = "H1" if 4 <= probe.month <= 9 else "H2"
            fy_start = probe.year if probe.month >= 4 else probe.year - 1
            fy = f"{fy_start}-{str(fy_start + 1)[-2:]}"
            period = f"{h_label} {fy}"
            if period not in filed_periods:
                # due month = Oct for H1, Apr for H2
                due_month = 10 if h_label == "H1" else 4
                due_year = probe.year if (h_label == "H1" or probe.month <= 3) else probe.year + 1
                try:
                    return date(due_year, due_month, due_day)
                except ValueError:
                    return date(due_year, due_month, 28)
        return None
    if freq == "Yearly":
        due_month = int(item.get("due_month") or 7)
        for years_back in range(0, 5):
            fy_year = today.year - years_back - (1 if today.month < 4 else 0)
            fy = f"{fy_year}-{str(fy_year + 1)[-2:]}"
            if fy not in filed_periods:
                due_year = fy_year + 1
                try:
                    return date(due_year, due_month, due_day)
                except ValueError:
                    return date(due_year, due_month, 28)
        return None
    if freq == "One_Time":
        if item.get("filed_history"):
            return None
        try:
            return date(int(item.get("due_year") or today.year),
                         int(item.get("due_month") or 7),
                         due_day)
        except (ValueError, TypeError):
            return None
    return None


def _status_label(due: Optional[date], today: date) -> str:
    if due is None:
        return "Filed"
    delta = (due - today).days
    if delta < 0:
        return "Overdue"
    if delta <= 15:
        return "Due_Soon"
    return "Upcoming"


async def _get(cid: str) -> dict:
    doc = await db.compliance_items.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Compliance item not found")
    return doc


# ═══════════════════ ENDPOINTS ═══════════════════

@api_router.get("/compliance", response_model=List[ComplianceItem])
async def list_compliance(status: Optional[ComplianceStatus] = None,
                           frequency: Optional[Frequency] = None,
                           authority: Optional[str] = None):
    q: dict = {}
    if status: q["status"] = status
    if frequency: q["frequency"] = frequency
    if authority: q["authority"] = authority
    return await db.compliance_items.find(q, {"_id": 0}).sort("name", 1).to_list(500)


@api_router.get("/compliance/dashboard")
async def compliance_dashboard():
    """Returns each compliance item enriched with next_due_date, days_left, and status_label."""
    items = await db.compliance_items.find({"status": "Active"}, {"_id": 0}).sort("name", 1).to_list(500)
    today = datetime.now(timezone.utc).date()
    rows = []
    counts = {"Overdue": 0, "Due_Soon": 0, "Upcoming": 0, "Filed": 0}
    for it in items:
        due = _next_due_date(it, today)
        label = _status_label(due, today)
        counts[label] = counts.get(label, 0) + 1
        rows.append({
            "id": it["id"],
            "name": it["name"],
            "authority": it["authority"],
            "frequency": it["frequency"],
            "section_ref": it.get("section_ref"),
            "next_due_date": due.isoformat() if due else None,
            "days_left": (due - today).days if due else None,
            "status_label": label,
            "last_filed": it["filed_history"][-1] if it.get("filed_history") else None,
        })
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "rows": rows,
    }


@api_router.get("/compliance/{cid}", response_model=ComplianceItem)
async def get_compliance(cid: str):
    return await _get(cid)


@api_router.post("/compliance", response_model=ComplianceItem)
async def create_compliance(payload: ComplianceItemCreate):
    item = ComplianceItem(**payload.model_dump())
    await db.compliance_items.insert_one(item.model_dump())
    await write_audit_log(
        module="compliance", record_id=item.id, action="create",
        actor={"name": "MPCA Accounts", "role": "mpca_accounts"},
        details={"name": item.name, "authority": item.authority, "frequency": item.frequency},
    )
    return item


@api_router.post("/compliance/{cid}/file", response_model=ComplianceItem)
async def mark_filed(cid: str, payload: FilePayload):
    """Append a filing record. Idempotent-lite — refuses to re-file the same period."""
    item = await _get(cid)
    for f in item.get("filed_history") or []:
        if f["period"] == payload.period:
            raise HTTPException(400, f"Already filed for period {payload.period}")
    rec = FiledRecord(
        period=payload.period,
        filed_date=payload.filed_date or datetime.now(timezone.utc).date().isoformat(),
        filed_by=payload.filed_by,
        ack_ref=payload.ack_ref,
        filing_url=payload.filing_url,
        amount_inr=payload.amount_inr,
        notes=payload.notes,
    )
    await db.compliance_items.update_one(
        {"id": cid},
        {"$push": {"filed_history": rec.model_dump()}},
    )
    await write_audit_log(
        module="compliance", record_id=cid, action="file",
        actor={"name": payload.filed_by, "role": "mpca_accounts"},
        details={"name": item["name"], "period": payload.period,
                 "ack_ref": payload.ack_ref, "amount_inr": payload.amount_inr},
    )
    return await _get(cid)


@api_router.get("/compliance-stats/summary")
async def compliance_summary():
    items = await db.compliance_items.find({"status": "Active"}, {"_id": 0}).to_list(500)
    today = datetime.now(timezone.utc).date()
    counts = {"Overdue": 0, "Due_Soon": 0, "Upcoming": 0, "Filed": 0}
    for it in items:
        due = _next_due_date(it, today)
        counts[_status_label(due, today)] += 1
    return {"total_items": len(items), "by_status": counts}
