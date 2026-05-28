import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDisclosures } from "@/lib/api";
import { FileText, Download, Calendar } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";
import { MpcaLogoMark } from "@/components/MpcaEmblem";

const TYPE_LABELS = {
    All: "All Categories",
    AGM_Notice: "AGM Notices",
    Committee_Minutes: "Committee Minutes",
    GBM_Minutes: "General Body Minutes",
    Audited_Accounts: "Audited Accounts",
    Selection_Announcement: "Selection Announcements",
    Circular: "Circulars",
};

const Disclosures = ({ publicView = false }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("All");

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchDisclosures();
                setItems(data);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        if (filter === "All") return items;
        return items.filter((d) => d.disclosure_type === filter);
    }, [items, filter]);

    const groups = useMemo(() => {
        const by = {};
        for (const d of filtered) {
            const year = new Date(d.issued_date).getFullYear();
            (by[year] = by[year] || []).push(d);
        }
        return Object.entries(by).sort((a, b) => Number(b[0]) - Number(a[0]));
    }, [filtered]);

    const Wrapper = ({ children }) =>
        publicView ? (
            <div className="min-h-screen bg-mpca-ivory" data-testid="public-disclosures">
                <header className="bg-mpca-green-dark text-mpca-ivory px-8 md:px-16 py-6 border-b border-mpca-brass/30">
                    <div className="max-w-6xl mx-auto flex items-center justify-between">
                        <Link to="/" className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-mpca-ivory flex items-center justify-center p-1">
                                <MpcaLogoMark className="w-full h-full object-contain" />
                            </div>
                            <div>
                                <div className="font-serif text-lg">MPCA</div>
                                <div className="overline text-[9px] text-mpca-gold-light/70">Public Disclosures</div>
                            </div>
                        </Link>
                        <Link to="/login" className="btn-heritage-secondary !text-mpca-gold-light !border-mpca-brass/60">
                            Pavilion Login
                        </Link>
                    </div>
                </header>
                {children}
            </div>
        ) : (
            <div className="page-enter">{children}</div>
        );

    return (
        <Wrapper>
            <div className={`${publicView ? "max-w-6xl mx-auto" : "max-w-6xl mx-auto"} px-8 md:px-12 py-10`} data-testid="disclosures-page">
                <div className="mb-10">
                    <div className="overline">Article XV · Public Disclosures</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        The Public Bulletin
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        Notices, minutes, audited accounts and selection announcements
                        published in accordance with Article XV of the MPCA Constitution.
                    </p>
                </div>

                <div className="crest-divider mb-10" />

                {/* Filter */}
                <div className="flex flex-wrap gap-2 mb-10">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <button
                            key={k}
                            onClick={() => setFilter(k)}
                            data-testid={`disc-filter-${k.toLowerCase()}`}
                            className={`px-3.5 py-2 text-[11px] uppercase tracking-[0.18em] border transition-all duration-300 ${
                                filter === k
                                    ? "bg-mpca-green-dark text-mpca-ivory border-mpca-green-dark"
                                    : "bg-transparent text-mpca-green-dark border-mpca-brass/40 hover:border-mpca-brass"
                            }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <CricketLoader label="Reading the bulletin…" />
                ) : groups.length === 0 ? (
                    <div className="text-center py-20 bulletin-card" data-testid="disc-empty">
                        <FileText className="mx-auto text-mpca-brass mb-4" size={36} strokeWidth={1} />
                        <div className="font-serif text-2xl text-mpca-green-dark">No disclosures in this category.</div>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {groups.map(([year, list]) => (
                            <section key={year} data-testid={`year-${year}`}>
                                <div className="flex items-baseline gap-4 mb-6">
                                    <div className="font-serif text-3xl text-mpca-green-dark">{year}</div>
                                    <div className="flex-1 h-px bg-mpca-brass/30" />
                                    <div className="overline">{list.length} entries</div>
                                </div>

                                <div className="bulletin-card overflow-hidden">
                                    {list.map((d) => (
                                        <div
                                            key={d.id}
                                            className="ledger-row px-7 py-6"
                                            data-testid={`disclosure-${d.id}`}
                                        >
                                            <div className="grid md:grid-cols-12 gap-4 items-start">
                                                <div className="md:col-span-2 flex flex-col">
                                                    <div className="font-mono text-[11px] text-mpca-brass tracking-wider">
                                                        {new Date(d.issued_date).toLocaleDateString("en-IN", {
                                                            day: "2-digit",
                                                            month: "short",
                                                        })}
                                                    </div>
                                                    <div className="font-serif text-2xl text-mpca-green-dark mt-1">
                                                        {new Date(d.issued_date).getDate()}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-8">
                                                    <div className="overline mb-2">
                                                        {d.disclosure_type.replace(/_/g, " ")}
                                                    </div>
                                                    <div className="font-serif text-xl text-mpca-green-dark leading-tight">
                                                        {d.title}
                                                    </div>
                                                    {d.summary && (
                                                        <p className="text-sm text-mpca-charcoal mt-2 leading-relaxed">
                                                            {d.summary}
                                                        </p>
                                                    )}
                                                    {d.content && (
                                                        <p className="text-xs text-mpca-gray-dark italic font-serif mt-3 leading-relaxed">
                                                            {d.content}
                                                        </p>
                                                    )}
                                                    {d.issued_by && (
                                                        <div className="text-[11px] text-mpca-brass tracking-wider mt-3 flex items-center gap-2">
                                                            <Calendar size={11} strokeWidth={1.5} />
                                                            Issued by {d.issued_by}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="md:col-span-2 md:text-right">
                                                    {d.document_url ? (
                                                        <a
                                                            href={d.document_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="btn-heritage-ghost inline-flex"
                                                        >
                                                            <Download size={12} strokeWidth={1.5} /> PDF
                                                        </a>
                                                    ) : (
                                                        <div className="text-[10px] text-mpca-gray italic">On record</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

                <div className="mt-16 text-xs text-mpca-gray-dark italic font-serif text-center">
                    All disclosures shall be retained for a minimum of seven (7) years per
                    constitutional & statutory norms.
                </div>
            </div>
        </Wrapper>
    );
};

export default Disclosures;
