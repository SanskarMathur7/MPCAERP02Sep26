# MPCA ERP · Tournament Lifecycle Reference

> **Source of truth**: `tournament_wiring` singleton (9 steps × 8 types × 8 attributes)
> **Advisory doc** — every step remains clickable in the ERP; the wiring only *labels*, it never *blocks*.

Format is uniform for all 8 types:
- **9-Step Table** — who takes action + who approves
- **Cast** — personas involved
- **Money Flow** — grant + reimbursement path
- **Wiring Enforcement** — what the ERP auto-does per this type
- **Rough Edge** — honest gap I saw while walking through it

---

## 1️⃣ BCCI Tournament (Ranji · Vijay Hazare · Syed Mushtaq Ali · Duleep · Irani · Nayudu)
**Wiring key**: `bcci` · **Owner**: MPCA · **Visibility to MPCA**: Realtime · **Example**: *Ranji Trophy Elite MPCA 2026-27*

| # | Step | Who acts | Approver | What happens |
|---|---|---|---|---|
| 1 | Tournament Creation | 🔴 **MPCA Secretary** | None | Creates on the platform; BCCI has already allotted this fixture to MP |
| 2 | Pool / Basics | 🔴 **MPCA Secretary** | None | Only ONE selectable "host division" (Holkar / Roshanpura); multiple match pools allowed |
| 3 | Match Official Posting | 🔴 **MPCA Secretary** | 🔴 **MPCA Secretary** | Same as Inter-Div — MPCA posts umpires · scorers · referees |
| 4 | Squad | 🔴 **MPCA Secretary** (Manual PDF only) | None | MPCA uploads the signed MP squad list. No register-linked selection — the MP team is chosen by state selectors offline |
| 5 | Squad Approval by MPCA | ⊘ NA | — | MPCA uploaded it directly → no separate approval step |
| 6 | Match Calendar | 🔴 **MPCA Secretary** (Manual entry) | None | Away teams are other states (Gujarat, Odisha, Vidarbha) — typed manually |
| 7 | Unified Budget | 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Auto per rate card. **Special rule**: both teams' full squads count as AWAY pax (no home-side exemption) |
| 8 | Finance Console | 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Normal / full — receipts, deductions, UTR |
| 9 | MPCA Visibility | ⓘ Info | — | Realtime — MPCA sees everything as it happens |

**Cast**: MPCA Secretary (Shri Sanjeev Dua) · MPCA Treasurer · Manager (Shri Sanjay Jagdale) · Coach (Shri Chandrakant Pandit) · BCCI-appointed umpires and referees

**Money Flow**:
```
MPCA books hosting cost → invoices submitted to BCCI → BCCI reimburses via hosting fee + participation subsidy
```
- **Scheme**: `2-A` (host) · **BCCI's "Guidelines to Staging Associations 2025-26"** for reimbursement caps

**Wiring Enforcement**:
- ✅ Squad box shows `OPTIONAL·NOT USED` on Squad Approval (dashed gray, still clickable)
- ✅ Squad picker defaults to Manual-PDF mode
- ✅ Match Calendar accepts free-text team names (not master-registry-limited)

**Rough Edge**: BCCI reimbursement claim isn't submitted to *MPCA's* Finance Console — it goes to *BCCI* externally. The current Finance Console treats it as a normal MPCA-approved claim which is a slight mismatch. **Fix later**: add a `bcci_claim` sub-type that prints BCCI's own claim template instead of the MPCA voucher.

---

## 2️⃣ Inter-Divisional Tournament (MPCA-run)
**Wiring key**: `interdiv` · **Owner**: MPCA (allots) → Division (hosts) · **Visibility**: Realtime · **Example**: *MY Memorial Trophy 2026-27* (all 10 MP Divisions)

