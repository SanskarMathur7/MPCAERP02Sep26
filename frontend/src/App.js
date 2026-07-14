import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/AppLayout";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Members from "@/pages/Members";
import MemberDetail from "@/pages/MemberDetail";
import MemberNew from "@/pages/MemberNew";
import MemberCard from "@/pages/MemberCard";
import Disclosures from "@/pages/Disclosures";
import Meetings from "@/pages/Meetings";
import MeetingDetail from "@/pages/MeetingDetail";
import MeetingNew from "@/pages/MeetingNew";
import Elections from "@/pages/Elections";
import ElectionDetail from "@/pages/ElectionDetail";
import ElectionNew from "@/pages/ElectionNew";
import Verify from "@/pages/Verify";
import Fees from "@/pages/Fees";
import Bank from "@/pages/Bank";
import BankAccountDetail from "@/pages/BankAccountDetail";
import FinancialPowers from "@/pages/FinancialPowers";
import MemberProfile from "@/pages/MemberProfile";
import OrgStructure from "@/pages/OrgStructure";
import Claims from "@/pages/Claims";
import ClaimNew from "@/pages/ClaimNew";
import Budgets from "@/pages/Budgets";
import Procurement from "@/pages/Procurement";
import Vendors from "@/pages/Vendors";
import VendorBills from "@/pages/VendorBills";
import TournamentBudgets from "@/pages/TournamentBudgets";
import VenuesGrounds from "@/pages/VenuesGrounds";
import SelectionFunnel from "@/pages/SelectionFunnel";
import Players from "@/pages/Players";
import PlayerDetail from "@/pages/PlayerDetail";
import Tournaments from "@/pages/Tournaments";
import TournamentDetail from "@/pages/TournamentDetail";
import Fixtures from "@/pages/Fixtures";
import AuditLog from "@/pages/AuditLog";
import Rulebook from "@/pages/Rulebook";
import DivisionGrants from "@/pages/DivisionGrants";
import Ledger from "@/pages/Ledger";
import BudgetVsActual from "@/pages/BudgetVsActual";
import PurchaseOrders from "@/pages/PurchaseOrders";
import VendorKYC from "@/pages/VendorKYC";
import AssetRegister from "@/pages/AssetRegister";
import Payroll from "@/pages/Payroll";
import DMS from "@/pages/DMS";
import Compliance from "@/pages/Compliance";

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
                <BrowserRouter>
                    <Routes>
                        {/* Public routes */}
                        <Route path="/" element={<Landing />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/disclosures-public" element={<Disclosures publicView />} />
                        <Route path="/verify/:uid" element={<Verify />} />
                        <Route path="/member-profile/:uid" element={<MemberProfile />} />

                        {/* Protected — Phase 1 */}
                        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
                        <Route path="/org" element={<Protected><OrgStructure /></Protected>} />
                        <Route path="/rulebook" element={<Protected><Rulebook /></Protected>} />
                        <Route path="/members" element={<Protected><Members /></Protected>} />
                        <Route path="/members/new" element={<Protected><MemberNew /></Protected>} />
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
                        <Route path="/fixtures" element={<Protected><Fixtures /></Protected>} />
                        <Route path="/audit-log" element={<Protected><AuditLog /></Protected>} />
                        <Route path="/tournaments/:id" element={<Protected><TournamentDetail /></Protected>} />

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

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </div>
    );
}

export default App;
