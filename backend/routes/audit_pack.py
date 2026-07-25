"""Sprint 4 · Audit Workpapers PDF (P7.4).

Generates a consolidated audit-ready PDF pack for a given fiscal cycle with:
  1. Cover page (MPCA letterhead)
  2. Executive summary — ledger totals · asset gross/net block · payroll · POs
  3. Ledger snapshot (last 30 entries for body_id=MPCA)
  4. Fixed asset register (all assets)
  5. Payroll register list
  6. Compliance filings register
  7. Purchase-order commitments outstanding

Uses reportlab (already in requirements from Sprint 1).
"""
import asyncio
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional
from fastapi.responses import StreamingResponse

from core.infra import db, api_router
from core.shared_services import indian_fy


def _fmt(v):
    if v is None: return "—"
    try: return f"₹ {float(v):,.2f}"
    except Exception: return str(v)


@api_router.get("/audit-pack/generate.pdf")
async def audit_pack_pdf(fiscal_cycle: Optional[str] = None,
                          body_id: str = "MPCA",
                          include_ledger: bool = True,
                          include_assets: bool = True,
                          include_payroll: bool = True,
                          include_compliance: bool = True,
                          include_pos: bool = True):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak,
    )

    fy = fiscal_cycle or indian_fy()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                             leftMargin=15*mm, rightMargin=15*mm,
                             topMargin=15*mm, bottomMargin=15*mm,
                             title=f"MPCA Audit Workpapers · {fy}")

    styles = getSampleStyleSheet()
    st_title = ParagraphStyle("t", parent=styles["Title"], fontSize=22,
                               textColor=colors.HexColor("#0a1f3d"), alignment=1, spaceAfter=6*mm)
    st_sub = ParagraphStyle("s", parent=styles["Normal"], fontSize=11,
                             textColor=colors.HexColor("#7a1f2c"), alignment=1, italic=True, spaceAfter=4*mm)
    st_h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=15,
                            textColor=colors.HexColor("#0a1f3d"), spaceBefore=6*mm, spaceAfter=3*mm)
    st_body = ParagraphStyle("b", parent=styles["Normal"], fontSize=9.5, leading=13)

    story = []

    # ═══════ Cover ═══════
    story.append(Spacer(1, 40*mm))
    story.append(Paragraph("Madhya Pradesh Cricket Association", st_title))
    story.append(Paragraph("Consolidated Audit Workpapers", st_sub))
    story.append(Paragraph(f"Fiscal Cycle · {fy}", st_sub))
    story.append(Spacer(1, 60*mm))
    story.append(Paragraph(
        f"<i>Compiled by the MPCA Enterprise Resource Planning system on "
        f"{datetime.now(timezone.utc).strftime('%d %b %Y · %H:%M UTC')}. "
        f"For internal audit and statutory-auditor reference. "
        f"Cross-check every figure against source ledgers before signing off.</i>",
        st_body,
    ))
    story.append(PageBreak())

    # ═══════ Section 1 · Executive summary ═══════
    story.append(Paragraph("1. Executive Summary", st_h1))

    total_vouchers = await db.vouchers.count_documents({"fiscal_cycle": fy, "status": "Posted"})
    total_grants = await db.division_grants.count_documents({"fiscal_cycle": fy})
    disbursed = await db.division_grants.count_documents({"fiscal_cycle": fy, "status": "Disbursed"})
    asset_docs = await db.assets.find({}, {"_id": 0}).to_list(3000)
    total_gross = sum(float(a.get("cost_inr") or 0) for a in asset_docs)
    total_net = sum(float(a.get("book_value_inr") or 0) for a in asset_docs)
    payroll_regs = await db.payroll_registers.find({"fiscal_cycle": fy}, {"_id": 0}).to_list(50)
    payroll_gross = sum(float(r.get("total_gross_inr") or 0) for r in payroll_regs)
    payroll_net = sum(float(r.get("total_net_inr") or 0) for r in payroll_regs)
    po_docs = await db.purchase_orders.find(
        {"fiscal_cycle": fy, "status": {"$nin": ["Cancelled", "Draft"]}}, {"_id": 0},
    ).to_list(500)
    total_committed = sum(float(p.get("total_amount_inr") or 0) for p in po_docs)
    total_invoiced = sum(float(p.get("invoiced_amount_inr") or 0) for p in po_docs)

    summary_rows = [
        ["Item", "Value"],
        ["Vouchers · Posted", str(total_vouchers)],
        ["Division Grants · Raised", str(total_grants)],
        ["Division Grants · Disbursed", str(disbursed)],
        ["Fixed Assets · Gross Block", _fmt(total_gross)],
        ["Fixed Assets · Net Block", _fmt(total_net)],
        ["Payroll · Total Gross (YTD)", _fmt(payroll_gross)],
        ["Payroll · Total Net (YTD)", _fmt(payroll_net)],
        ["POs · Total Committed", _fmt(total_committed)],
        ["POs · Total Invoiced", _fmt(total_invoiced)],
        ["POs · Outstanding", _fmt(total_committed - total_invoiced)],
    ]
    t = Table(summary_rows, colWidths=[70*mm, 60*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a1f3d")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#7a1f2c")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#fbf7ed")),
    ]))
    story.append(t)

    # ═══════ Section 2 · Ledger snapshot ═══════
    if include_ledger:
        story.append(Paragraph("2. Ledger — last 30 posted entries (all bodies · MPCA scope)", st_h1))
        vouchers = await db.vouchers.find(
            {"fiscal_cycle": fy, "status": "Posted"}, {"_id": 0},
        ).sort("date", -1).to_list(30)
        if vouchers:
            rows = [["Date", "Voucher No.", "Type", "Particulars", "Amount (₹)"]]
            for v in vouchers:
                rows.append([
                    v.get("date"), v.get("voucher_no"), v.get("voucher_type"),
                    (v.get("particulars") or "")[:55] + ("…" if (v.get("particulars") or "") and len(v.get("particulars") or "") > 55 else ""),
                    f"{float(v.get('amount_inr') or 0):,.2f}",
                ])
            t = Table(rows, colWidths=[22*mm, 40*mm, 22*mm, 70*mm, 26*mm], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a1f3d")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (4, 1), (4, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#7a1f2c")),
            ]))
            story.append(t)
        else:
            story.append(Paragraph("<i>No posted vouchers this cycle.</i>", st_body))

    # ═══════ Section 3 · Fixed Asset Register ═══════
    if include_assets:
        story.append(Paragraph("3. Fixed Asset Register", st_h1))
        if asset_docs:
            rows = [["Asset No.", "Category", "Description", "Cost", "Accum. Dep.", "Book Value", "Status"]]
            for a in asset_docs:
                rows.append([
                    a.get("asset_no"),
                    (a.get("category") or "").replace("_", " "),
                    (a.get("description") or "")[:38] + ("…" if len(a.get("description") or "") > 38 else ""),
                    f"{float(a.get('cost_inr') or 0):,.0f}",
                    f"{float(a.get('accumulated_depreciation_inr') or 0):,.0f}",
                    f"{float(a.get('book_value_inr') or 0):,.0f}",
                    a.get("status") or "Active",
                ])
            t = Table(rows, colWidths=[36*mm, 22*mm, 46*mm, 22*mm, 22*mm, 22*mm, 18*mm], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a1f3d")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (3, 1), (5, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#7a1f2c")),
            ]))
            story.append(t)

    # ═══════ Section 4 · Payroll Registers ═══════
    if include_payroll and payroll_regs:
        story.append(Paragraph("4. Payroll Registers", st_h1))
        rows = [["Period", "Body", "Rows", "Gross", "Deductions", "Net Pay", "Status"]]
        for r in payroll_regs:
            rows.append([
                r.get("period"), r.get("body_id"), str(len(r.get("rows") or [])),
                f"{float(r.get('total_gross_inr') or 0):,.0f}",
                f"{float(r.get('total_deductions_inr') or 0):,.0f}",
                f"{float(r.get('total_net_inr') or 0):,.0f}",
                r.get("status"),
            ])
        t = Table(rows, colWidths=[22*mm, 22*mm, 15*mm, 30*mm, 30*mm, 30*mm, 25*mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a1f3d")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (3, 1), (5, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#7a1f2c")),
        ]))
        story.append(t)

    # ═══════ Section 5 · Compliance ═══════
    if include_compliance:
        story.append(Paragraph("5. Statutory Compliance Register", st_h1))
        comp_items = await db.compliance_items.find({"status": "Active"}, {"_id": 0}).to_list(200)
        if comp_items:
            from routes.compliance import _next_due_date, _status_label
            today = datetime.now(timezone.utc).date()
            rows = [["Name", "Authority", "Frequency", "Next Due", "Last Filed", "Status"]]
            for c in comp_items:
                due = _next_due_date(c, today)
                last = c.get("filed_history") or []
                last_txt = f"{last[-1]['period']} · {last[-1]['filed_date']}" if last else "—"
                rows.append([
                    c["name"], c["authority"], c["frequency"],
                    due.isoformat() if due else "—",
                    last_txt, _status_label(due, today),
                ])
            t = Table(rows, colWidths=[40*mm, 32*mm, 22*mm, 22*mm, 40*mm, 22*mm], repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a1f3d")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#7a1f2c")),
            ]))
            story.append(t)
        else:
            story.append(Paragraph("<i>No active compliance items registered.</i>", st_body))

    # ═══════ Section 6 · PO Commitments ═══════
    if include_pos and po_docs:
        story.append(Paragraph("6. Outstanding Purchase-Order Commitments", st_h1))
        rows = [["PO No.", "Vendor", "Subject", "Committed", "Invoiced", "Remaining", "Status"]]
        for p in po_docs:
            committed = float(p.get("total_amount_inr") or 0)
            invoiced = float(p.get("invoiced_amount_inr") or 0)
            rows.append([
                p.get("po_no"), (p.get("vendor_name") or "")[:26],
                (p.get("subject") or "")[:28],
                f"{committed:,.0f}", f"{invoiced:,.0f}",
                f"{committed - invoiced:,.0f}",
                p.get("status"),
            ])
        t = Table(rows, colWidths=[36*mm, 32*mm, 42*mm, 22*mm, 22*mm, 22*mm, 20*mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a1f3d")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (3, 1), (5, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#7a1f2c")),
        ]))
        story.append(t)

    # ═══════ Footer ═══════
    story.append(Spacer(1, 12*mm))
    story.append(Paragraph(
        f"<i>End of workpapers · Generated by MPCA ERP · "
        f"{datetime.now(timezone.utc).strftime('%d %b %Y')}. "
        f"For questions contact the MPCA Finance & Accounts team.</i>", st_body,
    ))

    await asyncio.to_thread(doc.build, story)  # H4 · offload CPU-bound PDF render
    buf.seek(0)
    filename = f"MPCA_Audit_Workpapers_{fy}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                              headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@api_router.get("/audit-pack/preview")
async def audit_pack_preview(fiscal_cycle: Optional[str] = None):
    """Returns metadata about what would go into the audit pack — used by the UI."""
    fy = fiscal_cycle or indian_fy()
    counts = {
        "vouchers": await db.vouchers.count_documents({"fiscal_cycle": fy, "status": "Posted"}),
        "division_grants": await db.division_grants.count_documents({"fiscal_cycle": fy}),
        "assets": await db.assets.count_documents({}),
        "payroll_registers": await db.payroll_registers.count_documents({"fiscal_cycle": fy}),
        "compliance_items": await db.compliance_items.count_documents({"status": "Active"}),
        "active_pos": await db.purchase_orders.count_documents(
            {"fiscal_cycle": fy, "status": {"$nin": ["Cancelled", "Draft"]}},
        ),
    }
    return {"fiscal_cycle": fy, "counts": counts,
            "estimated_pages": 1 + sum(1 for k, v in counts.items() if v > 0)}
