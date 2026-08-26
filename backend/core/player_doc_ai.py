"""M39p · Player Registration AI/OCR Validator.

Runs Gemini vision on the KYC bundle uploaded by a prospective player and
returns a structured validation report card so Division & MPCA reviewers can
approve/reject with confidence.

Checks performed (per the user's 25-point rework spec):
  1. Aadhaar OCR — extract name, DOB, aadhaar number; match against form entries.
  2. Aadhaar duplication — enforce one submission per Aadhaar (across all
     campaigns, active + approved).
  3. PAN mandation for age 18+ (soft warn if missing).
  4. PAN OCR — extract PAN number and name, match against form.
  5. Birth certificate QR — extract QR content and verify it redirects to
     https://dc.crsorgi.gov.in/crs/ (URL prefix check, no live HTTP call).
  6. 3-year marksheet bundle — check the PDF has marksheets for 3 distinct
     academic years.
  7. Cancelled cheque — verify it is a cheque with player's or a related
     account holder's name (soft warn on mismatch).
  8. Cross-document name matching — flag mismatches between the names
     extracted from Aadhaar / PAN / birth cert / marksheet / cheque.

Failure mode: soft warnings only — nothing is auto-rejected. The AI verdict
sits in `player_data.ai_validation` and reviewers see it in the approval UI.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from emergentintegrations.llm.chat import (
    LlmChat,
    UserMessage,
    FileContentWithMimeType,
)

from core.infra import db

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
AI_CALL_TIMEOUT = float(os.environ.get("PLAYER_AI_TIMEOUT", "60"))
AI_MODEL_PROVIDER = "gemini"
AI_MODEL_NAME = "gemini-3-flash-preview"

BIRTH_CERT_QR_PREFIX = "https://dc.crsorgi.gov.in/crs/"


# ─────────────────────── Helpers ───────────────────────

def _norm_name(s: Optional[str]) -> str:
    """Lower-case, strip punctuation, collapse whitespace — for fuzzy compare."""
    if not s:
        return ""
    s = re.sub(r"[^a-z\s]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def _name_similarity(a: Optional[str], b: Optional[str]) -> float:
    """Cheap token-overlap similarity, 0..1. Handles reordered / partial names."""
    na, nb = _norm_name(a), _norm_name(b)
    if not na or not nb:
        return 0.0
    ta, tb = set(na.split()), set(nb.split())
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    return inter / max(len(ta), len(tb))


def _compute_age(dob_str: Optional[str]) -> Optional[int]:
    """DOB → age in years today. Accepts ISO YYYY-MM-DD."""
    if not dob_str:
        return None
    try:
        d = datetime.fromisoformat(dob_str).date()
    except Exception:
        try:
            d = datetime.strptime(dob_str, "%Y-%m-%d").date()
        except Exception:
            return None
    today = date.today()
    return today.year - d.year - ((today.month, today.day) < (d.month, d.day))


async def _file_from_url(url: Optional[str]) -> Optional[FileContentWithMimeType]:
    """Turn an /api/uploads/{id} URL into a FileContentWithMimeType for Gemini."""
    if not url or "/api/uploads/" not in url:
        return None
    file_id = url.rsplit("/", 1)[-1]
    rec = await db.uploads.find_one({"id": file_id})
    if not rec:
        return None
    path = rec.get("_path")
    mime = rec.get("mime_type") or "application/octet-stream"
    if not path or not Path(path).exists():
        return None
    return FileContentWithMimeType(file_path=path, mime_type=mime)


def _parse_json_block(raw: str) -> Dict[str, Any]:
    """Extract a JSON object from Gemini's response (may be wrapped)."""
    try:
        return json.loads(raw)
    except Exception:
        pass
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL | re.IGNORECASE)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    m = re.search(r"(\{[\s\S]*\})", raw)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    return {}


# ─────────────────────── Gemini prompt ───────────────────────

