"""Sprint 3 · HR/Payroll (P6.x).

Employee master + monthly payroll register with statutory deductions:
  Basic + HRA + Special_Allowance + Conveyance = Gross
  Deductions: PF (12% of Basic) + ESI (0.75% of Gross ≤ ₹21K threshold) +
              Professional_Tax (₹200 slab MP) + Income_Tax (TDS)
  Net_Pay = Gross - Deductions

Payroll register per fiscal-month can be Drafted → Finalised (locked).
Finalising creates a Journal Voucher entry in the vouchers collection so the
ledger stays consistent with Sprint 1 (Payroll → Salaries expense · Bank credit).
"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from core.infra import api_router, db
from core.shared_services import indian_fy, next_code, write_audit_log

EmploymentType = Literal["Permanent", "Contract", "Consultant", "Intern", "Retainer"]
EmployeeStatus = Literal["Active", "On_Leave", "Resigned", "Terminated"]

# Statutory constants (FY 2025-26 India)
PF_RATE_PCT = 12.0             # Employee PF on Basic
ESI_RATE_PCT = 0.75            # Employee ESI on Gross when < 21,000
ESI_GROSS_CEILING_INR = 21000.0
PT_MP_SLAB_INR = 200.0         # Madhya Pradesh Professional Tax
CONSULTANT_TDS_PCT = 10.0      # u/s 194J for consultants


class EmployeeBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    body_id: str = "MPCA"
    name: str
    designation: str
    department: str | None = None
    employment_type: EmploymentType = "Permanent"
    date_of_joining: str
    date_of_leaving: str | None = None
    pan: str | None = None
    aadhaar: str | None = None
    bank_account_no: str | None = None
    bank_ifsc: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    basic_pay_inr: float = Field(gt=0)
    hra_inr: float = 0.0
    special_allowance_inr: float = 0.0
    conveyance_inr: float = 0.0
    # For consultants — TDS handled instead of PF/ESI
    tds_applicable: bool = False
    tds_rate_pct: float = CONSULTANT_TDS_PCT
    pf_applicable: bool = True
    esi_applicable: bool = True
    professional_tax_applicable: bool = True


class Employee(EmployeeBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employee_no: str = ""  # EMP/MPCA/2026-27/00001
    status: EmployeeStatus = "Active"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str | None = None


class EmployeeCreate(EmployeeBase):
    pass


class PayrollRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    employee_id: str
    employee_no: str
    name: str
    designation: str
    basic_inr: float
    hra_inr: float
    special_allowance_inr: float
    conveyance_inr: float
    gross_inr: float
    pf_inr: float = 0.0
    esi_inr: float = 0.0
    professional_tax_inr: float = 0.0
    tds_inr: float = 0.0
    total_deductions_inr: float
    net_pay_inr: float


class PayrollRegister(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    body_id: str = "MPCA"
    fiscal_cycle: str = Field(default_factory=indian_fy)
    period: str  # "2026-02" year-month
    status: Literal["Draft", "Finalised"] = "Draft"
    generated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finalised_at: str | None = None
    finalised_by: str | None = None
    rows: list[PayrollRow] = []
    total_gross_inr: float = 0.0
    total_deductions_inr: float = 0.0
    total_net_inr: float = 0.0
    voucher_id: str | None = None


class PayrollGeneratePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    period: str  # "2026-02"
    body_id: str = "MPCA"
    actor_name: str | None = "MPCA Accounts"


class PayrollFinalisePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    actor_name: str | None = "MPCA Accounts"
    actor_role: str | None = "mpca_accounts"
    disbursement_date: str | None = None
    note: str | None = None


# ═══════════════════ EMPLOYEE ENDPOINTS ═══════════════════

@api_router.get("/employees", response_model=list[Employee])
async def list_employees(body_id: str | None = None,
                         status: EmployeeStatus | None = None,
                         employment_type: EmploymentType | None = None,
                         skip: int = 0,
                         limit: int = 1000):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    if status: q["status"] = status
    if employment_type: q["employment_type"] = employment_type
    return await db.employees.find(q, {"_id": 0}).sort("employee_no", 1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))


@api_router.get("/employees/{eid}", response_model=Employee)
async def get_employee(eid: str):
    doc = await db.employees.find_one({"id": eid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Employee not found")
    return doc


@api_router.post("/employees", response_model=Employee)
async def create_employee(payload: EmployeeCreate):
    e = Employee(**payload.model_dump())
    e.employee_no = await next_code("employee", org_short=payload.body_id or "MPCA",
                                     fy=indian_fy())
    await db.employees.insert_one(e.model_dump())
    await write_audit_log(
        module="employee", record_id=e.id, action="create",
        actor={"name": "HR", "role": "mpca_accounts", "body_id": payload.body_id},
        details={"employee_no": e.employee_no, "name": e.name, "designation": e.designation,
                 "basic_pay_inr": e.basic_pay_inr},
    )
    return e


@api_router.get("/employees-stats/summary")
async def employees_summary(body_id: str | None = None):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    docs = await db.employees.find(q, {"_id": 0}).to_list(2000)
    by_status: dict = {}
    by_type: dict = {}
    monthly_gross = 0.0
    for e in docs:
        by_status[e.get("status", "Active")] = by_status.get(e.get("status", "Active"), 0) + 1
        by_type[e.get("employment_type", "Permanent")] = by_type.get(e.get("employment_type", "Permanent"), 0) + 1
        if e.get("status") == "Active":
            monthly_gross += (float(e.get("basic_pay_inr") or 0) + float(e.get("hra_inr") or 0) +
                               float(e.get("special_allowance_inr") or 0) + float(e.get("conveyance_inr") or 0))
    return {
        "count": len(docs), "active": by_status.get("Active", 0),
        "by_status": by_status, "by_type": by_type,
        "monthly_gross_inr": round(monthly_gross, 2),
        "annual_projected_inr": round(monthly_gross * 12, 2),
    }


# ═══════════════════ PAYROLL ENDPOINTS ═══════════════════

def _compute_payroll_row(e: dict) -> PayrollRow:
    basic = float(e.get("basic_pay_inr") or 0)
    hra = float(e.get("hra_inr") or 0)
    special = float(e.get("special_allowance_inr") or 0)
    conveyance = float(e.get("conveyance_inr") or 0)
    gross = round(basic + hra + special + conveyance, 2)

    pf = round(basic * PF_RATE_PCT / 100, 2) if e.get("pf_applicable", True) else 0.0
    esi = 0.0
    if e.get("esi_applicable", True) and gross <= ESI_GROSS_CEILING_INR:
        esi = round(gross * ESI_RATE_PCT / 100, 2)
    pt = PT_MP_SLAB_INR if e.get("professional_tax_applicable", True) and gross >= 15000 else 0.0
    tds = 0.0
    if e.get("tds_applicable"):
        tds = round(gross * float(e.get("tds_rate_pct") or CONSULTANT_TDS_PCT) / 100, 2)

    total_ded = round(pf + esi + pt + tds, 2)
    net = round(gross - total_ded, 2)
    return PayrollRow(
        employee_id=e["id"], employee_no=e.get("employee_no", ""),
        name=e.get("name", ""), designation=e.get("designation", ""),
        basic_inr=basic, hra_inr=hra, special_allowance_inr=special,
        conveyance_inr=conveyance, gross_inr=gross,
        pf_inr=pf, esi_inr=esi, professional_tax_inr=pt, tds_inr=tds,
        total_deductions_inr=total_ded, net_pay_inr=net,
    )


@api_router.post("/payroll/generate", response_model=PayrollRegister)
async def generate_payroll(payload: PayrollGeneratePayload):
    # Idempotency — one Draft per body/period; refuse duplicate Finalised
    existing = await db.payroll_registers.find_one(
        {"body_id": payload.body_id, "period": payload.period}, {"_id": 0},
    )
    if existing and existing["status"] == "Finalised":
        raise HTTPException(400, f"Payroll for {payload.period} is already finalised. Cannot regenerate.")

    employees = await db.employees.find({"body_id": payload.body_id, "status": "Active"},
                                         {"_id": 0}).sort("employee_no", 1).to_list(1000)
    if not employees:
        raise HTTPException(400, "No active employees for this body.")

    rows = [_compute_payroll_row(e) for e in employees]
    total_gross = round(sum(r.gross_inr for r in rows), 2)
    total_ded = round(sum(r.total_deductions_inr for r in rows), 2)
    total_net = round(sum(r.net_pay_inr for r in rows), 2)

    register = PayrollRegister(
        body_id=payload.body_id, period=payload.period,
        rows=rows, total_gross_inr=total_gross,
        total_deductions_inr=total_ded, total_net_inr=total_net,
    )
    if existing:
        register.id = existing["id"]
        register.generated_at = existing["generated_at"]  # preserve original
        await db.payroll_registers.update_one(
            {"id": existing["id"]},
            {"$set": {**register.model_dump(), "regenerated_at": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        await db.payroll_registers.insert_one(register.model_dump())

    await write_audit_log(
        module="payroll", record_id=register.id,
        action="regenerate" if existing else "generate",
        actor={"name": payload.actor_name, "role": "mpca_accounts", "body_id": payload.body_id},
        details={"period": payload.period, "row_count": len(rows),
                 "total_gross_inr": total_gross, "total_net_inr": total_net},
    )
    return register


@api_router.get("/payroll/registers", response_model=list[PayrollRegister])
async def list_registers(body_id: str | None = None,
                         fiscal_cycle: str | None = None,
                         status: str | None = None,
                         skip: int = 0,
                         limit: int = 200):
    q: dict = {}
    if body_id: q["body_id"] = body_id
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    if status: q["status"] = status
    return await db.payroll_registers.find(q, {"_id": 0}).sort("period", -1).skip(max(skip, 0)).limit(min(max(limit, 1), 5000)).to_list(min(max(limit, 1), 5000))


@api_router.get("/payroll/registers/{rid}", response_model=PayrollRegister)
async def get_register(rid: str):
    doc = await db.payroll_registers.find_one({"id": rid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Payroll register not found")
    return doc


@api_router.post("/payroll/registers/{rid}/finalise", response_model=PayrollRegister)
async def finalise_register(rid: str, payload: PayrollFinalisePayload):
    """Finalise the register (locks it) AND auto-creates a Payment Voucher for
    the total net-pay disbursement — closing the loop with the Sprint 1 ledger.
    """
    reg = await db.payroll_registers.find_one({"id": rid}, {"_id": 0})
    if not reg:
        raise HTTPException(404, "Payroll register not found")
    if reg["status"] == "Finalised":
        raise HTTPException(400, "Register already finalised.")

    # Auto-create a Payment voucher for net pay disbursement
    from routes.vouchers import Voucher
    date = payload.disbursement_date or datetime.now(timezone.utc).date().isoformat()
    v = Voucher(
        body_id=reg["body_id"], voucher_type="Payment",
        date=date, amount_inr=float(reg["total_net_inr"]),
        particulars=f"Salary disbursement for {reg['period']} · {len(reg['rows'])} employees",
        dr_account="Salaries & Wages",
        cr_account="MPCA General Bank Account",
        linked_module="payroll",
        linked_ref_id=reg["id"],
        linked_ref_code=f"PAYROLL/{reg['period']}",
        fiscal_cycle=reg.get("fiscal_cycle") or indian_fy(),
        created_by_name=payload.actor_name,
        status="Posted",
    )
    v.voucher_no = await next_code("voucher", org_short=reg["body_id"], fy=v.fiscal_cycle)
    await db.vouchers.insert_one(v.model_dump())

    now = datetime.now(timezone.utc).isoformat()
    await db.payroll_registers.update_one(
        {"id": rid},
        {"$set": {"status": "Finalised", "finalised_at": now,
                  "finalised_by": payload.actor_name, "voucher_id": v.id}},
    )
    await write_audit_log(
        module="payroll", record_id=rid, action="finalise",
        actor={"name": payload.actor_name, "role": payload.actor_role, "body_id": reg["body_id"]},
        details={"period": reg["period"], "voucher_no": v.voucher_no,
                 "net_pay_inr": reg["total_net_inr"], "note": payload.note},
    )
    return await db.payroll_registers.find_one({"id": rid}, {"_id": 0})


@api_router.get("/payroll-stats/summary")
async def payroll_summary(fiscal_cycle: str | None = None):
    q: dict = {}
    if fiscal_cycle: q["fiscal_cycle"] = fiscal_cycle
    docs = await db.payroll_registers.find(q, {"_id": 0}).to_list(200)
    total_gross = sum(d.get("total_gross_inr") or 0 for d in docs)
    total_net = sum(d.get("total_net_inr") or 0 for d in docs)
    total_tds = sum(sum(r.get("tds_inr") or 0 for r in d.get("rows", [])) for d in docs)
    total_pf = sum(sum(r.get("pf_inr") or 0 for r in d.get("rows", [])) for d in docs)
    total_esi = sum(sum(r.get("esi_inr") or 0 for r in d.get("rows", [])) for d in docs)
    total_pt = sum(sum(r.get("professional_tax_inr") or 0 for r in d.get("rows", [])) for d in docs)
    by_status: dict = {}
    for d in docs:
        by_status[d.get("status", "Draft")] = by_status.get(d.get("status", "Draft"), 0) + 1
    return {
        "period_count": len(docs),
        "by_status": by_status,
        "total_gross_inr": round(total_gross, 2),
        "total_net_inr": round(total_net, 2),
        "total_tds_inr": round(total_tds, 2),
        "total_pf_inr": round(total_pf, 2),
        "total_esi_inr": round(total_esi, 2),
        "total_pt_inr": round(total_pt, 2),
    }
