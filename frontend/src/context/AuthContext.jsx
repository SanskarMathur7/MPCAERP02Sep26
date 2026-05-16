import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export const PERSONAS = [
    {
        id: "president",
        title: "President",
        honorific: "Shri",
        name: "Abhilash Khandekar",
        post: "President, MPCA",
        scope: "Full executive access — chairs AGM & Committee",
        privileges: ["Read All", "Approve", "Chair Meetings", "Sign Resolutions"],
        accent: "green",
    },
    {
        id: "secretary",
        title: "Hon. Secretary",
        honorific: "Shri",
        name: "Sanjay Jagdale",
        post: "Honorary Secretary",
        scope: "Membership, AGM convening, correspondence, register custody",
        privileges: ["Manage Members", "Convene Meetings", "Issue Notices"],
        accent: "oxblood",
    },
    {
        id: "treasurer",
        title: "Hon. Treasurer",
        honorific: "Smt.",
        name: "Meera Verma",
        post: "Honorary Treasurer",
        scope: "Bank operations, fees, subscriptions, audit",
        privileges: ["Financial Powers", "Fees Ledger", "Bank Signatory"],
        accent: "brass",
    },
    {
        id: "committee",
        title: "Committee Member",
        honorific: "Capt.",
        name: "Rajinder Pal Singh",
        post: "Managing Committee",
        scope: "Vote in committee, propose resolutions, review reports",
        privileges: ["Vote", "View Minutes", "Propose"],
        accent: "wood",
    },
    {
        id: "member",
        title: "Member",
        honorific: "Shri",
        name: "Naveen Joshi",
        post: "Individual Annual Member",
        scope: "View profile, pay fees, attend AGM, raise grievances",
        privileges: ["View Self", "Pay Fees", "Vote at AGM"],
        accent: "ivory",
    },
    {
        id: "public",
        title: "Public",
        honorific: "",
        name: "Guest Viewer",
        post: "Unauthenticated Public",
        scope: "View public disclosures, AGM notices & audited accounts",
        privileges: ["View Disclosures"],
        accent: "parchment",
    },
];

export const AuthProvider = ({ children }) => {
    const [persona, setPersona] = useState(null);

    useEffect(() => {
        const stored = localStorage.getItem("mpca_persona");
        if (stored) {
            try {
                setPersona(JSON.parse(stored));
            } catch (_) {}
        }
    }, []);

    const login = (personaObj) => {
        localStorage.setItem("mpca_persona", JSON.stringify(personaObj));
        setPersona(personaObj);
    };

    const logout = () => {
        localStorage.removeItem("mpca_persona");
        setPersona(null);
    };

    return (
        <AuthContext.Provider value={{ persona, login, logout, isAuthed: !!persona }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
};
