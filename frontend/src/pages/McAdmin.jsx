/**
 * McAdmin.jsx — Iter 109 · Dynamic Maker-Checker configuration console.
 *
 * MPCA Secretary opens `/mc-admin` to map POSTS → each step of each workflow.
 * No code deploy needed to reconfigure — the engine reads config from Mongo.
 */
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { PageShell, PageEyebrow, DL, embossedCard, Pill, PrimaryButton } from "@/lib/designSystem";
import { Check, Users, RotateCcw, X, AlertTriangle, Save, ChevronDown, ChevronUp } from "lucide-react";

const badge = (bg, fg) => ({
    display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px",
    borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 700,
    letterSpacing: 0.4, textTransform: "uppercase",
});

const categoryColor = (cat) => {
    if (cat === "MPCA") return { bg: "rgba(13,59,46,0.14)", fg: DL.emerald };
    if (cat === "Division") return { bg: "rgba(184,131,40,0.18)", fg: DL.gold };
    if (cat === "District") return { bg: "rgba(139,31,31,0.14)", fg: DL.danger };
    return { bg: "rgba(14,31,27,0.10)", fg: DL.ink };
};

export default function McAdmin() {
    const [workflows, setWorkflows] = useState([]);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [wRes, pRes] = await Promise.all([
                api.get("/mc-admin/workflows"),
                api.get("/mc-admin/posts"),
            ]);
            setWorkflows(wRes.data.workflows || []);
            setPosts(pRes.data.posts || []);
        } catch (e) {
            setToast({ type: "err", msg: e?.response?.data?.detail || String(e) });
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const saveWorkflow = async (key, patch) => {
        setSaving(true);
        try {
            await api.patch(`/mc-admin/workflows/${key}`, patch);
            setToast({ type: "ok", msg: `Saved · ${key}` });
            await reload();
        } catch (e) {
            setToast({ type: "err", msg: e?.response?.data?.detail || String(e) });
        } finally { setSaving(false); setTimeout(() => setToast(null), 2200); }
    };

    return (
        <PageShell testid="mc-admin-shell">
            <PageEyebrow
                title="Maker-Checker Console"
                meta="MPCA · Governance"
            />
            <div style={{ marginBottom: 20, fontSize: 14, color: DL.muted, maxWidth: 780, lineHeight: 1.5 }}>
                Configure who is the <b>maker</b> and who are the <b>checker(s)</b> for every sensitive action.
                Multi-checker steps complete when the <i>last configured post</i> approves.
                The two-person rule prevents the same user from double-signing.
            </div>

            {toast && (
                <div data-testid="mc-admin-toast" style={{
                    position: "fixed", bottom: 20, right: 20, zIndex: 60,
                    ...embossedCard({ padding: "10px 14px", fontWeight: 700,
                        color: toast.type === "ok" ? DL.emerald : DL.danger,
                        borderColor: toast.type === "ok" ? DL.emerald : DL.danger }),
                }}>
                    {toast.type === "ok" ? "✓" : "⚠"} {toast.msg}
                </div>
            )}

            {loading ? (
                <div style={{ padding: 40, color: DL.muted }}>Loading workflows…</div>
            ) : (
                <div data-testid="mc-workflow-list" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
                    {workflows.map(wf => (
                        <WorkflowCard
                            key={wf.key}
                            wf={wf}
                            posts={posts}
                            expanded={expanded === wf.key}
                            onToggle={() => setExpanded(expanded === wf.key ? null : wf.key)}
                            onSave={(steps) => saveWorkflow(wf.key, { steps })}
                            saving={saving}
                        />
                    ))}
                </div>
            )}
        </PageShell>
    );
}

function WorkflowCard({ wf, posts, expanded, onToggle, onSave, saving }) {
    const cat = categoryColor(wf.category);
    const stepCount = (wf.steps || []).length;
    const configuredCount = (wf.steps || []).filter(s => (s.posts || []).length > 0).length;
    const fullyConfigured = configuredCount === stepCount && stepCount > 0;

    return (
        <div
            data-testid={`mc-workflow-card-${wf.key}`}
            style={{ ...embossedCard(), padding: expanded ? 20 : 16 }}
        >
            <div onClick={onToggle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                    <span style={badge(cat.bg, cat.fg)}>{wf.category}</span>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: DL.ink }}>{wf.label}</div>
                        <div style={{ fontSize: 12, color: DL.muted, marginTop: 2 }}>{wf.description}</div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span data-testid={`mc-config-status-${wf.key}`} style={badge(
                        fullyConfigured ? "rgba(13,59,46,0.14)" : "rgba(184,131,40,0.18)",
                        fullyConfigured ? DL.emerald : DL.gold
                    )}>
                        {fullyConfigured ? <><Check size={11} /> Configured</> : <><AlertTriangle size={11} /> {configuredCount}/{stepCount} configured</>}
                    </span>
                    {expanded ? <ChevronUp size={18} color={DL.muted} /> : <ChevronDown size={18} color={DL.muted} />}
                </div>
            </div>

            {expanded && (
                <div style={{ marginTop: 20, borderTop: `1px solid ${DL.rule}`, paddingTop: 20 }}>
                    <StepEditor
                        wfKey={wf.key}
                        initialSteps={wf.steps || []}
                        posts={posts}
                        onSave={onSave}
                        saving={saving}
                    />
                </div>
            )}
        </div>
    );
}

