"""Seed data + idempotent seed_data() coroutine called on startup."""
from datetime import datetime, timezone
from typing import List
from core.infra import db, logger
from models import (
    Member, Disclosure, Meeting, Election, Candidate,
    BankAccount, BankTransaction, FeeInvoice,
    Body, Claim, ClaimBase, ApprovalStep,
    ProcurementRequest, Quotation,
    Player, PlayerCreate, Tournament, Squad, SquadMember, DisqualificationFlag,
)
from core.helpers import (
    next_uid, _next_invoice_no, _next_meeting_no,
    _resolve_parent_body, _procurement_method_for, _next_pr_no, _validate_eligibility,
)

SEED_MEMBERS = [
    {
        "name": "Shri Abhilash Khandekar",
        "category": "Individual",
        "sub_category": "Life Member",
        "address": "12 Race Course Road, Indore, MP 452003",
        "phone": "+91 98260 12345",
        "email": "abhilash.k@example.com",
        "eligibility_factor": "Former Ranji Trophy player",
        "membership_date": "2008-04-15",
        "effectiveness": "Lifetime",
        "fee_structure": "₹25,000 one-time",
        "approving_authority": "Managing Committee Resolution dt. 12.04.2008",
        "status": "Active",
        "photo_url": "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400",
    },
    {
        "name": "Dr. Meera Verma",
        "category": "Individual",
        "sub_category": "Annual Member",
        "address": "B-7, Arera Colony, Bhopal, MP 462016",
        "phone": "+91 94250 67890",
        "email": "meera.verma@example.com",
        "eligibility_factor": "Sports Medicine Specialist",
        "membership_date": "2022-09-01",
        "effectiveness": "01.09.2024 – 31.08.2025",
        "fee_structure": "₹3,000/year",
        "approving_authority": "Hon. Secretary",
        "status": "Active",
        "photo_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400",
    },
    {
        "name": "Indore Gymkhana Cricket Club",
        "category": "Institutional",
        "sub_category": "Affiliated Club",
        "address": "Nehru Stadium Annexe, Indore, MP 452001",
        "phone": "+91 731 2545 678",
        "email": "secretary@indoregymkhana.org",
        "eligibility_factor": "BCCI-recognised District Club",
        "membership_date": "1985-06-21",
        "effectiveness": "Permanent (subject to annual renewal)",
        "fee_structure": "₹15,000/year",
        "representative_name": "Shri Vikram Singh Rathore",
        "representative_contact": "+91 98260 99887",
        "approving_authority": "AGM Resolution 1985-III",
        "status": "Active",
    },
    {
        "name": "Jabalpur District Cricket Association",
        "category": "Institutional",
        "sub_category": "District Association",
        "address": "Ranital Stadium, Jabalpur, MP 482002",
        "phone": "+91 761 2412 345",
        "email": "office@jdca-mp.org",
        "eligibility_factor": "Recognised District Body under MPCA Constitution Art. 5",
        "membership_date": "1968-03-10",
        "effectiveness": "Permanent",
        "fee_structure": "₹25,000/year",
        "representative_name": "Shri Anand Pandey",
        "representative_contact": "+91 94251 11223",
        "approving_authority": "Founding Member",
        "status": "Active",
    },
    {
        "name": "Captain (Retd.) Rajinder Pal Singh",
        "category": "Honorary",
        "sub_category": "Honorary Member for Services",
        "address": "Defence Colony, Bhopal, MP 462001",
        "phone": "+91 98101 22334",
        "email": "rps.cricket@example.com",
        "eligibility_factor": "Test cricketer, distinguished services to MP cricket",
        "membership_date": "2015-11-12",
        "effectiveness": "Lifetime",
        "fee_structure": "Nil — Honorary",
        "approving_authority": "AGM Resolution dt. 12.11.2015",
        "status": "Active",
    },
    {
        "name": "Shri Naveen Joshi",
        "category": "Individual",
        "sub_category": "Annual Member",
        "address": "27 Tulsi Nagar, Ujjain, MP 456001",
        "phone": "+91 97551 88990",
        "email": "naveen.j@example.com",
        "eligibility_factor": "Cricket Coach (BCCI Level-2)",
        "membership_date": "2024-09-15",
        "effectiveness": "01.09.2024 – 31.08.2025",
        "fee_structure": "₹3,000/year",
        "approving_authority": "Pending Hon. Secretary approval",
        "status": "Pending",
    },
    {
        "name": "Shri Devendra Bundela",
        "category": "Patron",
        "sub_category": "Founding Patron",
        "address": "Patron's Pavilion, Holkar Stadium, Indore",
        "phone": "+91 98260 00001",
        "email": "patron@mpca.in",
        "eligibility_factor": "Patron of MP cricket since 1972",
        "membership_date": "1972-01-01",
        "effectiveness": "Lifetime",
        "fee_structure": "Patron — Nil",
        "approving_authority": "Constitutional Patron",
        "status": "Active",
    },
]


SEED_DISCLOSURES = [
    {
        "title": "Notice of 78th Annual General Meeting",
        "disclosure_type": "AGM_Notice",
        "summary": "Notice is hereby given that the 78th AGM of the Madhya Pradesh Cricket Association will be held on Saturday, 21st September 2025 at the Holkar Stadium Conference Hall, Indore.",
        "content": "Agenda: (1) Confirmation of minutes of 77th AGM (2) Annual Report 2024-25 (3) Audited Statement of Accounts (4) Budget 2025-26 (5) Election of Office Bearers (6) Any other matter with the permission of the Chair.",
        "issued_date": "2025-08-20",
        "issued_by": "Hon. Secretary, MPCA",
    },
    {
        "title": "Minutes — Managing Committee Meeting (Aug 2025)",
        "disclosure_type": "Committee_Minutes",
        "summary": "Minutes of the Managing Committee meeting held on 5th August 2025 at MPCA Headquarters, Indore.",
        "content": "Resolutions passed: (i) Approval of selection committee for Ranji 2025-26 (ii) Sanction of grant of ₹15 lakh to District Associations (iii) Approval of revised umpire panel.",
        "issued_date": "2025-08-12",
        "issued_by": "Hon. Joint Secretary",
    },
    {
        "title": "Audited Statement of Accounts FY 2024-25",
        "disclosure_type": "Audited_Accounts",
        "summary": "Statutory audited financial statements for the financial year ended 31st March 2025, certified by M/s. Chaturvedi & Associates, Chartered Accountants.",
        "content": "Total receipts: ₹42.6 crore. Total expenditure: ₹38.1 crore. Surplus: ₹4.5 crore. Full ledger available at the registered office for member inspection.",
        "issued_date": "2025-07-30",
        "issued_by": "Hon. Treasurer",
    },
    {
        "title": "Selection Announcement — MP Ranji Squad 2025-26",
        "disclosure_type": "Selection_Announcement",
        "summary": "The Senior Selection Committee has announced the 16-member Madhya Pradesh squad for the 2025-26 Ranji Trophy.",
        "content": "Captain: Shubham Sharma. Vice-Captain: Venkatesh Iyer. Wicketkeeper: Himanshu Mantri. Full squad and reserves available in the attached document.",
        "issued_date": "2025-09-05",
        "issued_by": "Senior Selection Committee",
    },
    {
        "title": "Circular — Membership Renewal Cycle 2025-26",
        "disclosure_type": "Circular",
        "summary": "All members are requested to renew their membership for the 2025-26 cycle (1 Sept 2025 – 31 Aug 2026) on or before 30th September 2025.",
        "content": "Late renewals will attract a penalty of ₹500 as per Article 17(c) of the Constitution. Members in default beyond 31st December 2025 shall lose voting rights at the AGM.",
        "issued_date": "2025-08-25",
        "issued_by": "Hon. Treasurer",
    },
]


