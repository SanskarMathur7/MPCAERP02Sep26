"""Routes · Bank Accounts + Transactions"""
from datetime import datetime, timezone, date
from typing import List, Optional, Literal
import uuid
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict

from core.infra import db, api_router
from models import BankAccount, BankAccountCreate, BankTransaction, BankTransactionCreate
from core.helpers import next_uid as _


@api_router.get("/bank/accounts", response_model=List[BankAccount])
async def list_bank_accounts():
    docs = await db.bank_accounts.find({}, {"_id": 0}).sort("name", 1).to_list(50)
    return docs


@api_router.post("/bank/accounts", response_model=BankAccount)
async def create_bank_account(payload: BankAccountCreate):
    data = payload.model_dump()
    if not data.get("current_balance"):
        data["current_balance"] = data.get("opening_balance", 0.0)
    acct = BankAccount(**data)
    await db.bank_accounts.insert_one(acct.model_dump())
    return acct


@api_router.get("/bank/accounts/{account_id}", response_model=BankAccount)
async def get_bank_account(account_id: str):
    doc = await db.bank_accounts.find_one({"id": account_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Account not found")
    return doc


@api_router.get("/bank/transactions", response_model=List[BankTransaction])
async def list_transactions(account_id: Optional[str] = None, limit: int = 200):
    query = {"account_id": account_id} if account_id else {}
    docs = await db.bank_txns.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    return docs


@api_router.post("/bank/transactions", response_model=BankTransaction)
async def add_transaction(payload: BankTransactionCreate):
    acct = await db.bank_accounts.find_one({"id": payload.account_id}, {"_id": 0})
    if not acct:
        raise HTTPException(404, "Account not found")
    delta = payload.amount if payload.txn_type == "Credit" else -payload.amount
    new_balance = round(acct["current_balance"] + delta, 2)
    txn = BankTransaction(balance_after=new_balance, **payload.model_dump())
    await db.bank_txns.insert_one(txn.model_dump())
    await db.bank_accounts.update_one(
        {"id": payload.account_id}, {"$set": {"current_balance": new_balance}}
    )
    return txn


