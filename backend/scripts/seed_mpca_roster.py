"""Iter 112 · Import MPCA grounds + match officials from the Excel roster.

Data source: /artifacts/vh1iz438_MPCA GROUND, UMPIRE, SCORER LIST.xlsx

The sheet has 37 grounds (Column A) and 82 umpires (Column B) with an
`umpire home division` column (Column C).  Ground division mapping in
the source is unreliable, so we DERIVE it heuristically from the ground
name; anything ambiguous defaults to MPCA (state-owned).
"""
import re

DIVISION_CODE = {
    "INDORE":   "DIV-IND",
    "BHOPAL":   "DIV-BPL",
    "GWALIOR":  "DIV-GWL",
    "UJJAIN":   "DIV-UJN",
    "REWA":     "DIV-RWA",
    "JABALPUR": "DIV-JBP",
    "SAGAR":    "DIV-SAG",
    "SHAHDOL":  "DIV-SHD",
    "CHAMBAL":  "DIV-CHM",
    "N'PURAM":       "DIV-NMD",  # Narmadapuram
    "NARMADAPURAM":  "DIV-NMD",
}


# ── 37 grounds (Column A of the roster) ──────────────────────────────
GROUNDS = [
    ("Holkar Stadium",              "Indore",       "International"),
    ("Emerald School",              "Indore",       "Domestic"),
    ("Daly College - Ground 1",     "Indore",       "Domestic"),
    ("Daly College - Ground 2",     "Indore",       "None"),
    ("SSCC Ground",                 "Indore",       "None"),
    ("RBCF Ground",                 "Indore",       "None"),
    ("Gymkhana Ground",             "Indore",       "None"),
    ("NMIMS Ground",                "Indore",       "None"),
    ("PMCA Ground",                 "Indore",       "None"),
    ("County Club",                 "Indore",       "None"),
    ("Vikram University",           "Ujjain",       "Domestic"),
    ("Ujjain RPF Ground",           "Ujjain",       "None"),
    ("Railway Ground",              "Ratlam",       "None"),
    ("Nutan Cricket Stadium",       "Mandsaur",     "None"),
    ("Faith Cricket Club - Ground 1", "Bhopal",     "Domestic"),
    ("Faith Cricket Club - Ground 2", "Bhopal",     "None"),
    ("Shrewsbury School",           "Bhopal",       "None"),
    ("Old Friend Cricket Academy",  "Bhopal",       "None"),
    ("Bab-e-Ali Cricket Ground",    "Bhopal",       "None"),
    ("Chandu Sarwate Cricket Ground", "Sagar",      "Domestic"),
    ("MPCA Ground Narmadapuram",    "Narmadapuram", "None"),
    ("Gupta Ground",                "Narmadapuram", "None"),
    ("MPCA Ground - Jabalpur 1",    "Jabalpur",     "Domestic"),
    ("MPCA Ground - Jabalpur 2",    "Jabalpur",     "None"),
    ("MPCA Ground Shahdol",         "Shahdol",      "Domestic"),
    ("Mahatma Gandhi Stadium",      "Indore",       "None"),
    ("MPCA Ground Rewa",            "Rewa",         "Domestic"),
    ("APS University Stadium",      "Rewa",         "None"),
    ("Maharaja School",             "Chhatarpur",   "None"),
    ("SMSCS Gwalior",               "Gwalior",      "Domestic"),
    ("CRCS Ground",                 "Gwalior",      "None"),
    ("Scindia School",              "Gwalior",      "Domestic"),
    ("Aditya World School",         "Gwalior",      "None"),
    ("University Cricket Ground",   "Jabalpur",     "None"),
    ("MPCA Ground - Morena",        "Morena",       "Domestic"),
    ("Chambal SR Ground",           "Bhind",        "None"),
]