SEED_MEETINGS = [
    {
        "title": "78th Annual General Meeting",
        "meeting_type": "AGM",
        "scheduled_date": "2025-09-21",
        "scheduled_time": "11:00 AM",
        "venue": "Conference Hall, Holkar Stadium, Indore",
        "notice_date": "2025-08-20",
        "quorum_required": 35,
        "quorum_present": 0,
        "chairperson": "Shri Mahanaryaman Scindia",
        "convened_by": "Hon. Secretary",
        "status": "Notice_Issued",
        "agenda": [
            {"number": 1, "title": "Confirmation of minutes of 77th AGM", "description": "Read & confirm prior minutes."},
            {"number": 2, "title": "Annual Report 2024-25", "description": "Tabled by Hon. Secretary."},
            {"number": 3, "title": "Audited Statement of Accounts FY 2024-25", "description": "Tabled by Hon. Treasurer; auditor's certification."},
            {"number": 4, "title": "Approval of Budget 2025-26", "description": "Income & expenditure for the next fiscal."},
            {"number": 5, "title": "Election of Office Bearers", "description": "Conducted by appointed Electoral Officer."},
            {"number": 6, "title": "Any other matter", "description": "With the permission of the Chair."},
        ],
        "attendees": [],
    },
    {
        "title": "Managing Committee Meeting — August 2025",
        "meeting_type": "Committee",
        "scheduled_date": "2025-08-05",
        "scheduled_time": "4:00 PM",
        "venue": "Boardroom, MPCA Headquarters",
        "notice_date": "2025-07-25",
        "quorum_required": 9,
        "quorum_present": 11,
        "chairperson": "Shri Mahanaryaman Scindia",
        "convened_by": "Hon. Joint Secretary",
        "status": "Concluded",
        "agenda": [
            {"number": 1, "title": "Approval of Senior Selection Committee for Ranji 2025-26", "decided": True, "decision": "Approved unanimously."},
            {"number": 2, "title": "Grant-in-aid of ₹15 lakh to District Associations", "decided": True, "decision": "Approved with one abstention."},
            {"number": 3, "title": "Revised Umpire Panel 2025-26", "decided": True, "decision": "Approved; list to be circulated."},
        ],
        "attendees": [],
        "minutes": "The meeting commenced at 4:05 PM after confirming quorum of 11 against the required 9. All three agenda items were taken up in seriatim. Resolutions on selection committee constitution and district grants were carried. The meeting concluded at 6:30 PM with a vote of thanks.",
    },
    {
        "title": "Sub-Committee — Infrastructure & Stadium",
        "meeting_type": "Sub_Committee",
        "scheduled_date": "2026-02-12",
        "scheduled_time": "3:00 PM",
        "venue": "Holkar Stadium · Pavilion Lounge",
        "notice_date": "2026-02-01",
        "quorum_required": 5,
        "quorum_present": 0,
        "chairperson": "Capt. Rajinder Pal Singh",
        "convened_by": "Hon. Secretary",
        "status": "Scheduled",
        "agenda": [
            {"number": 1, "title": "Floodlight upgrade at Holkar Stadium", "description": "Tender evaluation."},
            {"number": 2, "title": "Indoor practice facility — Bhopal", "description": "Status report."},
        ],
        "attendees": [],
    },
]


SEED_ELECTIONS = [
    {
        "title": "Election of Hon. Treasurer · Term 2026-30",
        "post": "Honorary Treasurer",
        "tenure_years": 4,
        "cooling_period_years": 4,
        "electoral_officer": "Justice (Retd.) S.K. Awasthi",
        "nomination_open_date": "2026-01-15",
        "nomination_close_date": "2026-02-15",
        "voting_date": "2026-03-10",
        "status": "Voting_Open",
        "notes": "Conducted under Article XII of the MPCA Constitution. Single transferable vote not applicable; first-past-the-post.",
    },
]


SEED_BANK_ACCOUNTS = [
    {
        "name": "MPCA General Account",
        "bank": "State Bank of India",
        "branch": "Race Course Road, Indore",
        "account_no": "30215467881",
        "ifsc": "SBIN0030045",
        "account_type": "Current",
        "opening_balance": 12500000.00,
        "current_balance": 12500000.00,
        "signatories": ["President", "Hon. Secretary", "Hon. Treasurer"],
        "notes": "Primary operating account for the Association. Joint signature required above ₹50,000.",
    },
    {
        "name": "MPCA Tournament Reserves",
        "bank": "HDFC Bank",
        "branch": "Vijay Nagar, Indore",
        "account_no": "50100789456",
        "ifsc": "HDFC0001284",
        "account_type": "Savings",
        "opening_balance": 8500000.00,
        "current_balance": 8500000.00,
        "signatories": ["Hon. Secretary", "Hon. Treasurer"],
        "notes": "Reserves for Ranji Trophy and domestic tournaments.",
    },
]


SEED_TXNS_TEMPLATE = [
    {"date": "2025-09-01", "txn_type": "Credit", "amount": 2500000.0, "narration": "BCCI annual grant — Q2 FY 2025-26", "reference": "BCCI/GRANT/2025-Q2", "approved_by": "Hon. Treasurer"},
    {"date": "2025-09-15", "txn_type": "Debit", "amount": 1500000.0, "narration": "Honorarium to district associations — Aug 2025", "reference": "MC-2025-12-RES-2", "approved_by": "Managing Committee"},
    {"date": "2025-09-22", "txn_type": "Credit", "amount": 75000.0, "narration": "Subscription receipts (5 institutional members)", "reference": "FEE-BATCH-2509", "approved_by": "Hon. Treasurer"},
    {"date": "2025-10-05", "txn_type": "Debit", "amount": 380000.0, "narration": "Stadium maintenance — Holkar pitch reconditioning", "reference": "PO-2025-INF-44", "approved_by": "Hon. Secretary"},
    {"date": "2025-10-18", "txn_type": "Debit", "amount": 220000.0, "narration": "Selection committee honoraria — Ranji squad", "reference": "MC-2025-SEL-7", "approved_by": "Hon. Treasurer"},
]


async def seed_bodies():
    """Seed the BCCI → MPCA HQ → 10 Divisions → districts hierarchy."""
    if await db.bodies.count_documents({}) > 0:
        return
    logger.info("Seeding org hierarchy (BCCI, MPCA, 10 divisions, districts)…")

    bodies: List[dict] = [
        # ─── Apex ───
        {"code": "BCCI", "name": "Board of Control for Cricket in India", "body_type": "BCCI",
         "parent_code": None, "state": "All India", "seat": "Mumbai", "founded_year": 1928,
         "annual_grant_inr": 0.0},
        {"code": "MPCA", "name": "Madhya Pradesh Cricket Association",
         "body_type": "State", "parent_code": "BCCI", "seat": "Indore", "founded_year": 1957,
         "annual_grant_inr": 0.0,
         "secretary_name": "Shri Sanjeev Rao", "treasurer_name": "Smt. Meera Verma"},

        # ─── 10 Divisions (per MPCA setup diagram) ───
        # Each Division gets an annual grant of ₹30,000 from MPCA.
        {"code": "DIV-JBP", "name": "Jabalpur Division",      "body_type": "Division", "parent_code": "MPCA", "seat": "Jabalpur",     "annual_grant_inr": 30000.0},
        {"code": "DIV-RWA", "name": "Rewa Division",          "body_type": "Division", "parent_code": "MPCA", "seat": "Rewa",         "annual_grant_inr": 30000.0},
        {"code": "DIV-SHD", "name": "Shahdol Division",       "body_type": "Division", "parent_code": "MPCA", "seat": "Shahdol",      "annual_grant_inr": 30000.0},
        {"code": "DIV-BPL", "name": "Bhopal Division",        "body_type": "Division", "parent_code": "MPCA", "seat": "Bhopal",       "annual_grant_inr": 30000.0},
        {"code": "DIV-NMD", "name": "Narmadapuram Division",  "body_type": "Division", "parent_code": "MPCA", "seat": "Narmadapuram", "annual_grant_inr": 30000.0},
        {"code": "DIV-SAG", "name": "Sagar Division",         "body_type": "Division", "parent_code": "MPCA", "seat": "Sagar",        "annual_grant_inr": 30000.0},
        {"code": "DIV-UJN", "name": "Ujjain Division",        "body_type": "Division", "parent_code": "MPCA", "seat": "Ujjain",       "annual_grant_inr": 30000.0,
         "secretary_name": "Shri Vikram Patil"},
        {"code": "DIV-CHM", "name": "Chambal Division",       "body_type": "Division", "parent_code": "MPCA", "seat": "Morena",       "annual_grant_inr": 30000.0},
        {"code": "DIV-GWL", "name": "Gwalior Division",       "body_type": "Division", "parent_code": "MPCA", "seat": "Gwalior",      "annual_grant_inr": 30000.0},
        {"code": "DIV-IND", "name": "Indore Division",        "body_type": "Division", "parent_code": "MPCA", "seat": "Indore",       "annual_grant_inr": 30000.0,
         "secretary_name": "Shri Vikram Patil"},
    ]

    # ─── Districts (52 total — per MPCA plan v2.0) ───
    # Each district receives ₹1,10,000 annual grant via its parent Division.
    district_map = {
        "DIV-JBP": ["Jabalpur", "Katni", "Narsinghpur", "Chhindwara", "Seoni", "Mandla", "Dindori", "Balaghat"],
        "DIV-RWA": ["Rewa", "Satna", "Sidhi", "Singrauli", "Maihar", "Mauganj"],
        "DIV-SHD": ["Shahdol", "Anuppur", "Umaria"],
        "DIV-BPL": ["Bhopal", "Sehore", "Raisen", "Rajgarh", "Vidisha"],
        "DIV-NMD": ["Narmadapuram", "Harda", "Betul"],
        "DIV-SAG": ["Sagar", "Damoh", "Panna", "Tikamgarh", "Chhatarpur", "Niwari"],
        "DIV-UJN": ["Ujjain", "Dewas", "Shajapur", "Agar Malwa", "Mandsaur", "Neemuch", "Ratlam"],
        "DIV-CHM": ["Morena", "Bhind", "Sheopur"],
        "DIV-GWL": ["Gwalior", "Datia", "Shivpuri", "Guna", "Ashoknagar"],
        "DIV-IND": ["Indore", "Dhar", "Khargone", "Khandwa", "Burhanpur", "Barwani", "Alirajpur", "Jhabua"],
    }

    for div_code, districts in district_map.items():
        for dname in districts:
            # 4-char prefix to avoid collisions like Khargone/Khandwa or Gwalior/Guna
            slug = ''.join(ch for ch in dname.upper() if ch.isalpha())[:4]
            # Special-case Ujjain for the demo persona
            sec_name = "Shri Anil Sharma" if dname == "Ujjain" else None
            bodies.append({
                "code": f"DIST-{slug}-{div_code[-3:]}",
                "name": f"{dname} District Cricket Association",
                "body_type": "District",
                "parent_code": div_code,
                "seat": dname,
                "annual_grant_inr": 110000.0,
                "secretary_name": sec_name,
            })

    for b in bodies:
        body = Body(**b)
        await db.bodies.insert_one(body.model_dump())

    logger.info(f"Seeded {len(bodies)} bodies (BCCI, MPCA, 10 divisions, {sum(len(v) for v in district_map.values())} districts).")


