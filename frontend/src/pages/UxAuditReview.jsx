/**
 * /audit-review — Inline reviewer for the Phase-1 UX Audit
 * Reads /api/ux-audit/report, renders every item, lets the user pick a
 * DECISION + write a NOTE per item. Decisions persist to Mongo so main
 * agent can act on them in Round 2.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const DECISIONS = [
    { key: "KEEP",             label: "✅ Keep as-is",       color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    { key: "FIX",              label: "⚠️ Fix UI",            color: "bg-amber-100 text-amber-800 border-amber-300" },
    { key: "DELETE",           label: "🗑️ Delete",           color: "bg-red-100 text-red-800 border-red-300" },
    { key: "MERGE",            label: "🔀 Merge",            color: "bg-purple-100 text-purple-800 border-purple-300" },
    { key: "MOVE_TO_SHOWCASE", label: "🎨 Move to /showcase", color: "bg-blue-100 text-blue-800 border-blue-300" },
    { key: "POSTPONE",         label: "⏸️ Postpone",         color: "bg-slate-100 text-slate-700 border-slate-300" },
];

function DecisionRow({ itemKey, itemBody, savedDecision, onSave }) {
    const [decision, setDecision] = useState(savedDecision?.decision || "");
    const [note, setNote] = useState(savedDecision?.note || "");
    const [saving, setSaving] = useState(false);
    const [savedTs, setSavedTs] = useState(savedDecision?.updated_at || null);

    const save = async () => {
        if (!decision) return;
        setSaving(true);
        try {
            const { data } = await api.post("/ux-audit/decisions", { item_key: itemKey, decision, note });
            setSavedTs(data.decision.updated_at);
            onSave(itemKey, data.decision);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="border-2 border-slate-200 rounded-lg p-5 bg-white hover:border-slate-300 transition-colors" data-testid={`audit-row-${itemKey}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div className="mb-3">{itemBody}</div>
            <div className="flex flex-wrap items-start gap-2 mt-4">
                {DECISIONS.map((d) => (
                    <button key={d.key} onClick={() => setDecision(d.key)}
                            className={`px-3 py-1.5 border-2 rounded-md text-sm font-medium transition-all ${decision === d.key ? d.color + " ring-2 ring-offset-1 ring-slate-400" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
                            data-testid={`audit-decision-${itemKey}-${d.key}`}>
                        {d.label}
                    </button>
                ))}
            </div>
            <div className="mt-3 flex gap-3 items-start">
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                          placeholder="Your comment / instruction for the main agent…"
                          className="flex-1 border-2 border-slate-200 rounded-md p-2 text-base text-slate-800 focus:border-slate-400 focus:outline-none min-h-[3rem]"
                          rows={2} data-testid={`audit-note-${itemKey}`} />
                <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={save} disabled={!decision || saving}
                            className="h-11 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-base font-semibold disabled:opacity-50"
                            data-testid={`audit-save-${itemKey}`}>{saving ? "Saving…" : "Save"}</button>
                    {savedTs && <span className="text-xs text-emerald-700">✓ Saved · {new Date(savedTs).toLocaleTimeString()}</span>}
                </div>
            </div>
        </div>
    );
}

function itemBodyGeneric(item) {
    if (typeof item === "string") return <div className="text-base text-slate-800">{item}</div>;
    const route = item.route || item.page || item.url;
    return (
        <>
            {route && <div className="font-mono text-sm text-slate-500 mb-1">{route}</div>}
            <div className="text-lg font-semibold text-slate-900">{item.symptom || item.reason || item.note || item.label || item.classification || JSON.stringify(item).slice(0, 120)}</div>
            {(item.symptom_detail || item.suggestion || item.detail) && <div className="text-base text-slate-700 mt-1">{item.symptom_detail || item.suggestion || item.detail}</div>}
            {item.priority && <span className="inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-white">{item.priority}</span>}
        </>
    );
}

export default function UxAuditReview() {
    const [data, setData] = useState(null);
    const [decisions, setDecisions] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data: d } = await api.get("/ux-audit/report");
            setData(d.report);
            setDecisions(d.decisions || {});
            setLoading(false);
        })();
    }, []);

    const sections = useMemo(() => {
        if (!data) return [];
        const gf = data.global_findings || {};
        const focus = data.focus_pages_deep_dive || {};
        const broad = data.broad_sweep_classification || [];
        return [
            { title: "🔴 P0 · Redesign needed for 45+ admin", items: gf.p0_redesign_needed_45plus_admin || [], prefix: "p0" },
            { title: "🔀 Duplicated Claim Surfaces (4 → 1)",  items: gf.duplicated_claim_surfaces || [],       prefix: "claim" },
            { title: "💰 Duplicated Finance Surfaces (6 → 1)", items: gf.duplicated_finance_surfaces || [],    prefix: "fin" },
            { title: "📅 Duplicated Calendar Surfaces",         items: gf.duplicated_calendar_surfaces || [],   prefix: "cal" },
            { title: "🕸 Orphan Routes (no nav entry)",         items: gf.orphan_routes_no_nav_entry || [],      prefix: "orphan" },
            { title: "🔒 Public routes to gate",                items: gf.public_routes_that_should_be_gated || [], prefix: "pub" },
            { title: "🚫 Dead Buttons / Dead-Ends",             items: gf.buttons_that_do_nothing_or_dead_ends || [], prefix: "dead" },
            { title: "🎨 General Design Issues",                items: gf.design_issues_general || [],           prefix: "des" },
            { title: "✅ Notable Positives (don't touch)",       items: gf.notable_positives || [],              prefix: "pos" },
            { title: "🔍 Deep-Dive · Tournaments",              items: focus.tournaments ? [focus.tournaments] : [], prefix: "focus-t" },
            { title: "🔍 Deep-Dive · Players",                  items: focus.players ? [focus.players] : [],      prefix: "focus-p" },
            { title: "🔍 Deep-Dive · Grant Claims",             items: focus.grant_claims ? [focus.grant_claims] : [], prefix: "focus-g" },
            { title: "🔍 Deep-Dive · Members / Org",             items: focus.members || focus.members_org ? [focus.members || focus.members_org] : [], prefix: "focus-m" },
            { title: "🔍 Deep-Dive · Discussions",              items: focus.discussions ? [focus.discussions] : [], prefix: "focus-d" },
            { title: "📋 Broad Sweep Classification",           items: broad, prefix: "sweep" },
        ].filter((s) => s.items.length);
    }, [data]);

    if (loading) return <div className="p-12 text-center text-lg text-slate-500">Loading UX audit…</div>;
    if (!data) return <div className="p-12 text-center text-lg text-red-600">Audit report not found.</div>;

    const savedCount = Object.keys(decisions).length;

    return (
        <div className="min-h-screen bg-slate-50 py-8 px-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div className="max-w-5xl mx-auto">
                <header className="mb-8">
                    <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Phase 1 · UX Audit</div>
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">Debt Register · Inline Review</h1>
                    <p className="text-lg text-slate-700 max-w-3xl leading-relaxed">
                        Pick a decision + optional note per item. Every save persists to Mongo — main agent will read
                        <code className="mx-1 px-2 py-0.5 rounded bg-slate-100 font-mono text-sm">/api/ux-audit/decisions</code>
                        and act on them in Round 2 (Cleave).
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3 items-center">
                        <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-sm font-semibold" data-testid="audit-saved-count">
                            {savedCount} decision{savedCount === 1 ? "" : "s"} saved
                        </span>
                        <span className="text-sm text-slate-500">{sections.reduce((a, s) => a + s.items.length, 0)} items · {sections.length} sections</span>
                    </div>
                </header>

                {data.summary && (
                    <div className="mb-8 p-5 bg-white border-2 border-slate-200 rounded-lg">
                        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Overall Summary</div>
                        <p className="text-base text-slate-800 leading-relaxed">{typeof data.summary === "string" ? data.summary : JSON.stringify(data.summary)}</p>
                    </div>
                )}

                {sections.map((sec) => (
                    <section key={sec.prefix} className="mb-10" data-testid={`audit-section-${sec.prefix}`}>
                        <h2 className="text-2xl font-bold text-slate-900 mb-4 border-b-2 border-slate-300 pb-2">
                            {sec.title} <span className="text-base font-normal text-slate-500 ml-2">({sec.items.length})</span>
                        </h2>
                        <div className="space-y-4">
                            {sec.items.map((it, i) => {
                                const itemKey = `${sec.prefix}-${i}`;
                                return (
                                    <DecisionRow key={itemKey} itemKey={itemKey} itemBody={itemBodyGeneric(it)}
                                                 savedDecision={decisions[itemKey]}
                                                 onSave={(k, d) => setDecisions((prev) => ({ ...prev, [k]: d }))} />
                                );
                            })}
                        </div>
                    </section>
                ))}

                {data.recommendations_for_main_agent && (
                    <div className="mt-12 p-6 bg-blue-50 border-2 border-blue-200 rounded-lg">
                        <div className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3">Recommended Phase-2 Cleave Plan (from testing agent)</div>
                        <pre className="text-base text-slate-800 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
                            {typeof data.recommendations_for_main_agent === "string" ? data.recommendations_for_main_agent : JSON.stringify(data.recommendations_for_main_agent, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