AI_SYSTEM_MESSAGE = """You are the MPCA Player Registration Document OCR & Fraud Detection AI.

You receive a set of KYC documents uploaded by a prospective cricket player. For EACH document, extract structured fields, then produce cross-document consistency findings.

Documents you may receive (each labelled with its role in the attached order):
  1. Aadhaar card (unmasked)
  2. Aadhaar Update History (a UIDAI-issued PDF listing every enrolment/update record for a UID, most recent first — each record shows "Date of Enrolment/Update: DD/MM/YYYY" and a Type such as "Biometric" / "Demographic")
  3. PAN card
  4. Birth certificate (may contain a QR code linking to dc.crsorgi.gov.in)
  5. Marksheet PDF — expected to contain 3 marksheets from 3 distinct academic years
  6. Cancelled cheque
  7. Address proof
  8. Passport photo

You are STRICTLY an information-extractor + fraud sniffer. You NEVER approve or reject.

Respond with a SINGLE JSON object — no prose, no code fences. Shape:

{
  "aadhaar": {
    "extracted_number": "<12-digit or null>",
    "extracted_name": "<name printed on card or null>",
    "extracted_dob": "<YYYY-MM-DD or null>",
    "extracted_gender": "<M/F/Other or null>",
    "issued_or_updated_year": "<YYYY or null>",
    "tampering_signals": ["<any splicing / font-mismatch / photocopy defects>"],
    "ocr_confidence": 0.0..1.0
  },
  "aadhaar_update_history": {
    "latest_update_date": "<YYYY-MM-DD of the most recent enrolment/update record, or null>",
    "latest_update_type": "<Biometric | Demographic | Enrolment | Update | null>",
    "records_count": <integer number of records visible in the PDF>,
    "uid_last4": "<last 4 digits of UID shown at the top of the history, or null>",
    "extracted_name": "<name on the latest record or null>",
    "extracted_dob": "<YYYY-MM-DD from the latest record or null>",
    "ocr_confidence": 0.0..1.0
  },
  "pan": {
    "extracted_number": "<10-char PAN or null>",
    "extracted_name": "<name on card or null>",
    "extracted_dob": "<YYYY-MM-DD or null>",
    "ocr_confidence": 0.0..1.0
  },
  "birth_certificate": {
    "extracted_name": "<child name or null>",
    "extracted_dob": "<YYYY-MM-DD or null>",
    "extracted_father_name": "<or null>",
    "extracted_place_of_birth_city": "<city / town / village of birth as printed, or null>",
    "extracted_place_of_birth_state": "<state (usually 'Madhya Pradesh'), or null>",
    "qr_present": true|false,
    "qr_decoded_url": "<url if a QR is visible; null otherwise>",
    "issuing_authority": "<free text>",
    "ocr_confidence": 0.0..1.0
  },
  "marksheet": {
    "years_detected": ["<YYYY-YY strings>"],
    "num_marksheets_in_pdf": <integer>,
    "distinct_academic_years": <integer>,
    "student_name": "<or null>",
    "father_name": "<or null>",
    "board_or_institution": "<or null>",
    "ocr_confidence": 0.0..1.0
  },
  "cancelled_cheque": {
    "account_holder_name": "<or null>",
    "bank_name": "<or null>",
    "ifsc": "<or null>",
    "account_number_last4": "<or null>",
    "is_marked_cancelled": true|false,
    "ocr_confidence": 0.0..1.0
  },
  "photo": {
    "appears_to_be_person": true|false,
    "ocr_confidence": 0.0..1.0
  },
  "cross_document": {
    "names_seen": ["<unique names extracted across all docs>"],
    "dobs_seen": ["<unique DOBs seen across all docs>"],
    "name_mismatch_detected": true|false,
    "dob_mismatch_detected": true|false,
    "notes": "<short explanation>"
  },
  "warnings": ["<any global concerns not covered above>"],
  "overall_confidence": 0.0..1.0
}

Only include a section if a corresponding document was attached; otherwise omit the section entirely (do not fabricate). Be conservative — return null when you cannot read a field reliably.
"""