async def migrate_body_ids():
    """Phase III.6 migration: backfill `body_id` = 'MPCA' on every existing record
    that predates the multi-tenant column. Idempotent."""
    collections_to_tag = [
        "members", "disclosures", "meetings", "elections",
        "fee_invoices", "bank_accounts", "bank_txns",
    ]
    total = 0
    for coll in collections_to_tag:
        result = await db[coll].update_many(
            {"body_id": {"$exists": False}},
            {"$set": {"body_id": "MPCA"}},
        )
        if result.modified_count:
            logger.info(f"Migrated {result.modified_count} records in '{coll}' to body_id=MPCA")
            total += result.modified_count
    if total:
        logger.info(f"Phase III.6 migration: tagged {total} legacy records with body_id=MPCA")


async def seed_claims():
    """Seed a realistic Phase III.6 demo of the grant workflow lifecycle."""
    if await db.claims.count_documents({}) > 0:
        return
    logger.info("Seeding sample grant claims across the workflow…")

    # Pull a few real district / division codes
    ujjain = await db.bodies.find_one({"code": "DIST-UJJA-UJN"}, {"_id": 0})
    indore_dist = await db.bodies.find_one({"code": "DIST-INDO-IND"}, {"_id": 0})
    jabalpur_dist = await db.bodies.find_one({"code": "DIST-JABA-JBP"}, {"_id": 0})

    samples = []

    # 1) Draft claim — Ujjain District, in progress (no submission yet)
    if ujjain:
        samples.append({
            "claim": ClaimBase(
                body_id="DIST-UJJA-UJN",
                title="U-15 Inter-District League — Travel & Boarding",
                description="3-night travel for the U-15 squad to the SM Khan zonal qualifier at Indore.",
                category="Tournament_Expense",
                amount_inr=87500.0,
                fiscal_cycle="2025-26",
            ),
            "stages": [],
            "status": "Draft",
            "creator": "Shri Anil Sharma",
        })

    # 2) Submitted claim — Indore District → Indore Division (awaiting recommendation)
    if indore_dist:
        samples.append({
            "claim": ClaimBase(
                body_id="DIST-INDO-IND",
                title="Annual District Grant 2025-26",
                description="Statutory annual district grant per MPCA constitution Art. 28(v).",
                category="Annual_Grant",
                amount_inr=110000.0,
                fiscal_cycle="2025-26",
            ),
            "stages": [
                ("Submitted", "Hon. Secretary", "Shri Rakesh Singh", "DIST-INDO-IND",
                 "Submitted", "Quarter-1 receipts attached, audited."),
            ],
            "status": "Submitted",
            "creator": "Shri Rakesh Singh",
        })

    # 3) Division_Recommended claim — Jabalpur District → MPCA queue
    if jabalpur_dist:
        samples.append({
            "claim": ClaimBase(
                body_id="DIST-JABA-JBP",
                title="Ranital Stadium — Pitch Roller Procurement",
                description="One heavy-duty pitch roller for Ranital stadium pre-season prep.",
                category="Infrastructure",
                amount_inr=425000.0,
                fiscal_cycle="2025-26",
            ),
            "stages": [
                ("Submitted", "Hon. Secretary", "Shri Anand Pandey", "DIST-JABA-JBP",
                 "Submitted", "Three quotations attached as per procurement protocol."),
                ("Division_Recommended", "Hon. Secretary", "Shri Devendra Tiwari", "DIV-JBP",
                 "Recommended", "Recommended; lowest L1 quote highlighted. Onward to MPCA."),
            ],
            "status": "Division_Recommended",
            "creator": "Shri Anand Pandey",
        })

    # 4) MPCA_Sanctioned + Disbursed example — historical Sehore District grant
    samples.append({
        "claim": ClaimBase(
            body_id="DIST-SEHO-BPL",
            title="Sehore District — Honorarium to local umpire panel",
            description="Honoraria to the 12-member panel for the inter-school tournament Aug 2025.",
            category="Honorarium",
            amount_inr=72000.0,
            fiscal_cycle="2025-26",
        ),
        "stages": [
            ("Submitted", "Hon. Secretary", "Shri Ramesh Yadav", "DIST-SEHO-BPL",
             "Submitted", "12 umpires × ₹6,000."),
            ("Division_Recommended", "Hon. Secretary", "Shri Praveen Mishra", "DIV-BPL",
             "Recommended", "List vetted; recommended in full."),
            ("MPCA_Sanctioned", "Hon. Treasurer", "Smt. Meera Verma", "MPCA",
             "Sanctioned", "Sanctioned per MC Resolution 2025-09-RES-3."),
            ("Disbursed", "Hon. Treasurer", "Smt. Meera Verma", "MPCA",
             "Disbursed", "NEFT released; ref MPCA/2025-26/HON/0044."),
        ],
        "status": "Disbursed",
        "creator": "Shri Ramesh Yadav",
    })

    cycle_counter: dict = {}
    for s in samples:
        cycle = s["claim"].fiscal_cycle
        cycle_counter[cycle] = cycle_counter.get(cycle, 0) + 1
        claim_no = f"CLM-{cycle}-{cycle_counter[cycle]:03d}"
        parent = await _resolve_parent_body(s["claim"].body_id)
        chain: List[dict] = []
        for stage, post, name, body_id, decision, notes in s["stages"]:
            chain.append(ApprovalStep(
                stage=stage, actor_post=post, actor_name=name, actor_body_id=body_id,
                decision=decision, notes=notes,
            ).model_dump())
        # When status is Division_Recommended or MPCA-stage, parent should be MPCA
        if s["status"] in ("Division_Recommended", "MPCA_Sanctioned", "Disbursed"):
            parent_for_inbox = "MPCA"
        else:
            parent_for_inbox = parent
        claim = Claim(
            claim_no=claim_no,
            status=s["status"],
            approval_chain=[ApprovalStep(**c) for c in chain],
            parent_body_id=parent_for_inbox,
            created_by=s["creator"],
            **s["claim"].model_dump(),
        )
        await db.claims.insert_one(claim.model_dump())
    logger.info(f"Seeded {len(samples)} sample claims.")


async def seed_procurement():
    """Phase III.8 — seed a few demo procurement requests."""
    if await db.procurement_requests.count_documents({}) > 0:
        return
    logger.info("Seeding sample procurement requests…")

    samples = [
        # Small Direct procurement at MPCA HQ
        {
            "body_id": "MPCA",
            "title": "Office stationery — Q3 replenishment",
            "description": "Routine stationery supplies for MPCA HQ administrative office.",
            "estimated_amount_inr": 35_000,
            "quotations": [
                Quotation(vendor_name="Indore Stationers", quote_amount_inr=33_400, quote_date="2025-09-15"),
            ],
            "awarded_vendor": "Indore Stationers",
            "awarded_amount_inr": 33_400,
            "security_deposit_inr": 0,
            "status": "Awarded",
        },
        # Three-Quote at Jabalpur Division — Pitch Roller (will tie to CLM-003)
        {
            "body_id": "DIST-JABA-JBP",
            "title": "Ranital Stadium — Pitch Roller procurement",
            "description": "Heavy-duty pitch roller, 1.2T, with 12-month warranty.",
            "estimated_amount_inr": 450_000,
            "quotations": [
                Quotation(vendor_name="GroundCraft India Pvt Ltd", vendor_gstin="23AABCG1234C1Z5", quote_amount_inr=425_000, quote_date="2025-08-20"),
                Quotation(vendor_name="Bhopal Sports Engg.",       vendor_gstin="23AABCB7890D1Z9", quote_amount_inr=448_000, quote_date="2025-08-21"),
                Quotation(vendor_name="Pune Maidan Works",          vendor_gstin="27AAACP1212F1Z3", quote_amount_inr=462_500, quote_date="2025-08-22"),
            ],
            "awarded_vendor": "GroundCraft India Pvt Ltd",
            "awarded_amount_inr": 425_000,
            "security_deposit_inr": 21_250,
            "emd_inr": 10_000,
            "status": "Awarded",
        },
        # Draft, no quotes yet — Sehore District equipment
        {
            "body_id": "DIST-SEHO-BPL",
            "title": "Sehore Cricket Kit Refresh",
            "description": "Bats, balls, helmets and pads for the U-15 squad.",
            "estimated_amount_inr": 140_000,
            "quotations": [],
            "status": "Draft",
        },
    ]

    for s in samples:
        method = _procurement_method_for(s["estimated_amount_inr"])
        pr_no = await _next_pr_no("2025-26")
        # Avoid passing keys to ProcurementRequest that conflict with constructor positionals
        pr = ProcurementRequest(
            pr_no=pr_no,
            method=method,
            **{k: v for k, v in s.items() if k != "method"},
        )
        await db.procurement_requests.insert_one(pr.model_dump())

    logger.info(f"Seeded {len(samples)} procurement requests.")


