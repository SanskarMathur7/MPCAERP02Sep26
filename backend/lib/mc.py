"""lib/mc.py — Iter 109 · Dynamic Maker-Checker engine (config-driven).

Every workflow plugs into ONE engine. Workflow configs live in the
`mc_workflows` Mongo collection so MPCA can add/edit them from an admin UI
without a code change.

Doc-side conventions (any collection can adopt these keys):
    - mc_status:     current M&C status (e.g. "Draft", "PendingReview", "Approved")
    - mc_chain:      audit trail of every action taken
    - mc_approvals:  running list of checker approvals when a step needs
                     multiple checkers (mode = "all")

Workflow config schema (see /app/backend/scripts/seed_mc_workflows.py).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from core.infra import db, logger
from lib.authz import RequestPrincipal, require_scope


# ═══════════════ Config resolution ═══════════════════════════════════════

async def load_workflow(key: str) -> dict:
    wf = await db.mc_workflows.find_one({"key": key}, {"_id": 0})
    if not wf:
        raise HTTPException(404, f"Unknown M&C workflow: {key}")
    if not wf.get("enabled", True):
        raise HTTPException(409, f"M&C workflow '{key}' is disabled")
    wf.setdefault("id_field", "id")
    wf.setdefault("status_field", "mc_status")
    wf.setdefault("chain_field", "mc_chain")
    wf.setdefault("approvals_field", "mc_approvals")
    wf.setdefault("initial_status", "Draft")
    wf.setdefault("return_to", "Draft")
    wf.setdefault("terminal_statuses", [])
    wf.setdefault("steps", [])
    return wf


async def list_workflows(enabled_only: bool = False) -> list[dict]:
    q = {"enabled": True} if enabled_only else {}
    cur = db.mc_workflows.find(q, {"_id": 0}).sort("label", 1)
    return await cur.to_list(length=None)


# ═══════════════ Post matching ═══════════════════════════════════════════

def _principal_matches_post(principal: RequestPrincipal, post: dict, doc_body_code: Optional[str]) -> bool:
    scope = (post.get("body_scope") or "").lower()
    title = (post.get("post_title") or "").strip().lower()
    p_type = (principal.body_type or "").lower()
    p_title = (getattr(principal, "post_title", None) or "").strip().lower()

    if title and title != p_title:
        return False
    if scope in ("", "any"):
        pass
    elif scope == "state" and p_type != "state":
        return False
    elif scope == "division" and p_type != "division":
        return False
    elif scope == "district" and p_type != "district":
        return False
    elif scope == "official" and p_type not in ("official", "match_official"):
        return False

    if doc_body_code and scope in ("division", "district"):
        try:
            require_scope(principal, doc_body_code)
        except HTTPException:
            return False
    return True


def _post_key(post: dict) -> str:
    return f'{(post.get("body_scope") or "").lower()}::{(post.get("post_title") or "").lower()}'


# ═══════════════ Chain building ══════════════════════════════════════════

def _make_chain_entry(principal: RequestPrincipal, step: dict, from_s: str, to_s: str, note: Optional[str], partial: bool = False) -> dict:
    return {
        "actor_id":    principal.user_id,
        "actor_name":  principal.name,
        "actor_email": principal.email,
        "actor_role":  principal.role.value,
        "actor_body":  principal.body_code,
        "actor_post":  getattr(principal, "post_title", None) or principal.post,
        "action":      step.get("action"),
        "label":       step.get("label"),
        "from":        from_s,
        "to":          to_s,
        "note":        (note or "").strip(),
        "partial":     partial,
        "returns":     bool(step.get("returns")),
        "at":          datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════ Introspection ═══════════════════════════════════════════

async def list_next_actions(wf_key: str, doc: dict, principal: RequestPrincipal) -> list[dict]:
    wf = await load_workflow(wf_key)
    current = doc.get(wf["status_field"]) or wf["initial_status"]
    chain = doc.get(wf["chain_field"]) or []
    approvals = doc.get(wf["approvals_field"]) or []
    doc_body = doc.get("body_code") or doc.get("body_id") or None

    out = []
    for step in wf["steps"]:
        if step.get("from") != current:
            continue
        posts = step.get("posts") or []
        if not posts:
            continue
        if not any(_principal_matches_post(principal, p, doc_body) for p in posts):
            continue
        if step.get("requires_two_person"):
            prior_ids = {c.get("actor_id") for c in chain if c.get("action") == step.get("action")}
            if principal.user_id in prior_ids:
                continue
        if step.get("checker_mode") == "all" and len(posts) > 1:
            my_key = _post_key({"body_scope": principal.body_type, "post_title": getattr(principal, "post_title", None)})
            already = any(_post_key(a) == my_key and a.get("step_id") == step.get("id") for a in approvals)
            if already:
                continue
        out.append({
            "step_id":      step.get("id"),
            "action":       step.get("action"),
            "label":        step.get("label"),
            "target":       step.get("to"),
            "needs_note":   bool(step.get("needs_note")),
            "returns":      bool(step.get("returns")),
            "checker_mode": step.get("checker_mode"),
        })
    return out


def _pending_checker_summary(step: dict, approvals: list[dict]) -> dict:
    all_posts = step.get("posts") or []
    signed_keys = {_post_key(a) for a in approvals if a.get("step_id") == step.get("id")}
    pending = [p for p in all_posts if _post_key(p) not in signed_keys]
    return {
        "required":  all_posts,
        "signed":    [a for a in approvals if a.get("step_id") == step.get("id")],
        "pending":   pending,
    }


# ═══════════════ Transition executor ═════════════════════════════════════

async def apply_transition(wf_key: str, doc_id: str, action: str, principal: RequestPrincipal, note: Optional[str] = None) -> dict:
    wf = await load_workflow(wf_key)
    coll = db[wf["collection"]]
    doc = await coll.find_one({wf["id_field"]: doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, f"{wf.get('label') or wf_key}: document not found")

    doc_body = doc.get("body_code") or doc.get("body_id") or None
    current = doc.get(wf["status_field"]) or wf["initial_status"]

    step = next((s for s in wf["steps"] if s.get("from") == current and s.get("action") == action), None)
    if not step:
        raise HTTPException(400, f"No transition '{action}' from '{current}' in {wf_key}")

    posts = step.get("posts") or []
    if not posts:
        raise HTTPException(400, f"Step '{action}' has no posts configured yet — use the M&C Admin console to map maker/checker.")
    if not any(_principal_matches_post(principal, p, doc_body) for p in posts):
        raise HTTPException(403, f"Your post '{getattr(principal, 'post_title', principal.post) or ''}' is not authorised for this action")

    if step.get("needs_note") and not (note or "").strip():
        raise HTTPException(400, f"'{step.get('label') or action}' requires a note")

    chain_field = wf["chain_field"]
    status_field = wf["status_field"]
    approvals_field = wf["approvals_field"]
    chain = doc.get(chain_field) or []
    approvals = doc.get(approvals_field) or []

    if step.get("requires_two_person"):
        prior_ids = {c.get("actor_id") for c in chain if c.get("action") == action}
        if principal.user_id in prior_ids:
            raise HTTPException(403, "Two-person rule: you cannot act on this step twice")

    checker_mode = step.get("checker_mode")
    multi_required = checker_mode == "all" and len(posts) > 1

    if multi_required:
        my_key = _post_key({"body_scope": principal.body_type, "post_title": getattr(principal, "post_title", None)})
        step_signed = {_post_key(a) for a in approvals if a.get("step_id") == step.get("id")}
        if my_key in step_signed:
            raise HTTPException(400, "You have already approved this step")
        approvals_entry = {
            "step_id":     step.get("id"),
            "action":      action,
            "actor_id":    principal.user_id,
            "actor_name":  principal.name,
            "body_scope":  principal.body_type,
            "post_title":  getattr(principal, "post_title", None) or principal.post,
            "body_code":   principal.body_code,
            "at":          datetime.now(timezone.utc).isoformat(),
            "note":        (note or "").strip(),
        }
        new_approvals = approvals + [approvals_entry]
        required_keys = {_post_key(p) for p in posts}
        signed_now = {_post_key(a) for a in new_approvals if a.get("step_id") == step.get("id")}
        will_transition = required_keys.issubset(signed_now)

        entry = _make_chain_entry(principal, step, current, step["to"] if will_transition else current, note, partial=not will_transition)
        update = {
            "$push": {chain_field: entry, approvals_field: approvals_entry},
            "$set":  {"updated_at": datetime.now(timezone.utc).isoformat()},
        }
        if will_transition:
            update["$set"][status_field] = step["to"]
        await coll.update_one({wf["id_field"]: doc_id}, update)
        await _write_audit(wf_key, wf, doc_id, principal, current, step["to"] if will_transition else current, entry["note"], partial=not will_transition)
        return await coll.find_one({wf["id_field"]: doc_id}, {"_id": 0})

    # Single-actor path
    entry = _make_chain_entry(principal, step, current, step["to"], note)
    await coll.update_one(
        {wf["id_field"]: doc_id},
        {
            "$push": {chain_field: entry},
            "$set":  {status_field: step["to"], "updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    await _write_audit(wf_key, wf, doc_id, principal, current, step["to"], entry["note"])
    return await coll.find_one({wf["id_field"]: doc_id}, {"_id": 0})


async def _write_audit(wf_key: str, wf: dict, doc_id: str, principal: RequestPrincipal, from_s: str, to_s: str, note: str, partial: bool = False):
    try:
        await db.audit_log.insert_one({
            "actor":       principal.name or principal.email,
            "action":      f"mc.{wf_key}.{'partial' if partial else 'transition'}",
            "entity_type": wf["collection"],
            "entity_id":   doc_id,
            "delta":       {"from": from_s, "to": to_s, "note": note},
            "created_at":  datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:  # noqa: BLE001
        logger.warning("mc audit failed: %s", e)


# ═══════════════ Inbox / rework helpers ═════════════════════════════════

async def needs_rework_inbox(principal: RequestPrincipal) -> dict:
    """Docs sitting at return_to that the caller can rework (i.e. their post
    is a valid maker for a submit-step from return_to)."""
    wfs = await list_workflows(enabled_only=True)
    buckets = []
    total = 0
    for wf in wfs:
        return_to = wf.get("return_to") or wf.get("initial_status") or "Draft"
        status_field = wf.get("status_field", "mc_status")
        chain_field = wf.get("chain_field", "mc_chain")
        coll_name = wf.get("collection")
        if not coll_name:
            continue
        maker_steps = [s for s in wf.get("steps", []) if s.get("from") == return_to and not s.get("returns")]
        can_rework = any(
            _principal_matches_post(principal, p, None)
            for s in maker_steps for p in (s.get("posts") or [])
        )
        if not can_rework:
            continue
        coll = db[coll_name]
        try:
            cur = coll.find(
                {status_field: return_to, chain_field + ".returns": True},
                {"_id": 0},
            ).limit(50)
            docs = await cur.to_list(length=None)
        except Exception:
            docs = []
        if not docs:
            continue
        total += len(docs)
        buckets.append({
            "workflow_key":   wf["key"],
            "workflow_label": wf.get("label"),
            "collection":     coll_name,
            "count":          len(docs),
            "items": [
                {
                    "id": d.get(wf["id_field"]),
                    "name": d.get("name") or d.get("player_name") or d.get("title") or d.get("ref") or d.get(wf["id_field"]),
                    "status": d.get(status_field),
                }
                for d in docs
            ],
        })
    return {"count": total, "buckets": buckets}


def build_state_view(wf: dict, doc: dict) -> dict:
    status = doc.get(wf["status_field"]) or wf["initial_status"]
    chain = doc.get(wf["chain_field"]) or []
    approvals = doc.get(wf.get("approvals_field", "mc_approvals")) or []
    step_previews = []
    for step in wf["steps"]:
        if step.get("from") != status:
            continue
        step_previews.append({
            "step_id":       step.get("id"),
            "action":        step.get("action"),
            "label":         step.get("label"),
            "target":        step.get("to"),
            "checker_mode":  step.get("checker_mode"),
            "returns":       bool(step.get("returns")),
            "posts":         step.get("posts") or [],
            "progress":      _pending_checker_summary(step, approvals),
        })
    return {
        "status":     status,
        "chain":      chain,
        "approvals":  approvals,
        "steps":      step_previews,
        "terminal":   status in (wf.get("terminal_statuses") or []),
    }
