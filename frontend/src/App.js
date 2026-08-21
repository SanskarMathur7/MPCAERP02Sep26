import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SeasonProvider } from "@/context/SeasonContext";
import AppLayout from "@/components/AppLayout";
// Kept eager: shell + first-paint public routes (avoids a loading flash on entry).
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";

// M9 · route-level code-splitting. Each page is fetched on demand instead of
// bundling all ~60 pages into the initial download, cutting first-load size.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Members = lazy(() => import("@/pages/Members"));
const MemberDetail = lazy(() => import("@/pages/MemberDetail"));
const MemberNew = lazy(() => import("@/pages/MemberNew"));
const MemberCard = lazy(() => import("@/pages/MemberCard"));
const MemberCategories = lazy(() => import("@/pages/MemberCategories"));
const Disclosures = lazy(() => import("@/pages/Disclosures"));
const Meetings = lazy(() => import("@/pages/Meetings"));
const MeetingDetail = lazy(() => import("@/pages/MeetingDetail"));
const MeetingNew = lazy(() => import("@/pages/MeetingNew"));
const Elections = lazy(() => import("@/pages/Elections"));
const ElectionDetail = lazy(() => import("@/pages/ElectionDetail"));
const ElectionNew = lazy(() => import("@/pages/ElectionNew"));
const Verify = lazy(() => import("@/pages/Verify"));
const Fees = lazy(() => import("@/pages/Fees"));
const Bank = lazy(() => import("@/pages/Bank"));
const BankAccountDetail = lazy(() => import("@/pages/BankAccountDetail"));
const FinancialPowers = lazy(() => import("@/pages/FinancialPowers"));
const MemberProfile = lazy(() => import("@/pages/MemberProfile"));
const OrgStructure = lazy(() => import("@/pages/OrgStructure"));
const BodyDetail = lazy(() => import("@/pages/BodyDetail"));
const Claims = lazy(() => import("@/pages/Claims"));
const ClaimNew = lazy(() => import("@/pages/ClaimNew"));
const Budgets = lazy(() => import("@/pages/Budgets"));
const Procurement = lazy(() => import("@/pages/Procurement"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const VendorBills = lazy(() => import("@/pages/VendorBills"));
const TournamentBudgets = lazy(() => import("@/pages/TournamentBudgets"));
const VenuesGrounds = lazy(() => import("@/pages/VenuesGrounds"));
const SelectionFunnel = lazy(() => import("@/pages/SelectionFunnel"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerDetail = lazy(() => import("@/pages/PlayerDetail"));
const Tournaments = lazy(() => import("@/pages/Tournaments"));
const TournamentDetail = lazy(() => import("@/pages/TournamentDetail"));
const TournamentSchedulePDF = lazy(() => import("@/pages/TournamentSchedulePDF"));
const TournamentClosurePDF  = lazy(() => import("@/pages/TournamentClosurePDF"));
const GrantClaimSummaryPDF  = lazy(() => import("@/pages/GrantClaimSummaryPDF"));
const SelectionConsole = lazy(() => import("@/pages/SelectionConsole"));
const MatchOfficials = lazy(() => import("@/pages/MatchOfficials"));
const MyAssignments = lazy(() => import("@/pages/MyAssignments"));
const Fixtures = lazy(() => import("@/pages/Fixtures"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const Rulebook = lazy(() => import("@/pages/Rulebook"));
const DivisionGrants = lazy(() => import("@/pages/DivisionGrants"));
const Ledger = lazy(() => import("@/pages/Ledger"));
const BudgetVsActual = lazy(() => import("@/pages/BudgetVsActual"));
const PurchaseOrders = lazy(() => import("@/pages/PurchaseOrders"));
const VendorKYC = lazy(() => import("@/pages/VendorKYC"));
const AssetRegister = lazy(() => import("@/pages/AssetRegister"));
const Payroll = lazy(() => import("@/pages/Payroll"));
const DMS = lazy(() => import("@/pages/DMS"));
const Compliance = lazy(() => import("@/pages/Compliance"));
const TournamentFinance = lazy(() => import("@/pages/TournamentFinance"));
// M39z.h · TournamentFinanceDetail retired (legacy Finance page). Route now
// redirected via LegacyFinanceRedirect below. Lazy import removed to trim bundle.
const TournamentFinanceConsole = lazy(() => import("@/pages/TournamentFinanceConsole"));
const ReimbursementClaimsList = lazy(() =>
    import("@/pages/ReimbursementClaims").then((m) => ({ default: m.ReimbursementClaimsList })));
const ReimbursementClaimDetail = lazy(() =>
    import("@/pages/ReimbursementClaims").then((m) => ({ default: m.ReimbursementClaimDetail })));
const DivisionReimbursementClaimForm = lazy(() => import("@/pages/DivisionReimbursementClaimForm"));
const MpcaClaimReviewForm = lazy(() => import("@/pages/MpcaClaimReviewForm"));
const MatchOfficialDAVoucher = lazy(() => import("@/pages/MatchOfficialDAVoucher"));
const MatchOfficialFinancePage = lazy(() => import("@/pages/MatchOfficialFinancePage"));
const MPCAShowcase = lazy(() => import("@/pages/MPCAShowcase"));
const UxAuditReview = lazy(() => import("@/pages/UxAuditReview"));
const MyDAForms = lazy(() => import("@/pages/MyDAForms"));
const SquadReview = lazy(() => import("@/pages/SquadReview"));
const SquadDetail = lazy(() => import("@/pages/SquadDetail"));
const SquadNominationForm = lazy(() => import("@/pages/SquadNominationForm"));
const SquadMPCAReviewForm = lazy(() => import("@/pages/SquadMPCAReviewForm"));
const DAReview = lazy(() => import("@/pages/DAReview"));
const MatchOfficialDetail = lazy(() => import("@/pages/MatchOfficialDetail"));
const ActionCenter = lazy(() => import("@/pages/ActionCenter"));
const Discussions = lazy(() => import("@/pages/Discussions"));
const EventCalendar = lazy(() => import("@/pages/EventCalendar"));
const PlayerRegistrations = lazy(() => import("@/pages/PlayerRegistrations"));
const PublicPlayerRegistration = lazy(() => import("@/pages/PublicPlayerRegistration"));
const CampsPage = lazy(() => import("@/pages/Camps"));
const CampDetail = lazy(() => import("@/pages/CampDetail"));
const SchemesMaster = lazy(() => import("@/pages/SchemesMaster"));
const TournamentMasterRegistry = lazy(() => import("@/pages/TournamentMasterRegistry"));
const RateCardMaster = lazy(() => import("@/pages/RateCardMaster"));
const TournamentWiringConsole = lazy(() => import("@/pages/TournamentWiringConsole"));
const GrantClaims = lazy(() => import("@/pages/GrantClaims"));
const TournamentCalendarPage = lazy(() => import("@/pages/TournamentCalendarPage"));
const AccessControl = lazy(() => import("@/pages/AccessControl"));

const PageLoader = () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "#64748b", fontFamily: "system-ui, sans-serif" }}>
        Loading…
    </div>
);

const LegacyFinanceRedirect = () => {
    const { id } = useParams();
    return <Navigate to={`/tournaments/${id}/finance`} replace />;
};

const ProtectedShell = ({ children }) => {
    const { isAuthed } = useAuth();
    if (!isAuthed) return <Navigate to="/login" replace />;
    return <AppLayout>{children}</AppLayout>;
};

const Protected = ({ children }) => (
    <ProtectedShell>{children}</ProtectedShell>
);

function App() {
    return (
        <div className="App">
            <AuthProvider>
                <SeasonProvider>
                <BrowserRouter>
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            {/* Public routes */}
                            <Route path="/" element={<Landing />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/disclosures-public" element={<Disclosures publicView />} />
                            <Route path="/showcase" element={<MPCAShowcase />} />
                            <Route path="/audit-review" element={<UxAuditReview />} />
                            {/* Feb 2026 · /design-lab + /design-preview retired — HUDs now live under /showcase → Command Deck */}
                            <Route path="/design-lab" element={<Navigate to="/showcase" replace />} />
                            <Route path="/design-preview" element={<Navigate to="/showcase" replace />} />
                            <Route path="/design-preview/*" element={<Navigate to="/showcase" replace />} />
                            <Route path="/verify/:uid" element={<Verify />} />
                            <Route path="/member-profile/:uid" element={<MemberProfile />} />
                            <Route path="/register/player/:token" element={<PublicPlayerRegistration />} />

                            {/* Protected — Phase 1 */}
                            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
                            <Route path="/org" element={<Protected><OrgStructure /></Protected>} />
                            <Route path="/org/:code" element={<Protected><BodyDetail /></Protected>} />
                            <Route path="/rulebook" element={<Protected><Rulebook /></Protected>} />
                            <Route path="/members" element={<Protected><Members /></Protected>} />
                            <Route path="/members/new" element={<Protected><MemberNew /></Protected>} />
                            <Route path="/members/categories" element={<Protected><MemberCategories /></Protected>} />
                            <Route path="/members/:id" element={<Protected><MemberDetail /></Protected>} />
                            <Route path="/members/:id/card" element={<Protected><MemberCard /></Protected>} />
                            <Route path="/disclosures" element={<Protected><Disclosures /></Protected>} />

                            {/* Protected — Phase 2: Meetings */}
                            <Route path="/meetings" element={<Protected><Meetings /></Protected>} />
                            <Route path="/meetings/new" element={<Protected><MeetingNew /></Protected>} />
                            <Route path="/meetings/:id" element={<Protected><MeetingDetail /></Protected>} />

                            {/* Protected — Phase 2: Elections */}
                            <Route path="/elections" element={<Protected><Elections /></Protected>} />
                            <Route path="/elections/new" element={<Protected><ElectionNew /></Protected>} />
                            <Route path="/elections/:id" element={<Protected><ElectionDetail /></Protected>} />

                            {/* Protected — Phase 3: Fees, Bank, Financial Powers */}
                            <Route path="/fees" element={<Protected><Fees /></Protected>} />
                            <Route path="/bank" element={<Protected><Bank /></Protected>} />
                            <Route path="/bank/:id" element={<Protected><BankAccountDetail /></Protected>} />
                            <Route path="/financial-powers" element={<Protected><FinancialPowers /></Protected>} />

                            {/* Protected — Phase III.6: Grant Workflow */}
                            <Route path="/claims" element={<Protected><Claims /></Protected>} />
                            <Route path="/claims/new" element={<Protected><ClaimNew /></Protected>} />

                            {/* Protected — Phase III.7: Body Budget Ledger */}
                            <Route path="/budgets" element={<Protected><Budgets /></Protected>} />

                            {/* Protected — Phase III.8: Procurement */}
                            <Route path="/procurement" element={<Protected><Procurement /></Protected>} />
                            <Route path="/vendors" element={<Protected><Vendors /></Protected>} />
                            <Route path="/vendor-bills" element={<Protected><VendorBills /></Protected>} />
                            <Route path="/tournament-budgets" element={<Protected><TournamentBudgets /></Protected>} />
                            <Route path="/venues" element={<Protected><VenuesGrounds /></Protected>} />
                            <Route path="/selection" element={<Protected><SelectionFunnel /></Protected>} />

                            {/* Protected — Phase IV: Player Module */}
                            <Route path="/players" element={<Protected><Players /></Protected>} />
                            <Route path="/players/:id" element={<Protected><PlayerDetail /></Protected>} />

                            {/* Protected — Phase IV.2: Tournament Module */}
                            <Route path="/tournaments" element={<Protected><Tournaments /></Protected>} />
                            <Route path="/tournament-calendar" element={<Protected><TournamentCalendarPage /></Protected>} />
                        <Route path="/access-control" element={<Protected><AccessControl /></Protected>} />
                            <Route path="/fixtures" element={<Protected><Fixtures /></Protected>} />
                            <Route path="/audit-log" element={<Protected><AuditLog /></Protected>} />
                            <Route path="/tournaments/:id" element={<Protected><TournamentDetail /></Protected>} />
                            <Route path="/tournaments/:id/schedule" element={<Protected><TournamentSchedulePDF /></Protected>} />
                            <Route path="/tournaments/:id/closure"  element={<Protected><TournamentClosurePDF /></Protected>} />
                            <Route path="/grant-claims/:id/summary" element={<Protected><GrantClaimSummaryPDF /></Protected>} />
                            <Route path="/tournaments/:id/selection" element={<Protected><SelectionConsole /></Protected>} />
                            <Route path="/selection-funnel" element={<Protected><SelectionFunnel /></Protected>} />
                            <Route path="/match-officials" element={<Protected><MatchOfficials /></Protected>} />
                            <Route path="/my-assignments" element={<Protected><MyAssignments /></Protected>} />
                            <Route path="/match-officials/:id" element={<Protected><MatchOfficialDetail /></Protected>} />

                            {/* Protected — Sprint 1: Finance Rails */}
                            <Route path="/division-grants" element={<Protected><DivisionGrants /></Protected>} />
                            <Route path="/ledger" element={<Protected><Ledger /></Protected>} />
                            <Route path="/budget-vs-actual" element={<Protected><BudgetVsActual /></Protected>} />

                            {/* Protected — Sprint 2: Purchase Orders + Vendor KYC */}
                            <Route path="/purchase-orders" element={<Protected><PurchaseOrders /></Protected>} />
                            <Route path="/vendor-kyc" element={<Protected><VendorKYC /></Protected>} />

                            {/* Protected — Sprint 3: Asset Register + HR/Payroll */}
                            <Route path="/asset-register" element={<Protected><AssetRegister /></Protected>} />
                            <Route path="/payroll" element={<Protected><Payroll /></Protected>} />

                            {/* Protected — Sprint 4: Governance & Compliance */}
                            <Route path="/dms" element={<Protected><DMS /></Protected>} />
                            <Route path="/compliance" element={<Protected><Compliance /></Protected>} />

                            {/* Protected — Sprint T-RIM: Tournament Reimbursement Matrix */}
                            <Route path="/tournament-finance" element={<Protected><TournamentFinance /></Protected>} />
                            <Route path="/tournaments/:id/finance" element={<Protected><TournamentFinanceConsole /></Protected>} />
                            <Route path="/tournaments/:id/finance/legacy" element={<LegacyFinanceRedirect />} />
                            <Route path="/reimbursement-claims" element={<Protected><ReimbursementClaimsList /></Protected>} />
                            <Route path="/reimbursement-claims/:id" element={<Protected><ReimbursementClaimDetail /></Protected>} />
                            <Route path="/reimbursement-claims/:id/division-form" element={<Protected><DivisionReimbursementClaimForm /></Protected>} />
                            <Route path="/reimbursement-claims/:id/mpca-review-form" element={<Protected><MpcaClaimReviewForm /></Protected>} />
                            <Route path="/match-official-da/:did/voucher" element={<Protected><MatchOfficialDAVoucher /></Protected>} />
                            <Route path="/my-finance/:tid" element={<Protected><MatchOfficialFinancePage /></Protected>} />
                            <Route path="/my-da-forms" element={<Protected><MyDAForms /></Protected>} />
                            <Route path="/da-review" element={<Protected><DAReview /></Protected>} />
                            <Route path="/action-center" element={<Protected><ActionCenter /></Protected>} />
                            <Route path="/discussions" element={<Protected><Discussions /></Protected>} />
                            <Route path="/events" element={<Protected><EventCalendar /></Protected>} />
                            <Route path="/squads/:sid/review" element={<Protected><SquadReview /></Protected>} />
                            <Route path="/squads/:sid" element={<Protected><SquadDetail /></Protected>} />
                            <Route path="/squads/:id/nomination-form" element={<Protected><SquadNominationForm /></Protected>} />
                            <Route path="/squads/:id/mpca-review-form" element={<Protected><SquadMPCAReviewForm /></Protected>} />
                            <Route path="/tournaments/:tid/squads/new" element={<Protected><SquadDetail /></Protected>} />
                            <Route path="/player-registrations" element={<Protected><PlayerRegistrations /></Protected>} />
                            <Route path="/camps" element={<Protected><CampsPage /></Protected>} />
                            <Route path="/camps/:cid" element={<Protected><CampDetail /></Protected>} />
                            <Route path="/schemes" element={<Protected><SchemesMaster /></Protected>} />
                            <Route path="/tournament-master" element={<Protected><TournamentMasterRegistry /></Protected>} />
                            <Route path="/rate-cards" element={<Protected><RateCardMaster /></Protected>} />
                            <Route path="/tournament-wiring" element={<Protected><TournamentWiringConsole /></Protected>} />
                            <Route path="/grant-claims" element={<Protected><GrantClaims /></Protected>} />
                            <Route path="/grant-claims/new" element={<Protected><GrantClaims /></Protected>} />

                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Suspense>
                </BrowserRouter>
                </SeasonProvider>
            </AuthProvider>
        </div>
    );
}

export default App;
