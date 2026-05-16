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

const ProtectedShell = ({ children }) => {
    const { isAuthed } = useAuth();
    if (!isAuthed) return <Navigate to="/login" replace />;
    return <AppLayout>{children}</AppLayout>;
};

function App() {
    return (
        <div className="App">
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/disclosures-public" element={<Disclosures publicView />} />

                        {/* Protected (demo persona) */}
                        <Route
                            path="/dashboard"
                            element={
                                <ProtectedShell>
                                    <Dashboard />
                                </ProtectedShell>
                            }
                        />
                        <Route
                            path="/members"
                            element={
                                <ProtectedShell>
                                    <Members />
                                </ProtectedShell>
                            }
                        />
                        <Route
                            path="/members/new"
                            element={
                                <ProtectedShell>
                                    <MemberNew />
                                </ProtectedShell>
                            }
                        />
                        <Route
                            path="/members/:id"
                            element={
                                <ProtectedShell>
                                    <MemberDetail />
                                </ProtectedShell>
                            }
                        />
                        <Route
                            path="/members/:id/card"
                            element={
                                <ProtectedShell>
                                    <MemberCard />
                                </ProtectedShell>
                            }
                        />
                        <Route
                            path="/disclosures"
                            element={
                                <ProtectedShell>
                                    <Disclosures />
                                </ProtectedShell>
                            }
                        />

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </div>
    );
}

export default App;
