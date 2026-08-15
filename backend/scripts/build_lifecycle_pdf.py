"""MPCA · Tournament Lifecycle Reference PDF generator.

Builds a branded, board-quality PDF (~15-20 pages) covering all 8 tournament
types' full lifecycle — 9 steps · actors · money flow · schemes · rough edges.

Output: /app/docs/mpca_tournament_lifecycle_reference.pdf
"""
import os
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Preformatted, Spacer, Table, TableStyle, KeepTogether,
)

# ─── MPCA palette (matching the app tokens) ─────────────────────────────
NAVY       = colors.HexColor("#0a1f3d")
NAVY2      = colors.HexColor("#163558")
OXBLOOD    = colors.HexColor("#ff6a13")
BURGUNDY   = colors.HexColor("#7a1f2c")
BRASS      = colors.HexColor("#b8860b")
BRASS_LT   = colors.HexColor("#e9b949")
GOLD       = colors.HexColor("#d4a017")
IVORY      = colors.HexColor("#fbf7ed")
PARCHMENT  = colors.HexColor("#f1ead7")
CHARCOAL   = colors.HexColor("#1a1a1a")
GRAY_DARK  = colors.HexColor("#3d4a5f")
GRAY       = colors.HexColor("#6b7a90")

OUT_PATH = "/app/docs/mpca_tournament_lifecycle_reference.pdf"


# ─── Styles ─────────────────────────────────────────────────────────────
_base = getSampleStyleSheet()

STYLE = {
    "cover_kicker": ParagraphStyle("ck", parent=_base["Normal"], fontName="Helvetica-Bold",
        fontSize=9, textColor=BRASS, leading=12, alignment=TA_CENTER,
        spaceBefore=0, spaceAfter=6, letterSpacing=4),
    "cover_title":  ParagraphStyle("ct", parent=_base["Title"], fontName="Times-Bold",
        fontSize=28, textColor=NAVY, leading=34, alignment=TA_CENTER, spaceBefore=18, spaceAfter=6),
    "cover_sub":    ParagraphStyle("cs", parent=_base["Normal"], fontName="Times-Italic",
        fontSize=13, textColor=BURGUNDY, leading=18, alignment=TA_CENTER, spaceAfter=32),
    "cover_meta":   ParagraphStyle("cm", parent=_base["Normal"], fontName="Helvetica",
        fontSize=9, textColor=GRAY_DARK, leading=13, alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", parent=_base["Heading1"], fontName="Times-Bold",
        fontSize=20, textColor=NAVY, leading=26, spaceBefore=18, spaceAfter=6, keepWithNext=True),
    "h1_kicker": ParagraphStyle("h1k", parent=_base["Normal"], fontName="Helvetica-Bold",
        fontSize=8, textColor=OXBLOOD, leading=11, spaceBefore=6, spaceAfter=0, letterSpacing=3),
    "h2": ParagraphStyle("h2", parent=_base["Heading2"], fontName="Times-Bold",
        fontSize=13, textColor=BURGUNDY, leading=17, spaceBefore=14, spaceAfter=4, keepWithNext=True),
    "meta_line": ParagraphStyle("meta", parent=_base["Normal"], fontName="Helvetica",
        fontSize=9, textColor=GRAY_DARK, leading=12, spaceAfter=6, italic=True),
    "body": ParagraphStyle("body", parent=_base["Normal"], fontName="Helvetica",
        fontSize=9.5, textColor=CHARCOAL, leading=13, spaceAfter=4, alignment=TA_LEFT),
    "body_j": ParagraphStyle("bj", parent=_base["Normal"], fontName="Helvetica",
        fontSize=9.5, textColor=CHARCOAL, leading=13, spaceAfter=4, alignment=TA_JUSTIFY),
    "callout": ParagraphStyle("cal", parent=_base["Normal"], fontName="Helvetica-Oblique",
        fontSize=8.5, textColor=BURGUNDY, leading=12, spaceAfter=4,
        leftIndent=8, rightIndent=8, borderColor=BRASS, borderPadding=6, borderWidth=0.5,
        backColor=PARCHMENT),
    "footer": ParagraphStyle("ft", parent=_base["Normal"], fontName="Helvetica",
        fontSize=7.5, textColor=GRAY, leading=10, alignment=TA_CENTER),
    "code": ParagraphStyle("cd", parent=_base["Code"], fontName="Courier",
        fontSize=8, textColor=NAVY, leading=11, backColor=IVORY, borderColor=BRASS,
        borderPadding=6, borderWidth=0.5, spaceAfter=6, spaceBefore=6, leftIndent=6, rightIndent=6),
}


