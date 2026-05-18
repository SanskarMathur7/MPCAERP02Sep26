import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { createClaim } from "@/lib/api";
import { HandCoins, ChevronLeft, CheckCircle2 } from "lucide-react";

const CATEGORIES = [
    { value: "Annual_Grant",       label: "Annual Grant",        hint: "District statutory grant per Art. 28(v)" },
    { value: "Tournament_Expense", label: "Tournament Expense",  hint: "Travel · boarding · officiating costs" },
    { value: "Infrastructure",     label: "Infrastructure",      hint: "Equipment · ground upkeep · stadium works" },
    { value: "Honorarium",         label: "Honorarium",          hint: "Umpire panel · coaching staff · scorers" },
    { value: "Special_Sanction",   label: "Special Sanction",    hint: "One-off MC-approved expenditure" },
];

const ClaimNew = () => {
    const { persona } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({
        title: "",
        description: "",
        category: "Tournament_Expense",
        amount_inr: "",
        fiscal_cycle: "2025-26",
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    if (!persona || persona.body_type === "Public") {
        return (
            <div className="page-enter px-8 py-16 max-w-2xl mx-auto text-center" data-testid="claim-new-denied">
                <div className="overline">Access Denied</div>
                <h1 className="font-serif text-3xl text-mpca-green-dark mt-3">
                    A District or State persona is required to raise claims.
                </h1>
            </div>
        );
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const created = await createClaim({
                body_id: persona.body_code,
                title: form.title.trim(),
                description: form.description.trim() || null,
                category: form.category,
                amount_inr: parseFloat(form.amount_inr),
                fiscal_cycle: form.fiscal_cycle,
                created_by: persona.name,
            });
            navigate("/claims", { state: { highlight: created.id } });
        } catch (e) {
            setError(e?.response?.data?.detail || e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-3xl mx-auto" data-testid="claim-new-page">
            <button
                onClick={() => navigate("/claims")}
                className="btn-heritage-ghost mb-6"
                data-testid="claim-new-back"
            >
                <ChevronLeft size={14} strokeWidth={2} /> Back to Claims
            </button>

            <div className="overline">Phase III.6 · Raise a Claim</div>
            <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                A new entry in the grant ledger.
            </h1>
            <p className="text-mpca-gray-dark mt-3">
                Once drafted, this claim travels: <strong>{persona.body_code}</strong> → its parent body → MPCA Treasurer → disbursement.
            </p>

            <div className="crest-divider my-10" />

            <form onSubmit={handleSubmit} className="bulletin-card p-8 space-y-6" data-testid="claim-new-form">
                <div className="flex items-center gap-3">
                    <HandCoins className="text-mpca-oxblood" size={22} strokeWidth={1.5} />
                    <div>
                        <div className="overline">Originator</div>
                        <div className="font-serif text-lg text-mpca-green-dark">
                            {persona.honorific} {persona.name} · {persona.body_name}
                        </div>
                    </div>
                </div>

                <div>
                    <label className="label-heritage" htmlFor="title">Claim Title *</label>
                    <input
                        id="title"
                        required
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Annual District Grant 2025-26"
                        className="input-heritage"
                        data-testid="claim-title-input"
                    />
                </div>

                <div>
                    <label className="label-heritage" htmlFor="description">Description / Justification</label>
                    <textarea
                        id="description"
                        rows={4}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Brief justification, references to MC resolutions, attachments etc."
                        className="input-heritage"
                        data-testid="claim-description-input"
                    />
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                        <label className="label-heritage">Category *</label>
                        <div className="space-y-1.5" data-testid="claim-category-group">
                            {CATEGORIES.map((c) => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, category: c.value }))}
                                    data-testid={"claim-cat-" + c.value}
                                    className={
                                        "w-full text-left px-3 py-2 border transition-colors " +
                                        (form.category === c.value
                                            ? "border-mpca-oxblood bg-mpca-oxblood/10 text-mpca-oxblood"
                                            : "border-mpca-brass/40 hover:border-mpca-brass text-mpca-green-dark")
                                    }
                                >
                                    <div className="font-serif text-sm">{c.label}</div>
                                    <div className="text-[10px] text-mpca-gray-dark mt-0.5">{c.hint}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="label-heritage" htmlFor="amount">Amount (INR) *</label>
                            <input
                                id="amount"
                                required
                                type="number"
                                step="1"
                                min="1"
                                value={form.amount_inr}
                                onChange={(e) => setForm((f) => ({ ...f, amount_inr: e.target.value }))}
                                placeholder="110000"
                                className="input-heritage"
                                data-testid="claim-amount-input"
                            />
                            <div className="text-[10px] text-mpca-gray-dark mt-1">
                                Reference: District annual grant ₹1,10,000 · Division annual grant ₹30,000
                            </div>
                        </div>
                        <div>
                            <label className="label-heritage" htmlFor="cycle">Fiscal Cycle</label>
                            <input
                                id="cycle"
                                value={form.fiscal_cycle}
                                onChange={(e) => setForm((f) => ({ ...f, fiscal_cycle: e.target.value }))}
                                placeholder="2025-26"
                                className="input-heritage"
                                data-testid="claim-cycle-input"
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="bg-mpca-oxblood/10 border border-mpca-oxblood/40 text-mpca-oxblood px-4 py-3 text-sm" data-testid="claim-new-error">
                        {error}
                    </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-mpca-brass/20">
                    <button type="button" onClick={() => navigate("/claims")} className="btn-heritage-ghost" data-testid="claim-new-cancel">
                        Cancel
                    </button>
                    <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="claim-new-submit">
                        <CheckCircle2 size={14} strokeWidth={2} />
                        {busy ? "Saving…" : "Save as Draft"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ClaimNew;
