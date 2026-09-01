"""Routes · Rulebook + Meeting Agenda"""
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

from core.infra import APPROVAL_MATRIX_PATH, api_router
from core.pdf_generator import _markdown_to_colored_pdf, _markdown_to_pdf_response

# ============================================================
# Approval Matrix (AI Rulebook) — view + download (.md / .pdf)
# ============================================================

@api_router.get("/rulebook")
async def get_rulebook():
    """Returns the markdown rulebook text + metadata for in-app rendering."""
    try:
        text = APPROVAL_MATRIX_PATH.read_text(encoding="utf-8")
        stat = APPROVAL_MATRIX_PATH.stat()
    except FileNotFoundError:
        raise HTTPException(404, "Rulebook file not found")
    return {
        "version": "0.1 (strawman)",
        "path": str(APPROVAL_MATRIX_PATH),
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "markdown": text,
    }


@api_router.get("/rulebook/download.md")
async def download_rulebook_md():
    if not APPROVAL_MATRIX_PATH.exists():
        raise HTTPException(404, "Rulebook file not found")
    return FileResponse(
        str(APPROVAL_MATRIX_PATH),
        media_type="text/markdown",
        filename="MPCA_Approval_Matrix_v0.1.md",
    )


@api_router.get("/rulebook/download.pdf")
async def download_rulebook_pdf():
    if not APPROVAL_MATRIX_PATH.exists():
        raise HTTPException(404, "Rulebook file not found")
    return _markdown_to_pdf_response(
        APPROVAL_MATRIX_PATH,
        title="MPCA Approval Matrix v0.1",
        filename="MPCA_Approval_Matrix_v0.1.pdf",
    )


@api_router.get("/meeting-agenda/download.md")
async def download_agenda_md():
    path = Path("/app/memory/MPCA_MEETING_AGENDA.md")
    if not path.exists():
        raise HTTPException(404, "Agenda file not found")
    return FileResponse(str(path), media_type="text/markdown", filename="MPCA_Meeting_Agenda.md")


@api_router.get("/meeting-agenda/download.pdf")
async def download_agenda_pdf():
    path = Path("/app/memory/MPCA_MEETING_AGENDA.md")
    if not path.exists():
        raise HTTPException(404, "Agenda file not found")
    return _markdown_to_colored_pdf(
        path,
        title="MPCA ERP · Stakeholder Review",
        filename="MPCA_Meeting_Agenda.pdf",
    )