def _mk_step_table(rows):
    """Build the 9-step lifecycle table with heritage styling."""
    header = ["#", "Step", "Who acts", "Approver", "What happens"]
    data = [header] + rows
    tbl = Table(data, colWidths=[0.7 * cm, 3.5 * cm, 3.7 * cm, 3.0 * cm, 7.4 * cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), IVORY),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 8.5),
        ("ALIGN",      (0, 0), (-1, 0), "LEFT"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING",    (0, 0), (-1, 0), 7),
        # Body
        ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 1), (-1, -1), 8.5),
        ("TEXTCOLOR",  (0, 1), (-1, -1), CHARCOAL),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 1), (-1, -1), 5),
        # Row zebra
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        *[("BACKGROUND", (0, i), (-1, i), IVORY)
          for i in range(2, len(data), 2)],
        # Grid
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, BRASS),
        ("LINEBELOW", (0, -1), (-1, -1), 0.4, BRASS),
        ("LINEBEFORE", (0, 1), (0, -1), 2, OXBLOOD),
    ]))
    return tbl


def _mk_money_box(text):
    """Money-flow diagram in a heritage-boxed monospace block."""
    return Preformatted(text, STYLE["code"])


# ─── Content ────────────────────────────────────────────────────────────

def cover_page(story):
    story.append(Spacer(1, 6 * cm))
    story.append(Paragraph("MPCA · MADHYA PRADESH CRICKET ASSOCIATION", STYLE["cover_kicker"]))
    story.append(Paragraph("Tournament Lifecycle Reference", STYLE["cover_title"]))
    story.append(Paragraph("The full 9-step process for every tournament type MPCA runs", STYLE["cover_sub"]))

    # Central chip block
    chip_data = [
        ["8", "Tournament Types"],
        ["9", "Lifecycle Steps"],
        ["72", "Wiring Cells"],
        ["v1", "Season 2026-27"],
    ]
    chip_tbl = Table(chip_data, colWidths=[2.2 * cm, 5.6 * cm], hAlign="CENTER")
    chip_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), NAVY),
        ("TEXTCOLOR",  (0, 0), (0, -1), GOLD),
        ("FONTNAME",   (0, 0), (0, -1), "Times-Bold"),
        ("FONTSIZE",   (0, 0), (0, -1), 22),
        ("ALIGN",      (0, 0), (0, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (1, 0), (1, -1), IVORY),
        ("TEXTCOLOR",  (1, 0), (1, -1), BURGUNDY),
        ("FONTNAME",   (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTSIZE",   (1, 0), (1, -1), 11),
        ("ALIGN",      (1, 0), (1, -1), "LEFT"),
        ("LEFTPADDING", (1, 0), (1, -1), 14),
        ("TOPPADDING",    (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("BOX", (0, 0), (-1, -1), 0.6, BRASS),
        ("LINEABOVE", (0, 1), (-1, -1), 0.4, BRASS),
    ]))
    story.append(chip_tbl)

    story.append(Spacer(1, 3.5 * cm))
    story.append(Paragraph("Source of truth · <font name='Courier'>tournament_wiring</font> singleton",
                           STYLE["cover_meta"]))
    story.append(Paragraph("Advisory doc — every step remains clickable in the ERP.<br/>"
                           "The wiring only <b>labels</b>, it never <b>blocks</b>.",
                           STYLE["cover_meta"]))
    story.append(Paragraph("Generated for MPCA Tournament Committee &nbsp;·&nbsp; February 2026",
                           STYLE["cover_meta"]))
    story.append(PageBreak())


# ─── The 8 tournament type sections ─────────────────────────────────────

TYPES = [
    dict(
        n="1",
        title="BCCI Tournament",
        subtitle="Ranji · Vijay Hazare · Syed Mushtaq Ali · Duleep · Irani · Nayudu",
        wiring="bcci",
        owner="MPCA",
        visibility="Realtime",
        example="Ranji Trophy · Elite · MPCA 2026-27",
        rows=[
            ["1", "Tournament Creation",  "MPCA Secretary",   "None",           "BCCI has allotted this fixture to MP — MPCA creates on the platform."],
            ["2", "Pool / Basics",        "MPCA Secretary",   "None",           "Only ONE selectable host division (Holkar / Roshanpura); multiple match pools allowed."],
            ["3", "Match Official Posting","MPCA Secretary",  "MPCA",           "MPCA posts umpires, scorers and referees."],
            ["4", "Squad",                "MPCA Secretary",   "None",           "Manual PDF only. MPCA uploads the signed MP squad list — no register linkage."],
            ["5", "Squad Approval by MPCA","N/A",             "—",              "Optional · Not Used. MPCA uploaded the squad directly, so no separate approval."],
            ["6", "Match Calendar",       "MPCA Secretary",   "None",           "Manual entry. Away teams are other states (Gujarat, Odisha, Vidarbha etc.)."],
            ["7", "Unified Budget",       "MPCA Treasurer",   "MPCA Treasurer", "Auto per rate card. Special rule: both teams' full squads count as AWAY pax (no home exemption)."],
            ["8", "Finance Console",      "MPCA Treasurer",   "MPCA Treasurer", "Normal claim + receipts + UTR."],
            ["9", "MPCA Visibility",      "Info",             "—",              "Realtime — MPCA sees everything as it happens."],
        ],
        money="MPCA books hosting cost\n     ↓\n  invoices submitted to BCCI\n     ↓\n  BCCI reimburses via hosting fee + participation subsidy",
        scheme="Scheme 2-A (host) · BCCI's own Guidelines to Staging Associations 2025-26 apply for caps.",
        rough="BCCI reimbursement is submitted to BCCI externally, not to the MPCA Finance Console. The ERP currently treats it as a normal MPCA-internal claim. Add a bcci_claim sub-type later that prints BCCI's own template instead of the MPCA voucher.",
    ),
    dict(
        n="2",
        title="Inter-Divisional Tournament",
        subtitle="MPCA-run · all 10 Divisions participate",
        wiring="interdiv",
        owner="MPCA (allots) → Division (hosts)",
        visibility="Realtime",
        example="MY Memorial Trophy · 2026-27",
        rows=[
            ["1", "Tournament Creation",  "MPCA Secretary",           "None",           "Allots the tournament to a host Division per the CDC calendar."],
            ["2", "Pool / Basics",        "MPCA Secretary",           "None",           "Sets all 10 Divisions into pools (e.g. 2 pools of 5 for league + knockout)."],
            ["3", "Match Official Posting","MPCA Secretary",          "MPCA",           "MPCA posts umpires and scorers from the divisional rosters."],
            ["4", "Squad",                "Each Division Secretary",  "MPCA (step 5)",  "Register-linked. Each Division selects 15 players + Captain / Vice-Captain / Wicket-Keeper from its Player Register."],
            ["5", "Squad Approval by MPCA","MPCA Secretary",          "MPCA",           "Reviews each Division's squad. Approve or send back with comments."],
            ["6", "Match Calendar",       "MPCA Secretary",           "None",           "Fixtures auto-generated from pools with dates and venues."],
            ["7", "Unified Budget",       "MPCA Treasurer",           "MPCA Treasurer", "Host uses scheme 2-D · Visiting Divisions use scheme 2-C."],
            ["8", "Finance Console",      "MPCA Treasurer",           "MPCA Treasurer", "Divisions submit claims after their matches. MPCA approves and pays each Division separately."],
            ["9", "MPCA Visibility",      "Info",                     "—",              "Realtime — MPCA sees everything as it happens."],
        ],
        money=("               MPCA (funds pool)\n"
               "                       │\n"
               "         ┌─────────────┴──────────────┐\n"
               "         ▼                            ▼\n"
               "  Host Division                Visiting Divisions × 9\n"
               "  (scheme 2-D hosting)         (travel + DA on 2-C)\n"
               "         │                            │\n"
               "         └──────── separate claims ───┘\n"
               "                       │\n"
               "                       ▼\n"
               "        MPCA Treasurer approves + pays each Division"),
        scheme="Scheme 2-D (host) + 2-C (visitors) · Reference: Scheme pp.11-13.",
        rough="Cap-breach on scheme 2-C isn't auto-split into a 'Division bears the excess' bucket. Add a cap-warning in Finance Console when visitor DA exceeds the 2-C ceiling.",
    ),
    dict(
        n="3",
        title="Pre-Tournament Camp",
        subtitle="Division-run · auto-linked to a parent Inter-Divisional tournament",
        wiring="camp",
        owner="Division",
        visibility="On-Submit",
        example="Bhopal Pre-Tournament Camp for MY Memorial",
        rows=[
            ["1", "Tournament Creation",  "N/A (Auto)",          "—",              "Not created fresh — Division picks an active Inter-Div tournament to link to. Camp auto-created off that parent."],
            ["2", "Pool / Basics",        "N/A",                 "—",              "Single division only — no pools."],
            ["3", "Match Official Posting","N/A",                "—",              "No matches → no officials."],
            ["4", "Squad",                "Division Secretary",  "None",           "Register-linked, planning mode. Selects a larger training squad (than the final 15) from the Register."],
            ["5", "Squad Approval by MPCA","N/A",                "—",              "MPCA does not approve pre-camp squads."],
            ["6", "Match Calendar",       "Division (Optional)", "None",           "Division may add practice-match fixtures for reference. All manual fields."],
            ["7", "Unified Budget",       "Division Treasurer",  "None",           "Auto per scheme 3-D. Division owns and uploads. MPCA has no role until submit."],
            ["8", "Finance Console",      "Division → MPCA",     "MPCA Treasurer", "Division submits camp claim as part of the parent Inter-Div reimbursement bundle."],
            ["9", "MPCA Visibility",      "Info",                "—",              "On final claim submission only."],
        ],
        money=("Division (funds camp upfront)\n"
               "            │\n"
               "            ▼\n"
               "  attaches expense to parent\n"
               "  Inter-Divisional claim\n"
               "            │\n"
               "            ▼\n"
               "  MPCA Treasurer reimburses\n"
               "  as part of the Inter-Div bundle"),
        scheme="Scheme 3-D (Pre-Tournament Camp rate card).",
        rough="Pre-Camps live in the camps collection, not tournaments, so they don't appear in the main Tournaments list. Users looking for 'all things happening this month' can miss them. Later, surface Pre-Camps as a chip on the parent Inter-Div tournament header.",
    ),
    dict(
        n="4",
        title="Inter-District Tournament",
        subtitle="Division-run · allotted to Districts within the Division",
        wiring="district",
        owner="Division",
        visibility="On-Submit",
        example="Indore Division Inter-District Championship 2026-27",
        rows=[
            ["1", "Tournament Creation",  "Division Secretary",    "None",           "Division creates on the platform (not MPCA)."],
            ["2", "Pool / Basics",        "Division Secretary",    "None",           "Chooses which 8 Districts participate; groups them into pools of 4 for league + knockout."],
            ["3", "Match Official Posting","Division Secretary",   "Division",       "Division posts umpires and scorers from its divisional roster (different from Inter-Div where MPCA posts)."],
            ["4", "Squad",                "District Secretary",    "None",           "Manual PDF. Each District uploads a signed squad-list PDF (no register linkage — District Registers not in ERP yet)."],
            ["5", "Squad Approval by MPCA","N/A",                  "—",              "Optional · Not Used. Division self-manages, no MPCA approval."],
            ["6", "Match Calendar",       "Division Secretary",    "None",           "Division fixes pool-play + knockout fixtures with venues."],
            ["7", "Unified Budget",       "Division Secretary",    "Division",       "Auto per rate card 2-B × match-days. Division locks."],
            ["8", "Finance Console",      "Division → MPCA",       "MPCA Treasurer", "Single consolidated reimbursement to the Division (not per District). MPCA reviews and pays."],
            ["9", "MPCA Visibility",      "Info",                  "—",              "On final claim submission only."],
        ],
        money=("MPCA (funds) ──► Division (organiser) ──► Districts (participants)\n"
               "                            │\n"
               "                            ▼\n"
               "         collects invoices, vouchers and DA forms\n"
               "                            │\n"
               "                            ▼\n"
               "        Division files ONE consolidated claim\n"
               "                            │\n"
               "                            ▼\n"
               "  MPCA Treasurer approves + pays the Division"),
        scheme="Scheme 2-B (host) + 2-C (visiting Districts).",
        rough="Districts have no Player Register in the ERP today. Register-linked squad mode is Division-only. If MPCA later wants District Registers, we'd need a new District Player Register module (~1 sprint).",
    ),
    dict(
        n="5",
        title="Inter-School Tournament",
        subtitle="Division-run · allotted to Schools within the Division",
        wiring="interschool",
        owner="Division",
        visibility="On-Submit",
        example="Bhopal District Inter-School Championship (U-19)",
        rows=[
            ["1", "Tournament Creation",  "Division Secretary",   "None",           "Division allots to schools in its area."],
            ["2", "Pool / Basics",        "N/A",                  "—",              "Straight knockout format — no pools."],
            ["3", "Match Official Posting","N/A",                 "—",              "Schools bring their own umpires; no MPCA / Division officials assigned."],
            ["4", "Squad",                "Division Secretary",   "None",           "Manual PDF. Division uploads a signed squad PDF listing every participating school's team."],
            ["5", "Squad Approval by MPCA","N/A",                 "—",              "Optional · Not Used. No MPCA approval."],
            ["6", "Match Calendar",       "Division (Optional)",  "None",           "Division may add fixtures with fully manual school names (Schools aren't in a registry)."],
            ["7", "Unified Budget",       "Division Treasurer",   "None",           "Auto from (players × scheme 2-A). Entry fee ₹1,500 per team collected by host and declared with the claim."],
            ["8", "Finance Console",      "Division → MPCA",      "MPCA Treasurer", "Net claim = Total expense minus Entry-fee pool. MPCA reimburses the net."],
            ["9", "MPCA Visibility",      "Info",                 "—",              "On final claim submission only."],
        ],
        money=("Schools pay entry fee ₹1.5k × N\n"
               "           │\n"
               "           ▼\n"
               "     Division pool\n"
               "           │\n"
               "           ▼\n"
               "Division runs tournament and pays umpires + logistics\n"
               "           │\n"
               "           ▼\n"
               "Net cost = Total expense − Entry fees collected\n"
               "           │\n"
               "           ▼\n"
               "MPCA reimburses the net amount"),
        scheme="Scheme 2-A · Reference: Scheme p.7 · Knockout only · 25 overs (till SF), 50 overs (SF+F) · Daily grant ₹5k.",
        rough="Schools aren't first-class entities in the ERP — they're free-text names on the squad PDF. If a School participates over multiple years, cumulative participation or funding can't be tracked. Later, add a lightweight schools collection (name + city + coach contact).",
    ),
    dict(
        n="6",
        title="Inter-Club Tournament",
        subtitle="Division-run · allotted to 'A' Grade Clubs",
        wiring="interclub",
        owner="Division",
        visibility="On-Submit",
        example="Holkar Cup · Indore A-Grade Clubs Championship",
        rows=[
            ["1", "Tournament Creation",  "Division Secretary",   "None",           "Division allots to A-Grade Clubs registered under it."],
            ["2", "Pool / Basics",        "N/A",                  "—",              "No pools."],
            ["3", "Match Official Posting","N/A",                 "—",              "Clubs bring their own umpires; not Division-posted."],
            ["4", "Squad",                "Division Secretary",   "None",           "Manual PDF. Division uploads a signed squad PDF of every participating club's team."],
            ["5", "Squad Approval by MPCA","N/A",                 "—",              "Optional · Not Used."],
            ["6", "Match Calendar",       "Division (Optional)",  "None",           "Two-day knockout fixtures with manual club-name entry."],
            ["7", "Unified Budget",       "Division Treasurer",   "None",           "Auto from (players × scheme 2-E). Special rule: only two-day knockout format is reimbursable — one-day / league-cum-knockout formats are not."],
            ["8", "Finance Console",      "Division → MPCA",      "MPCA Treasurer", "Division submits claim. MPCA verifies format was 2-day KO before approving."],
            ["9", "MPCA Visibility",      "Info",                 "—",              "On final claim submission only."],
        ],
        money=("Clubs bear their own local expenses\n"
               "           │\n"
               "           ▼\n"
               "Division reimburses per-match on scheme 2-E\n"
               "           │\n"
               "           ▼\n"
               "Outstation clubs get stay + food + travel (extra)\n"
               "           │\n"
               "           ▼\n"
               "Division consolidates → MPCA reimburses"),
        scheme="Scheme 2-E · Reference: Scheme pp.14-15.",
        rough="The 'only two-day knockout' rule isn't enforced in code — the Budget compute accepts any format. Add a hard check in Unified Budget compute that returns 422 if format != Multi_Day, or make it a soft warning on Finance Console.",
    ),
    dict(
        n="7",
        title="Periodical Coaching Camp",
        subtitle="Division-run · rural / district players who cannot practise at divisional HQ",
        wiring="coachingcamp",
        owner="Division",
        visibility="On-Submit",
        example="Ujjain Rural Coaching Camp (U-16)",
        rows=[
            ["1", "Tournament Creation",  "Division Secretary",   "None",           "Division opens the camp for its rural / district players."],
            ["2", "Pool / Basics",        "N/A",                  "—",              "No pools — single camp."],
            ["3", "Match Official Posting","N/A",                 "—",              "No matches → no officials."],
            ["4", "Squad",                "Division Secretary",   "None",           "Manual PDF. Division uploads the signed camp roster (typically 30-40 players)."],
            ["5", "Squad Approval by MPCA","N/A",                 "—",              "Optional · Not Used."],
            ["6", "Match Calendar",       "Division (Optional)",  "None",           "Division may add practice-match dates for reference."],
            ["7", "Unified Budget",       "Division Treasurer",   "None",           "Auto from (players × days × scheme 3-A). Division locks."],
            ["8", "Finance Console",      "Division → MPCA",      "MPCA Treasurer", "Division submits camp claim."],
            ["9", "MPCA Visibility",      "Info",                 "—",              "On final claim submission only."],
        ],
        money=("Division bears camp cost upfront\n"
               "(accommodation + food + coaching fees)\n"
               "           │\n"
               "           ▼\n"
               "Division submits camp claim → MPCA reimburses on 3-A caps"),
        scheme="Scheme 3-A · Reference: Scheme p.16 · Prior MPCA notification is MANDATORY. NOT available for the camp before an Inter-Divisional tournament (that's what Pre-Tournament Camp is for).",
        rough="The 'prior MPCA notification is mandatory' rule isn't checked by the ERP. Divisions can create a Coaching Camp today and submit its claim without ever notifying MPCA. Add a notification_date field on tournament creation for this type; block claim submission if it's blank or after start_date.",
    ),
    dict(
        n="8",
        title="Vacation Camp",
        subtitle="Division-run · Summer / Winter break camps",
        wiring="vacationcamp",
        owner="Division",
        visibility="On-Submit",
        example="Jabalpur Summer Vacation Camp (U-14)",
        rows=[
            ["1", "Tournament Creation",  "Division Secretary",   "None",           "Division opens the vacation camp for its youth players."],
            ["2", "Pool / Basics",        "N/A",                  "—",              "No pools."],
            ["3", "Match Official Posting","N/A",                 "—",              "No matches."],
            ["4", "Squad",                "Division Secretary",   "None",           "Manual PDF. Division uploads signed camp roster (typically 50-60 players — larger than coaching camps)."],
            ["5", "Squad Approval by MPCA","N/A",                 "—",              "Optional · Not Used."],
            ["6", "Match Calendar",       "Division (Optional)",  "None",           "Division may add exhibition-match fixtures."],
            ["7", "Unified Budget",       "Division Treasurer",   "None",           "Auto from (players × days × scheme 3-B)."],
            ["8", "Finance Console",      "Division → MPCA",      "MPCA Treasurer", "Division submits claim. Divisional Secretary must sign the printed 'no-fee-charged' undertaking that goes with the claim."],
            ["9", "MPCA Visibility",      "Info",                 "—",              "On final claim submission only."],
        ],
        money=("Division bears entire camp cost upfront\n"
               "(₹0 collected from players)\n"
               "           │\n"
               "           ▼\n"
               "Division submits claim + no-fee undertaking\n"
               "           │\n"
               "           ▼\n"
               "MPCA reimburses on 3-B caps"),
        scheme="Scheme 3-B · Reference: Scheme p.17 · Divisional Secretary's undertaking mandatory: 'No amount was charged from any player'.",
        rough="The no-fee-charged undertaking isn't a mandatory attachment in the ERP. Divisions can submit a Vacation Camp claim without uploading the signed undertaking. Add a mandatory PDF-upload field on the Vacation Camp Finance Console with the auto-generated undertaking template.",
    ),
]


def add_type_section(story, t):
    story.append(Paragraph(f"TYPE {t['n']} OF 8 · WIRING KEY · <font name='Courier'>{t['wiring']}</font>",
                           STYLE["h1_kicker"]))
    story.append(Paragraph(t["title"], STYLE["h1"]))
    story.append(Paragraph(f"<i>{t['subtitle']}</i>", STYLE["meta_line"]))

    meta = Table([[
        Paragraph(f"<b>Owner</b><br/><font size=8 color='#3d4a5f'>{t['owner']}</font>", STYLE["body"]),
        Paragraph(f"<b>MPCA Visibility</b><br/><font size=8 color='#3d4a5f'>{t['visibility']}</font>", STYLE["body"]),
        Paragraph(f"<b>Example</b><br/><font size=8 color='#3d4a5f'>{t['example']}</font>", STYLE["body"]),
    ]], colWidths=[4.5 * cm, 4.5 * cm, 9.3 * cm])
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PARCHMENT),
        ("BOX",        (0, 0), (-1, -1), 0.4, BRASS),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",(0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
    ]))
    story.append(meta)
    story.append(Spacer(1, 8))

    story.append(Paragraph("The 9 Steps · who acts &amp; who approves", STYLE["h2"]))
    story.append(_mk_step_table(t["rows"]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Money Flow", STYLE["h2"]))
    story.append(_mk_money_box(t["money"]))

    story.append(Paragraph("Scheme reference", STYLE["h2"]))
    story.append(Paragraph(t["scheme"], STYLE["body_j"]))

    story.append(Paragraph("Rough edge (honest gap)", STYLE["h2"]))
    story.append(Paragraph(t["rough"], STYLE["callout"]))
    story.append(PageBreak())


def summary_matrix(story):
    story.append(Paragraph("APPENDIX", STYLE["h1_kicker"]))
    story.append(Paragraph("Summary Matrix · Who Does What", STYLE["h1"]))
    story.append(Paragraph("At-a-glance table for board / audit reference.", STYLE["meta_line"]))

    header = ["Tournament Type", "Creates", "Squad Approves", "Finance Approves", "MPCA Visibility"]
    rows = [
        ["BCCI",                "MPCA",     "—",     "MPCA", "Realtime"],
        ["Inter-Divisional",    "MPCA",     "MPCA",  "MPCA", "Realtime"],
        ["Pre-Tournament Camp", "Auto",     "—",     "MPCA", "On-submit"],
        ["Inter-District",      "Division", "—",     "MPCA", "On-submit"],
        ["Inter-School",        "Division", "—",     "MPCA", "On-submit"],
        ["Inter-Club",          "Division", "—",     "MPCA", "On-submit"],
        ["Coaching Camp",       "Division", "—",     "MPCA", "On-submit"],
        ["Vacation Camp",       "Division", "—",     "MPCA", "On-submit"],
    ]
    data = [header] + rows
    tbl = Table(data, colWidths=[4.0*cm, 2.5*cm, 3.5*cm, 3.5*cm, 3.5*cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), IVORY),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 9),
        ("ALIGN",      (0, 0), (-1, 0), "LEFT"),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("FONTSIZE",   (0, 1), (-1, -1), 9),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 1), (-1, -1), 6),
        *[("BACKGROUND", (0, i), (-1, i), IVORY) for i in range(2, len(data), 2)],
        ("LINEBELOW", (0, 0), (-1, 0), 1.2, BRASS),
        ("BOX", (0, 0), (-1, -1), 0.4, BRASS),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 18))

    story.append(Paragraph("Wiring Coverage Recap", STYLE["h2"]))
    for line in [
        "<b>72 wiring cells</b> total (8 types × 9 steps).",
        "<b>Only 8 cells are MPCA-owned + Mandatory</b> — concentrated in BCCI + Inter-Divisional.",
        "<b>34 cells are Not Applicable</b> — mostly the Championship-scoped smaller tournaments "
        "(School / Club / Camps). Per governance direction, NA cells remain fully clickable in "
        "the ERP; the label just tells the user their data won't drive any downstream calculations.",
        "This ratio is the reason the wiring epic is such a <b>cognitive-load reducer</b>: office "
        "bearers no longer need to memorise which type needs which step. The wiring tells them.",
    ]:
        story.append(Paragraph(line, STYLE["body_j"]))
    story.append(Spacer(1, 12))

    # Signature block for board approval
    story.append(Paragraph("Signed &amp; approved for use in season 2026-27", STYLE["h2"]))
    sig = Table([
        ["", "", ""],
        ["Hon. Secretary\nMPCA", "Hon. Treasurer\nMPCA", "Hon. President\nMPCA"],
    ], colWidths=[5.4*cm, 5.4*cm, 5.4*cm], rowHeights=[1.8*cm, 0.9*cm])
    sig.setStyle(TableStyle([
        ("LINEABOVE", (0, 1), (-1, 1), 0.6, NAVY),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 9),
        ("TEXTCOLOR", (0, 1), (-1, 1), NAVY),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 1), (-1, 1), "TOP"),
        ("TOPPADDING", (0, 1), (-1, 1), 4),
    ]))
    story.append(sig)