async def seed_players():
    """Phase IV — seed a small bench of demo players across multiple districts."""
    if await db.players.count_documents({}) > 0:
        return
    logger.info("Seeding sample players…")

    samples = [
        # Local MP — Indore District
        {
            "body_id": "DIST-INDO-IND",
            "full_name": "Aarav Sharma",
            "father_name": "Shri Manish Sharma",
            "date_of_birth": "2002-07-14",
            "place_of_birth": "Indore",
            "address_district": "Indore",
            "category": "Local_MP",
            "role": "Batter",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Off_Spin",
            "contact_phone": "+91-9425500011",
            "status": "Active",
        },
        # Local MP — Bhopal District, all-rounder
        {
            "body_id": "DIST-BHOP-BPL",
            "full_name": "Ishaan Khan",
            "father_name": "Shri Imran Khan",
            "date_of_birth": "2001-03-22",
            "place_of_birth": "Bhopal",
            "address_district": "Bhopal",
            "category": "Local_MP",
            "role": "All_Rounder",
            "batting_style": "Left_Hand",
            "bowling_style": "Left_Arm_Orthodox",
            "contact_phone": "+91-9425500022",
            "status": "Active",
        },
        # Local MP — U-19 wicket-keeper at Jabalpur
        {
            "body_id": "DIST-JABA-JBP",
            "full_name": "Devansh Pandey",
            "father_name": "Shri Anand Pandey",
            "date_of_birth": "2008-11-09",
            "place_of_birth": "Jabalpur",
            "address_district": "Jabalpur",
            "category": "Local_MP",
            "role": "Wicket_Keeper",
            "batting_style": "Right_Hand",
            "contact_phone": "+91-9425500033",
            "guardian_name": "Shri Anand Pandey",
            "guardian_phone": "+91-9425500033",
            "status": "Active",
        },
        # Born Outside — moved to Ujjain 5 years ago
        {
            "body_id": "DIST-UJJA-UJN",
            "full_name": "Karan Kapoor",
            "father_name": "Shri Sushil Kapoor",
            "date_of_birth": "1998-05-17",
            "place_of_birth": "Lucknow, UP",
            "address_district": "Ujjain",
            "category": "Born_Outside",
            "role": "Bowler",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Fast",
            "contact_phone": "+91-9425500044",
            "status": "Active",
        },
        # Guest — TW3 verified, registered at Indore
        {
            "body_id": "DIST-INDO-IND",
            "full_name": "Yuvraj Mehta",
            "father_name": "Shri Bharat Mehta",
            "date_of_birth": "2003-01-30",
            "place_of_birth": "Surat, Gujarat",
            "address_district": "Indore",
            "category": "Guest",
            "role": "Batter",
            "batting_style": "Left_Hand",
            "bowling_style": "None",
            "contact_phone": "+91-9425500055",
            "tw3_verified": True,
            "status": "Active",
        },
        # Pending — Sehore U-15
        {
            "body_id": "DIST-SEHO-BPL",
            "full_name": "Rishi Yadav",
            "father_name": "Shri Ramesh Yadav",
            "date_of_birth": "2010-08-12",
            "place_of_birth": "Sehore",
            "address_district": "Sehore",
            "category": "Local_MP",
            "role": "All_Rounder",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Leg_Spin",
            "guardian_name": "Shri Ramesh Yadav",
            "guardian_phone": "+91-9425500066",
            "status": "Pending",
        },
        # Suspended example — 2-year ban
        {
            "body_id": "DIST-GWAL-GWL",
            "full_name": "Sahil Verma",
            "father_name": "Shri Mukesh Verma",
            "date_of_birth": "1999-09-04",
            "address_district": "Gwalior",
            "category": "Local_MP",
            "role": "Bowler",
            "batting_style": "Right_Hand",
            "bowling_style": "Right_Arm_Medium",
            "contact_phone": "+91-9425500077",
            "status": "Suspended",
            "disqualifications": [DisqualificationFlag(
                kind="Two_Year_Ban",
                reason="Age misrepresentation in U-19 selection trials, Aug 2024.",
                imposed_by="MPCA",
                imposed_on="2024-09-12",
                expires_on="2026-09-11",
            ).model_dump()],
        },
    ]

    serial = 0
    year = datetime.now(timezone.utc).year
    for s in samples:
        serial += 1
        pid = f"MPCA/{year}/{serial:06d}"
        # run validator to populate notes
        try:
            _ok, notes = _validate_eligibility(PlayerCreate(**{k: v for k, v in s.items() if k not in ("status", "disqualifications")}))
        except Exception:
            notes = []
        player = Player(
            player_id=pid,
            eligibility_notes=notes,
            **s,
        )
        await db.players.insert_one(player.model_dump())

    logger.info(f"Seeded {len(samples)} players.")


