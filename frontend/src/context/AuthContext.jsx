import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

// Personas now carry body-scope info: body_type (State/Division/District),
// body_code (MPCA / IND / UJN-MN etc.), and accent for visual differentiation.
export const PERSONAS = [
    {
        id: "president",
        title: "President",
        honorific: "Shri",
        name: "Mahanaryaman Scindia",
        post: "President, MPCA",
        scope: "Full executive — sees all divisions & districts",
        privileges: ["Read All", "Approve", "Chair Meetings", "Sign Resolutions"],
        accent: "navy",
        body_type: "State",
        body_code: "MPCA",
        body_name: "MPCA Headquarters",
    },
    {
        id: "secretary",
        title: "Hon. Secretary",
        honorific: "Shri",
        name: "Sanjeev Rao",
        post: "Honorary Secretary, MPCA",
        scope: "Membership, AGM, register custody — state-wide",
        privileges: ["Manage Members", "Convene Meetings", "Issue Notices"],
        accent: "saffron",
        body_type: "State",
        body_code: "MPCA",
        body_name: "MPCA Headquarters",
    },
    {
        id: "treasurer",
        title: "Hon. Treasurer",
        honorific: "Smt.",
        name: "Meera Verma",
        post: "Honorary Treasurer, MPCA",
        scope: "State bank operations, grants, audit",
        privileges: ["Financial Powers", "Approve Grants", "Bank Signatory"],
        accent: "marigold",
        body_type: "State",
        body_code: "MPCA",
        body_name: "MPCA Headquarters",
        _disabled: true,
    },
    {
        id: "division-secretary",
        title: "Division Secretary",
        honorific: "Shri",
        name: "Vikram Patil",
        post: "Hon. Secretary, Indore Division",
        scope: "Indore Division — 8 districts under jurisdiction",
        privileges: ["Recommend Grants", "Review Districts", "Submit Claims"],
        accent: "maroon",
        body_type: "Division",
        body_code: "DIV-IND",
        body_name: "Indore Division",
    },
    {
        id: "district-secretary",
        title: "District Secretary",
        honorific: "Shri",
        name: "Rajesh Kulkarni",
        post: "Hon. Secretary, Indore District",
        scope: "Indore District — submits claims to Indore Division",
        privileges: ["Submit Claims", "Manage Local Players", "Sign Receipts"],
        accent: "navy-light",
        body_type: "District",
        body_code: "DIST-INDO-IND",
        body_name: "Indore District",
    },
    {
        id: "public",
        title: "Public",
        honorific: "",
        name: "Guest Viewer",
        post: "Unauthenticated Public",
        scope: "View public disclosures, AGM notices & audited accounts",
        privileges: ["View Disclosures"],
        accent: "cream",
        body_type: "Public",
        body_code: null,
        body_name: null,
        _disabled: true,
    },
];

export const AuthProvider = ({ children }) => {
    // Initialise from localStorage SYNCHRONOUSLY so the first render of any
    // ProtectedShell already sees a hydrated `persona`. Avoids the race where
    // a hard reload on a protected route flashes a redirect to /login.
    const [persona, setPersona] = useState(() => {
        try {
            const stored = typeof window !== "undefined" && window.localStorage.getItem("mpca_persona");
            return stored ? JSON.parse(stored) : null;
        } catch (_) {
            return null;
        }
    });

    const login = (personaObj) => {
        localStorage.setItem("mpca_persona", JSON.stringify(personaObj));
        setPersona(personaObj);
    };

    const logout = () => {
        localStorage.removeItem("mpca_persona");
        setPersona(null);
    };

    return (
        <AuthContext.Provider value={{
            persona,
            login,
            logout,
            isAuthed: !!persona,
            isOfficeBearer: !!persona && ["president", "secretary", "treasurer", "division-secretary"].includes(persona.id),
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
};
