"""Shared infrastructure: db client, api_router, logger, paths."""
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).resolve().parent.parent  # /app/backend
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mpca-erp")

UPLOAD_ROOT = ROOT_DIR / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

APPROVAL_MATRIX_PATH = Path("/app/memory/APPROVAL_MATRIX.md")
MEETING_AGENDA_PATH = Path("/app/memory/MPCA_MEETING_AGENDA.md")