async def seed_tournaments():
    """Phase IV.2 + M2-A — seed the MPCA-approved tournament catalogue per user screenshot.
    Additive: preserves existing tournaments; inserts any missing entries by short_name.
    """
    logger.info("Seeding MPCA tournament catalogue (additive)…")

    # ─── M2-A · MPCA Inter-Divisional (9 men's + 1 women's + 2 girls trophies within JS Anand) ───
    # (name, short, format, scope, age_cap, age_floor, allows_guests, is_womens, start, end, tournament_type)
    inter_divisional = [
        ("MY Memorial Trophy",              "MYMT",  "Multi_Day", "Inter_Divisional", None, None, False, False, "2025-11-10", "2025-11-28"),   # Sr Men Multi-Day
        ("Madhavrao Scindia Trophy",        "MSchT", "One_Day",   "Inter_Divisional", None, None, False, False, "2025-12-05", "2025-12-15"),   # Sr 50-over
        ("JN Bhaya Trophy",                 "JNBT",  "T20",       "Inter_Divisional", None, None, False, False, "2025-10-01", "2025-10-12"),   # Sr T20
        ("Parmanandbhai Patel Trophy",      "PPT",   "One_Day",   "Inter_Divisional", 22,   None, False, False, "2025-09-20", "2025-09-30"),   # U-22
        ("Hiralal Gaekwad Trophy",          "HGT",   "Multi_Day", "Inter_Divisional", 18,   None, False, False, "2025-09-05", "2025-09-18"),   # U-18 Multi-Day
        ("SM Khan Trophy",                  "SMKT",  "One_Day",   "Inter_Divisional", 18,   None, False, False, "2025-08-22", "2025-09-02"),   # U-18 Ltd
        ("MM Jagdale Trophy",               "MMJT",  "One_Day",   "Inter_Divisional", 15,   None, False, False, "2025-08-10", "2025-08-18"),   # U-15
        ("AW Kanmadikar Trophy",            "AWKT",  "One_Day",   "Inter_Divisional", 13,   None, False, False, "2025-07-25", "2025-08-05"),   # U-13
        ("JS Anand Trophy · Women's Senior","JSAT-W","One_Day",   "Inter_Divisional", None, None, False, True,  "2025-12-20", "2025-12-28"),
        ("JS Anand Trophy · Girls U-18",    "JSAT-G18","One_Day", "Inter_Divisional", 18,   None, False, True,  "2025-12-05", "2025-12-14"),
        ("JS Anand Trophy · Girls U-15",    "JSAT-G15","One_Day", "Inter_Divisional", 15,   None, False, True,  "2025-11-20", "2025-11-30"),
    ]

    # ─── M2-A · Championship Trophies (Winner + Rest of MP A + B, 3-team format) ───
    championships = [
        ("CT Sarwate Trophy",         "CTS",  "Multi_Day", "Championship", None, None, "CT Sarwate",         "Senior · Winner + Rest of MP A + B"),
        ("CS Nayudu Trophy",          "CSN",  "Multi_Day", "Championship", 22,   None, "CS Nayudu",          "U-22 · Winner + Rest of MP A + B"),
        ("Bhausaheb Nimbalkar Trophy","BSN",  "Multi_Day", "Championship", 18,   None, "Bhausaheb Nimbalkar", "U-18 · Winner + Rest of MP A + B"),
        ("Bhau Niwsarkar Trophy",     "BNW",  "One_Day",   "Championship", 15,   None, "Bhau Niwsarkar",     "U-15 · Winner + Rest of MP A + B"),
        ("RP Singh Trophy",           "RPS",  "One_Day",   "Championship", 14,   None, "RP Singh",           "U-14 · Winner + Rest of MP A + B"),
    ]

    # ─── BCCI Tournaments (with age auto-mapping) ───
    bcci = [
        ("BCCI Ranji Trophy",              "RANJI",  "Multi_Day", "Invitational", None, None, False, False, "2025-11-01", "2026-03-15"),
        ("BCCI Vijay Hazare Trophy",       "VHT",    "One_Day",   "Invitational", None, None, False, False, "2025-12-01", "2025-12-30"),
        ("BCCI Syed Mushtaq Ali Trophy",   "SMAT",   "T20",       "Invitational", None, None, False, False, "2025-11-15", "2025-12-05"),
        ("BCCI U-23 CK Nayudu Trophy",     "U23CKN", "Multi_Day", "Invitational", 23,   None, False, False, "2025-11-20", "2026-01-15"),
        ("BCCI U-19 Cooch Behar Trophy",   "U19CBT", "Multi_Day", "Invitational", 19,   None, False, False, "2025-11-25", "2026-01-25"),
        ("BCCI U-16 Vijay Merchant Trophy","U16VMT", "Multi_Day", "Invitational", 16,   None, False, False, "2025-10-20", "2025-12-15"),
        ("BCCI U-14 Youth Trophy",         "U14YT",  "One_Day",   "Invitational", 14,   None, False, False, "2025-09-15", "2025-10-30"),
    ]

    serial = await db.tournaments.count_documents({})
    inserted = 0
    for name, short, fmt, scope, ac, af, ag, iw, start, end in inter_divisional:
        if await db.tournaments.find_one({"short_name": short}):
            continue
        serial += 1
        t = Tournament(
            tournament_no=f"TRN-2025-26-{serial:03d}",
            name=name, short_name=short, format=fmt, scope=scope,
            tournament_type="MPCA_InterDivisional",
            fiscal_cycle="2025-26", host_body_id="MPCA",
            age_cap_years=ac, age_floor_years=af, allows_guests=ag, is_womens=iw,
            max_squad_size=18, start_date=start, end_date=end,
            status="Upcoming",
            venue="Multiple divisional venues",
        )
        await db.tournaments.insert_one(t.model_dump())
        inserted += 1

    for name, short, fmt, scope, ac, af, trophy_name, notes in championships:
        if await db.tournaments.find_one({"short_name": short}):
            continue
        serial += 1
        t = Tournament(
            tournament_no=f"TRN-2025-26-{serial:03d}",
            name=name, short_name=short, format=fmt, scope=scope,
            tournament_type="MPCA_Championship",
            trophy_name=trophy_name, is_three_team_format=True,
            fiscal_cycle="2025-26", host_body_id="MPCA",
            age_cap_years=ac, age_floor_years=af, allows_guests=False,
            max_squad_size=18, status="Upcoming",
            venue="Holkar Stadium, Indore", notes=notes,
        )
        await db.tournaments.insert_one(t.model_dump())
        inserted += 1

    for name, short, fmt, scope, ac, af, ag, iw, start, end in bcci:
        if await db.tournaments.find_one({"short_name": short}):
            continue
        serial += 1
        t = Tournament(
            tournament_no=f"TRN-2025-26-{serial:03d}",
            name=name, short_name=short, format=fmt, scope=scope,
            tournament_type="BCCI",
            fiscal_cycle="2025-26", host_body_id="BCCI",
            age_cap_years=ac, age_floor_years=af, allows_guests=ag, is_womens=iw,
            max_squad_size=18, start_date=start, end_date=end,
            status="Upcoming",
        )
        await db.tournaments.insert_one(t.model_dump())
        inserted += 1

    # Backfill tournament_type on legacy records that don't have it (they default to MPCA_InterDivisional)
    await db.tournaments.update_many(
        {"tournament_type": {"$exists": False}},
        {"$set": {"tournament_type": "MPCA_InterDivisional"}},
    )

    logger.info(f"Tournament catalogue: +{inserted} inserted, total {await db.tournaments.count_documents({})}.")


async def seed_data():
    await seed_bodies()
    await migrate_body_ids()
    # One-shot migration: refresh MPCA HQ office-bearers & founding year
    # to reflect the 2025 office-bearers (per official MPCA records).
    await db.bodies.update_one(
        {"code": "MPCA"},
        {"$set": {
            "founded_year": 1957,
            "secretary_name": "Shri Sanjeev Rao",
            "treasurer_name": "Smt. Meera Verma",
        }},
    )
    # Refresh chairperson on seeded meetings (idempotent).
    await db.meetings.update_many(
        {"chairperson": "Shri Abhilash Khandekar"},
        {"$set": {"chairperson": "Shri Mahanaryaman Scindia"}},
    )
    await seed_claims()
    await seed_procurement()
    await seed_players()
    await seed_tournaments()
    if await db.members.count_documents({}) == 0:
        logger.info("Seeding members…")
        for m in SEED_MEMBERS:
            uid = await next_uid(m["category"])
            member = Member(uid=uid, **m)
            await db.members.insert_one(member.model_dump())
    if await db.disclosures.count_documents({}) == 0:
        logger.info("Seeding disclosures…")
        for d in SEED_DISCLOSURES:
            doc = Disclosure(**d)
            await db.disclosures.insert_one(doc.model_dump())
    if await db.meetings.count_documents({}) == 0:
        logger.info("Seeding meetings…")
        for m in SEED_MEETINGS:
            count = await db.meetings.count_documents({"meeting_type": m["meeting_type"]})
            meeting = Meeting(meeting_no=_next_meeting_no(m["meeting_type"], count), **m)
            await db.meetings.insert_one(meeting.model_dump())
    if await db.elections.count_documents({}) == 0:
        logger.info("Seeding elections…")
        eligible = await db.members.count_documents({"status": "Active"})
        for e in SEED_ELECTIONS:
            data = dict(e)
            data["eligible_voters_count"] = eligible
            elec = Election(**data)
            await db.elections.insert_one(elec.model_dump())
            # Seed two candidates for the open election
            for cand_uid in ["MPCA-IND-0001", "MPCA-IND-0002"]:
                m = await db.members.find_one({"uid": cand_uid}, {"_id": 0})
                if m:
                    c = Candidate(
                        election_id=elec.id,
                        member_uid=m["uid"],
                        member_name=m["name"],
                        manifesto="Pledged to strengthen the financial discipline and transparent disclosures of the Association.",
                        status="Accepted",
                    )
                    await db.candidates.insert_one(c.model_dump())
    if await db.bank_accounts.count_documents({}) == 0:
        logger.info("Seeding bank accounts & transactions…")
        for a in SEED_BANK_ACCOUNTS:
            acct = BankAccount(**a)
            await db.bank_accounts.insert_one(acct.model_dump())
            # Apply sample transactions only to the General Account
            if "General" in a["name"]:
                running = acct.opening_balance
                for t in SEED_TXNS_TEMPLATE:
                    delta = t["amount"] if t["txn_type"] == "Credit" else -t["amount"]
                    running = round(running + delta, 2)
                    txn = BankTransaction(account_id=acct.id, balance_after=running, **t)
                    await db.bank_txns.insert_one(txn.model_dump())
                await db.bank_accounts.update_one({"id": acct.id}, {"$set": {"current_balance": running}})
    if await db.fee_invoices.count_documents({}) == 0:
        logger.info("Seeding fee invoices for cycle 2025-26…")
        active = await db.members.find({"status": "Active", "category": {"$in": ["Individual", "Institutional"]}}, {"_id": 0}).to_list(2000)
        for m in active:
            amt = 15000.0 if m["category"] == "Institutional" else 3000.0
            invoice_no = await _next_invoice_no()
            # First invoice for each — mark a couple as Paid for realistic dashboard
            already_paid = m["uid"] in ("MPCA-IND-0001", "MPCA-INS-0002")
            inv = FeeInvoice(
                invoice_no=invoice_no,
                member_uid=m["uid"],
                member_name=m["name"],
                cycle="2025-26",
                description="Subscription · 2025-26",
                amount=amt,
                due_date="2025-12-31",
                status="Paid" if already_paid else "Pending",
                paid_date="2025-09-12" if already_paid else None,
                payment_ref=f"NEFT-2025-{m['uid'][-4:]}" if already_paid else None,
            )
            await db.fee_invoices.insert_one(inv.model_dump())
    await seed_vendors()
    await seed_tournament_budgets()
    await seed_venues_grounds()
    await seed_selection_funnels()


