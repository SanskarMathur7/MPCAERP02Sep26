import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createElection } from "@/lib/api";
import { ArrowLeft, Check } from "lucide-react";

const today = new Date().toISOString().slice(0, 10);

const ElectionNew = () => {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        title: "",
        post: "President",
        tenure_years: 4,
        cooling_period_years: 4,
        electoral_officer: "",
        nomination_open_date: today,
        nomination_close_date: today,
        voting_date: today,
        status: "Announced",
        notes: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const update = (e) => {
        const v = e.target.type === "number" ? Number(e.target.value) : e.target.value;
        setForm((f) => ({ ...f, [e.target.name]: v }));
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const created = await createElection(form);
            navigate(`/elections/${created.id}`);
        } catch (err) {
            setError(err.response?.data?.detail || err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-4xl mx-auto" data-testid="election-new-page">
            <Link to="/elections" className="btn-heritage-ghost mb-6 inline-flex">
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Elections
            </Link>
            <div className="mb-10">
                <div className="overline">Announcement</div>
                <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">
                    Announce a New Election
                </h1>
                <p className="text-mpca-gray-dark mt-2 max-w-2xl">
                    On approval of the Managing Committee, an Electoral Officer shall be
                    appointed to conduct the election in accordance with Article XI.
                </p>
                <div className="crest-divider mt-10" />
            </div>

            <form onSubmit={onSubmit} className="space-y-8">
                <div className="bulletin-card p-8">
                    <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                        <div className="md:col-span-2">
                            <label className="label-heritage">Title *</label>
                            <input name="title" required value={form.title} onChange={update} className="input-heritage" data-testid="el-title" />
                        </div>
                        <div>
                            <label className="label-heritage">Post *</label>
                            <select name="post" value={form.post} onChange={update} className="input-heritage" data-testid="el-post">
                                <option>President</option>
                                <option>Vice President</option>
                                <option>Honorary Secretary</option>
                                <option>Joint Secretary</option>
                                <option>Honorary Treasurer</option>
                                <option>Managing Committee Member</option>
                            </select>
                        </div>
                        <div>
                            <label className="label-heritage">Electoral Officer *</label>
                            <input name="electoral_officer" required value={form.electoral_officer} onChange={update} className="input-heritage" data-testid="el-officer" />
                        </div>
                        <div>
                            <label className="label-heritage">Tenure (years)</label>
                            <input type="number" name="tenure_years" min="1" value={form.tenure_years} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Cooling Period (years)</label>
                            <input type="number" name="cooling_period_years" min="0" value={form.cooling_period_years} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Nominations Open Date *</label>
                            <input type="date" name="nomination_open_date" required value={form.nomination_open_date} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Nominations Close Date *</label>
                            <input type="date" name="nomination_close_date" required value={form.nomination_close_date} onChange={update} className="input-heritage" />
                        </div>
                        <div>
                            <label className="label-heritage">Voting Date *</label>
                            <input type="date" name="voting_date" required value={form.voting_date} onChange={update} className="input-heritage" data-testid="el-voting-date" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="label-heritage">Notes</label>
                            <textarea name="notes" value={form.notes} onChange={update} rows={3} className="input-heritage" />
                        </div>
                    </div>
                </div>

                {error && <div className="text-mpca-oxblood text-sm italic" data-testid="el-error">{error}</div>}

                <div className="flex justify-end gap-3">
                    <Link to="/elections" className="btn-heritage-secondary">Cancel</Link>
                    <button type="submit" disabled={saving} className="btn-heritage-primary" data-testid="el-submit">
                        <Check size={14} strokeWidth={1.5} />
                        {saving ? "Announcing…" : "Announce Election"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ElectionNew;