async def _run_gemini_extraction(
    reg_doc: Dict[str, Any],
    attachments_with_labels: List[Tuple[str, FileContentWithMimeType]],
) -> Dict[str, Any]:
    """Call Gemini once with all attachments, returning parsed extraction JSON."""
    if not EMERGENT_LLM_KEY:
        return {"error": "AI unavailable (no EMERGENT_LLM_KEY)."}
    if not attachments_with_labels:
        return {"error": "No documents attached."}

    pd = reg_doc.get("player_data") or {}
    docs_manifest = "\n".join(
        f"  {i+1}. {label}" for i, (label, _) in enumerate(attachments_with_labels)
    )
    prompt = f"""REGISTERED PLAYER DATA (as entered on form):

- Full Name: {pd.get('full_name') or '(missing)'}
- Father's Name: {pd.get('father_name') or '(missing)'}
- Date of Birth: {pd.get('dob') or '(missing)'}
- Gender: {pd.get('gender') or '(missing)'}
- Aadhaar No (entered): {pd.get('aadhaar_no') or '(not provided)'}
- PAN (entered): {pd.get('pan_no') or '(not provided)'}
- Bank name (entered): {pd.get('bank_name') or '(not provided)'}
- Bank A/C (entered): {pd.get('bank_account_no') or '(not provided)'}
- Bank IFSC (entered): {pd.get('bank_ifsc') or '(not provided)'}

DOCUMENTS ATTACHED (in this exact order):
{docs_manifest}

Extract each document's fields as JSON per the schema. Compare across documents for name/DOB inconsistencies. Return the JSON only."""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"player-reg-ai-{reg_doc.get('id')}",
        system_message=AI_SYSTEM_MESSAGE,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)

    msg = UserMessage(
        text=prompt,
        file_contents=[fc for _, fc in attachments_with_labels],
    )
    try:
        raw = await asyncio.wait_for(chat.send_message(msg), timeout=AI_CALL_TIMEOUT)
    except Exception as e:
        return {"error": f"Gemini call failed ({type(e).__name__}): {str(e)[:200]}"}
    parsed = _parse_json_block(raw if isinstance(raw, str) else str(raw))
    if not parsed:
        return {"error": "Could not parse AI response.", "raw": (raw or "")[:400]}
    return parsed


# ─────────────────── Business rules on top of extraction ───────────────────

