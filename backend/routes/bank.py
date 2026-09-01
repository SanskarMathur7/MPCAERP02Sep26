"""Routes · Bank Accounts + Transactions"""
from fastapi import HTTPException

from core.infra import api_router, db
from models import (
    BankAccount,
    BankAccountCreate,
    BankTransaction,
    BankTransactionCreate,
)


@api_router.get("/bank/accounts", response_model=list[BankAccount])
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


@api_router.get("/bank/transactions", response_model=list[BankTransaction])
async def list_transactions(account_id: str | None = None, limit: int = 200):
    query = {"account_id": account_id} if account_id else {}
    docs = await db.bank_txns.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    return docs


@api_router.post("/bank/transactions", response_model=BankTransaction)
async def add_transaction(payload: BankTransactionCreate):
    delta = payload.amount if payload.txn_type == "Credit" else -payload.amount
    # H6 · atomic balance update — a single $inc prevents the lost-update race
    # where two concurrent transactions read the same balance and one overwrites
    # the other. find_one_and_update returns the document AFTER the increment.
    acct = await db.bank_accounts.find_one_and_update(
        {"id": payload.account_id},
        {"$inc": {"current_balance": delta}},
        return_document=True,
    )
    if not acct:
        raise HTTPException(404, "Account not found")
    new_balance = round(acct["current_balance"], 2)
    txn = BankTransaction(balance_after=new_balance, **payload.model_dump())
    await db.bank_txns.insert_one(txn.model_dump())
    return txn


