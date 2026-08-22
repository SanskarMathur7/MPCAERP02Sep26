import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

// PERSONAS remains exported for backwards-compat with older screens that read
// the seed list (e.g. member roster demos). Auth no longer keys off this — the
// live user comes from `/api/auth/login` and `/api/auth/me`.
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
        name: "Sanjeev Dua",
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
        honorific: "Shri",
        name: "Naveen Mittal",
        post: "Honorary Treasurer, MPCA",
        scope: "State bank operations, grants, audit",
        privileges: ["Financial Powers", "Approve Grants", "Bank Signatory"],
        accent: "marigold",
        body_type: "State",
        body_code: "MPCA",
        body_name: "MPCA Headquarters",
    },
    {
        id: "division-secretary",
        title: "Division Secretary",
        honorific: "Shri",
        name: "Devashish Nilosey",
        post: "Hon. Secretary, Indore Division",
        scope: "Indore Division — 8 districts under jurisdiction",
        privileges: ["Recommend Grants", "Review Districts", "Submit Claims"],
        accent: "maroon",
        body_type: "Division",
        body_code: "DIV-IND",
        body_name: "Indore Division",
    },
    {
        // M39i · Gwalior Division Secretary — sample login for the northern
        // division so the user can exercise multi-division RBAC end-to-end.
        id: "division-secretary-gwl",
        title: "Division Secretary",
        honorific: "Shri",
        name: "Kailash Vijayvargiya",
        post: "Hon. Secretary, Gwalior Division",
        scope: "Gwalior Division — 5 districts (Gwalior, Datia, Shivpuri, Guna, Ashoknagar)",
        privileges: ["Recommend Grants", "Review Districts", "Submit Claims"],
        accent: "navy",
        body_type: "Division",
        body_code: "DIV-GWL",
        body_name: "Gwalior Division",
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
        id: "match-official",
        title: "Match Official",
        honorific: "Shri",
        name: "Chandrakant Pandit",
        post: "State Panel Umpire, MPCA",
        scope: "Own DA / TA forms · Submit days for tournaments assigned",
        privileges: ["Submit DA Forms", "View Assigned Fixtures"],
        accent: "brass",
        body_type: "Official",
        body_code: "MPCA",
        body_name: "MPCA Match Official Panel",
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
    // Feb 2026 · JWT-based auth. `mpca_persona` still holds the user object
    // (identical shape to the old PERSONAS entries) so downstream pages don't
    // change. `mpca_token` holds the JWT sent as `Authorization: Bearer <...>`.
    const [persona, setPersona] = useState(() => {
        try {
            const stored = typeof window !== "undefined" && window.localStorage.getItem("mpca_persona");
            return stored ? JSON.parse(stored) : null;
        } catch (_) {
            return null;
        }
    });

    // On mount, if a token exists but no persona in memory (e.g. legacy
    // localStorage), hydrate from /api/auth/me. Failures log the user out.
    useEffect(() => {
        const token = typeof window !== "undefined" && window.localStorage.getItem("mpca_token");
        if (token && !persona) {
            // Late import avoids a circular dep with api.js
            import("@/lib/api").then(({ api }) => {
                api.get("/auth/me")
                    .then(({ data }) => {
                        localStorage.setItem("mpca_persona", JSON.stringify(data));
                        setPersona(data);
                    })
                    .catch(() => {
                        localStorage.removeItem("mpca_token");
                        localStorage.removeItem("mpca_persona");
                    });
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // New JWT-based login — used by the redesigned Login page.
    const loginWithCredentials = (accessToken, user) => {
        localStorage.setItem("mpca_token", accessToken);
        localStorage.setItem("mpca_persona", JSON.stringify(user));
        setPersona(user);
    };

    // Legacy demo login kept as a no-op stub so older callers (e.g. tests
    // that call `login(persona)` directly) don't crash. Prefer loginWithCredentials.
    const login = (personaObj) => {
        localStorage.setItem("mpca_persona", JSON.stringify(personaObj));
        setPersona(personaObj);
    };

    const logout = () => {
        localStorage.removeItem("mpca_token");
        localStorage.removeItem("mpca_persona");
        setPersona(null);
    };

    return (
        <AuthContext.Provider value={{
            persona,
            login,
            loginWithCredentials,
            logout,
            isAuthed: !!persona,
            isOfficeBearer: !!persona && ["president", "secretary", "treasurer", "division-secretary", "division-secretary-gwl"].includes(persona.id),
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
