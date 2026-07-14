import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMembers, fetchMemberStats, fetchMemberCategories } from "@/lib/api";
import { Plus, Search, ChevronRight, Users, Upload, Tag, Download } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import MemberBulkUploadModal from "@/components/MemberBulkUploadModal";
import { useAuth } from "@/context/AuthContext";

const CATEGORIES = ["All", "Individual", "Institutional", "Honorary", "Patron"];
const MEMBER_TYPES = ["All", "MPCA", "Division"];

const Members = () => {
    const { isOfficeBearer } = useAuth();
    const [members, setMembers] = useState([]);
    const [stats, setStats] = useState(null);
    const [subCats, setSubCats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState("All");
    const [memberType, setMemberType] = useState("All");
    const [subCategory, setSubCategory] = useState("All");
    const [search, setSearch] = useState("");
    const [bulkOpen, setBulkOpen] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [data, s, cats] = await Promise.all([
                fetchMembers(),
                fetchMemberStats().catch(() => null),
                fetchMemberCategories({ active_only: true }).catch(() => []),
            ]);
            setMembers(data);
            setStats(s);
            setSubCats(cats);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        return members.filter((m) => {
            if (category !== "All" && m.category !== category) return false;
            if (memberType !== "All" && (m.member_type || "MPCA") !== memberType) return false;
            if (subCategory !== "All" && m.sub_category !== subCategory) return false;
            if (search) {
                const q = search.toLowerCase();
                return (
                    m.name.toLowerCase().includes(q) ||
                    m.uid.toLowerCase().includes(q) ||
                    (m.email || "").toLowerCase().includes(q) ||
                    (m.role || "").toLowerCase().includes(q) ||
                    (m.membership_id || "").toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [members, category, memberType, subCategory, search]);

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="members-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-6">
                <div>
                    <div className="overline">Article V · The Register</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Membership Register
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        The authoritative digital ledger of MPCA general body members and Division-affiliated members.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/members/categories" className="btn-heritage-ghost" data-testid="categories-link-btn">
                        <Tag size={14} strokeWidth={1.5} /> Categories
                    </Link>
                    {isOfficeBearer && (
                        <button
                            className="btn-heritage-ghost"
                            onClick={() => setBulkOpen(true)}
                            data-testid="bulk-upload-btn"
                        >
                            <Upload size={14} strokeWidth={1.5} /> Bulk Upload
                        </button>
                    )}
                    <Link to="/members/new" className="btn-heritage-primary" data-testid="add-member-btn">
                        <Plus size={14} strokeWidth={1.5} /> Enrol Member
                    </Link>
                </div>
            </div>

            {/* Stats strip */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="member-stats-strip">
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-3">
                        <div className="overline text-[9px]">Total</div>
                        <div className="font-serif text-2xl text-mpca-green-dark">{stats.total}</div>
                    </div>
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-3">
                        <div className="overline text-[9px]">MPCA General Body</div>
                        <div className="font-serif text-2xl text-mpca-green-dark">{stats.by_type?.MPCA ?? 0}</div>
                    </div>
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-3">
                        <div className="overline text-[9px]">Division-linked</div>
                        <div className="font-serif text-2xl text-mpca-green-dark">{stats.by_type?.Division ?? 0}</div>
                    </div>
                    <div className="border border-mpca-brass/30 bg-mpca-parchment/40 p-3">
                        <div className="overline text-[9px]">Active</div>
                        <div className="font-serif text-2xl text-mpca-green">{stats.by_status?.Active ?? 0}</div>
                    </div>
                </div>
            )}

            <div className="crest-divider mb-8" />

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
                <div className="flex items-center gap-1 flex-wrap">
                    {MEMBER_TYPES.map((t) => (
                        <button
                            key={t}
                            onClick={() => setMemberType(t)}
                            data-testid={`filter-type-${t.toLowerCase()}`}
                            className={`px-3 py-2 text-[11px] uppercase tracking-[0.18em] border transition-all duration-300 ${
                                memberType === t
                                    ? "bg-mpca-brass text-mpca-ivory border-mpca-brass"
                                    : "bg-transparent text-mpca-brass border-mpca-brass/40 hover:border-mpca-brass"
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <div className="h-6 w-px bg-mpca-brass/30" />
                <div className="flex items-center gap-1 flex-wrap">
                    {CATEGORIES.map((c) => (
                        <button
                            key={c}
                            onClick={() => setCategory(c)}
                            data-testid={`filter-${c.toLowerCase()}`}
                            className={`px-3 py-2 text-[11px] uppercase tracking-[0.18em] border transition-all duration-300 ${
                                category === c
                                    ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                    : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:border-mpca-brass"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                {subCats.length > 0 && (
                    <select
                        value={subCategory}
                        onChange={(e) => setSubCategory(e.target.value)}
                        className="input-heritage !py-2 !text-xs max-w-[220px]"
                        data-testid="sub-category-select"
                    >
                        <option value="All">All Sub-Categories</option>
                        {subCats.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                )}
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-mpca-gray" size={16} strokeWidth={1.5} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, UID, email, role, membership id…"
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
                        Adjust your filters, enrol a new member, or upload a CSV of members.
                    </p>
                    {isOfficeBearer && (
                        <button className="btn-heritage-secondary mt-6 inline-flex" onClick={() => setBulkOpen(true)}>
                            <Download size={14} strokeWidth={1.5} /> Bulk Upload CSV
                        </button>
                    )}
                </div>
            ) : (
                <div className="bulletin-card overflow-hidden" data-testid="members-ledger">
                    {/* Ledger header */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-mpca-green-dark text-mpca-gold-light border-b border-mpca-brass/40">
                        <div className="col-span-2 overline !text-mpca-gold-light">UID</div>
                        <div className="col-span-3 overline !text-mpca-gold-light">Member</div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Type / Body</div>
                        <div className="col-span-2 overline !text-mpca-gold-light">Category</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Joined</div>
                        <div className="col-span-1 overline !text-mpca-gold-light">Status</div>
                        <div className="col-span-1"></div>
                    </div>

                    {filtered.map((m) => (
                        <Link
                            to={`/members/${m.id}`}
                            key={m.id}
                            className="ledger-row grid grid-cols-12 gap-4 px-6 py-5 items-center"
                            data-testid={`member-row-${m.uid}`}
                        >
                            <div className="col-span-2 font-mono text-[11px] text-mpca-brass tracking-wider">
                                {m.uid}
                                {m.membership_id && (
                                    <div className="text-[10px] text-mpca-gray-dark mt-0.5">#{m.membership_id}</div>
                                )}
                            </div>
                            <div className="col-span-3">
                                <div className="font-serif text-lg text-mpca-green-dark leading-tight">
                                    {m.name}
                                </div>
                                <div className="text-[11px] text-mpca-gray-dark mt-0.5 truncate">
                                    {m.role ? <span className="text-mpca-brass">{m.role} · </span> : null}
                                    {m.email || m.phone || "—"}
                                </div>
                                {(m.memberships || []).filter((a) => !a.end_date || new Date(a.end_date) >= new Date()).length > 1 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1" data-testid={`positions-${m.uid}`}>
                                        {(m.memberships || [])
                                            .filter((a) => !a.end_date || new Date(a.end_date) >= new Date())
                                            .slice(0, 3)
                                            .map((a) => (
                                                <span key={a.id} className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 border ${a.is_primary ? "bg-mpca-brass/10 border-mpca-brass/60 text-mpca-brass" : "border-mpca-brass/25 text-mpca-charcoal"}`}>
                                                    {a.role || a.category}
                                                </span>
                                            ))}
                                        {(m.memberships || []).filter((a) => !a.end_date || new Date(a.end_date) >= new Date()).length > 3 && (
                                            <span className="text-[9px] italic text-mpca-gray-dark">+{(m.memberships || []).filter((a) => !a.end_date || new Date(a.end_date) >= new Date()).length - 3} more</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="col-span-2">
                                <span className={`pill ${(m.member_type || "MPCA") === "Division" ? "pill-pending" : "pill-active"}`}>
                                    {m.member_type || "MPCA"}
                                </span>
                                {m.division_body_id && (
                                    <div className="text-[10px] text-mpca-gray-dark mt-0.5 font-mono">{m.division_body_id}</div>
                                )}
                            </div>
                            <div className="col-span-2">
                                <div className="text-sm text-mpca-charcoal">{m.category}</div>
                                <div className="text-[11px] text-mpca-gray-dark mt-0.5">
                                    {m.sub_category || "—"}
                                </div>
                            </div>
                            <div className="col-span-1 font-mono text-[11px] text-mpca-charcoal">
                                {m.membership_date
                                    ? new Date(m.membership_date).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "2-digit",
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

            <MemberBulkUploadModal
                open={bulkOpen}
                onClose={() => setBulkOpen(false)}
                onDone={() => load()}
            />
        </div>
    );
};

export default Members;
