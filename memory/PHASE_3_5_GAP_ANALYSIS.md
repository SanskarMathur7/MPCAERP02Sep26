# MPCA ERP — Critical Architecture Gap (Identified Jan 2026)

> User feedback: "It had approval matrix / approval thresholds / budgets for divisions/districts. Then as an ERP each division/district will have a login in place. Then each lower body applies for grants to upper body for approvals."

## What the plan envisions but **NOT YET BUILT**

### 1. Hierarchical Multi-Tenant Org Structure 🔴 MISSING
The plan implies a 4-tier hierarchy, but the ERP currently models only the State level:

```
MPCA State HQ           ← only this level is built
   ↓
Divisions (Indore, Bhopal, Jabalpur, Gwalior, etc.)
   ↓
District Associations (51 districts in MP)
   ↓
Affiliated Clubs / Schools / Universities
```

Each body should be a **tenant** with:
- Its own login(s) (multi-user, per body)
- Its own member register (scoped to that body)
- Its own bank accounts, invoices, meetings, minutes
- Its own grievance inbox
- Visibility scoping (state HQ sees all; districts see their own only)

### 2. Grant Request / Approval Chain Workflow 🔴 MISSING
Currently there's only a one-page constitutional "Financial Powers" reference. The plan implies a **live workflow**:

```
Club / District submits Grant Request →
  Division reviews & recommends →
    State Hon. Treasurer evaluates →
      State Hon. Secretary co-approves →
        Managing Committee Resolution (if > threshold) →
          State disburses → recipient acknowledges
```

With:
- Request form (purpose, amount, supporting docs)
- Threshold-based routing (auto-escalation rules)
- Approval audit trail (who approved when, with comments)
- Disbursement tracking (links to bank txn)
- Acknowledgement receipt from recipient body

### 3. Per-Body Budget & Threshold Matrix 🟡 PARTIAL
What's built: single static `/financial-powers` table (6 posts at state level)
What's missing:
- Annual budgets per body (state, each division, each district, each club)
- Budget heads (ground maintenance, coaching, equipment, travel, salaries)
- Spend tracking against budget per head per body
- Variance dashboards (over/under budget)
- Per-body approval thresholds (e.g., District Secretary ≤ ₹25k, District Committee ≤ ₹2L, Division ≤ ₹10L, State MC ≤ ₹50L, AGM > ₹50L)

### 4. Inter-body Transactions 🔴 MISSING
- Grant disbursement (State → District)
- Affiliation fee receipts (Club → District → State pyramidal share)
- Inter-account transfers with dual ledger entries

## Updated Phase Roadmap

| Phase | Module | Status |
|---|---|---|
| I | Membership · Disclosures · Identity Card | ✅ Done |
| II | Meetings · Elections · Verify QR | ✅ Done |
| III | Fees · Bank · Financial Powers (state-only) · Member Portal | ✅ Done |
| **III.5 (NEW)** | **Multi-tenant Hierarchy + Grant Workflow + Per-body Budgets** | 🔴 **Critical — must build** |
| III.6 | Real Stripe/UPI payment · Two-signatory approval | ⏳ Planned |
| IV | Player Registration · Squad Reveal · Grievance Redressal | ⏳ Planned |
| V | Constitution Library · AI Assistant · Audit Log · OAuth | ⏳ Planned |

## Proposed Phase III.5 — Multi-Tenant + Grants (3 sprints estimate)

### Sprint 1 — Org hierarchy & tenant scoping
- `bodies` collection: id, name, type (State/Division/District/Club), parent_id, address, registration, signatories
- Seed: MPCA State HQ + 4 divisions + 8 districts + 12 clubs (sample)
- Every existing collection (members, invoices, meetings, txns, etc.) gains a `body_id`
- API middleware: `request.body_context` derived from logged-in user; queries auto-scoped
- New tenant switcher in topbar (state admin can drill down; district admin locked to their body)

### Sprint 2 — Approval matrix & grant workflow
- `approval_thresholds` collection: body_type + role + txn_type → limit + next_approver_rule
- `grant_requests` collection: requester_body, target_body, amount, purpose, attachments, status, approval_chain[]
- Routes: POST /grants, GET /grants/inbox (per role), POST /grants/{id}/approve, POST /grants/{id}/reject
- Workflow engine: auto-routes by amount + body level
- Frontend: `/grants` (list), `/grants/new`, `/grants/:id` (full chain visible)

### Sprint 3 — Budgets & disbursement
- `budgets` collection: body_id, fy, head, allocated_amount, spent_amount
- `/budget` per body: 4 quadrants (allocated / spent / committed / available)
- When grant approved → auto-creates pending bank txn at source body + receivable at target body
- On disbursement confirmation → updates both ledgers + closes grant request

## UI Direction confirmed (user choice)
- **Palette**: BCCI Navy `#0a1f3d` + Indian Saffron `#ff6a13` + Marigold `#e9b949` + Maroon `#7a1f2c` + Warm Cream `#fbf7ed`
- **Icons**: Subtle — replace 5-8 most prominent icons with custom cricket SVG (bat, ball, stumps, helmet, pads, trophy, scorecard, crossed bat & ball)

## Open question for the main agent

Phase III.5 is **architectural** — it touches every collection, every route, every page (because of tenant scoping). It's a 2-3 day rebuild, not a small patch. Recommended order:
1. Build Phase III.5 (multi-tenant + grants + per-body budgets) **first**
2. Apply the Indian palette + cricket icon overhaul **on top of the new structure**
3. Then Phase III.6 (real payment + 2-sig)
4. Then Phase IV (Players + Grievance + Squad reveal)

This order avoids redoing the UI twice.
