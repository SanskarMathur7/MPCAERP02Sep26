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

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </div>
    );
}

export default App;
