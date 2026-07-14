import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBodiesTree } from "@/lib/api";
import { Building2, MapPin, Landmark, ChevronRight, ChevronDown, Users, Coins, ArrowUpRight } from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(n || 0);

const ICON_BY_TYPE = {
    BCCI: Landmark,
    State: Landmark,
    Division: Building2,
    District: MapPin,
    Club: Users,
};

const ACCENT_BY_TYPE = {
    BCCI: { dot: "bg-mpca-oxblood", text: "text-mpca-oxblood" },
    State: { dot: "bg-mpca-green-dark", text: "text-mpca-green-dark" },
    Division: { dot: "bg-mpca-burgundy-dark", text: "text-mpca-burgundy-dark" },
    District: { dot: "bg-mpca-brass", text: "text-mpca-gold" },
    Club: { dot: "bg-mpca-gray", text: "text-mpca-gray-dark" },
};

// Iterative flatten — DFS — into a list of { node, depth, hasChildren, parentCode }
const flattenTree = (tree, expanded) => {
    const result = [];
    const stack = tree.map((n) => ({ node: n, depth: 0, parentCode: null }));
    while (stack.length) {
        const { node, depth, parentCode } = stack.shift();
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        result.push({ node, depth, hasChildren, parentCode });
        if (hasChildren && expanded[node.code]) {
            const kids = node.children.map((c) => ({ node: c, depth: depth + 1, parentCode: node.code }));
            stack.unshift(...kids);
        }
    }
    return result;
};

