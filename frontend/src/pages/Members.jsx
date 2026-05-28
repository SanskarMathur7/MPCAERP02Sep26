import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMembers } from "@/lib/api";
import { Plus, Search, ChevronRight, Users } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const CATEGORIES = ["All", "Individual", "Institutional", "Honorary", "Patron"];

const Members = () => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState("All");
    const [search, setSearch] = useState("");

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const data = await fetchMembers();
                setMembers(data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        return members.filter((m) => {
            if (category !== "All" && m.category !== category) return false;
            if (search) {
                const q = search.toLowerCase();
                return (
                    m.name.toLowerCase().includes(q) ||
                    m.uid.toLowerCase().includes(q) ||
                    (m.email || "").toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [members, category, search]);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="members-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article V · The Register</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Membership Register
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The authoritative digital ledger of Individual, Institutional,
                        Honorary and Patron members of the MPCA.
                    </p>
                </div>
                <Link to="/members/new" className="btn-heritage-primary" data-testid="add-member-btn">
                    <Plus size={14} strokeWidth={1.5} /> Enrol Member
                </Link>
            </div>

            <div className="crest-divider mb-10" />

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-6 mb-8">
                <div className="flex items-center gap-2 flex-wrap">
                    {CATEGORIES.map((c) => (
                        <button
                            key={c}
                            onClick={() => setCategory(c)}
                            data-testid={`filter-${c.toLowerCase()}`}
                            className={`px-4 py-2 text-xs uppercase tracking-[0.18em] border transition-all duration-300 ${
                                category === c
                                    ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                    : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:border-mpca-brass"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                <div className="flex-1 min-w-[240px] relative">
                    <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-mpca-gray" size={16} strokeWidth={1.5} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, UID or email…"
                        data-testid="search-input"
                        className="input-heritage pl-7"
                    />
                </div>
            </div>

            {/* Ledger */}
            {loading ? (
                <CricketLoader label="Reading the register…" />
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bulletin-card" data-testid="empty-state">
                    <Users className="mx-auto text-mpca-brass mb-4" size={36} strokeWidth={1} />
                    <div className="font-serif text-2xl text-mpca-green-dark">No entries found.</div>
                    <p className="text-mpca-gray-dark text-sm mt-2">
                        Adjust your filters or enrol a new member.
                    </p>
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden" data-testid="members-ledger">
                    {/* Ledger header */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-mpca-green-dark text-mpca-gold-light border-b border-mpca-brass/40">
                        <div className="col-span-2 overline !text-mpca-gold-light">UID</div>
                        <div className="col-span-4 overline !text-mpca-gold-light">Member</div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Category</div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Joined</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Status</div>
                        <div className="col-span-1"></div>
                    </div>

                    {filtered.map((m, i) => (
                        <Link
                            to={`/members/${m.id}`}
                            key={m.id}
                            className="ledger-row grid grid-cols-12 gap-4 px-6 py-5 items-center"
                            data-testid={`member-row-${m.uid}`}
                        >
                            <div className="col-span-2 font-mono text-[11px] text-mpca-brass tracking-wider">
                                {m.uid}
                            </div>
                            <div className="col-span-4">
                                <div className="font-serif text-lg text-mpca-green-dark leading-tight">
                                    {m.name}
                                </div>
                                <div className="text-[11px] text-mpca-gray-dark mt-0.5 truncate">
                                    {m.email || m.phone || "—"}
                                </div>
                            </div>
                            <div className="col-span-2">
                                <div className="text-sm text-mpca-charcoal">{m.category}</div>
                                <div className="text-[11px] text-mpca-gray-dark mt-0.5">
                                    {m.sub_category || "—"}
                                </div>
                            </div>
                            <div className="col-span-2 font-mono text-[11px] text-mpca-charcoal">
                                {m.membership_date
                                    ? new Date(m.membership_date).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                      })
                                    : "—"}
                            </div>
                            <div className="col-span-1">
                                <span
                                    className={`pill ${
                                        m.status === "Active"
                                            ? "pill-active"
                                            : m.status === "Pending"
                                                ? "pill-pending"
                                                : m.status === "Suspended"
                                                    ? "pill-suspended"
                                                    : "pill-lapsed"
                                    }`}
                                >
                                    {m.status}
                                </span>
                            </div>
                            <div className="col-span-1 text-right text-mpca-brass">
                                <ChevronRight size={16} strokeWidth={1.5} />
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <div className="mt-6 text-xs text-mpca-gray-dark italic font-serif">
                Showing {filtered.length} of {members.length} entries · Sorted by most recent enrolment.
            </div>
        </div>
    );
};

export default Members;