SEED_VENDORS = [
    {"name": "Hotel Surya Indore", "category": "Hotel", "gstin": "23AABCS1234A1Z5",
     "contact_name": "Ramesh Khanna", "contact_phone": "+91 731 425 6789",
     "address_line": "5/2 Race Course Road", "city": "Indore", "pincode": "452003",
     "bank_account_no": "30258974321", "bank_ifsc": "HDFC0001284"},
    {"name": "ITC Welcomhotel Bhopal", "category": "Hotel", "gstin": "23AAACI1234B1Z2",
     "contact_name": "Sunita Mehra", "contact_phone": "+91 755 661 7777",
     "address_line": "Shyamla Hills", "city": "Bhopal", "pincode": "462013"},
    {"name": "Madhya Pradesh Tourism Travels", "category": "Travel", "gstin": "23AAALM1234C1Z9",
     "contact_name": "Anil Sharma", "contact_phone": "+91 755 277 8888",
     "address_line": "MPSTDC Building, Paryatan Bhavan", "city": "Bhopal", "pincode": "462011"},
    {"name": "SG Cricket Equipment Pvt Ltd", "category": "Material", "gstin": "07AABCS5555M1ZP",
     "contact_name": "Vivek Kohli", "contact_phone": "+91 11 6699 4400",
     "address_line": "Sanspareils Greenlands, Meerut Road", "city": "Meerut", "state": "Uttar Pradesh", "pincode": "250002"},
    {"name": "Sundaram Stadium Maintenance", "category": "Infra", "gstin": "23AAACS9999I1Z1",
     "contact_name": "Suresh Iyer", "contact_phone": "+91 731 234 7777",
     "address_line": "Holkar Stadium Annexe", "city": "Indore", "pincode": "452001"},
    {"name": "Saanvi Caterers", "category": "Catering", "gstin": "23AAACK7777C1Z3",
     "contact_name": "Manisha Joshi", "contact_phone": "+91 99818 12345",
     "address_line": "12, Vijay Nagar", "city": "Indore", "pincode": "452010"},
    {"name": "Tarun Printers & Publishers", "category": "Printing", "gstin": "23AAATP3333P1Z6",
     "contact_name": "Tarun Bansal", "contact_phone": "+91 731 511 6789",
     "address_line": "Press Complex, Press Colony", "city": "Indore", "pincode": "452007"},
    {"name": "Quick Couriers India", "category": "Services", "gstin": "23AAQCI4444S1Z0",
     "contact_name": "Front Desk", "contact_phone": "+91 731 408 0000",
     "address_line": "Old Palasia", "city": "Indore", "pincode": "452018",
     "is_blacklisted": True,
     "blacklist_reason": "Repeated mis-delivery of tournament documents (Aug 2025)."},
]


SEED_VENDOR_BILLS = [
    {"vendor_match": "Hotel Surya Indore", "category": "Hotel",
     "bill_no_external": "INV/HSI/2025/0182", "bill_date": "2025-10-14",
     "description": "Team accommodation · MY Memorial Trophy U-19 (15 rooms × 3 nights)",
     "base_amount_inr": 318600.0, "gst_inr": 38232.0, "total_amount_inr": 356832.0, "status": "Paid"},
    {"vendor_match": "Madhya Pradesh Tourism Travels", "category": "Travel",
     "bill_no_external": "MPT/24/9911", "bill_date": "2025-11-02",
     "description": "Coach booking 35-seater · Indore → Bhilai → return (Ranji squad)",
     "base_amount_inr": 84000.0, "gst_inr": 10080.0, "total_amount_inr": 94080.0, "status": "Sanctioned"},
    {"vendor_match": "SG Cricket Equipment Pvt Ltd", "category": "Material",
     "bill_no_external": "SG/INV/2025/4421", "bill_date": "2025-10-28",
     "description": "12 × SG Sunny Tonny English Willow bats + 8 sets of pads",
     "base_amount_inr": 142000.0, "gst_inr": 25560.0, "total_amount_inr": 167560.0, "status": "Verified"},
    {"vendor_match": "Sundaram Stadium Maintenance", "category": "Infra",
     "bill_no_external": "SSM/2025/INV/77", "bill_date": "2025-11-08",
     "description": "Pitch re-conditioning · Square + 2 turf practice strips",
     "base_amount_inr": 285000.0, "gst_inr": 51300.0, "total_amount_inr": 336300.0, "status": "Submitted"},
    {"vendor_match": "Saanvi Caterers", "category": "Catering",
     "bill_no_external": "SC/B/2811", "bill_date": "2025-11-11",
     "description": "Lunch + tea for selectors meeting (28 head-count)",
     "base_amount_inr": 12500.0, "gst_inr": 625.0, "total_amount_inr": 13125.0, "status": "Draft"},
]


async def seed_vendors():
    """Seed vendor master + representative bills across all statuses."""
    if await db.vendors.count_documents({}) > 0:
        return
    logger.info("Seeding vendor master + bills…")
    from models import Vendor, VendorBill
    year = datetime.now(timezone.utc).year
    by_name = {}
    for i, v in enumerate(SEED_VENDORS, start=1):
        vendor_no = f"VEND-{year}-{i:04d}"
        vendor = Vendor(vendor_no=vendor_no, **v)
        await db.vendors.insert_one(vendor.model_dump())
        by_name[v["name"]] = vendor

    chain_for_status = {
        "Draft": [],
        "Submitted": ["Submitted"],
        "Verified": ["Submitted", "Verified"],
        "Sanctioned": ["Submitted", "Verified", "Sanctioned"],
        "Paid": ["Submitted", "Verified", "Sanctioned", "Paid"],
    }
    actor_map = {
        "Submitted": ("Hon. Secretary", "Shri Sanjeev Rao", "Recommended"),
        "Verified": ("Accounts Officer", "Shri Ashok Khare", "Recommended"),
        "Sanctioned": ("Hon. Treasurer", "Smt. Meera Verma", "Sanctioned"),
        "Paid": ("Hon. Treasurer", "Smt. Meera Verma", "Disbursed"),
    }
    for i, b in enumerate(SEED_VENDOR_BILLS, start=1):
        vendor = by_name.get(b["vendor_match"])
        if not vendor:
            continue
        bill_no = f"VB-2025-26-{i:03d}"
        chain = []
        for stage in chain_for_status[b["status"]]:
            post, name, decision = actor_map[stage]
            chain.append(ApprovalStep(
                stage=stage, actor_post=post, actor_name=name,
                actor_body_id="MPCA", decision=decision,
                notes=f"{stage} via seeded workflow.",
            ).model_dump())
        bill = VendorBill(
            bill_no=bill_no,
            body_id="MPCA",
            vendor_id=vendor.id,
            vendor_name=vendor.name,
            category=b["category"],
            fiscal_cycle="2025-26",
            bill_no_external=b["bill_no_external"],
            bill_date=b["bill_date"],
            description=b["description"],
            base_amount_inr=b["base_amount_inr"],
            gst_inr=b["gst_inr"],
            total_amount_inr=b["total_amount_inr"],
            status=b["status"],
            approval_chain=chain,
            created_by="Shri Sanjeev Rao",
        )
        await db.vendor_bills.insert_one(bill.model_dump())