| # | Step | Who acts | Approver | What happens |
|---|---|---|---|---|
| 1 | Tournament Creation | 🔴 **MPCA Secretary** | None | Allots the tournament to a host Division per the CDC calendar |
| 2 | Pool / Basics | 🔴 **MPCA Secretary** | None | Sets all 10 Divisions into pools (e.g. 2 pools of 5 for league + KO) |
| 3 | Match Official Posting | 🔴 **MPCA Secretary** | 🔴 **MPCA Secretary** | MPCA posts umpires/scorers from divisional rosters |
| 4 | Squad | 🟠 **Each Division Secretary** (Register-linked) | 🔴 **MPCA Secretary** (step 5) | Every participating Division selects from their **Player Register** — 15 players + Captain/VC/WK/Coach/Manager |
| 5 | Squad Approval by MPCA | 🔴 **MPCA Secretary** | 🔴 **MPCA Secretary** | Reviews each Division's squad, approves or sends back with comments |
| 6 | Match Calendar | 🔴 **MPCA Secretary** | None | Full auto — fixtures generated from pools, with dates + venues |
| 7 | Unified Budget | 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Auto per Rate Card. Host = scheme `2-D`; Visitors = scheme `2-C` |
| 8 | Finance Console | 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Divisions submit claims after their matches; MPCA approves + pays each Division separately |
| 9 | MPCA Visibility | ⓘ Info | — | Realtime |

**Cast**: MPCA Secretary + Treasurer · 10 Division Secretaries · 10 Division Treasurers · umpires/scorers · Match Officials

**Money Flow**:
```
                    MPCA (funds pool)
                          ↓
       ┌──────────────────┴────────────────┐
       ↓                                    ↓
Host Division                     Visiting Divisions × 9
(hosting cost @ 2-D)              (travel + DA per 2-C)
       ↓                                    ↓
       └────── consolidated claim ──────────┘
                          ↓
                MPCA Treasurer approves + pays each Division individually
```
- **Scheme**: `2-D` (host) + `2-C` (visitors) · Reference Scheme pp.11-13

**Wiring Enforcement**:
- ✅ All 9 steps active (M×8 + INFO×1) — the most rigorous flow
- ✅ Squad in Register-linked mode
- ✅ Squad Approval blocks nothing but is Mandatory to mark done

**Rough Edge**: The claim submission is per-Division but the Unified Budget is one document. If a Visiting Division exceeds its `2-C` cap, the current ERP doesn't split the "over-cap" amount into a separate "Division bears" bucket automatically. **Fix later**: add a cap-breach warning in Finance Console.

---

## 3️⃣ Pre-Tournament Camp (Division-run, auto-linked to Inter-Div)
**Wiring key**: `camp` · **Owner**: Division (Auto-linked to parent) · **Visibility**: On-Submit · **Example**: *Bhopal Pre-Tournament Camp for MY Memorial 2026-27*

| # | Step | Who acts | Approver | What happens |
|---|---|---|---|---|
| 1 | Tournament Creation | ⊘ NA | — | Not created fresh — the Division picks an active Inter-Div tournament to link to. The camp is auto-created off that parent |
| 2 | Pool / Basics | ⊘ NA | — | Single division only — no pools |
| 3 | Match Official Posting | ⊘ NA | — | No matches → no officials |
| 4 | Squad | 🟠 **Division Secretary** (Register-linked, planning) | None | Selects a pre-tournament training squad from Register; locks for reference (larger than the final 15) |
| 5 | Squad Approval by MPCA | ⊘ NA | — | MPCA does NOT approve pre-camp squads |
| 6 | Match Calendar | 🟠 **Division Secretary** (Optional, Manual) | None | Division may add practice-match fixtures for reference. Not officially tracked |
| 7 | Unified Budget | 🟠 **Division Treasurer** | None | Auto per Rate Card `3-D`. Division owns & uploads. MPCA has no role until submit |
| 8 | Finance Console | 🟠 **Division Treasurer** → 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Division submits camp claim as part of the parent Inter-Div reimbursement bundle |
| 9 | MPCA Visibility | ⓘ Info | — | On final claim submission only |

**Cast**: Division Secretary · Division Treasurer · Camp Coach · Camp Trainer · Camp Manager · Division Selection Committee

