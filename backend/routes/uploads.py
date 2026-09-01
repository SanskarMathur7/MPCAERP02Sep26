"""Routes · File Uploads"""
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from core.infra import UPLOAD_ROOT, api_router, db
from models import UploadRecord

# ============================================================
# Step 3 · Real File Uploads (Feb 2026)
# Replaces mocked URL strings — prereq for AI grant validation
# Files stored on disk at /app/backend/uploads/<yyyy-mm>/<uuid>.<ext>
# Metadata in `uploads` collection
# ============================================================

ALLOWED_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",              # non-standard but some browsers/OSes send this
    "image/pjpeg",            # legacy progressive JPEG variant
    "image/png",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.ms-excel",
}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024   # 20 MB cap

EXT_BY_MIME = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/msword": ".doc",
    "application/vnd.ms-excel": ".xls",
}


@api_router.post("/uploads", response_model=UploadRecord)
async def upload_file(
    file: UploadFile = File(...),
    body_id: str | None = Form(None),
    uploaded_by: str | None = Form(None),
    related_type: str | None = Form(None),
    related_id: str | None = Form(None),
):
    if file.content_type not in ALLOWED_MIMES:
        raise HTTPException(
            400,
            f"Unsupported file type {file.content_type}. Allowed: PDF, JPG/JPEG/PNG/WebP images, DOCX, XLSX, DOC, XLS.",
        )
    ext = EXT_BY_MIME.get(file.content_type, "")
    file_id = str(uuid.uuid4())
    yyyymm = datetime.now(timezone.utc).strftime("%Y-%m")
    target_dir = UPLOAD_ROOT / yyyymm
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{file_id}{ext}"

    # Stream-write with size cap
    total = 0
    chunk_size = 1024 * 1024
    with open(target_path, "wb") as out:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                out.close()
                target_path.unlink(missing_ok=True)
                raise HTTPException(413, f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB cap.")
            out.write(chunk)

    record = UploadRecord(
        id=file_id,
        original_name=file.filename or f"upload{ext}",
        size_bytes=total,
        mime_type=file.content_type,
        body_id=body_id,
        uploaded_by=uploaded_by,
        related_type=related_type,
        related_id=related_id,
        url=f"/api/uploads/{file_id}",
    )
    # Persist the disk path on the doc too (internal use only — not returned via response_model)
    rec_doc = record.model_dump()
    rec_doc["_path"] = str(target_path)
    await db.uploads.insert_one(rec_doc)
    return record


# ─── Iter 123x · Public upload for anonymous player registration ────────
# The public form has no JWT — players fill it directly via the token URL.
# Mirror the /uploads logic but scope tightly: only allowed when related_type
# starts with `player_registration` so this can't become a free upload sink.
@api_router.post("/public/uploads", response_model=UploadRecord)
async def public_upload_file(
    file: UploadFile = File(...),
    body_id: str | None = Form(None),
    uploaded_by: str | None = Form(None),
    related_type: str | None = Form(None),
    related_id: str | None = Form(None),
    registration_token: str | None = Form(None),
):
    if not (related_type or "").startswith("player_registration"):
        raise HTTPException(400, "public/uploads is only for player-registration flows.")
    if not registration_token:
        raise HTTPException(400, "registration_token is required.")
    # Validate token exists (campaign or invited player OR active correction request)
    # before accepting the file.
    campaign = await db.player_registration_campaigns.find_one({"public_token": registration_token})
    invited  = None
    correction = None
    if not campaign:
        invited = await db.player_registrations.find_one({"invite_token": registration_token})
    if not (campaign or invited):
        # Iter 128 · public correction flow — token lives in player_correction_requests
        correction = await db.player_correction_requests.find_one({"token": registration_token, "status": "Pending"})
    if not (campaign or invited or correction):
        raise HTTPException(404, "Invalid registration token.")
    if file.content_type not in ALLOWED_MIMES:
        raise HTTPException(400, f"Unsupported file type {file.content_type}.")
    ext = EXT_BY_MIME.get(file.content_type, "")
    file_id = str(uuid.uuid4())
    yyyymm = datetime.now(timezone.utc).strftime("%Y-%m")
    target_dir = UPLOAD_ROOT / yyyymm
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{file_id}{ext}"
    total = 0
    chunk_size = 1024 * 1024
    with open(target_path, "wb") as out:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                out.close(); target_path.unlink(missing_ok=True)
                raise HTTPException(413, f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB cap.")
            out.write(chunk)
    record = UploadRecord(
        id=file_id, original_name=file.filename or f"upload{ext}", size_bytes=total,
        mime_type=file.content_type, body_id=body_id or (campaign or {}).get("body_id") or (invited or {}).get("body_id"),
        uploaded_by=uploaded_by, related_type=related_type, related_id=related_id,
        url=f"/api/uploads/{file_id}",
    )
    rec_doc = record.model_dump()
    rec_doc["_path"] = str(target_path)
    rec_doc["public_registration_token"] = registration_token
    await db.uploads.insert_one(rec_doc)
    return record


@api_router.get("/uploads/{file_id}")
async def serve_upload(file_id: str):
    doc = await db.uploads.find_one({"id": file_id})
    if not doc:
        raise HTTPException(404, "File not found")
    path = doc.get("_path")
    if not path or not Path(path).exists():
        raise HTTPException(410, "File no longer available")
    return FileResponse(
        path,
        media_type=doc.get("mime_type") or "application/octet-stream",
        filename=doc.get("original_name") or file_id,
    )


@api_router.get("/uploads/{file_id}/meta", response_model=UploadRecord)
async def upload_meta(file_id: str):
    doc = await db.uploads.find_one({"id": file_id}, {"_id": 0, "_path": 0})
    if not doc:
        raise HTTPException(404, "File not found")
    return doc

