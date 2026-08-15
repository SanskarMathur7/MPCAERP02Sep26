// MPCA-235 · Tournament Wiring Console
// Single source of truth for the tournament progression matrix.
// Two tabs: Wiring Matrix (grid) + By Type (per-type card view).
// Any MPCA-scope persona can edit cells; changes bump a version counter.

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
    Cable, Download, RotateCcw, X, Save, Pencil, Info,
    ChevronRight, LayoutGrid, Layers,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Flag / owner / mode → colour tokens (kept close to app palette) ──────────
const FLAG_STYLE = {
    M:    { bg: "#fde8ec", fg: "#7f1d1d", label: "Mandatory", border: "#dc2626" },
    O:    { bg: "#fef3c7", fg: "#78350f", label: "Optional",  border: "#d97706" },
    NA:   { bg: "#e5e7eb", fg: "#374151", label: "N/A",       border: "#9ca3af" },
    INFO: { bg: "#dbeafe", fg: "#1e3a8a", label: "Info",      border: "#2563eb" },
};

const OWNER_STYLE = {
    MPCA:     { bg: "#3b2a3a", fg: "#fff" },
    Division: { bg: "#2f4f4f", fg: "#fff" },
    District: { bg: "#8b5a2b", fg: "#fff" },
    Auto:     { bg: "#9ca3af", fg: "#fff" },
};

const MODE_LABEL = {
    Register_Linked: "Register-linked",
    Manual_PDF:      "Manual · PDF only",
    Auto_Compute:    "Auto-computed",
    NA:              "—",
};

const VIS_LABEL = {
    Realtime:  "Realtime to MPCA",
    On_Submit: "On claim submit",
    Never:     "Never (internal)",
};

const BUCKET_STYLE = {
    Pre_Tournament:  { label: "Pre-Tournament",  bg: "#f0fdf4", border: "#16a34a" },
    In_Tournament:   { label: "In-Tournament",   bg: "#fefce8", border: "#ca8a04" },
    Post_Tournament: { label: "Post-Tournament", bg: "#fef2f2", border: "#b91c1c" },
};

// ─── Small display atoms ──────────────────────────────────────────────────────
const Chip = ({ children, style, testid }) => (
    <span
        data-testid={testid}
        style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            ...style,
        }}
    >
        {children}
    </span>
);

