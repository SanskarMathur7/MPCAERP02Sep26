"""ReportLab PDF generators for rulebook + meeting agenda routes."""
from pathlib import Path
from fastapi.responses import Response


def _markdown_to_colored_pdf(md_path: Path, *, title: str, filename: str) -> Response:
    """Markdown → PDF renderer with proper colored tables (green/amber/red tint based on status emoji)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    import io
    import re as _re

    text = md_path.read_text(encoding="utf-8")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.6 * cm, rightMargin=1.6 * cm,
        topMargin=1.6 * cm, bottomMargin=1.6 * cm,
        title=title,
        author="Madhya Pradesh Cricket Association",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], textColor=colors.HexColor("#10342B"), spaceAfter=14, spaceBefore=6, fontSize=24, leading=28)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], textColor=colors.HexColor("#7A2E1F"), spaceAfter=10, spaceBefore=18, fontSize=18, leading=22)
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], textColor=colors.HexColor("#10342B"), spaceAfter=8, spaceBefore=12, fontSize=14, leading=18)
    body_style = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=9.5, leading=13, spaceAfter=4)
    quote_style = ParagraphStyle("Quote", parent=body_style, leftIndent=14, textColor=colors.HexColor("#555"), fontName="Helvetica-Oblique")
    bullet_style = ParagraphStyle("Bullet", parent=body_style, leftIndent=14, bulletIndent=2)
    cell_style = ParagraphStyle("Cell", parent=body_style, fontSize=9, leading=12, spaceAfter=0)

    def _esc(s: str, *, in_table_cell: bool = False) -> str:
        s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        s = _re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = _re.sub(r"(?<![*\w])\*(?!\*)(.+?)\*(?!\*)", r"<i>\1</i>", s)
        s = _re.sub(r"`([^`]+)`", r'<font face="Courier" color="#7A2E1F">\1</font>', s)
        if in_table_cell:
            # In tables, status emoji carry meaning — render as colored dots.
            s = s.replace("🟢", '<font color="#1F7A4D"><b>●</b></font>')
            s = s.replace("🟡", '<font color="#B07A12"><b>●</b></font>')
            s = s.replace("🔴", '<font color="#A2392B"><b>●</b></font>')
            s = s.replace("🟣", '<font color="#6B3FA0"><b>●</b></font>')
            s = s.replace("🔥", '<font color="#A2392B"><b>!</b></font>')
            s = s.replace("🟠", '<font color="#C9711F"><b>●</b></font>')
            s = s.replace("🔵", '<font color="#2A5BB0"><b>●</b></font>')
        # Strip ALL decorative emoji (in both contexts to be safe).
        # Decorative status pips not in table cells, and section-header emoji, are removed.
        s = _re.sub(
            r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\u2022\u25A0-\u25FF]",
            "",
            s,
        )
        # Clean up leading whitespace left after stripping
        s = _re.sub(r"^\s+", "", s)
        return s

    GREEN = colors.HexColor("#D0E6D8")
    AMBER = colors.HexColor("#FAE6BC")
    RED   = colors.HexColor("#F5C8BD")
    NAVY  = colors.HexColor("#10342B")
    BRASS = colors.HexColor("#C9A55C")
    IVORY = colors.HexColor("#F8EFD8")
    SAFFRON = colors.HexColor("#F58220")    # bright table-header background

    def _row_color(cells: list):
        joined = " ".join(cells)
        if "🟢" in joined:
            return GREEN
        if "🟡" in joined:
            return AMBER
        if "🔴" in joined or "🔥" in joined or "🟣" in joined:
            return RED
        return None

    def _flush_table(table_rows: list, story: list):
        if not table_rows:
            return
        # First row is header, second is separator |---|, rest data
        header = [c.strip() for c in table_rows[0].strip("|").split("|")]
        data_rows = []
        for raw_row in table_rows[2:] if len(table_rows) >= 2 else []:
            cells = [c.strip() for c in raw_row.strip("|").split("|")]
            data_rows.append(cells)
        # Wrap each cell in Paragraph for word-wrap
        flowable = [[Paragraph(_esc(c, in_table_cell=True), cell_style) for c in header]]
        for cells in data_rows:
            flowable.append([Paragraph(_esc(c, in_table_cell=True), cell_style) for c in cells])

        ncols = len(header)
        avail = A4[0] - 2 * 1.6 * cm
        # Smart column widths: narrower for first column if it's a number, % col gets less
        col_widths = [avail / ncols] * ncols

        tbl = Table(flowable, colWidths=col_widths, repeatRows=1)
        ts = [
            ("BACKGROUND", (0, 0), (-1, 0), SAFFRON),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9.5),
            ("ALIGN", (0, 0), (-1, 0), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.4, BRASS),
            ("LINEBELOW", (0, 0), (-1, 0), 1.5, NAVY),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, 0), 7),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
            ("TOPPADDING", (0, 1), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ]
        # Per-row color hints
        for r_idx, cells in enumerate(data_rows, start=1):
            col = _row_color(cells)
            if col is not None:
                ts.append(("BACKGROUND", (0, r_idx), (-1, r_idx), col))
        tbl.setStyle(TableStyle(ts))
        story.append(tbl)
        story.append(Spacer(1, 8))

    story: list = []
    table_buf: list = []
    in_table = False

    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("|"):
            in_table = True
            table_buf.append(line)
            continue
        if in_table:
            _flush_table(table_buf, story)
            table_buf = []
            in_table = False

        if not line.strip():
            story.append(Spacer(1, 4))
            continue
        if line.startswith("# "):
            story.append(Paragraph(_esc(line[2:]), h1))
        elif line.startswith("## "):
            story.append(Paragraph(_esc(line[3:]), h2))
        elif line.startswith("### "):
            story.append(Paragraph(_esc(line[4:]), h3))
        elif line.startswith("> "):
            story.append(Paragraph(_esc(line[2:]), quote_style))
        elif line.startswith("- ") or line.startswith("* "):
            story.append(Paragraph(_esc(line[2:]), bullet_style, bulletText="•"))
        elif line.startswith("---"):
            story.append(Spacer(1, 4))
            story.append(Paragraph("<para alignment='center'>· · ·</para>", body_style))
            story.append(Spacer(1, 4))
        else:
            story.append(Paragraph(_esc(line), body_style))

    if in_table:
        _flush_table(table_buf, story)

    doc.build(story)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def _markdown_to_pdf_response(md_path: Path, *, title: str, filename: str) -> Response:
    """Reusable MD → PDF renderer (used by both rulebook and agenda)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    import io
    import re as _re

    text = md_path.read_text(encoding="utf-8")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=title,
        author="Madhya Pradesh Cricket Association",
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], textColor=colors.HexColor("#10342B"), spaceAfter=10)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], textColor=colors.HexColor("#7A2E1F"), spaceAfter=8)
    h3 = ParagraphStyle("H3", parent=styles["Heading3"], textColor=colors.HexColor("#10342B"), spaceAfter=6)
    body_style = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=10, leading=14, spaceAfter=6)
    quote_style = ParagraphStyle("Quote", parent=body_style, leftIndent=18, textColor=colors.HexColor("#555"), fontName="Helvetica-Oblique")
    bullet_style = ParagraphStyle("Bullet", parent=body_style, leftIndent=14, bulletIndent=2)
    code_style = ParagraphStyle("Code", parent=body_style, fontName="Courier", fontSize=9, textColor=colors.HexColor("#333"))

    def _esc(s: str) -> str:
        s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        s = _re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = _re.sub(r"(?<![*\w])\*(?!\*)(.+?)\*(?!\*)", r"<i>\1</i>", s)
        s = _re.sub(r"`([^`]+)`", r'<font face="Courier" color="#7A2E1F">\1</font>', s)
        return s

    story: list = []
    in_table = False
    table_buffer: list = []
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("|"):
            in_table = True
            table_buffer.append(line)
            continue
        if in_table:
            for row in table_buffer:
                story.append(Paragraph(_esc(row), code_style))
            story.append(Spacer(1, 6))
            table_buffer = []
            in_table = False
        if not line.strip():
            story.append(Spacer(1, 4))
            continue
        if line.startswith("# "):
            story.append(Paragraph(_esc(line[2:]), h1))
        elif line.startswith("## "):
            story.append(Paragraph(_esc(line[3:]), h2))
        elif line.startswith("### "):
            story.append(Paragraph(_esc(line[4:]), h3))
        elif line.startswith("> "):
            story.append(Paragraph(_esc(line[2:]), quote_style))
        elif line.startswith("- ") or line.startswith("* "):
            story.append(Paragraph(_esc(line[2:]), bullet_style, bulletText="•"))
        elif line.startswith("---"):
            story.append(Spacer(1, 6))
            story.append(Paragraph("<para alignment='center'>· · ·</para>", body_style))
            story.append(Spacer(1, 6))
        else:
            story.append(Paragraph(_esc(line), body_style))
    if in_table:
        for row in table_buffer:
            story.append(Paragraph(_esc(row), code_style))

    doc.build(story)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