# ── 82 umpires (Column B + Column C · division) ──────────────────────
UMPIRES = [
    ("Arvind Kumar",           "UJJAIN"),
    ("Ravi Sharma",            "INDORE"),
    ("Vijendra Parihar",       "BHOPAL"),
    ("Anuj Totre",             "INDORE"),
    ("Kamlesh Shukla",         "REWA"),
    ("Manish Jaiswal",         "INDORE"),
    ("Rahul Satwaskar",        "INDORE"),
    ("Rajesh Kannojia",        "INDORE"),
    ("Rohan Patwardhan",       "INDORE"),
    ("Shersingh Amrodiya",     "INDORE"),
    ("Sunil Rajoria",          "CHAMBAL"),
    ("Anil Sharma",            "JABALPUR"),
    ("Neeraj Tiwari",          "SAGAR"),
    ("Shantanu Pitre",         "SAGAR"),
    ("Shubdha Bhosale",        "GWALIOR"),
    ("Rajesh Walecha",         "INDORE"),
    ("Rakesh Tripathi",        "SHAHDOL"),
    ("Ashish Mishra (Rewa)",   "REWA"),
    ("Shamim Dad",             "N'PURAM"),
    ("Vishal Sharma",          "N'PURAM"),
    ("Rohit Dhakad",           "BHOPAL"),
    ("Parth Tomar",            "N'PURAM"),
    ("Harshit Jain",           "INDORE"),
    ("Pankaj Bharti",          "INDORE"),
    ("Vyomkesh Tripathi",      "SHAHDOL"),
    ("Ashish Solanki",         "INDORE"),
    ("Rakesh Kumar Chandel",   "REWA"),
    ("Raja Thakur",            "SAGAR"),
    ("Anuj Kumar",             "SAGAR"),
    ("Jitendra Gupta",         "REWA"),
    ("Madhur Nahar",           "INDORE"),
    ("Amandeep Singh Bali",    "INDORE"),
    ("Vaibhav Abhyankar",      "UJJAIN"),
    ("Vivek Choudhary",        "INDORE"),
    ("Ashish Mishra (Bhopal)", "BHOPAL"),
    ("Akshay Totray",          "INDORE"),
    ("Manish Jain",            "INDORE"),
    ("Nikhil Menon",           "INDORE"),
    ("Nitin Menon",            "INDORE"),
    ("Rajesh Timaney",         "INDORE"),
    ("Prem Shankar Bhargava",  "REWA"),
    ("Nikhil Patwardhan",      "INDORE"),
    ("Pushpendra S Bhadoriya", "GWALIOR"),
    ("Rameez Khan",            "BHOPAL"),
    ("Rohan Shrivastava",      "INDORE"),
    ("Abhishek Tomar",         "INDORE"),
    ("Ritika Buley",           "INDORE"),
    ("Sachin Parashar",        "SHAHDOL"),
    ("Vijay Negi",             "INDORE"),
    ("Amit Parkhe",            "INDORE"),
    ("Mayank Thanwar",         "INDORE"),
    ("Dattatray Varat",        "INDORE"),
    ("Jayant Wankhede",        "INDORE"),
    ("Sumit Bhati",            "INDORE"),
    ("Sunil Gupta",            "GWALIOR"),
    ("Dheerendra S Bhadoriya", "GWALIOR"),
    ("Dheerendra S Chouhan",   "REWA"),
    ("Bhavesh Kelonia",        "INDORE"),
    ("Akhilesh Joshi",         "INDORE"),
    ("Jay Sharma",             "INDORE"),
    ("Yogesh Panchal",         "INDORE"),
    ("Bhavesh Pandit",         "INDORE"),
    ("Yogesh Tomar",           "INDORE"),
    ("Rahul Thakur",           "INDORE"),
    ("Rupesh Prajapati",       "UJJAIN"),
    ("Sanjay Chouhan",         "GWALIOR"),
    ("Raghvendra Singh",       "GWALIOR"),
    ("Shishpal Singh Rajpoot", "GWALIOR"),
    ("Sunil Rajpoot",          "GWALIOR"),
    ("Pawan Tiwari",           "REWA"),
    ("Sandeep Satnami",        "SHAHDOL"),
    ("Sachin Goswami",         "JABALPUR"),
    ("Prakhar Jain",           "JABALPUR"),
    ("Gajendra Vishwakarma",   "SAGAR"),
    ("Lalit Ahirwar",          "SAGAR"),
    ("Sachin Tiwari",          "SAGAR"),
    ("Deepak Vishwakarma",     "BHOPAL"),
    ("Sachin Rajoriya",        "CHAMBAL"),
    ("Kaushlendra Kumar",      "CHAMBAL"),
    ("Vikas Singh",            "REWA"),
    ("Kiran Kumar Beru",       "REWA"),
    ("Rohit Singh",            "REWA"),
]


async def seed_grounds_and_officials(db) -> dict:
    """Idempotent: skips any doc whose name/full_name already exists."""
    import uuid
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    year = datetime.now(timezone.utc).year

    # ── Grounds ──
    created_grounds, kept_grounds = [], []
    existing_names = {g["name"] async for g in db.grounds.find({}, {"_id": 0, "name": 1})}
    seq = await db.grounds.count_documents({})
    for name, city, approval in GROUNDS:
        if name in existing_names:
            kept_grounds.append(name)
            continue
        seq += 1
        doc = {
            "id": str(uuid.uuid4()),
            "ground_no": f"GRD-{year}-{seq:03d}",
            "name": name,
            "type": "Main",
            "city": city,
            "owner_body_id": "MPCA",
            "bcci_approval": approval,
            "is_active": True,
            "suitable_formats": [],
            "allowed_tournament_types": [],
            "ground_staff": [],
            "created_at": now,
        }
        await db.grounds.insert_one(doc)
        created_grounds.append(name)

    # ── Match officials (Umpires) ──
    created_umps, kept_umps = [], []
    existing_umps = {u["full_name"].strip().lower() async for u in db.match_officials.find({}, {"_id": 0, "full_name": 1})}
    for name, div in UMPIRES:
        key = name.strip().lower()
        if key in existing_umps:
            kept_umps.append(name)
            continue
        # Normalize disambiguating suffixes (e.g., "Ashish Mishra (Rewa)")
        clean_name = re.sub(r"\s*\([^)]*\)\s*", "", name).strip()
        doc = {
            "id": str(uuid.uuid4()),
            "full_name": clean_name,
            "role": "Umpire",
            "grade": "State_Panel",
            "body_id": DIVISION_CODE.get(div, "MPCA"),
            "state": "Madhya Pradesh",
            "is_active": True,
            "years_of_experience": 0,
            "kyc_status": "Not_Started",
            "created_at": now,
        }
        await db.match_officials.insert_one(doc)
        created_umps.append(clean_name)

    return {
        "grounds":  {"created": len(created_grounds), "kept": len(kept_grounds)},
        "umpires":  {"created": len(created_umps),   "kept": len(kept_umps)},
    }