# ─── Page frame + on-page decorators ────────────────────────────────────

def _on_page(canvas, doc):
    canvas.saveState()
    # Top rule
    canvas.setStrokeColor(BRASS)
    canvas.setLineWidth(0.5)
    canvas.line(2*cm, A4[1] - 1.3*cm, A4[0] - 2*cm, A4[1] - 1.3*cm)
    # Header text
    canvas.setFont("Helvetica-Bold", 7)
    canvas.setFillColor(BRASS)
    canvas.drawString(2*cm, A4[1] - 1.05*cm, "MPCA · TOURNAMENT LIFECYCLE REFERENCE")
    canvas.drawRightString(A4[0] - 2*cm, A4[1] - 1.05*cm, "SEASON 2026-27")
    # Bottom rule
    canvas.line(2*cm, 1.3*cm, A4[0] - 2*cm, 1.3*cm)
    # Page number
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GRAY)
    canvas.drawCentredString(A4[0] / 2, 0.9*cm, f"Page {doc.page}")
    canvas.drawRightString(A4[0] - 2*cm, 0.9*cm, "Generated from tournament_wiring singleton")
    canvas.restoreState()


def _on_cover(canvas, doc):
    canvas.saveState()
    # A subtle centred emblem block on the cover
    w, h = A4
    # Top brass bar
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 3.4*cm, w, 3.4*cm, fill=1, stroke=0)
    canvas.setFillColor(BRASS)
    canvas.rect(0, h - 3.6*cm, w, 0.2*cm, fill=1, stroke=0)
    # Bottom brass bar
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, 2.4*cm, fill=1, stroke=0)
    canvas.setFillColor(BRASS)
    canvas.rect(0, 2.4*cm, w, 0.2*cm, fill=1, stroke=0)
    # Small crest at top-center
    canvas.setFont("Times-Bold", 18)
    canvas.setFillColor(GOLD)
    canvas.drawCentredString(w / 2, h - 2.1*cm, "\u2694\uFE0F  MPCA  \u2694\uFE0F")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(BRASS_LT)
    canvas.drawCentredString(w / 2, h - 2.7*cm, "MADHYA PRADESH CRICKET ASSOCIATION")
    canvas.restoreState()