const OrgStructure = () => {
    const [tree, setTree] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState({});

    useEffect(() => {
        (async () => {
            try {
                const t = await fetchBodiesTree();
                setTree(t);
                // Default — BCCI + MPCA + all 10 Divisions expanded
                const initial = {};
                const walkInit = (nodes) => {
                    for (const n of nodes) {
                        if (n.body_type === "BCCI" || n.body_type === "State" || n.body_type === "Division") {
                            initial[n.code] = true;
                        }
                        if (n.children) walkInit(n.children);
                    }
                };
                walkInit(t);
                setExpanded(initial);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const toggle = (code) => setExpanded((s) => ({ ...s, [code]: !s[code] }));

    const flat = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

    const stats = useMemo(() => {
        let divisions = 0;
        let districts = 0;
        let districtGrant = 0;
        const walk = (nodes) => {
            for (const n of nodes) {
                if (n.body_type === "Division") divisions += 1;
                if (n.body_type === "District") {
                    districts += 1;
                    districtGrant += n.annual_grant_inr || 0;
                }
                if (n.children) walk(n.children);
            }
        };
        walk(tree);
        return { divisions, districts, districtGrant, totalGrant: districtGrant + divisions * 30000 };
    }, [tree]);

    if (loading) {
        return (
            <div className="p-16" data-testid="org-loading">
                <CricketLoader size="lg" label="Loading the hierarchy…" />
            </div>
        );
    }

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="org-page">
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                <div>
                    <div className="overline">Article II · Affiliated Bodies</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                        Organisational Structure
                    </h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                        BCCI → MPCA → Divisions → Districts. Every record in the
                        ERP — members, fees, meetings, grants — is scoped to a body
                        within this tree.
                    </p>
                </div>
            </div>

            <div className="crest-divider mb-10" />

            <div className="grid sm:grid-cols-3 gap-px bg-mpca-brass/20 border border-mpca-brass/20 mb-12" data-testid="org-summary">
                <div className="bulletin-card p-7 border-0 rounded-none">
                    <Building2 className="text-mpca-burgundy-dark mb-4" size={22} strokeWidth={1.25} />
                    <div className="overline">Divisions</div>
                    <div className="font-serif text-5xl text-mpca-green-dark mt-2 leading-none">
                        {stats.divisions}
                    </div>
                    <div className="text-xs text-mpca-gray-dark mt-2">
                        Each receives ₹30,000 annual grant from MPCA HQ.
                    </div>
                </div>
                <div className="bulletin-card p-7 border-0 rounded-none">
                    <MapPin className="text-mpca-gold mb-4" size={22} strokeWidth={1.25} />
                    <div className="overline">District Associations</div>
                    <div className="font-serif text-5xl text-mpca-green-dark mt-2 leading-none">
                        {stats.districts}
                    </div>
                    <div className="text-xs text-mpca-gray-dark mt-2">
                        Each receives ₹1,10,000 annual grant via its Division.
                    </div>
                </div>
                <div className="bulletin-card p-7 border-0 rounded-none">
                    <Coins className="text-mpca-oxblood mb-4" size={22} strokeWidth={1.25} />
                    <div className="overline">Annual Grant Outlay</div>
                    <div className="font-serif text-4xl text-mpca-green-dark mt-2 leading-none">
                        {fmtINR(stats.totalGrant)}
                    </div>
                    <div className="text-xs text-mpca-gray-dark mt-2">
                        Routed District to Division to MPCA every fiscal year.
                    </div>
                </div>
            </div>

            <div className="bulletin-card overflow-hidden" data-testid="org-tree">
                <div className="px-6 py-4 border-b border-mpca-brass/20 bg-mpca-parchment/40 flex items-center justify-between">
                    <div>
                        <div className="overline">The Tree</div>
                        <div className="font-serif text-lg text-mpca-green-dark mt-1">
                            BCCI · MPCA · Divisions · Districts
                        </div>
                    </div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-mpca-gray-dark">
                        Click rows to expand
                    </div>
                </div>
                <div>
                    {flat.map(({ node, depth, hasChildren }) => {
                        const Icon = ICON_BY_TYPE[node.body_type] || MapPin;
                        const accent = ACCENT_BY_TYPE[node.body_type] || ACCENT_BY_TYPE.District;
                        const open = !!expanded[node.code];
                        const showGrant = node.body_type !== "BCCI" && node.body_type !== "State" && node.annual_grant_inr > 0;
                        const meta = [
                            node.code,
                            node.seat || null,
                            showGrant ? "Annual Grant " + fmtINR(node.annual_grant_inr) : null,
                        ].filter(Boolean).join(" · ");

                        return (
                            <div
                                key={node.code}
                                data-testid={"org-node-" + node.code}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-mpca-parchment/60 transition-colors border-b border-mpca-brass/15"
                                style={{ paddingLeft: (depth * 24 + 16) + "px" }}
                            >
                                <button
                                    onClick={() => hasChildren && toggle(node.code)}
                                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                                    data-testid={"org-toggle-" + node.code}
                                >
                                    {hasChildren && open && <ChevronDown size={14} className="text-mpca-gray-dark shrink-0" />}
                                    {hasChildren && !open && <ChevronRight size={14} className="text-mpca-gray-dark shrink-0" />}
                                    {!hasChildren && <span className="w-3.5 shrink-0" />}
                                    <span className={"w-2 h-2 rounded-full shrink-0 " + accent.dot} />
                                    <Icon size={15} strokeWidth={1.5} className={"shrink-0 " + accent.text} />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-serif text-base text-mpca-green-dark leading-tight truncate">
                                            {node.name}
                                        </div>
                                        <div className="text-[10px] tracking-[0.2em] uppercase text-mpca-gray-dark mt-0.5 font-mono">
                                            {meta}
                                        </div>
                                    </div>
                                </button>
                                <span className={"pill " + accent.text} style={{ borderColor: "currentColor", opacity: 0.85 }}>
                                    {node.body_type}
                                </span>
                                {(node.body_type === "Division" || node.body_type === "District" || node.body_type === "State") && (
                                    <Link
                                        to={"/org/" + node.code}
                                        className="btn-heritage-ghost !py-1 !px-2 !text-[10px] shrink-0"
                                        data-testid={"org-open-" + node.code}
                                    >
                                        Open <ArrowUpRight size={11} strokeWidth={1.5} />
                                    </Link>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-10 text-center">
                <p className="text-sm text-mpca-gray-dark italic font-serif max-w-3xl mx-auto">
                    Body-scoped logins, the District → Division → MPCA grant approval
                    workflow and per-body budget ledgers all operate against this
                    structure.
                </p>
            </div>
        </div>
    );
};

export default OrgStructure;