def _rules_engine(reg_doc: Dict[str, Any], ext: Dict[str, Any]) -> Dict[str, Any]:
    """Run deterministic checks on the extraction + form data.

    Returns a report card dict with issue lists split by severity.
    """
    pd = reg_doc.get("player_data") or {}
    critical: List[str] = []
    warnings: List[str] = []
    info: List[str] = []

    # ── 1. Aadhaar number consistency (form vs OCR) ────────────────────
    aadhaar_form = re.sub(r"\D", "", (pd.get("aadhaar_no") or ""))
    aadhaar_ocr_raw = (ext.get("aadhaar", {}) or {}).get("extracted_number")
    aadhaar_ocr = re.sub(r"\D", "", aadhaar_ocr_raw or "")
    if aadhaar_form and aadhaar_ocr and aadhaar_form != aadhaar_ocr:
        critical.append(
            f"Aadhaar number mismatch: form has {aadhaar_form[-4:]}, "
            f"OCR read {aadhaar_ocr[-4:]}."
        )
    if aadhaar_form and len(aadhaar_form) != 12:
        critical.append("Aadhaar number is not 12 digits.")

    # ── 2. Age & PAN mandation ────────────────────────────────────────
    age = _compute_age(pd.get("dob"))
    pan_form = (pd.get("pan_no") or "").upper().strip()
    pan_pattern = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
    if age is not None and age >= 18:
        if not pan_form:
            critical.append(f"PAN is mandatory for age 18+ (computed age: {age}).")
        elif not pan_pattern.match(pan_form):
            critical.append(f"PAN '{pan_form}' does not match ABCDE1234F pattern.")
    else:
        if pan_form and not pan_pattern.match(pan_form):
            warnings.append(f"PAN '{pan_form}' provided but format looks invalid.")

    # PAN OCR name match
    pan_ocr = ext.get("pan", {}) or {}
    if pan_ocr.get("extracted_number") and pan_form:
        if pan_ocr["extracted_number"].upper().replace(" ", "") != pan_form:
            warnings.append(
                f"PAN mismatch: form '{pan_form}', OCR '{pan_ocr['extracted_number']}'."
            )
    if pan_ocr.get("extracted_name") and pd.get("full_name"):
        sim = _name_similarity(pan_ocr["extracted_name"], pd["full_name"])
        if sim < 0.5:
            warnings.append(
                f"Name on PAN ('{pan_ocr['extracted_name']}') does not match "
                f"registered name ('{pd['full_name']}')."
            )

    # ── 3. Aadhaar OCR name / DOB match ──────────────────────────────
    aad_ocr = ext.get("aadhaar", {}) or {}
    if aad_ocr.get("extracted_name") and pd.get("full_name"):
        sim = _name_similarity(aad_ocr["extracted_name"], pd["full_name"])
        if sim < 0.5:
            critical.append(
                f"Aadhaar name '{aad_ocr['extracted_name']}' does not match "
                f"registered name '{pd['full_name']}'."
            )
    if aad_ocr.get("extracted_dob") and pd.get("dob"):
        if aad_ocr["extracted_dob"][:10] != pd["dob"][:10]:
            critical.append(
                f"DOB mismatch: form {pd['dob']}, Aadhaar {aad_ocr['extracted_dob']}."
            )
    # ── Iter 131e · Missing mandatory documents ──
    # Every registration MUST include these — anything absent is a critical
    # issue that stops the AI verdict from going green.
    core_mandatory = {
        "aadhaar_url":             "Aadhaar (Unmasked)",
        "birth_cert_url":          "Birth Certificate",
        "photo_url":               "Passport Size Photo",
        "address_proof_url":       "Current Address Proof",
        "samagra_id_player_url":   "Samagra ID (Player)",
        "samagra_id_family_url":   "Samagra ID (Family)",
        "consent_form_url":        "Consent Form (Notarized)",
    }
    missing_core: List[str] = [
        label for key, label in core_mandatory.items() if not pd.get(key)
    ]
    # Employment path vs student path — one of them is mandatory
    is_employed = bool(pd.get("is_employed"))
    no_studies = bool(pd.get("no_recent_studies"))
    if is_employed:
        for key, label in [
            ("appointment_letter_url", "Appointment Letter"),
            ("salary_slip_url",        "Latest Salary Slip"),
            ("bank_statement_1yr_url", "1-Year Bank Statement"),
        ]:
            if not pd.get(key):
                missing_core.append(label)
    elif no_studies:
        if not pd.get("no_study_affidavit_url"):
            missing_core.append("No-Study Affidavit")
    else:
        for key, label in [
            ("marksheet_3yr_url",       "Marksheets · Last 3 years"),
            ("bonafide_school_cert_url","School Bonafide"),
        ]:
            if not pd.get(key):
                missing_core.append(label)
    # NOC required if last-season division differs from current
    lsd = (pd.get("last_season_division_code") or "").strip()
    psd = (pd.get("preferred_division_code") or "").strip()
    if lsd and psd and lsd != psd and not pd.get("noc_previous_division_url"):
        missing_core.append(f"NOC from {lsd}")

    if missing_core:
        critical.append(
            "Missing required document(s): " + ", ".join(missing_core) + "."
        )

    aad_year = (aad_ocr.get("issued_or_updated_year") or "").strip()
    # Feb 2026 · If an Aadhaar Update History PDF was uploaded and Gemini
    # extracted a latest update date, prefer THAT over the year printed on
    # the Aadhaar card — the printed year is the enrolment year, but the
    # update history reflects the most recent biometric/demographic update,
    # which is what MPCA's "within last 3 years" policy actually cares about.
    auh = ext.get("aadhaar_update_history", {}) or {}
    auh_latest = (auh.get("latest_update_date") or "").strip()
    auh_year: Optional[str] = None
    if auh_latest and len(auh_latest) >= 4:
        try:
            auh_year = str(datetime.strptime(auh_latest[:10], "%Y-%m-%d").year)
        except Exception:
            # Accept bare year strings too
            if auh_latest[:4].isdigit():
                auh_year = auh_latest[:4]
    effective_year = auh_year or aad_year
    if effective_year and effective_year.isdigit():
        this_year = date.today().year
        if this_year - int(effective_year) > 3:
            src = (
                f"Aadhaar Update History latest update {auh_latest}"
                if auh_year else f"Aadhaar card printed year {aad_year}"
            )
            warnings.append(
                f"Aadhaar was last updated in {effective_year} ({src}) — "
                f"MPCA policy expects it within the last 3 years."
            )
        elif auh_year:
            # Explicit positive confirmation when history overrides the card
            info.append(
                f"Aadhaar Update History confirms latest update on {auh_latest} "
                f"({auh.get('latest_update_type') or 'update'})."
            )

    # ── 4. Birth certificate QR ──────────────────────────────────────
    bc = ext.get("birth_certificate", {}) or {}
    if pd.get("birth_cert_url"):
        if not bc.get("qr_present"):
            warnings.append(
                "Birth certificate uploaded but no QR code detected — required "
                "for CRS/CRSORGI verification."
            )
        else:
            qr_url = (bc.get("qr_decoded_url") or "").strip()
            if not qr_url.startswith(BIRTH_CERT_QR_PREFIX):
                critical.append(
                    f"Birth certificate QR does not point to {BIRTH_CERT_QR_PREFIX} "
                    f"(decoded: '{qr_url or 'unreadable'}')."
                )
            else:
                info.append("Birth certificate QR links to the official CRS portal.")
        if bc.get("extracted_dob") and pd.get("dob"):
            if bc["extracted_dob"][:10] != pd["dob"][:10]:
                critical.append(
                    f"DOB mismatch: form {pd['dob']}, birth certificate {bc['extracted_dob']}."
                )
        if bc.get("extracted_father_name") and pd.get("father_name"):
            sim = _name_similarity(bc["extracted_father_name"], pd["father_name"])
            if sim < 0.5:
                warnings.append(
                    f"Father's name on birth cert ('{bc['extracted_father_name']}') "
                    f"does not match form ('{pd['father_name']}')."
                )

    # ── 5. Marksheet 3-year check ────────────────────────────────────
    ms = ext.get("marksheet", {}) or {}
    if pd.get("marksheet_3yr_url") and not pd.get("no_recent_studies"):
        distinct = int(ms.get("distinct_academic_years") or 0)
        if distinct < 3:
            critical.append(
                f"Marksheet PDF contains only {distinct} distinct academic year(s); "
                f"3 years are required."
            )
        else:
            info.append(f"Marksheet bundle covers {distinct} academic years.")
        if ms.get("student_name") and pd.get("full_name"):
            sim = _name_similarity(ms["student_name"], pd["full_name"])
            if sim < 0.5:
                warnings.append(
                    f"Marksheet student name ('{ms['student_name']}') does not match "
                    f"registered name ('{pd['full_name']}')."
                )
    elif pd.get("no_recent_studies") and pd.get("affidavit_url"):
        info.append("U23 · Affidavit provided in lieu of 3-year marksheets.")

    # ── 6. Cancelled cheque ──────────────────────────────────────────
    cq = ext.get("cancelled_cheque", {}) or {}
    if pd.get("cancelled_cheque_url"):
        if not cq.get("is_marked_cancelled"):
            warnings.append("Uploaded cheque does not clearly show 'CANCELLED' marking.")
        # Name match: player OR guardian
        holder = cq.get("account_holder_name")
        if holder:
            sim_player = _name_similarity(holder, pd.get("full_name"))
            sim_guardian = _name_similarity(holder, pd.get("guardian_name"))
            sim_father = _name_similarity(holder, pd.get("father_name"))
            if max(sim_player, sim_guardian, sim_father) < 0.5:
                warnings.append(
                    f"Cheque account holder '{holder}' does not match player, "
                    f"guardian or father name."
                )
        if cq.get("ifsc") and pd.get("bank_ifsc"):
            if cq["ifsc"].upper().replace(" ", "") != pd["bank_ifsc"].upper().replace(" ", ""):
                warnings.append(
                    f"IFSC mismatch: form '{pd['bank_ifsc']}', cheque '{cq['ifsc']}'."
                )

    # ── 7. Cross-document name consistency ───────────────────────────
    xd = ext.get("cross_document", {}) or {}
    if xd.get("name_mismatch_detected"):
        warnings.append(
            "AI detected name variations across documents: "
            + (xd.get("notes") or "")[:180]
        )
    if xd.get("dob_mismatch_detected"):
        critical.append(
            "AI detected DOB variations across documents: "
            + (xd.get("notes") or "")[:180]
        )

    # ── 8. Global warnings from Gemini ───────────────────────────────
    for w in ext.get("warnings") or []:
        if isinstance(w, str) and w.strip():
            warnings.append(w.strip())

    # Verdict
    if critical:
        verdict = "Recommend_Reject"
    elif warnings:
        verdict = "Manual_Review"
    else:
        verdict = "Recommend_Approve"

    return {
        "verdict": verdict,
        "critical_issues": critical,
        "warnings": warnings,
        "info": info,
        "age_computed": age,
        "pan_required": (age is not None and age >= 18),
        "overall_confidence": float(ext.get("overall_confidence") or 0.0),
    }


