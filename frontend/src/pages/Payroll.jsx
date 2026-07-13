/**
 * Payroll page · Sprint 3 · P6.x
 * 2 tabs: Employees master + Payroll registers (generate / finalise).
 * Finalising auto-creates a Payment voucher (Sprint 1 ledger integration).
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    fetchEmployees, fetchEmployeesSummary, createEmployee,
    fetchPayrollRegisters, generatePayroll, finalisePayrollRegister, fetchPayrollSummary,
} from "@/lib/api";
import {
    Users, Plus, Filter, X, PlayCircle, CheckCircle2, ChevronRight,
    Wallet, Percent, ReceiptIndianRupee, Briefcase,
} from "lucide-react";
import CricketLoader from "@/components/CricketLoader";

const fmtINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fmtINR2 = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

const KpiTile = ({ label, value, sub, icon: Icon, tone = "green", testid }) => {
    const toneMap = { green: "text-mpca-green-dark", oxblood: "text-mpca-oxblood", brass: "text-mpca-brass", gold: "text-mpca-gold-dark" };
    return (
        <div className="bulletin-card p-5" data-testid={testid}>
            <Icon size={16} strokeWidth={1.5} className="text-mpca-brass mb-3" />
            <div className={`font-serif text-2xl ${toneMap[tone]}`}>{value}</div>
            <div className="text-xs text-mpca-gray-dark uppercase tracking-wider mt-2">{label}</div>
            {sub && <div className="text-[10px] text-mpca-gray-dark mt-1">{sub}</div>}
        </div>
    );
};

const Payroll = () => {
    const { persona } = useAuth();
    const [tab, setTab] = useState("payroll");
    const [employees, setEmployees] = useState([]);
    const [empStats, setEmpStats] = useState(null);
    const [registers, setRegisters] = useState([]);
    const [payStats, setPayStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showNewEmp, setShowNewEmp] = useState(false);
    const [showGenerate, setShowGenerate] = useState(false);
    const [selectedReg, setSelectedReg] = useState(null);
    const [showFinalise, setShowFinalise] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [e, es, r, ps] = await Promise.all([
                fetchEmployees(), fetchEmployeesSummary(),
                fetchPayrollRegisters(), fetchPayrollSummary(),
            ]);
            setEmployees(e); setEmpStats(es);
            setRegisters(r); setPayStats(ps);
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const handleFinalise = async (payload) => {
        if (!selectedReg) return;
        setBusy(true);
        try {
            await finalisePayrollRegister(selectedReg.id, payload);
            await load();
            setShowFinalise(false);
            setSelectedReg(null);
        } catch (e) {
            alert("Finalise failed: " + (e.response?.data?.detail || e.message));
        } finally { setBusy(false); }
    };

    if (loading) return <div className="p-16"><CricketLoader size="lg" label="Loading HR & Payroll…" /></div>;

    return (
        <div className="page-enter px-8 md:px-12 py-10 max-w-7xl mx-auto" data-testid="payroll-page">
            <div className="flex flex-wrap justify-between items-end gap-6 mb-8">
                <div>
                    <div className="overline flex items-center gap-2"><Users size={12} /> Sprint 3 · HR & Payroll</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark mt-3 leading-tight">Employees & Payroll</h1>
                    <p className="text-mpca-gray-dark mt-2 max-w-2xl text-sm">
                        Employee master with monthly payroll register · statutory deductions (PF · ESI · PT · TDS) · auto-voucher on finalise.
                    </p>
                </div>
                <div className="flex gap-2">
                    {tab === "employees" && (
                        <button onClick={() => setShowNewEmp(true)} className="btn-heritage-primary" data-testid="new-employee-btn">
                            <Plus size={14} /> New Employee
                        </button>
                    )}
                    {tab === "payroll" && (
                        <button onClick={() => setShowGenerate(true)} className="btn-heritage-primary" data-testid="generate-payroll-btn">
                            <PlayCircle size={14} /> Generate Payroll
                        </button>
                    )}
                </div>
            </div>

            <div className="crest-divider mb-8" />

            {tab === "employees" && empStats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Total Employees" value={empStats.count} sub={`${empStats.active} active`} icon={Users} testid="kpi-total-emp" />
                    <KpiTile label="Monthly Gross" value={fmtINR(empStats.monthly_gross_inr)} sub="All active staff" icon={Wallet} testid="kpi-monthly" />
                    <KpiTile label="Annual Projected" value={fmtINR(empStats.annual_projected_inr)} icon={ReceiptIndianRupee} tone="brass" testid="kpi-annual" />
                    <KpiTile label="Contractors" value={(empStats.by_type?.Consultant || 0) + (empStats.by_type?.Contract || 0)} sub="Consultant + Contract" icon={Briefcase} tone="gold" testid="kpi-contractors" />
                </div>
            )}
            {tab === "payroll" && payStats && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiTile label="Total Gross · YTD" value={fmtINR(payStats.total_gross_inr)} sub={`${payStats.period_count} period(s)`} icon={Wallet} testid="kpi-gross" />
                    <KpiTile label="Net Paid · YTD" value={fmtINR(payStats.total_net_inr)} icon={Wallet} tone="green" testid="kpi-net" />
                    <KpiTile label="TDS Deducted" value={fmtINR(payStats.total_tds_inr)} sub="Payable to IT dept." icon={Percent} tone="oxblood" testid="kpi-tds" />
                    <KpiTile label="PF + ESI + PT" value={fmtINR(payStats.total_pf_inr + payStats.total_esi_inr + payStats.total_pt_inr)} sub="Statutory contributions" icon={Percent} tone="brass" testid="kpi-statutory" />
                </div>
            )}

            <div className="flex gap-1 mb-4 border-b border-mpca-brass/30">
                {[["payroll", `Payroll Registers · ${registers.length}`], ["employees", `Employee Master · ${employees.length}`]].map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
                        className={"px-4 py-2 text-xs tracking-widest uppercase border-b-2 -mb-px " +
                            (tab === k ? "border-mpca-oxblood text-mpca-green-dark" : "border-transparent text-mpca-gray-dark hover:text-mpca-charcoal")}>
                        {l}
                    </button>
                ))}
            </div>

            {tab === "employees" && (
                <div className="bulletin-card overflow-hidden" data-testid="employees-body">
                    {employees.length === 0 ? (
                        <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No employees yet.</div>
                    ) : (
                        <table className="w-full text-sm" data-testid="employee-table">
                            <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                                <tr>
                                    {["Emp No.", "Name", "Designation", "Type", "DoJ", "Basic", "Total CTC", "Status"].map((h) => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((e) => {
                                    const ctc = (e.basic_pay_inr || 0) + (e.hra_inr || 0) + (e.special_allowance_inr || 0) + (e.conveyance_inr || 0);
                                    return (
                                        <tr key={e.id} className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40" data-testid={`emp-row-${e.id}`}>
                                            <td className="px-4 py-3 font-mono text-[11px] text-mpca-charcoal">{e.employee_no}</td>
                                            <td className="px-4 py-3 text-mpca-green-dark">{e.name}</td>
                                            <td className="px-4 py-3 text-mpca-charcoal text-[11px]">{e.designation}</td>
                                            <td className="px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-gray-dark">{e.employment_type}</td>
                                            <td className="px-4 py-3 font-mono text-[10px] text-mpca-gray-dark">{e.date_of_joining}</td>
                                            <td className="px-4 py-3 font-mono text-mpca-charcoal">{fmtINR(e.basic_pay_inr)}</td>
                                            <td className="px-4 py-3 font-mono text-mpca-green-dark">{fmtINR(ctc)}</td>
                                            <td className="px-4 py-3">
                                                <span className={"px-2 py-0.5 text-[10px] tracking-widest uppercase " +
                                                    (e.status === "Active" ? "bg-mpca-green-dark/15 text-mpca-green-dark" :
                                                     "bg-mpca-brass/15 text-mpca-brass")}>
                                                    {e.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tab === "payroll" && (
                <div className="bulletin-card overflow-hidden" data-testid="registers-body">
                    {registers.length === 0 ? (
                        <div className="p-12 text-center text-mpca-gray-dark italic font-serif">No payroll registers yet — click Generate Payroll.</div>
                    ) : (
                        <table className="w-full text-sm" data-testid="register-table">
                            <thead className="bg-mpca-parchment border-b border-mpca-brass/40">
                                <tr>
                                    {["Period", "Body", "Employees", "Gross", "Deductions", "Net Pay", "Status", ""].map((h) => (
                                        <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {registers.map((r) => (
                                    <tr key={r.id} onClick={() => setSelectedReg(r)}
                                        className="border-b border-mpca-brass/20 hover:bg-mpca-parchment/40 cursor-pointer"
                                        data-testid={`reg-row-${r.id}`}>
                                        <td className="px-4 py-3 font-mono text-mpca-charcoal">{r.period}</td>
                                        <td className="px-4 py-3 text-mpca-green-dark">{r.body_id}</td>
                                        <td className="px-4 py-3 font-mono">{r.rows.length}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-charcoal">{fmtINR(r.total_gross_inr)}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-oxblood">{fmtINR(r.total_deductions_inr)}</td>
                                        <td className="px-4 py-3 font-mono text-mpca-green-dark font-medium">{fmtINR(r.total_net_inr)}</td>
                                        <td className="px-4 py-3">
                                            <span className={"px-2 py-0.5 text-[10px] tracking-widest uppercase " +
                                                (r.status === "Finalised" ? "bg-mpca-green-deep/15 text-mpca-green-deep" :
                                                                            "bg-mpca-brass/15 text-mpca-brass")}>
                                                {r.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right"><ChevronRight size={14} className="text-mpca-gray-dark inline" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {selectedReg && (
                <RegisterDrawer reg={selectedReg} onClose={() => setSelectedReg(null)} onFinalise={() => setShowFinalise(true)} />
            )}
            {showNewEmp && (
                <NewEmployeeDialog onClose={() => setShowNewEmp(false)} onCreated={() => { setShowNewEmp(false); load(); }} persona={persona} />
            )}
            {showGenerate && (
                <GeneratePayrollDialog onClose={() => setShowGenerate(false)} onDone={() => { setShowGenerate(false); load(); }} persona={persona} />
            )}
            {showFinalise && selectedReg && (
                <FinaliseDialog reg={selectedReg} onClose={() => setShowFinalise(false)} onSubmit={handleFinalise} busy={busy} />
            )}
        </div>
    );
};

const RegisterDrawer = ({ reg, onClose, onFinalise }) => (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
        <div className="w-full max-w-5xl bg-mpca-ivory h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="register-drawer">
            <div className="border-b border-mpca-brass/40 px-6 py-5 flex justify-between items-start gap-4 bg-mpca-parchment">
                <div>
                    <div className="overline">{reg.body_id} · {reg.fiscal_cycle}</div>
                    <h2 className="font-serif text-2xl text-mpca-green-dark mt-1">Payroll Register · {reg.period}</h2>
                    <div className="mt-2 flex items-center gap-3 text-[11px] flex-wrap">
                        <span className={"px-2 py-0.5 text-[10px] tracking-widest uppercase " + (reg.status === "Finalised" ? "bg-mpca-green-deep/15 text-mpca-green-deep" : "bg-mpca-brass/15 text-mpca-brass")}>{reg.status}</span>
                        <span className="text-mpca-charcoal">{reg.rows.length} employees</span>
                        <span className="text-mpca-charcoal">Gross <b>{fmtINR(reg.total_gross_inr)}</b></span>
                        <span className="text-mpca-oxblood">Deductions <b>{fmtINR(reg.total_deductions_inr)}</b></span>
                        <span className="text-mpca-green-dark">Net <b>{fmtINR(reg.total_net_inr)}</b></span>
                    </div>
                </div>
                <button onClick={onClose} data-testid="close-register-drawer"><X size={20} /></button>
            </div>

            <div className="px-6 py-5">
                <div className="overflow-x-auto border border-mpca-brass/30">
                    <table className="w-full text-[11px]" data-testid="register-detail-table">
                        <thead className="bg-mpca-parchment/60 sticky top-0">
                            <tr>
                                {["Emp No.", "Name", "Basic", "HRA", "Special", "Conv.", "Gross", "PF", "ESI", "PT", "TDS", "Net Pay"].map(h => (
                                    <th key={h} className="text-left px-2 py-1.5 text-[9px] uppercase tracking-widest text-mpca-brass">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {reg.rows.map((r) => (
                                <tr key={r.employee_id} className="border-t border-mpca-brass/10 hover:bg-mpca-parchment/30" data-testid={`payroll-row-${r.employee_id}`}>
                                    <td className="px-2 py-1.5 font-mono text-mpca-brass">{r.employee_no}</td>
                                    <td className="px-2 py-1.5 text-mpca-green-dark">{r.name}</td>
                                    <td className="px-2 py-1.5 font-mono">{fmtINR(r.basic_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono">{fmtINR(r.hra_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono">{fmtINR(r.special_allowance_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono">{fmtINR(r.conveyance_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono text-mpca-charcoal font-medium">{fmtINR(r.gross_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono text-mpca-oxblood">{fmtINR(r.pf_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono text-mpca-oxblood">{fmtINR(r.esi_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono text-mpca-oxblood">{fmtINR(r.professional_tax_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono text-mpca-oxblood">{fmtINR2(r.tds_inr)}</td>
                                    <td className="px-2 py-1.5 font-mono text-mpca-green-dark font-medium">{fmtINR(r.net_pay_inr)}</td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-mpca-brass/50 bg-mpca-gold-light/20 font-medium">
                                <td colSpan={6} className="px-2 py-2 uppercase tracking-widest text-[10px] text-mpca-brass">Totals</td>
                                <td className="px-2 py-2 font-mono">{fmtINR(reg.total_gross_inr)}</td>
                                <td colSpan={4} className="px-2 py-2 font-mono text-mpca-oxblood">{fmtINR(reg.total_deductions_inr)}</td>
                                <td className="px-2 py-2 font-mono text-mpca-green-dark">{fmtINR(reg.total_net_inr)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {reg.status === "Finalised" && reg.voucher_id && (
                    <div className="mt-5 bg-mpca-gold-light/20 border border-mpca-gold-light px-4 py-3 text-[11px] text-mpca-charcoal" data-testid="reg-voucher">
                        <span className="uppercase tracking-widest text-mpca-brass text-[9px]">Salary Disbursement Voucher</span>
                        <div className="font-mono mt-1">{reg.voucher_id}</div>
                        <div className="text-[10px] text-mpca-gray-dark mt-1">Finalised by {reg.finalised_by} on {new Date(reg.finalised_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    </div>
                )}

                {reg.status === "Draft" && (
                    <div className="mt-5 flex justify-end border-t border-mpca-brass/30 pt-4">
                        <button onClick={onFinalise} className="btn-heritage-primary bg-mpca-green-deep" data-testid="finalise-btn">
                            <CheckCircle2 size={12} /> Finalise & Post Voucher
                        </button>
                    </div>
                )}
            </div>
        </div>
    </div>
);

const NewEmployeeDialog = ({ onClose, onCreated, persona }) => {
    const [form, setForm] = useState({
        body_id: persona?.body_code || "MPCA",
        name: "", designation: "", department: "",
        employment_type: "Permanent",
        date_of_joining: new Date().toISOString().split("T")[0],
        pan: "", basic_pay_inr: "",
        hra_inr: "", special_allowance_inr: "", conveyance_inr: "",
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try {
            const isConsultant = form.employment_type === "Consultant";
            await createEmployee({
                body_id: form.body_id,
                name: form.name,
                designation: form.designation,
                department: form.department || undefined,
                employment_type: form.employment_type,
                date_of_joining: form.date_of_joining,
                pan: form.pan || undefined,
                basic_pay_inr: parseFloat(form.basic_pay_inr),
                hra_inr: parseFloat(form.hra_inr) || 0,
                special_allowance_inr: parseFloat(form.special_allowance_inr) || 0,
                conveyance_inr: parseFloat(form.conveyance_inr) || 0,
                tds_applicable: isConsultant,
                tds_rate_pct: isConsultant ? 10 : 0,
                pf_applicable: !isConsultant,
                esi_applicable: !isConsultant,
                professional_tax_applicable: !isConsultant,
            });
            onCreated();
        } catch (e) {
            setErr(e.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="new-employee-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment sticky top-0 z-10 flex justify-between items-center">
                    <div><div className="overline">New Employee</div><div className="font-serif text-lg text-mpca-green-dark mt-1">Add Employee</div></div>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="label-heritage">Full Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-heritage" data-testid="input-name" /></div>
                        <div><label className="label-heritage">Designation</label><input required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="input-heritage" data-testid="input-designation" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="label-heritage">Department</label><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="input-heritage" data-testid="input-department" /></div>
                        <div>
                            <label className="label-heritage">Employment Type</label>
                            <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} className="input-heritage" data-testid="input-employment-type">
                                {["Permanent", "Contract", "Consultant", "Intern", "Retainer"].map(t => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="label-heritage">Date of Joining</label><input type="date" required value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} className="input-heritage" data-testid="input-doj" /></div>
                        <div><label className="label-heritage">PAN (optional)</label><input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} className="input-heritage font-mono" maxLength={10} data-testid="input-pan" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="label-heritage">Basic Pay (₹)</label><input type="number" min="1" required value={form.basic_pay_inr} onChange={(e) => setForm({ ...form, basic_pay_inr: e.target.value })} className="input-heritage" data-testid="input-basic" /></div>
                        <div><label className="label-heritage">HRA (₹)</label><input type="number" min="0" value={form.hra_inr} onChange={(e) => setForm({ ...form, hra_inr: e.target.value })} className="input-heritage" data-testid="input-hra" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="label-heritage">Special Allowance (₹)</label><input type="number" min="0" value={form.special_allowance_inr} onChange={(e) => setForm({ ...form, special_allowance_inr: e.target.value })} className="input-heritage" data-testid="input-special" /></div>
                        <div><label className="label-heritage">Conveyance (₹)</label><input type="number" min="0" value={form.conveyance_inr} onChange={(e) => setForm({ ...form, conveyance_inr: e.target.value })} className="input-heritage" data-testid="input-conv" /></div>
                    </div>
                    <div className="text-[10px] text-mpca-gray-dark italic bg-mpca-parchment/50 px-3 py-2">
                        {form.employment_type === "Consultant"
                            ? "Consultants: TDS 10% (u/s 194J), no PF/ESI/PT."
                            : "Permanent/Contract: PF 12% of Basic + ESI 0.75% if gross ≤ ₹21K + PT ₹200 (MP)."}
                    </div>
                    {err && <div className="text-mpca-oxblood text-sm" data-testid="new-emp-error">{err}</div>}
                    <div className="flex justify-end gap-3 pt-2 border-t border-mpca-brass/20">
                        <button type="button" onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button type="submit" disabled={busy} className="btn-heritage-primary" data-testid="submit-new-emp">
                            {busy ? "Saving…" : "Add Employee"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const GeneratePayrollDialog = ({ onClose, onDone, persona }) => {
    const defaultPeriod = new Date().toISOString().slice(0, 7);  // "YYYY-MM"
    const [form, setForm] = useState({ period: defaultPeriod, body_id: persona?.body_code || "MPCA" });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            await generatePayroll({
                period: form.period, body_id: form.body_id,
                actor_name: persona ? `${persona.honorific} ${persona.name}` : "MPCA Accounts",
            });
            onDone();
        } catch (e) {
            setErr(e.response?.data?.detail || e.message);
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="generate-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment">
                    <div className="overline">Generate Payroll</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">Compute Monthly Register</div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="label-heritage">Period (YYYY-MM)</label>
                        <input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="input-heritage" data-testid="input-period" />
                        <div className="text-[10px] text-mpca-gray-dark mt-1">Pulls all Active employees for this body and computes payroll snapshot.</div>
                    </div>
                    <div>
                        <label className="label-heritage">Body</label>
                        <input value={form.body_id} onChange={(e) => setForm({ ...form, body_id: e.target.value })} className="input-heritage" data-testid="input-gen-body" />
                    </div>
                    {err && <div className="text-mpca-oxblood text-sm" data-testid="gen-error">{err}</div>}
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button disabled={busy} onClick={submit} className="btn-heritage-primary" data-testid="confirm-generate">
                            {busy ? "Computing…" : "Generate"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const FinaliseDialog = ({ reg, onClose, onSubmit, busy }) => {
    const [form, setForm] = useState({
        disbursement_date: new Date().toISOString().split("T")[0],
        note: "",
    });
    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="finalise-dialog">
                <div className="border-b border-mpca-brass/40 px-6 py-4 bg-mpca-parchment">
                    <div className="overline">Finalise Register</div>
                    <div className="font-serif text-lg text-mpca-green-dark mt-1">Period {reg.period}</div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div className="bg-mpca-parchment/40 border border-mpca-brass/30 px-3 py-2 text-[11px]">
                        This locks the register and creates a <b>Payment Voucher</b> for <b className="font-mono text-mpca-green-dark">{fmtINR(reg.total_net_inr)}</b> (Salaries & Wages Dr / Bank Cr).
                    </div>
                    <div>
                        <label className="label-heritage">Disbursement Date</label>
                        <input type="date" value={form.disbursement_date} onChange={(e) => setForm({ ...form, disbursement_date: e.target.value })} className="input-heritage" data-testid="input-disburse-date" />
                    </div>
                    <div>
                        <label className="label-heritage">Note (optional)</label>
                        <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input-heritage" data-testid="input-finalise-note" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="btn-heritage-secondary">Cancel</button>
                        <button disabled={busy} onClick={() => onSubmit(form)} className="btn-heritage-primary bg-mpca-green-deep" data-testid="confirm-finalise">
                            {busy ? "Finalising…" : "Confirm Finalise"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Payroll;