async def seed_tournament_budgets():
    """Seed 4 representative tournament budgets covering Draft / Submitted / Approved / Returned."""
    if await db.tournament_budgets.count_documents({}) > 0:
        return
    logger.info("Seeding tournament budgets…")
    from models import TournamentBudget, BudgetHeadAllocation, VariableBudgetItem

    # Pick 2 tournaments from existing seed
    tournaments = await db.tournaments.find({}, {"_id": 0}).sort("created_at", 1).to_list(4)
    if not tournaments:
        return

    # Map of (tournament_idx, body_code, body_name, status) → budget shape
    samples = [
        # 1. Approved — Indore Division for the first tournament
        {
            "tournament": tournaments[0],
            "body_code": "DIV-IND",
            "body_name": "Indore Division",
            "total": 850000.0,
            "heads": [
                ("Travel", 150000), ("Hotel", 220000), ("TA_DA", 90000),
                ("Match_Officials", 180000), ("Equipment", 120000),
                ("Road_BLP_Lunch_Rain", 50000), ("Ground_Expenses", 30000),
                ("Miscellaneous", 10000),
            ],
            "approved_total": 800000.0,
            "approved_heads": [
                ("Travel", 140000), ("Hotel", 210000), ("TA_DA", 90000),
                ("Match_Officials", 180000), ("Equipment", 110000),
                ("Road_BLP_Lunch_Rain", 45000), ("Ground_Expenses", 20000),
                ("Miscellaneous", 5000),
            ],
            "variables": [
                {"description": "Replacement umpire insurance (last-minute)", "amount": 18000, "head": "Match_Officials", "status": "Approved"},
                {"description": "Extra physio for U-19 day-1 injury", "amount": 12000, "head": "Miscellaneous", "status": "Pending"},
            ],
            "status": "Approved",
            "notes": "Pilot Auto Budget for MY Memorial Trophy — Indore Division.",
        },
        # 2. Submitted — Bhopal Division for the second tournament
        {
            "tournament": tournaments[1] if len(tournaments) > 1 else tournaments[0],
            "body_code": "DIV-BPL",
            "body_name": "Bhopal Division",
            "total": 620000.0,
            "heads": [
                ("Travel", 110000), ("Hotel", 170000), ("TA_DA", 70000),
                ("Match_Officials", 130000), ("Equipment", 95000),
                ("Road_BLP_Lunch_Rain", 30000), ("Ground_Expenses", 10000),
                ("Miscellaneous", 5000),
            ],
            "variables": [
                {"description": "Pitch covers hire (rain forecast)", "amount": 22000, "head": "Ground_Expenses", "status": "Pending"},
            ],
            "status": "Submitted",
            "notes": "Senior inter-divisional fixtures — Bhopal Division proposal.",
        },
        # 3. Returned — Jabalpur Division (over-allocated heads scenario)
        {
            "tournament": tournaments[2] if len(tournaments) > 2 else tournaments[0],
            "body_code": "DIV-JBP",
            "body_name": "Jabalpur Division",
            "total": 480000.0,
            "heads": [
                ("Travel", 90000), ("Hotel", 130000), ("TA_DA", 60000),
                ("Match_Officials", 110000), ("Equipment", 60000),
                ("Road_BLP_Lunch_Rain", 20000), ("Ground_Expenses", 8000),
                ("Miscellaneous", 2000),
            ],
            "variables": [],
            "status": "Returned",
            "notes": "Ranji Trophy training-camp tournament.",
            "return_reason_code": "DOCS_MISSING",
            "return_reason_detail": "Please attach the venue rate-card and the scheme reference document.",
        },
        # 4. Draft — Gwalior Division
        {
            "tournament": tournaments[3] if len(tournaments) > 3 else tournaments[0],
            "body_code": "DIV-GWL",
            "body_name": "Gwalior Division",
            "total": 360000.0,
            "heads": [
                ("Travel", 60000), ("Hotel", 100000), ("TA_DA", 50000),
                ("Match_Officials", 85000), ("Equipment", 45000),
                ("Road_BLP_Lunch_Rain", 15000), ("Ground_Expenses", 5000),
            ],
            "variables": [],
            "status": "Draft",
            "notes": "Gwalior U-16 League — draft pending Division Sec review.",
        },
    ]

    actor_map = {
        "Submitted": ("Division Secretary", "Recommended"),
        "Approved": ("Hon. Treasurer", "Sanctioned"),
        "Returned": ("Hon. Treasurer", "Returned"),
        "Rejected": ("Hon. Treasurer", "Rejected"),
    }

    for i, s in enumerate(samples, start=1):
        budget_no = f"TB-2025-26-{i:03d}"
        heads = [BudgetHeadAllocation(head=h, limit_inr=lim).model_dump() for h, lim in s["heads"]]
        variables = []
        for v in s.get("variables") or []:
            item = VariableBudgetItem(
                description=v["description"],
                proposed_amount_inr=v["amount"],
                head=v.get("head"),
                status=v.get("status", "Pending"),
            )
            it = item.model_dump()
            if v.get("status") == "Approved":
                it["approved_amount_inr"] = v["amount"]
                it["decided_by"] = "Smt. Meera Verma"
                it["decided_at"] = datetime.now(timezone.utc).isoformat()
            variables.append(it)

        chain = []
        if s["status"] in ("Submitted", "Approved", "Returned"):
            chain.append(ApprovalStep(
                stage="Submitted", actor_post="Division Secretary",
                actor_name=f"Division Sec · {s['body_name']}",
                actor_body_id=s["body_code"], decision="Submitted",
                notes="Initial proposal submitted to MPCA.",
            ).model_dump())
        if s["status"] == "Approved":
            chain.append(ApprovalStep(
                stage="Approved", actor_post="Hon. Treasurer",
                actor_name="Smt. Meera Verma", actor_body_id="MPCA",
                decision="Sanctioned",
                notes=f"[Approved ₹{s['approved_total']:,.0f} of ₹{s['total']:,.0f} proposed]",
            ).model_dump())
        if s["status"] == "Returned":
            chain.append(ApprovalStep(
                stage="Returned", actor_post="Hon. Treasurer",
                actor_name="Smt. Meera Verma", actor_body_id="MPCA",
                decision="Returned",
                notes=f"[{s.get('return_reason_code')}] {s.get('return_reason_detail')}",
            ).model_dump())

        approved_heads = []
        if s["status"] == "Approved" and s.get("approved_heads"):
            approved_heads = [BudgetHeadAllocation(head=h, limit_inr=lim).model_dump() for h, lim in s["approved_heads"]]

        budget = TournamentBudget(
            budget_no=budget_no,
            tournament_id=s["tournament"]["id"],
            tournament_name=s["tournament"].get("name"),
            body_id=s["body_code"],
            body_name=s["body_name"],
            fiscal_cycle="2025-26",
            total_ceiling_inr=s["total"],
            head_allocations=heads,
            variable_items=variables,
            status=s["status"],
            approved_total_inr=s.get("approved_total"),
            approved_head_allocations=approved_heads,
            approval_chain=chain,
            return_reason_code=s.get("return_reason_code"),
            return_reason_detail=s.get("return_reason_detail"),
            notes=s.get("notes"),
            created_by=f"Division Sec · {s['body_name']}",
        )