def build():
    doc = BaseDocTemplate(
        OUT_PATH, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=1.9*cm, bottomMargin=1.9*cm,
        title="MPCA · Tournament Lifecycle Reference",
        author="MPCA Governance Office",
        subject="Season 2026-27 Wiring · Full 9-step process for all 8 tournament types",
    )

    frame_main  = Frame(2*cm, 1.9*cm, A4[0]-4*cm, A4[1]-3.8*cm, id="main")
    frame_cover = Frame(2*cm, 1.9*cm, A4[0]-4*cm, A4[1]-3.8*cm, id="cover")

    doc.addPageTemplates([
        PageTemplate(id="cover",   frames=[frame_cover], onPage=_on_cover),
        PageTemplate(id="content", frames=[frame_main],  onPage=_on_page),
    ])

    story = []
    cover_page(story)
    story.insert(0, NextPageTemplate("cover"))
    story.append(NextPageTemplate("content"))
    story.append(Paragraph("INTRODUCTION", STYLE["h1_kicker"]))
    story.append(Paragraph("The 9-Step Framework", STYLE["h1"]))
    story.append(Paragraph(
        "Every MPCA tournament — irrespective of scale, from BCCI Ranji Trophy to a "
        "single Vacation Camp for U-14 players — follows the same nine-step lifecycle. "
        "What differs is <b>which steps apply</b>, <b>who acts</b> at each step, and "
        "<b>who approves</b>. This document is the definitive reference: for every "
        "tournament type MPCA runs, it lists all nine steps, the responsible party, the "
        "approver, and the money flow.", STYLE["body_j"]))
    story.append(Paragraph(
        "The source of truth is the <font name='Courier'>tournament_wiring</font> "
        "singleton in the ERP database — a 9 × 8 matrix of cells, each carrying eight "
        "governance attributes (flag, owner, approver, mode, visibility, blocks-next, "
        "SLA and text). This PDF is a human-readable projection of that matrix.",
        STYLE["body_j"]))
    story.append(Paragraph("Key legend", STYLE["h2"]))
    for k, v in [
        ("MPCA", "The state association's office bearers (President / Secretary / Treasurer)."),
        ("Division", "One of MP's 10 cricket divisions (Bhopal, Indore, Jabalpur, Gwalior, Ujjain, Chambal, Sagar, Narmadapuram, Rewa, Shahdol)."),
        ("District", "A district-level unit under a Division (e.g. Indore District, Bhopal District)."),
        ("Realtime visibility", "MPCA sees this tournament and its data as soon as it is created."),
        ("On-Submit visibility", "MPCA sees this tournament only after the Division submits its final reimbursement claim."),
        ("N/A (Optional · Not Used)", "The step is not required for this tournament type; entered data will not drive any downstream calculation. The step remains fully open in the ERP — nothing is hidden or blocked."),
    ]:
        story.append(Paragraph(f"<b>{k}:</b> {v}", STYLE["body_j"]))
    story.append(PageBreak())

    for t in TYPES:
        add_type_section(story, t)

    summary_matrix(story)

    doc.build(story)


if __name__ == "__main__":
    build()
    size_kb = os.path.getsize(OUT_PATH) // 1024
    print(f"✔ PDF built: {OUT_PATH}  ({size_kb} KB)")
