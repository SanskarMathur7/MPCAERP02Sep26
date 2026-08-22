/**
 * ApprovalChain.jsx — Iter 109 · Reusable Maker-Checker widget.
 *
 * Drop this on ANY doc detail page:
 *     <ApprovalChain workflowKey="tournament_create" docId={tournament.id} />
 *
 * It reads runtime state from GET /api/mc/{key}/{docId}/state, renders the
 * chain timeline + pending checker summary + next-action buttons, and POSTs
 * transitions back through the engine.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DL, embossedCard } from "@/lib/designSystem";
import { Check, Clock, ArrowRight, RotateCcw, X, MessageSquare, ShieldAlert, Users } from "lucide-react";

const chip = (bg, fg) => ({
    display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px",
    borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 700,
    letterSpacing: 0.4,
});

function ActionButton({ act, onClick, disabled }) {
    const primary = act.action === "approve";
    const danger = act.action === "reject";
    const returns = act.returns;
    const bg = primary ? DL.emerald : danger ? DL.danger : returns ? DL.gold : "#fff";
    const fg = primary || danger || returns ? "#fff" : DL.ink;
    const border = primary || danger || returns ? bg : DL.ruleStrong;
    return (
        <button
            data-testid={`mc-action-${act.action}`}
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: "8px 14px", background: bg, color: fg, border: `1px solid ${border}`,
                borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
                display: "inline-flex", alignItems: "center", gap: 6,
            }}>
            {primary && <Check size={13} />}
            {danger && <X size={13} />}
            {returns && <RotateCcw size={13} />}
            {act.label}
        </button>
    );
}

function NoteModal({ action, onCancel, onSubmit, submitting }) {
    const [note, setNote] = useState("");
    return (
        <div style={{
            position: "fixed", inset: 0, background: "rgba(14,31,27,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={onCancel}>
            <div
                data-testid="mc-note-modal"
                onClick={(e) => e.stopPropagation()}
                style={{ ...embossedCard(), padding: 24, minWidth: 460, maxWidth: 560 }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{action.label}</div>
                <div style={{ fontSize: 12, color: DL.muted, marginBottom: 14 }}>A note is required to complete this action.</div>
                <textarea
                    data-testid="mc-note-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    autoFocus
                    placeholder="Reason / feedback…"
                    style={{
                        width: "100%", minHeight: 120, padding: 12, borderRadius: 4,
                        border: `1px solid ${DL.rule}`, fontFamily: DL.fontBody, fontSize: 13,
                        resize: "vertical",
                    }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button
                        data-testid="mc-note-cancel"
                        onClick={onCancel}
                        style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${DL.rule}`, borderRadius: 4, fontWeight: 700, cursor: "pointer" }}>
                        Cancel
                    </button>
                    <button
                        data-testid="mc-note-submit"
                        onClick={() => onSubmit(note.trim())}
                        disabled={!note.trim() || submitting}
                        style={{
                            padding: "8px 14px",
                            background: DL.emerald, color: "#fff", border: `1px solid ${DL.emerald}`,
                            borderRadius: 4, fontWeight: 700,
                            cursor: !note.trim() || submitting ? "not-allowed" : "pointer",
                            opacity: !note.trim() || submitting ? 0.55 : 1,
                        }}>
                        {submitting ? "Submitting…" : "Submit"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ApprovalChain({ workflowKey, docId, compact = false, onChange }) {
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [pendingAction, setPendingAction] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const reload = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const { data } = await api.get(`/mc/${workflowKey}/${docId}/state`);
            setState(data);
        } catch (e) {
            setErr(e?.response?.data?.detail || String(e));
        } finally { setLoading(false); }
    }, [workflowKey, docId]);

    useEffect(() => { if (docId && workflowKey) reload(); }, [docId, workflowKey, reload]);

    const runAction = async (act, note = null) => {
        setSubmitting(true);
        try {
            await api.post(`/mc/${workflowKey}/${docId}/transition`, { action: act.action, note });
            setPendingAction(null);
            await reload();
            onChange && onChange();
        } catch (e) {
            alert(e?.response?.data?.detail || String(e));
        } finally { setSubmitting(false); }
    };

    if (loading) return <div style={{ padding: 12, color: DL.muted }}>Loading approval state…</div>;
    if (err) return <div data-testid="mc-error" style={{ padding: 12, color: DL.danger }}>{err}</div>;
    if (!state) return null;

    return (
        <div data-testid={`mc-chain-${workflowKey}`} style={{ ...embossedCard(), padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: 0.5, color: DL.muted, textTransform: "uppercase" }}>
                        Approval Chain · {state.workflow?.label}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                        Status:{" "}
                        <span data-testid="mc-current-status" style={{ color: state.terminal ? DL.emerald : DL.gold }}>
                            {state.status}
                        </span>
                        {state.terminal && <Check size={16} color={DL.emerald} style={{ marginLeft: 6, verticalAlign: "middle" }} />}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(state.next_actions || []).map(a => (
                        <ActionButton
                            key={a.action}
                            act={a}
                            disabled={submitting}
                            onClick={() => a.needs_note ? setPendingAction(a) : runAction(a)}
                        />
                    ))}
                </div>
            </div>

            {/* Pending checker summary for multi-checker "all" steps */}
            {(state.steps || []).map(step => {
                if (step.checker_mode !== "all" || (step.posts || []).length <= 1) return null;
                const signed = step.progress?.signed || [];
                const pending = step.progress?.pending || [];
                return (
                    <div
                        key={step.step_id}
                        data-testid={`mc-multichecker-${step.step_id}`}
                        style={{
                            marginTop: 16, padding: 12,
                            background: "rgba(184,131,40,0.08)",
                            border: `1px dashed ${DL.gold}`, borderRadius: 4,
                        }}>
                        <div style={{ fontSize: 12, color: DL.muted, marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                            <Users size={13} /> Multi-checker step: <b>{step.label}</b> ({signed.length}/{(step.posts || []).length} approved)
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(step.posts || []).map(p => {
                                const has = signed.find(a => a.post_title === p.post_title && a.body_scope === p.body_scope);
                                return (
                                    <span key={`${p.body_scope}-${p.post_title}`} style={chip(
                                        has ? "rgba(13,59,46,0.14)" : "rgba(14,31,27,0.08)",
                                        has ? DL.emerald : DL.muted,
                                    )}>
                                        {has ? <Check size={11} /> : <Clock size={11} />}
                                        {p.post_title}
                                        {has && has.actor_name ? ` · ${has.actor_name}` : ""}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {/* Chain timeline */}
            {(state.chain || []).length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <div style={{ fontFamily: DL.fontMono, fontSize: 10, letterSpacing: 0.5, color: DL.muted, textTransform: "uppercase", marginBottom: 10 }}>
                        Audit trail ({state.chain.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="mc-chain-timeline">
                        {state.chain.slice().reverse().map((c, i) => (
                            <div key={i} style={{
                                display: "flex", gap: 12, alignItems: "flex-start",
                                paddingBottom: 8, borderBottom: i === state.chain.length - 1 ? "none" : `1px solid ${DL.rule}`,
                            }}>
                                <div style={{ paddingTop: 2 }}>
                                    {c.returns ? <RotateCcw size={14} color={DL.gold} />
                                        : c.partial ? <Clock size={14} color={DL.gold} />
                                        : <Check size={14} color={DL.emerald} />}
                                </div>
                                <div style={{ flex: 1, fontSize: 13 }}>
                                    <div>
                                        <b>{c.actor_name}</b>{" "}
                                        <span style={{ color: DL.muted, fontSize: 12 }}>({c.actor_post || c.actor_role} · {c.actor_body})</span>
                                        {" — "}
                                        <span style={{ fontFamily: DL.fontMono, fontSize: 12 }}>
                                            {c.from} <ArrowRight size={11} style={{ verticalAlign: "middle" }} /> {c.to}
                                        </span>
                                        {c.partial && <span style={{ ...chip("rgba(184,131,40,0.18)", DL.gold), marginLeft: 6 }}>Partial approval</span>}
                                        {c.returns && <span style={{ ...chip("rgba(184,131,40,0.24)", DL.gold), marginLeft: 6 }}>Returned</span>}
                                    </div>
                                    {c.note && (
                                        <div style={{ marginTop: 4, padding: "6px 10px", background: DL.paperEdge, borderRadius: 3, fontSize: 12, fontStyle: "italic" }}>
                                            <MessageSquare size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />
                                            {c.note}
                                        </div>
                                    )}
                                    <div style={{ marginTop: 4, fontSize: 11, color: DL.muted }}>{new Date(c.at).toLocaleString()}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(state.next_actions || []).length === 0 && !state.terminal && (
                <div data-testid="mc-no-actions" style={{
                    marginTop: 16, padding: 10, borderRadius: 4,
                    background: "rgba(14,31,27,0.05)", color: DL.muted, fontSize: 12,
                    display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                    <ShieldAlert size={13} /> No actions available for you at status <b>{state.status}</b>.
                    {(state.steps || []).some(s => (s.posts || []).length === 0) && " Some steps are not yet configured — visit /mc-admin."}
                </div>
            )}

            {pendingAction && (
                <NoteModal
                    action={pendingAction}
                    submitting={submitting}
                    onCancel={() => setPendingAction(null)}
                    onSubmit={(note) => runAction(pendingAction, note)}
                />
            )}
        </div>
    );
}