function StepEditor({ wfKey, initialSteps, posts, onSave, saving }) {
    const [steps, setSteps] = useState(initialSteps);
    const [dirty, setDirty] = useState(false);

    const updateStep = (idx, patch) => {
        const next = steps.map((s, i) => i === idx ? { ...s, ...patch } : s);
        setSteps(next); setDirty(true);
    };
    const togglePost = (idx, post) => {
        const step = steps[idx];
        const existing = step.posts || [];
        const key = `${post.body_scope}::${post.post_title}`;
        const has = existing.some(p => `${p.body_scope}::${p.post_title}` === key);
        const next = has
            ? existing.filter(p => `${p.body_scope}::${p.post_title}` !== key)
            : [...existing, { body_scope: post.body_scope, post_title: post.post_title }];
        updateStep(idx, { posts: next });
    };

    return (
        <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {steps.map((step, idx) => (
                    <StepRow
                        key={step.id || idx}
                        step={step}
                        posts={posts}
                        onTogglePost={(p) => togglePost(idx, p)}
                        onChange={(patch) => updateStep(idx, patch)}
                    />
                ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button
                    data-testid={`mc-reset-${wfKey}`}
                    onClick={() => { setSteps(initialSteps); setDirty(false); }}
                    disabled={!dirty}
                    style={{
                        padding: "8px 14px", background: "transparent", border: `1px solid ${DL.rule}`,
                        borderRadius: 4, cursor: dirty ? "pointer" : "not-allowed", opacity: dirty ? 1 : 0.5,
                        fontSize: 13, color: DL.ink, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    <RotateCcw size={12} /> Reset
                </button>
                <button
                    data-testid={`mc-save-${wfKey}`}
                    onClick={() => { onSave(steps); setDirty(false); }}
                    disabled={!dirty || saving}
                    style={{
                        padding: "8px 14px", background: DL.emerald, color: "#fff", border: `1px solid ${DL.emerald}`,
                        borderRadius: 4, cursor: dirty && !saving ? "pointer" : "not-allowed",
                        opacity: dirty && !saving ? 1 : 0.55, fontSize: 13, fontWeight: 700,
                        display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    <Save size={12} /> {saving ? "Saving…" : "Save configuration"}
                </button>
            </div>
        </div>
    );
}

function StepRow({ step, posts, onTogglePost, onChange }) {
    const selected = new Set((step.posts || []).map(p => `${p.body_scope}::${p.post_title}`));
    const isReturn = !!step.returns;

    return (
        <div data-testid={`mc-step-${step.id}`} style={{
            border: `1px solid ${DL.rule}`, borderRadius: 4, padding: 14,
            background: isReturn ? "rgba(184,131,40,0.05)" : "transparent",
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: DL.fontMono, fontSize: 11, color: DL.muted, letterSpacing: 0.5 }}>
                    {step.from} → <b style={{ color: DL.ink }}>{step.to}</b>
                </span>
                <span style={{ ...badge("rgba(14,31,27,0.10)", DL.ink), fontFamily: DL.fontMono }}>{step.action}</span>
                {step.needs_note && <span style={badge("rgba(184,131,40,0.18)", DL.gold)}>Note required</span>}
                {step.returns && <span style={badge("rgba(184,131,40,0.24)", DL.gold)}>Return path</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: DL.ink, marginBottom: 12 }}>{step.label}</div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {posts.map(p => {
                    const key = `${p.body_scope}::${p.post_title}`;
                    const on = selected.has(key);
                    return (
                        <button
                            key={key}
                            data-testid={`mc-post-toggle-${step.id}-${p.body_scope}-${p.post_title.replace(/\s+/g, "-")}`}
                            onClick={() => onTogglePost(p)}
                            style={{
                                padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                                cursor: "pointer",
                                background: on ? DL.emerald : "#fff",
                                color: on ? "#fff" : DL.ink,
                                border: `1px solid ${on ? DL.emerald : DL.rule}`,
                                display: "inline-flex", alignItems: "center", gap: 6,
                            }}>
                            {on && <Check size={11} />}
                            <span style={{ fontFamily: DL.fontMono, fontSize: 10, opacity: 0.7 }}>{p.body_scope}</span>
                            {p.post_title}
                        </button>
                    );
                })}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 12, color: DL.muted }}>
                {(step.posts || []).length > 1 && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                            type="checkbox"
                            data-testid={`mc-checker-mode-${step.id}`}
                            checked={step.checker_mode === "all"}
                            onChange={(e) => onChange({ checker_mode: e.target.checked ? "all" : null })}
                        />
                        <Users size={12} /> All checkers must approve (last one triggers transition)
                    </label>
                )}
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        data-testid={`mc-twoperson-${step.id}`}
                        checked={!!step.requires_two_person}
                        onChange={(e) => onChange({ requires_two_person: e.target.checked })}
                    />
                    Two-person rule (actor cannot repeat)
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        data-testid={`mc-needsnote-${step.id}`}
                        checked={!!step.needs_note}
                        onChange={(e) => onChange({ needs_note: e.target.checked })}
                    />
                    Requires note
                </label>
            </div>
        </div>
    );
}