async def seed_venues_grounds():
    """Seed BCCI-categorised venues, grounds, ground staff, and ground expenses.

    Each sub-collection is independently idempotent so partial-seed crashes recover.
    """
    from models import (
        Venue, Ground, GroundStaffMember, GroundExpense,
    )

    if await db.venues.count_documents({}) > 0 and await db.grounds.count_documents({}) > 0 and await db.ground_expenses.count_documents({}) >= 4:
        return
    logger.info("Seeding venues, grounds & expenses…")

    venues_data = [
        {"name": "Holkar Cricket Stadium", "category": "BCCI_International", "body_id": "DIV-IND",
         "city": "Indore", "address_line": "Race Course Road", "pincode": "452003",
         "capacity_seats": 30000, "floodlights": True, "bcci_calendar_eligible": True,
         "notes": "Test/ODI/T20I venue. Renovated 2022."},
        {"name": "Captain Roop Singh Stadium", "category": "BCCI_International", "body_id": "DIV-GWL",
         "city": "Gwalior", "address_line": "Race Course Road, Gwalior", "pincode": "474002",
         "capacity_seats": 45000, "floodlights": True, "bcci_calendar_eligible": True,
         "notes": "Highest ODI score ever scored here (Sehwag-Tendulkar 2010)."},
        {"name": "Aishbagh Stadium", "category": "BCCI_Domestic_A", "body_id": "DIV-BPL",
         "city": "Bhopal", "address_line": "Aishbagh, Bhopal", "pincode": "462001",
         "capacity_seats": 18000, "floodlights": True, "bcci_calendar_eligible": True,
         "notes": "Ranji Trophy host venue."},
        {"name": "MPCA Indore Academy Ground", "category": "MPCA_State", "body_id": "MPCA",
         "city": "Indore", "address_line": "MPCA Sports Complex, Vijay Nagar", "pincode": "452010",
         "capacity_seats": 2000, "floodlights": False, "bcci_calendar_eligible": False},
        {"name": "Jabalpur Division Ground", "category": "Divisional", "body_id": "DIV-JBP",
         "city": "Jabalpur", "address_line": "Wright Town Stadium Road", "pincode": "482001",
         "capacity_seats": 5000, "floodlights": False, "bcci_calendar_eligible": False},
    ]

    venue_records = []
    year = datetime.now(timezone.utc).year
    for i, v in enumerate(venues_data, start=1):
        venue = Venue(venue_no=f"VEN-{year}-{i:03d}", **v)
        await db.venues.insert_one(venue.model_dump())
        venue_records.append(venue)

    # Helper: build grounds + their staff
    def _ground(venue, name, type, pitch, suitable, staff):
        return {"venue": venue, "name": name, "type": type, "pitch_type": pitch,
                "suitable_formats": suitable, "staff": staff}

    grounds_data = [
        _ground(venue_records[0], "Main Ground", "Main", "Red Soil",
                ["FourDay_Senior", "OneDay_Senior", "T20_Senior", "FourDay_U23"],
                [("Ramesh Solanki", "Head Groundsman", 35000),
                 ("Vijay Patil", "Pitch Curator", 28000),
                 ("Ashok Yadav", "Helper", 14000),
                 ("Mohan Verma", "Helper", 14000)]),
        _ground(venue_records[0], "Practice A", "Practice_A", "Red Soil",
                ["OneDay_Senior", "T20_Senior", "FourDay_U23", "OneDay_U23"],
                [("Suresh Bansal", "Junior Curator", 18000),
                 ("Pintu Lal", "Helper", 12000)]),
        _ground(venue_records[0], "Practice B + Nets", "Practice_B", "Turf",
                ["OneDay_U19", "T20_U19", "U16_League"],
                [("Babu Khan", "Net Bowler Coach", 22000)]),
        _ground(venue_records[1], "Main Ground", "Main", "Black Soil",
                ["FourDay_Senior", "OneDay_Senior", "T20_Senior"],
                [("Ravi Tomar", "Head Groundsman", 30000),
                 ("Lakhan Singh", "Pitch Curator", 24000)]),
        _ground(venue_records[2], "Main Ground", "Main", "Red Soil",
                ["FourDay_Senior", "OneDay_Senior", "T20_Senior", "OneDay_Womens"],
                [("Anil Pawar", "Head Groundsman", 28000),
                 ("Pradeep Joshi", "Helper", 13000)]),
        _ground(venue_records[3], "Academy Net Practice", "Net_Practice", "Matting",
                ["OneDay_U19", "T20_U19", "U16_League"],
                [("Coach Sharma", "Head Coach (Ground)", 40000)]),
        _ground(venue_records[4], "Main Field", "Main", "Red Soil",
                ["OneDay_U23", "T20_U23", "U16_League"],
                [("Devraj Singh", "Head Groundsman", 22000)]),
    ]

    ground_records = []
    for i, g in enumerate(grounds_data, start=1):
        staff = [GroundStaffMember(name=n, role=r, monthly_salary_inr=s,
                                    joined_date="2024-04-01").model_dump()
                 for (n, r, s) in g["staff"]]
        venue = g["venue"]
        ground = Ground(
            ground_no=f"GRD-{(venue.city or 'GEN')[:3].upper()}-{i:03d}",
            venue_id=venue.id,
            venue_name=venue.name,
            name=g["name"],
            type=g["type"],
            pitch_type=g["pitch_type"],
            suitable_formats=g["suitable_formats"],
            is_active=True,
            ground_staff=staff,
        )
        await db.grounds.insert_one(ground.model_dump())
        ground_records.append(ground)

    # Seed 4 representative ground expenses across statuses
    expense_samples = [
        {"ground": ground_records[0], "type": "Pitch_Maintenance",
         "date": "2025-10-15", "desc": "Pre-Ranji pitch rolling + rear-cover tarpaulin",
         "amount": 45000, "status": "Paid"},
        {"ground": ground_records[0], "type": "Staff_Salary",
         "date": "2025-10-31", "desc": "October ground-staff payroll (4 heads)",
         "amount": 91000, "status": "Approved"},
        {"ground": ground_records[1], "type": "Equipment_Repair",
         "date": "2025-11-05", "desc": "Practice nets repair + new net cones",
         "amount": 8500, "status": "Submitted"},
        {"ground": ground_records[2], "type": "Water_Electricity",
         "date": "2025-11-10", "desc": "Practice B October utility bill",
         "amount": 12300, "status": "Draft"},
    ]

    actor_map = {
        "Submitted": ("Hon. Secretary", "Shri Sanjeev Rao", "Submitted"),
        "Approved": ("Hon. Treasurer", "Smt. Meera Verma", "Sanctioned"),
        "Paid": ("Hon. Treasurer", "Smt. Meera Verma", "Disbursed"),
    }
    chain_for_status = {
        "Draft": [],
        "Submitted": ["Submitted"],
        "Approved": ["Submitted", "Approved"],
        "Paid": ["Submitted", "Approved", "Paid"],
    }

    for i, ex in enumerate(expense_samples, start=1):
        chain = []
        for stage in chain_for_status[ex["status"]]:
            post, name, decision = actor_map[stage]
            chain.append(ApprovalStep(
                stage=stage, actor_post=post, actor_name=name,
                actor_body_id="MPCA", decision=decision,
                notes=f"{stage} via seeded workflow.",
            ).model_dump())
        ge = GroundExpense(
            expense_no=f"GE-2025-26-{i:03d}",
            ground_id=ex["ground"].id,
            venue_name=ex["ground"].venue_name,
            ground_name=ex["ground"].name,
            body_id="MPCA",
            expense_type=ex["type"],
            expense_date=ex["date"],
            description=ex["desc"],
            amount_inr=ex["amount"],
            status=ex["status"],
            approval_chain=chain,
            created_by="Ground Manager",
        )


async def seed_selection_funnels():
    """Seed:
    - SeasonRegistrations for all existing seeded players in 2025-26 (Approved)
    - 2 selection funnels: a domestic one at Pool(20) stage and an international one at Squad(12) ready for BCCI submission.
    """
    from models import (
        SeasonRegistration, SelectionFunnel, SelectionEntry, STAGE_LIMITS,
    )

    players = await db.players.find({}, {"_id": 0}).to_list(500)
    if not players:
        return

    if await db.season_registrations.count_documents({}) == 0:
        logger.info("Seeding season registrations…")
        for i, p in enumerate(players, start=1):
            reg = SeasonRegistration(
                registration_no=f"SR-2025-26-{p.get('body_id','MPCA')}-{i:05d}",
                player_id=p["id"],
                player_name=p.get("full_name") or p.get("name"),
                season_year="2025-26",
                body_id=p.get("body_id") or "MPCA",
                fees_paid_inr=500.0,
                status="Approved",
            )
            await db.season_registrations.insert_one(reg.model_dump())

    if await db.selection_funnels.count_documents({}) > 0:
        return
    logger.info("Seeding selection funnels…")

    # Helper to derive age from date_of_birth
    from datetime import date as _date
    def _age(dob_str):
        if not dob_str:
            return None
        try:
            d = _date.fromisoformat(dob_str[:10])
            t = _date.today()
            return t.year - d.year - ((t.month, t.day) < (d.month, d.day))
        except Exception:
            return None

    def _snap(p):
        return {
            "name": p.get("full_name") or p.get("name") or "—",
            "age": _age(p.get("date_of_birth")),
            "role": p.get("role"),
        }

    tournaments = await db.tournaments.find({}, {"_id": 0}).sort("created_at", 1).to_list(4)
    if not tournaments:
        return

    # Funnel A — domestic, at Pool stage with 20 players
    pool_players = players[:20]
    pool_entries = [SelectionEntry(
        player_id=p["id"], player_name=_snap(p)["name"],
        age=_snap(p)["age"], role=_snap(p)["role"],
        stage="Pool", added_by="Selection Committee Chair",
    ).model_dump() for p in pool_players]
    long_list_entries = [SelectionEntry(
        player_id=p["id"], player_name=_snap(p)["name"],
        age=_snap(p)["age"], role=_snap(p)["role"],
        stage="LongList", added_by="Selection Committee Chair",
    ).model_dump() for p in players[:min(150, len(players))]]
    short_list_entries = [SelectionEntry(
        player_id=p["id"], player_name=_snap(p)["name"],
        age=_snap(p)["age"], role=_snap(p)["role"],
        stage="ShortList", added_by="Selection Committee Chair",
    ).model_dump() for p in players[:30]]

    funnel_a = SelectionFunnel(
        funnel_no="SF-2025-26-001",
        tournament_id=tournaments[0]["id"],
        tournament_name=tournaments[0].get("name"),
        format=tournaments[0].get("format") or "OneDay_Senior",
        season_year="2025-26",
        is_international=False,
        current_stage="Pool",
        entries=long_list_entries + short_list_entries + pool_entries,
        created_by="Selection Committee Chair",
        notes="Domestic selection — currently shortlisting Pool of 20 from 30.",
    )
    await db.selection_funnels.insert_one(funnel_a.model_dump())

    # Funnel B — international, at Squad stage with 12 players, awaiting Division→MPCA→BCCI flow
    squad_players = players[:12] if len(players) >= 12 else players
    if len(squad_players) == 12 and len(tournaments) > 1:
        squad_entries = [SelectionEntry(
            player_id=p["id"], player_name=p.get("name"),
            age=p.get("age"), role=p.get("role"),
            stage="Squad", added_by="Selection Committee Chair",
        ).model_dump() for p in squad_players]
        prior_intl = [SelectionEntry(
            player_id=p["id"], player_name=p.get("name"),
            age=p.get("age"), role=p.get("role"),
            stage=stg, added_by="Selection Committee Chair",
        ).model_dump() for stg, group in [
            ("LongList", players[:min(150, len(players))]),
            ("ShortList", players[:30]),
            ("Pool", players[:20]),
        ] for p in group]
        funnel_b = SelectionFunnel(
            funnel_no="SF-2025-26-002",
            tournament_id=tournaments[1]["id"],
            tournament_name=tournaments[1].get("name"),
            format=tournaments[1].get("format") or "T20_Senior",
            season_year="2025-26",
            is_international=True,
            division_body_id="DIV-IND",
            current_stage="Squad",
            entries=prior_intl + squad_entries,
            created_by="Selection Committee Chair",
            notes="International tournament — awaiting Division recommendation then MPCA validation before BCCI submission.",
        )
        await db.selection_funnels.insert_one(funnel_b.model_dump())
        await db.ground_expenses.insert_one(ge.model_dump())