# ─────────────────── Aadhaar duplication check ───────────────────

async def check_aadhaar_duplicate(
    aadhaar_no: str,
    exclude_registration_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Return the offending doc if this aadhaar is already used in an active
    registration; None otherwise."""
    cleaned = re.sub(r"\D", "", aadhaar_no or "")
    if not cleaned or len(cleaned) != 12:
        return None
    q: Dict[str, Any] = {
        "player_data.aadhaar_no": {"$regex": f".*{cleaned}.*"},
        "status": {"$in": ["Submitted", "Returned", "Division_Approved", "Approved"]},
    }
    if exclude_registration_id:
        q["id"] = {"$ne": exclude_registration_id}
    existing = await db.player_registrations.find_one(q, {"_id": 0, "id": 1, "status": 1, "body_code": 1, "player_data.full_name": 1})
    return existing


# ─────────────────── Field-suggestion + per-doc status ───────────────────
#
# Powers the docs-first public registration flow: after Gemini extracts each
# document, we (a) suggest values for the manual form fields (name, dob, pan,
# aadhaar, ifsc, etc.) and (b) tag each uploaded document with a per-doc
# verdict pill (verified / warning / error) based on the rules-engine output.

def _build_field_suggestions(extraction: Dict[str, Any]) -> Dict[str, Any]:
    """Map Gemini extraction JSON → best-guess values for the manual form fields.
    Priority: Aadhaar > Birth Certificate > PAN > Marksheet for name/DOB."""
    if not isinstance(extraction, dict):
        return {}
    aad = extraction.get("aadhaar") or {}
    pan = extraction.get("pan") or {}
    bc  = extraction.get("birth_certificate") or {}
    ms  = extraction.get("marksheet") or {}
    cq  = extraction.get("cancelled_cheque") or {}

    out: Dict[str, Any] = {}

    # ── Name (Aadhaar > Birth Cert > PAN > Marksheet) ──
    full_name = (
        aad.get("extracted_name")
        or bc.get("extracted_name")
        or pan.get("extracted_name")
        or ms.get("student_name")
    )
    if full_name:
        out["full_name"] = full_name.strip()
        parts = full_name.strip().split()
        if len(parts) >= 2:
            out["first_name"] = " ".join(parts[:-1])
            out["surname"] = parts[-1]
        else:
            out["first_name"] = parts[0] if parts else ""
            out["surname"] = ""

    # ── Father's name (Birth Cert > Marksheet) ──
    father = bc.get("extracted_father_name") or ms.get("father_name")
    if father:
        out["father_name"] = father.strip()

    # ── Place of birth (Birth Certificate only) ──
    pob_city = bc.get("extracted_place_of_birth_city")
    pob_state = bc.get("extracted_place_of_birth_state")
    if pob_city:
        out["place_of_birth_city"] = pob_city.strip()
    if pob_state:
        out["place_of_birth_state"] = pob_state.strip()

    # ── DOB (Aadhaar > Birth Cert > PAN) ──
    dob = aad.get("extracted_dob") or bc.get("extracted_dob") or pan.get("extracted_dob")
    if dob:
        out["dob"] = dob[:10]

    # ── Gender (Aadhaar only) ──
    g = (aad.get("extracted_gender") or "").strip().upper()
    if g in {"M", "MALE"}: out["gender"] = "M"
    elif g in {"F", "FEMALE"}: out["gender"] = "F"
    elif g: out["gender"] = "Other"

    # ── Aadhaar / PAN numbers ──
    if aad.get("extracted_number"):
        cleaned = re.sub(r"\D", "", str(aad["extracted_number"]))
        if len(cleaned) == 12:
            out["aadhaar_no"] = cleaned
    if pan.get("extracted_number"):
        p = str(pan["extracted_number"]).upper().replace(" ", "")
        if re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", p):
            out["pan_no"] = p

    # ── Bank (cancelled cheque) ──
    if cq.get("bank_name"):
        out["bank_name"] = cq["bank_name"].strip()
    if cq.get("ifsc"):
        out["bank_ifsc"] = cq["ifsc"].strip().upper()

    return out


def _build_per_doc_status(
    pd: Dict[str, Any], extraction: Dict[str, Any], rules: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """Return {doc_key: {status, issues: [...]}}. doc_key matches the form's
    URL keys (aadhaar_url, pan_url, birth_cert_url, ...). Status is one of
    'verified' | 'warning' | 'error' based on rules-engine severity."""
    # Map each doc_key → keywords the rule-engine mentions when flagging that doc
    doc_keys = {
        "photo_url":            ["photo"],
        "aadhaar_url":          ["aadhaar"],
        "aadhaar_history_url":  ["aadhaar history", "aadhaar update"],
        "pan_url":              ["pan"],
        "passport_url":         ["passport"],
        "driving_licence_url":  ["driving licence", "driving license"],
        "voter_id_url":         ["voter id"],
        "birth_cert_url":       ["birth cert", "birth certificate"],
        "address_proof_url":    ["address proof"],
        "marksheet_3yr_url":    ["marksheet", "student", "academic year"],
        "affidavit_url":        ["affidavit"],
        "cancelled_cheque_url": ["cheque", "ifsc"],
        "gst_certificate_url":  ["gst"],
        "samagra_id_player_url":  ["samagra"],
        "samagra_id_family_url":  ["samagra"],
        "consent_form_url":       ["consent"],
        "no_study_affidavit_url": ["no-study", "no study"],
        "bonafide_school_cert_url": ["bonafide", "school"],
        "appointment_letter_url": ["appointment"],
        "salary_slip_url":        ["salary"],
        "bank_statement_1yr_url": ["bank statement"],
        "noc_previous_division_url": ["noc"],
    }
    critical = [s.lower() for s in (rules.get("critical_issues") or [])]
    warnings = [s.lower() for s in (rules.get("warnings") or [])]

    out: Dict[str, Dict[str, Any]] = {}
    for dk, kws in doc_keys.items():
        if not pd.get(dk):
            continue
        matched_err  = [s for s in critical if any(kw in s for kw in kws)]
        matched_warn = [s for s in warnings if any(kw in s for kw in kws)]
        if matched_err:
            status = "error"
        elif matched_warn:
            status = "warning"
        else:
            status = "verified"
        out[dk] = {
            "status": status,
            "issues": matched_err + matched_warn,
        }
    return out


# ─────────────────── Public entry point ───────────────────

async def run_full_registration_ai(reg_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Orchestrator — collects docs, calls Gemini once, runs rules engine.
    Returns the full report card (also persisted by the caller)."""
    pd = reg_doc.get("player_data") or {}

    # Ordered document tuples: (label sent to Gemini, url on record)
    # MPCA-Feb2026 · extended to cover every doc slot on the registration
    # form + any player-supplied Other Documents so AI sees the FULL picture.
    doc_slots = [
        ("Aadhaar", pd.get("aadhaar_url")),
        ("PAN", pd.get("pan_url")),
        ("Birth Certificate", pd.get("birth_cert_url")),
        ("Marksheet 3-year bundle", pd.get("marksheet_3yr_url")),
        ("Cancelled Cheque", pd.get("cancelled_cheque_url")),
        ("Address Proof", pd.get("address_proof_url")),
        ("Passport Photo", pd.get("photo_url")),
        ("Samagra ID · Player", pd.get("samagra_id_player_url")),
        ("Samagra ID · Family", pd.get("samagra_id_family_url")),
        ("Consent Form (Notarized)", pd.get("consent_form_url")),
        ("No-Study Affidavit", pd.get("no_study_affidavit_url")),
        ("School Bonafide Certificate", pd.get("bonafide_school_cert_url")),
        ("Appointment Letter", pd.get("appointment_letter_url")),
        ("Salary Slip", pd.get("salary_slip_url")),
        ("Bank Statement (1-year)", pd.get("bank_statement_1yr_url")),
        ("NOC · Previous Division", pd.get("noc_previous_division_url")),
        ("Passport", pd.get("passport_url")),
        ("Driving Licence", pd.get("driving_licence_url")),
        ("Voter ID", pd.get("voter_id_url")),
        ("Aadhaar Update History", pd.get("aadhaar_history_url")),
        ("Affidavit (legacy)", pd.get("affidavit_url")),
        ("GST Certificate", pd.get("gst_certificate_url")),
    ]
    # Append every player-supplied Other Document (unbounded list of {label, url})
    for other in (pd.get("other_docs") or []):
        if not isinstance(other, dict):
            continue
        url = other.get("url")
        label = other.get("label") or "Other Document"
        if url:
            doc_slots.append((f"Other · {label}", url))
    attachments: List[Tuple[str, FileContentWithMimeType]] = []
    missing: List[str] = []
    for label, url in doc_slots:
        if not url:
            if label in {"Aadhaar", "Birth Certificate", "Passport Photo"}:
                missing.append(label)
            continue
        fc = await _file_from_url(url)
        if fc:
            attachments.append((label, fc))
        else:
            missing.append(f"{label} (upload record missing)")

    # Aadhaar duplication is deterministic — always run.
    dup = None
    if pd.get("aadhaar_no"):
        dup = await check_aadhaar_duplicate(pd["aadhaar_no"], exclude_registration_id=reg_doc.get("id"))

    extraction: Dict[str, Any] = {}
    if attachments:
        extraction = await _run_gemini_extraction(reg_doc, attachments)

    rules = _rules_engine(reg_doc, extraction) if isinstance(extraction, dict) else {
        "verdict": "Manual_Review",
        "critical_issues": ["AI extraction failed."],
        "warnings": [],
        "info": [],
    }

    if dup:
        rules["critical_issues"].insert(
            0,
            f"Duplicate Aadhaar — already used on registration "
            f"{dup.get('id')[:8]} ({dup.get('status')}) at {dup.get('body_code')}.",
        )
        rules["verdict"] = "Recommend_Reject"

    if missing:
        for m in missing:
            rules["warnings"].append(f"Missing document: {m}")

    return {
        "verdict": rules["verdict"],
        "critical_issues": rules["critical_issues"],
        "warnings": rules["warnings"],
        "info": rules["info"],
        "age_computed": rules.get("age_computed"),
        "pan_required": rules.get("pan_required", False),
        "overall_confidence": rules.get("overall_confidence", 0.0),
        "extraction": extraction if isinstance(extraction, dict) else {"error": str(extraction)},
        "suggested_fields": _build_field_suggestions(extraction if isinstance(extraction, dict) else {}),
        "per_doc_status": _build_per_doc_status(pd, extraction if isinstance(extraction, dict) else {}, rules),
        "aadhaar_duplicate_of": (dup or {}).get("id") if dup else None,
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "model": f"{AI_MODEL_PROVIDER}/{AI_MODEL_NAME}",
        "engine_version": "M39p.2",
    }