**Money Flow**:
```
Division (funds camp upfront) → attaches expense to parent Inter-Div claim
                                                ↓
                                    MPCA Treasurer reimburses as part of the Inter-Div reimbursement
```
- **Scheme**: `3-D` (Pre-Tournament Camp rate card)

**Wiring Enforcement**:
- ✅ Multiple NA steps show `OPTIONAL·NOT USED` (still clickable)
- ✅ Not visible in MPCA's state list until parent Inter-Div claim is submitted (Ship 4 filter)

**Rough Edge**: The parent-child link between Pre-Camp and Inter-Div tournament is stored in the `camps` collection (not `tournaments`), so **it doesn't appear in the main Tournaments list**. It shows up under a separate Camps tab. This can confuse users looking for "all things happening this month." **Fix later**: surface Pre-Camps as a chip on the parent Inter-Div tournament header.

---

## 4️⃣ Inter-School Tournament (Division-run, allotted to Schools)
**Wiring key**: `interschool` · **Owner**: Division · **Visibility**: On-Submit · **Example**: *Bhopal Division Inter-School Championship U-19*

| # | Step | Who acts | Approver | What happens |
|---|---|---|---|---|
| 1 | Tournament Creation | 🟠 **Division Secretary** | None | Division creates it (not MPCA) |
| 2 | Pool / Basics | ⊘ NA | — | Straight knockout — no pools |
| 3 | Match Official Posting | ⊘ NA | — | Schools bring their own umpires. No MPCA/Division officials assigned |
| 4 | Squad | 🟠 **Division Secretary** (Manual PDF) | None | Division uploads signed squad PDF listing all participating schools' teams |
| 5 | Squad Approval by MPCA | ⊘ NA | — | No MPCA approval |
| 6 | Match Calendar | 🟠 **Division Secretary** (Optional, all-manual) | None | Division may add fixtures with fully manual team-name fields (School names aren't in a registry) |
| 7 | Unified Budget | 🟠 **Division Treasurer** | None | Auto from (players × Rate Card `2-A`). Division locks. MPCA plays no role until submit. **Entry fee ₹1,500/team** collected by host, declared with the claim |
| 8 | Finance Console | 🟠 **Division Treasurer** → 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Division submits net claim (expenses − entry fees collected) |
| 9 | MPCA Visibility | ⓘ Info | — | On final claim submission only |

**Cast**: Division Secretary · Division Treasurer · Participating school coaches (external)

**Money Flow**:
```
Schools pay entry fee ₹1.5k × N → Division pool
                                        ↓
        Division runs the tournament, pays umpires + logistics
                                        ↓
   Net cost = Total expense − Entry-fee pool → submitted to MPCA
                                        ↓
                        MPCA reimburses the net amount
```
- **Scheme**: `2-A` · Reference Scheme p.7 · Knockout only · 25 overs (till SF), 50 overs (SF+F) · Daily grant ₹5k

**Wiring Enforcement**:
- ✅ 4 setup boxes show `OPTIONAL·NOT USED` (Pool, Officials, Squad Approval, Match Calendar-optional)
- ✅ Squad in Manual-PDF mode
- ✅ Hidden from MPCA's default state list until claim submitted

**Rough Edge**: Schools aren't first-class entities in the ERP — they're free-text names on the squad PDF. If a School participates in multiple tournaments over years, we can't track cumulative participation or funding. **Fix later**: Add a lightweight `schools` collection (name + city + coach contact) if this becomes a governance requirement.

---

## 5️⃣ Inter-Club Tournament ('A' Grade Clubs)
**Wiring key**: `interclub` · **Owner**: Division · **Visibility**: On-Submit · **Example**: *Indore A-Grade Cup 2026-27*

| # | Step | Who acts | Approver | What happens |
|---|---|---|---|---|
| 1 | Tournament Creation | 🟠 **Division Secretary** | None | Division allots to its A-Grade Clubs |
| 2 | Pool / Basics | ⊘ NA | — | No pools |
| 3 | Match Official Posting | ⊘ NA | — | Clubs bring their own; not MPCA/Division-posted |
| 4 | Squad | 🟠 **Division Secretary** (Manual PDF) | None | Division uploads signed squad PDF of all participating clubs' teams |
| 5 | Squad Approval by MPCA | ⊘ NA | — | No MPCA approval |
| 6 | Match Calendar | 🟠 **Division Secretary** (Optional, all-manual) | None | Two-day KO fixtures with manual club-name entry |
| 7 | Unified Budget | 🟠 **Division Treasurer** | None | Auto from (players × Rate Card `2-E`). **Special rule**: **only** two-day knockout format is reimbursable — one-day / league-cum-knockout is NOT |
| 8 | Finance Console | 🟠 **Division Treasurer** → 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Division submits claim; MPCA verifies format was 2-day KO |
| 9 | MPCA Visibility | ⓘ Info | — | On final claim submission only |

**Cast**: Division Secretary · Division Treasurer · A-Grade Club managers (external) · Umpires supplied by clubs

**Money Flow**:
```
Clubs bear their own local expenses → Division reimburses per-match on Rate Card 2-E
                                                      ↓
                       Outstation clubs get stay + food + travel (extra)
                                                      ↓
                          Division consolidates → MPCA reimburses
```
- **Scheme**: `2-E` · Reference Scheme pp.14-15

**Wiring Enforcement**:
- ✅ 4 NA boxes shown as `OPTIONAL·NOT USED`
- ✅ Format-check warning if user tries a one-day KO (should be in Budget compute — currently not enforced, see rough edge)

**Rough Edge**: The "only 2-day KO reimbursed" rule is **not** enforced in code today — the Budget compute accepts any format the user picks. **Fix later**: add a hard check in Unified Budget compute that returns a 422 if `format != 'Multi_Day'` for interclub tournaments. Or make it a soft warning on the Finance Console.

---

## 6️⃣ Periodical Coaching Camp (Rural / District players)
**Wiring key**: `coachingcamp` · **Owner**: Division · **Visibility**: On-Submit · **Example**: *Ujjain Rural Coaching Camp U-16*

| # | Step | Who acts | Approver | What happens |
|---|---|---|---|---|
| 1 | Tournament Creation | 🟠 **Division Secretary** | None | Division allots the camp for its rural/district players |
| 2 | Pool / Basics | ⊘ NA | — | No pools — single-camp |
| 3 | Match Official Posting | ⊘ NA | — | No matches, so no officials |
| 4 | Squad | 🟠 **Division Secretary** (Manual PDF) | None | Uploads signed camp roster (typically 30-40 players) |
| 5 | Squad Approval by MPCA | ⊘ NA | — | No MPCA approval |
| 6 | Match Calendar | 🟠 **Division Secretary** (Optional, all-manual) | None | Division may add practice-match dates for reference |
| 7 | Unified Budget | 🟠 **Division Treasurer** | None | Auto from (players × days × Rate Card `3-A`). Division locks |
| 8 | Finance Console | 🟠 **Division Treasurer** → 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Division submits camp claim |
| 9 | MPCA Visibility | ⓘ Info | — | On final claim submission only |

**Cast**: Division Secretary · Division Treasurer · Camp Coach · Camp Trainer · Nutrition/physio (optional)

**Money Flow**:
```
Division bears camp cost upfront (accommodation + food + coaching fees)
                                        ↓
            Division submits camp claim → MPCA reimburses on 3-A caps
```
- **Scheme**: `3-A` · Reference Scheme p.16 · **Prior MPCA notification is mandatory** (audit trail must show the notification was sent before camp started)
- **Special rule**: NOT available for the camp *before* an Inter-Div tournament (that's what Pre-Tournament Camp is for)

**Wiring Enforcement**:
- ✅ Same NA pattern as Inter-School / Inter-Club
- ✅ Squad Manual-PDF mode

**Rough Edge**: The "prior MPCA notification is mandatory" rule isn't checked by the ERP. Divisions can create a Coaching Camp today and submit its claim without ever notifying MPCA. **Fix later**: add a "notification date" field on Tournament Creation for this type; block claim submission if it's blank or after `start_date`.

---

## 7️⃣ Vacation Camp (Summer / Winter breaks)
**Wiring key**: `vacationcamp` · **Owner**: Division · **Visibility**: On-Submit · **Example**: *Jabalpur Summer Vacation Camp U-14*

| # | Step | Who acts | Approver | What happens |
|---|---|---|---|---|
| 1 | Tournament Creation | 🟠 **Division Secretary** | None | Division opens the vacation camp for its youth players |
| 2 | Pool / Basics | ⊘ NA | — | No pools |
| 3 | Match Official Posting | ⊘ NA | — | No matches |
| 4 | Squad | 🟠 **Division Secretary** (Manual PDF) | None | Uploads signed camp roster (typically 50-60 players — larger than coaching camps) |
| 5 | Squad Approval by MPCA | ⊘ NA | — | No MPCA approval |
| 6 | Match Calendar | 🟠 **Division Secretary** (Optional, all-manual) | None | Division may add exhibition-match fixtures |
| 7 | Unified Budget | 🟠 **Division Treasurer** | None | Auto from (players × days × Rate Card `3-B`) |
| 8 | Finance Console | 🟠 **Division Treasurer** → 🔴 **MPCA Treasurer** | 🔴 **MPCA Treasurer** | Division submits camp claim. **Divisional Secretary must certify no fee was charged from players** — this is a printed undertaking that goes with the claim |
| 9 | MPCA Visibility | ⓘ Info | — | On final claim submission only |

**Cast**: Division Secretary (must sign the "no-fee-charged" undertaking) · Division Treasurer · Camp Coaches · Camp Trainers · Camp Physiotherapist

**Money Flow**:
```
Division bears entire camp cost upfront (₹0 collected from players)
                                        ↓
                    Division submits claim + no-fee undertaking
                                        ↓
                            MPCA reimburses on 3-B caps
```
- **Scheme**: `3-B` · Reference Scheme p.17 · **Divisional Secretary's undertaking mandatory**: "No amount was charged from any player"

**Wiring Enforcement**:
- ✅ Same NA pattern
- ✅ Squad Manual-PDF mode

**Rough Edge**: The "no-fee-charged" undertaking isn't a mandatory attachment in the ERP. Divisions can submit a Vacation Camp claim without uploading the signed undertaking. **Fix later**: Add a mandatory PDF-upload field on Vacation Camp Finance Console with the auto-generated undertaking template that the Division Secretary just signs and re-uploads.

---

## 8️⃣ Inter-District Tournament (Already covered in the previous message)
**Wiring key**: `district` · **Owner**: Division · **Visibility**: On-Submit · **Example**: *Indore Division Inter-District Championship 2026-27*

*Full detail in the previous message — Division creates, posts officials, locks calendar + budget, submits consolidated claim. MPCA has no approval role. 8 Districts participate; each District uploads a signed squad PDF.*

---

## 🎯 Summary Matrix · Who Creates / Approves / Pays

| Tournament Type | Creates | Squad Approves | Finance Approves | MPCA Sees |
|---|---|---|---|---|
| BCCI | MPCA | — | MPCA | Realtime |
| Inter-Divisional | MPCA | MPCA | MPCA | Realtime |
| Pre-Tournament Camp | *Auto from parent* | — | MPCA | On-submit |
| **Inter-District** | Division | — | MPCA | On-submit |
| Inter-School | Division | — | MPCA | On-submit |
| Inter-Club | Division | — | MPCA | On-submit |
| Coaching Camp | Division | — | MPCA | On-submit |
| Vacation Camp | Division | — | MPCA | On-submit |

## 🔍 Wiring Coverage Recap

- **8 types × 9 steps = 72 wiring cells**
- **Only 8 of 72 cells are Mandatory + MPCA-owned** (concentrated in BCCI + Inter-Div)
- **34 of 72 cells are NA** (mostly the Championship-scoped smaller tournaments — School/Club/Camps)
- This ratio is why the wiring epic is such a **cognitive load reducer**: office bearers no longer need to memorise which type needs which step.

---

*Doc version 1 · seeded from `tournament_wiring` singleton · last regenerated on wiring reset.*
