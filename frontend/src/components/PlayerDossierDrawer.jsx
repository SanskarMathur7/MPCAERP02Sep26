import { X, User } from "lucide-react";

const PlayerDossierDrawer = ({ playerId, onClose, players, canEdit, inSquad, onToggleSquad }) => {
    if (!playerId) return null;
    const p = players.find((x) => x.id === playerId);
    if (!p) return null;
    const m = p.selection_meta || {};
    const stats = m.stats || {};
    const form = m.form_last_5 || {};
    const compliance = m.compliance || {};
    const fmts = [["fc", "First-class · 4-day"], ["la", "List A · 50 overs"], ["t20", "T20"]];

    return (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="player-dossier-drawer">
            <div className="flex-1 bg-black/50" onClick={onClose} />
            <div className="w-full max-w-xl bg-mpca-ivory border-l-2 border-mpca-brass overflow-y-auto" style={{ backgroundImage: "linear-gradient(135deg, var(--mpca-ivory) 0%, var(--mpca-parchment) 100%)" }}>
                <div className="sticky top-0 bg-mpca-green-dark text-mpca-ivory px-6 py-4 flex justify-between items-center z-10">
                    <div>
                        <div className="overline !text-mpca-gold-light">Dossier</div>
                        <div className="font-serif text-lg">{p.full_name}</div>
                    </div>
                    <button onClick={onClose} className="text-mpca-gold-light" data-testid="dossier-close-btn"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <Field label="Player No." v={p.player_id} mono />
                        <Field label="Division" v={m.division_name || p.body_id} />
                        <Field label="Role" v={m.role_desc || p.role} />
                        <Field label="Age" v={m.age_years} />
                        <Field label="Batting" v={p.batting_style} />
                        <Field label="Bowling" v={m.bowling_style_raw || p.bowling_style} />
                        <Field label="Yo-Yo" v={m.yo_yo} mono />
                        <Field label="2 km" v={m.two_km_time} mono />
                    </div>

                    <div>
                        <div className="overline mb-2">Career statistics</div>
                        {fmts.map(([k, l]) => {
                            const s = stats[k];
                            if (!s) return null;
                            return (
                                <div key={k} className="border border-mpca-brass/30 p-2 mb-2 text-xs">
                                    <div className="font-serif text-mpca-green-dark mb-1">{l}</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <Stat label="M" v={s[0]} />
                                        <Stat label="Runs" v={s[1]} />
                                        <Stat label="Avg" v={s[2]} />
                                        <Stat label="SR" v={s[3]} />
                                        <Stat label="100/50" v={`${s[4]}/${s[5]}`} />
                                        <Stat label="Wkts" v={s[6]} />
                                        <Stat label="BowlAvg" v={s[7]} />
                                        <Stat label="Econ" v={s[8]} />
                                    </div>
                                    {form[k]?.length ? (
                                        <div className="mt-2 text-[10px] text-mpca-gray-dark">
                                            Last 5: {form[k].map(([r, w]) => `${r}${w ? "/" + w : ""}`).join(" · ")}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                    <div>
                        <div className="overline mb-2">Compliance</div>
                        <div className="text-xs space-y-1">
                            <ComplianceRow label="Age verification" ok={compliance.age_verified} />
                            <ComplianceRow label="NOC / transfer clearance" ok={compliance.noc_ok} />
                            <ComplianceRow label="Anti-doping & anti-corruption" ok={compliance.anti_doping_ok} />
                        </div>
                    </div>

                    {canEdit && (
                        <button onClick={() => { onToggleSquad(p); onClose(); }} className={`btn-heritage-primary w-full ${inSquad ? "!bg-mpca-oxblood" : ""}`} data-testid="dossier-toggle-squad-btn">
                            {inSquad ? "Remove from squad" : "Add to squad"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const Field = ({ label, v, mono }) => (
    <div>
        <div className="text-[10px] uppercase tracking-widest text-mpca-gray-dark">{label}</div>
        <div className={`text-sm text-mpca-charcoal ${mono ? "font-mono" : ""}`}>{v ?? "—"}</div>
    </div>
);
const Stat = ({ label, v }) => (
    <div><span className="text-[9px] text-mpca-gray-dark uppercase tracking-wider">{label}</span><div className="font-mono text-mpca-charcoal">{v ?? "—"}</div></div>
);
const ComplianceRow = ({ label, ok }) => (
    <div className={`flex justify-between px-2 py-1 border ${ok ? "border-mpca-green/40 text-mpca-green" : "border-mpca-oxblood/40 text-mpca-oxblood"}`}>
        <span>{label}</span><span>{ok ? "✓" : "✗"}</span>
    </div>
);

export default PlayerDossierDrawer;