const FlagChip = ({ flag, testid }) => {
    const s = FLAG_STYLE[flag] || FLAG_STYLE.NA;
    return (
        <Chip
            testid={testid}
            style={{ background: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
        >
            {flag}
        </Chip>
    );
};

const OwnerChip = ({ owner }) => {
    const s = OWNER_STYLE[owner] || OWNER_STYLE.Auto;
    return <Chip style={{ background: s.bg, color: s.fg }}>{owner}</Chip>;
};

// ─── Cell edit modal ──────────────────────────────────────────────────────────
function CellEditor({ open, onClose, cell, typeMeta, stepMeta, enums, onSave }) {
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open && cell) setDraft({ ...cell });
    }, [open, cell]);

    if (!open || !draft) return null;

    const setF = (k, v) => setDraft({ ...draft, [k]: v });

    const submit = async () => {
        setSaving(true);
        try {
            await onSave(draft);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            data-testid="wiring-cell-editor"
            style={{
                position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)",
                display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
            }}
        >
            <div style={{
                background: "#fff", borderRadius: 12, width: "min(720px, 92vw)",
                maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
            }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.4, color: "#64748b", fontWeight: 700 }}>Edit wiring cell</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", marginTop: 2 }}>{typeMeta.name} · {stepMeta.label}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{typeMeta.sub}</div>
                    </div>
                    <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: 20, display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
                    <Field label="Flag">
                        <select data-testid="wce-flag" value={draft.flag} onChange={e => setF("flag", e.target.value)} style={inputStyle}>
                            {enums.flag.map(v => <option key={v} value={v}>{v} · {FLAG_STYLE[v]?.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Owner">
                        <select data-testid="wce-owner" value={draft.owner} onChange={e => setF("owner", e.target.value)} style={inputStyle}>
                            {enums.owner.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </Field>
                    <Field label="Approver">
                        <select data-testid="wce-approver" value={draft.approver} onChange={e => setF("approver", e.target.value)} style={inputStyle}>
                            {enums.approver.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </Field>
                    <Field label="Mode">
                        <select data-testid="wce-mode" value={draft.mode} onChange={e => setF("mode", e.target.value)} style={inputStyle}>
                            {enums.mode.map(v => <option key={v} value={v}>{MODE_LABEL[v] || v}</option>)}
                        </select>
                    </Field>
                    <Field label="Visibility to MPCA">
                        <select data-testid="wce-visibility" value={draft.visibility} onChange={e => setF("visibility", e.target.value)} style={inputStyle}>
                            {enums.visibility.map(v => <option key={v} value={v}>{VIS_LABEL[v] || v}</option>)}
                        </select>
                    </Field>
                    <Field label="Blocks next step?">
                        <select data-testid="wce-blocks" value={draft.blocks_next ? "yes" : "no"} onChange={e => setF("blocks_next", e.target.value === "yes")} style={inputStyle}>
                            <option value="yes">Yes — gates next step</option>
                            <option value="no">No — parallel</option>
                        </select>
                    </Field>
                    <Field label="SLA (days)">
                        <input
                            data-testid="wce-sla" type="number" min={0}
                            value={draft.sla_days ?? ""}
                            onChange={e => setF("sla_days", e.target.value === "" ? null : Number(e.target.value))}
                            style={inputStyle}
                            placeholder="—"
                        />
                    </Field>
                    <div />
                    <div style={{ gridColumn: "1 / -1" }}>
                        <Field label="Notes / Text">
                            <textarea
                                data-testid="wce-text"
                                rows={3}
                                value={draft.text}
                                onChange={e => setF("text", e.target.value)}
                                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                            />
                        </Field>
                    </div>
                </div>

                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8, background: "#f8fafc" }}>
                    <button data-testid="wce-cancel" onClick={onClose} style={btnGhost}>Cancel</button>
                    <button data-testid="wce-save" onClick={submit} disabled={saving} style={btnPrimary}>
                        <Save size={14} style={{ marginRight: 6 }} />{saving ? "Saving…" : "Save cell"}
                    </button>
                </div>
            </div>
        </div>
    );
}

const Field = ({ label, children }) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</span>
        {children}
    </label>
);
const inputStyle = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 10px", fontSize: 13, background: "#fff" };
const btnGhost   = { padding: "8px 14px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnPrimary = { padding: "8px 14px", background: "#3b2a3a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center" };

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TournamentWiringConsole() {
    const { persona } = useAuth();
    const isMpca = persona?.body_type === "State" || persona?.id === "president" || persona?.id === "secretary" || persona?.id === "treasurer";

    const [doc, setDoc]       = useState(null);
    const [loading, setLoad]  = useState(true);
    const [tab, setTab]       = useState("matrix");   // matrix | bytype
    const [editing, setEdit]  = useState(null);       // { type_id, step_key }

    const load = async () => {
        setLoad(true);
        try {
            const r = await axios.get(`${API}/tournament-wiring`);
            setDoc(r.data);
        } catch (e) {
            toast.error("Failed to load wiring matrix");
        } finally {
            setLoad(false);
        }
    };
    useEffect(() => { load(); }, []);

    const saveCell = async (draft) => {
        try {
            const r = await axios.patch(`${API}/tournament-wiring/cell`, {
                type_id:  editing.type_id,
                step_key: editing.step_key,
                ...draft,
            });
            toast.success(`Saved · v${r.data.version}`);
            // Merge locally without a full reload
            setDoc(prev => ({
                ...prev,
                version: r.data.version,
                updated_at: r.data.updated_at,
                cells: {
                    ...prev.cells,
                    [editing.type_id]: {
                        ...prev.cells[editing.type_id],
                        [editing.step_key]: r.data.cell,
                    },
                },
            }));
        } catch (e) {
            toast.error(e.response?.data?.detail || "Save failed");
            throw e;
        }
    };

    const resetAll = async () => {
        if (!window.confirm("Reset every cell to the seeded defaults? Any manual edits will be lost.")) return;
        try {
            await axios.post(`${API}/tournament-wiring/reset`);
            toast.success("Matrix reset to defaults");
            load();
        } catch (e) {
            toast.error("Reset failed");
        }
    };

    const exportJson = async () => {
        try {
            const r = await axios.get(`${API}/tournament-wiring/export`);
            const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `mpca-tournament-wiring-v${r.data.meta.version}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error("Export failed");
        }
    };

    if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading wiring matrix…</div>;
    if (!doc)    return <div style={{ padding: 40, textAlign: "center", color: "#b91c1c" }}>Failed to load</div>;

    const steps = doc.steps;
    const types = doc.types;
    const cells = doc.cells;
    const enums = doc.enums;

    return (
        <div style={{ padding: "24px 32px", maxWidth: 1600, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
                <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.6, color: "#64748b", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Cable size={13} /> Operations · Tournament Wiring
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, color: "#1a1a1a", margin: "4px 0 2px 0", letterSpacing: -0.5 }}>
                        Tournament Progression Wiring
                    </h1>
                    <div style={{ fontSize: 13, color: "#475569", maxWidth: 780 }}>
                        Single source of truth for the 9-step tournament lifecycle across every tournament type MPCA runs. Governs Mandatory / Optional / N/A flags, owner, approver, capture mode, MPCA visibility and SLAs.
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Chip style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12, padding: "4px 10px" }} testid="wiring-version-chip">
                        v{doc.version} · {new Date(doc.updated_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Chip>
                    <button data-testid="wiring-export" onClick={exportJson} style={btnGhost}>
                        <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Export JSON
                    </button>
                    {isMpca && (
                        <button data-testid="wiring-reset" onClick={resetAll} style={{ ...btnGhost, color: "#b91c1c", borderColor: "#fecaca" }}>
                            <RotateCcw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Reset to defaults
                        </button>
                    )}
                </div>
            </div>

            {!isMpca && (
                <div data-testid="wiring-readonly-banner" style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 12px", marginTop: 12, marginBottom: 12, fontSize: 12, color: "#78350f" }}>
                    <Info size={12} style={{ verticalAlign: -1, marginRight: 6 }} />
                    Read-only. Only MPCA state-level personas can edit the wiring matrix.
                </div>
            )}

            {/* Tab strip */}
            <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0", marginTop: 22, marginBottom: 20 }}>
                <TabBtn active={tab === "matrix"} onClick={() => setTab("matrix")} icon={LayoutGrid} testid="wiring-tab-matrix">
                    Wiring Matrix
                </TabBtn>
                <TabBtn active={tab === "bytype"} onClick={() => setTab("bytype")} icon={Layers} testid="wiring-tab-bytype">
                    By Type
                </TabBtn>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "#64748b", paddingBottom: 8 }}>
                    <Legend />
                </div>
            </div>

            {tab === "matrix" ? (
                <MatrixView
                    steps={steps} types={types} cells={cells}
                    canEdit={isMpca}
                    onEdit={(type_id, step_key) => setEdit({ type_id, step_key })}
                />
            ) : (
                <ByTypeView
                    steps={steps} types={types} cells={cells}
                    canEdit={isMpca}
                    onEdit={(type_id, step_key) => setEdit({ type_id, step_key })}
                />
            )}

            <CellEditor
                open={!!editing}
                onClose={() => setEdit(null)}
                cell={editing ? cells[editing.type_id][editing.step_key] : null}
                typeMeta={editing ? types.find(t => t.id === editing.type_id) : null}
                stepMeta={editing ? steps.find(s => s.key === editing.step_key) : null}
                enums={enums}
                onSave={saveCell}
            />
        </div>
    );
}

const TabBtn = ({ active, onClick, icon: Icon, testid, children }) => (
    <button
        data-testid={testid}
        onClick={onClick}
        style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: "10px 18px", fontSize: 14, fontWeight: 700,
            color: active ? "#3b2a3a" : "#64748b",
            borderBottom: active ? "3px solid #3b2a3a" : "3px solid transparent",
            marginBottom: -2, display: "inline-flex", alignItems: "center", gap: 6,
        }}
    >
        <Icon size={15} /> {children}
    </button>
);

const Legend = () => (
    <>
        {["M", "O", "NA", "INFO"].map(f => (
            <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <FlagChip flag={f} /> <span>{FLAG_STYLE[f].label}</span>
            </span>
        ))}
    </>
);

// ─── Matrix view — steps as rows, types as columns ────────────────────────────
function MatrixView({ steps, types, cells, canEdit, onEdit }) {
    return (
        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table data-testid="wiring-matrix" style={{ borderCollapse: "collapse", width: "100%", background: "#fff", fontSize: 12 }}>
                <thead>
                    <tr style={{ background: "#f8fafc" }}>
                        <th style={{ ...thStyle, minWidth: 180, textAlign: "left", position: "sticky", left: 0, background: "#f8fafc", zIndex: 2 }}>Step</th>
                        {types.map(t => (
                            <th key={t.id} style={{ ...thStyle, minWidth: 150 }}>
                                <div style={{ fontWeight: 700, color: "#1a1a1a" }}>{t.name}</div>
                                <div style={{ fontSize: 10, fontWeight: 500, color: "#64748b", marginTop: 2, lineHeight: 1.3 }}>{t.sub}</div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {steps.map((s, idx) => (
                        <tr key={s.key} style={{ borderTop: "1px solid #e5e7eb" }}>
                            <td style={{ ...tdStyle, position: "sticky", left: 0, background: "#fff", zIndex: 1, borderRight: "2px solid #e5e7eb" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: "50%", background: BUCKET_STYLE[s.bucket].bg, border: `1px solid ${BUCKET_STYLE[s.bucket].border}`, color: BUCKET_STYLE[s.bucket].border, alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>{idx + 1}</span>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{s.label}</div>
                                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{BUCKET_STYLE[s.bucket].label}</div>
                                    </div>
                                </div>
                            </td>
                            {types.map(t => {
                                const cell = cells[t.id][s.key];
                                return (
                                    <td key={t.id}
                                        data-testid={`wcell-${t.id}-${s.key}`}
                                        onClick={canEdit ? () => onEdit(t.id, s.key) : undefined}
                                        style={{
                                            ...tdStyle,
                                            cursor: canEdit ? "pointer" : "default",
                                            background: FLAG_STYLE[cell.flag]?.bg,
                                            verticalAlign: "top",
                                        }}
                                        title={cell.text}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                            <FlagChip flag={cell.flag} testid={`wcell-flag-${t.id}-${s.key}`} />
                                            {cell.flag !== "NA" && <OwnerChip owner={cell.owner} />}
                                            {canEdit && <Pencil size={11} style={{ color: "#64748b", marginLeft: "auto" }} />}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.4 }}>{cell.text}</div>
                                        {(cell.mode !== "NA" || cell.sla_days) && (
                                            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4, fontSize: 10, color: "#475569" }}>
                                                {cell.mode !== "NA" && <span style={metaPill}>{MODE_LABEL[cell.mode]}</span>}
                                                {cell.sla_days ? <span style={metaPill}>SLA {cell.sla_days}d</span> : null}
                                                {cell.blocks_next && <span style={{ ...metaPill, background: "#fecaca", color: "#7f1d1d" }}>Gates next</span>}
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const thStyle = { padding: "12px 10px", fontSize: 11, fontWeight: 700, textAlign: "left", color: "#334155", borderBottom: "2px solid #cbd5e1", textTransform: "uppercase", letterSpacing: 0.6 };
const tdStyle = { padding: "10px", verticalAlign: "top", borderRight: "1px solid #f1f5f9" };
const metaPill = { display: "inline-block", padding: "1px 6px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 10, fontWeight: 600 };

// ─── By-type view — each tournament type gets a card with its full pipeline ──
function ByTypeView({ steps, types, cells, canEdit, onEdit }) {
    return (
        <div data-testid="wiring-bytype" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))" }}>
            {types.map(t => (
                <div key={t.id} data-testid={`wtype-card-${t.id}`} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ background: "linear-gradient(180deg, #3b2a3a 0%, #2a1e2e 100%)", padding: "14px 16px", color: "#fff" }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: "#d4b8c6", marginTop: 2 }}>{t.sub}</div>
                    </div>
                    <div>
                        {steps.map((s, idx) => {
                            const cell = cells[t.id][s.key];
                            const dim = cell.flag === "NA";
                            return (
                                <div key={s.key}
                                     data-testid={`wtype-step-${t.id}-${s.key}`}
                                     onClick={canEdit ? () => onEdit(t.id, s.key) : undefined}
                                     style={{
                                         display: "flex", gap: 12, padding: "10px 14px",
                                         borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                                         opacity: dim ? 0.55 : 1,
                                         cursor: canEdit ? "pointer" : "default",
                                     }}
                                >
                                    <div style={{ minWidth: 24, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                                        <span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: "50%", background: BUCKET_STYLE[s.bucket].bg, border: `1px solid ${BUCKET_STYLE[s.bucket].border}`, color: BUCKET_STYLE[s.bucket].border, alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>{idx + 1}</span>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{s.label}</span>
                                            <FlagChip flag={cell.flag} />
                                            {cell.flag !== "NA" && <OwnerChip owner={cell.owner} />}
                                            {canEdit && <Pencil size={11} style={{ color: "#94a3b8", marginLeft: "auto" }} />}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>{cell.text}</div>
                                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 10, color: "#64748b" }}>
                                            {cell.mode !== "NA" && <span style={metaPill}>{MODE_LABEL[cell.mode]}</span>}
                                            {cell.approver !== "None" && <span style={metaPill}>Approver · {cell.approver}</span>}
                                            <span style={metaPill}>{VIS_LABEL[cell.visibility]}</span>
                                            {cell.sla_days ? <span style={metaPill}>SLA {cell.sla_days}d</span> : null}
                                            {cell.blocks_next && <span style={{ ...metaPill, background: "#fecaca", color: "#7f1d1d" }}>Gates next <ChevronRight size={9} style={{ verticalAlign: -1 }}/></span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
