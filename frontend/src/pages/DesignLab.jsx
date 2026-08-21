/**
 * /design-lab — Side-by-side design sampler
 * ──────────────────────────────────────────
 * Renders the same "Grant Claim Detail" card in 3 aesthetic variants and
 * 4 font families, so the user can compare visually before committing to
 * a system-wide refresh.
 *
 * Global rules for all samples:
 *   • Base body size 16px (text-base) · inputs 18px (text-lg) · labels 14px (text-sm)
 *   • Higher contrast text on all surfaces
 *   • Generous whitespace, larger click targets (h-11 buttons)
 *   • Zero inheritance from existing MPCA global CSS — every sample sets
 *     its own font-family + text/colour tokens inline / via wrapper class
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Send, Check, X, Download, MessageSquare, FileText, ArrowLeft, IndianRupee } from "lucide-react";

const FONTS = [
    { key: "plex",   label: "IBM Plex Sans",   sub: "Institutional · clean",       stack: "'IBM Plex Sans', system-ui, sans-serif" },
    { key: "inter",  label: "Inter",           sub: "Modern SaaS · high legibility", stack: "'Inter', system-ui, sans-serif" },
    { key: "source", label: "Source Sans 3",   sub: "Public sector · warm",         stack: "'Source Sans 3', system-ui, sans-serif" },
    { key: "nunito", label: "Nunito",          sub: "Friendly · soft edges",        stack: "'Nunito', system-ui, sans-serif" },
];

const AESTHETICS = [
    { key: "corp",   label: "A · Corporate Formal",     sub: "White surfaces · thin gray borders · single accent · government-portal feel" },
    { key: "warm",   label: "B · Institutional Warm",   sub: "Cream cards · MPCA olive/oxblood accents · all-sans typography · retains heritage" },
    { key: "saas",   label: "C · Modern SaaS Clean",    sub: "Soft shadows · no borders · colored status dots · contemporary" },
];

/* ──────────── Sample claim data (identical across all cards) ──────────── */
const SAMPLE = {
    claim_ref: "GRC-2026-27-0009",
    scheme:    "Camp Reimbursement",
    body:      "Indore Division",
    amount:    80000,
    ceiling:   112000,
    status:    "Under Review",
    tournament:"Indore Division · Pre-Tournament Camp",
    dates:     "18 Aug 2026 → 25 Aug 2026",
    submitted: "19 Aug 2026 by Shri Devashish Nilosey",
    invoices:  [
        { ref: "INV-001", vendor: "Emerald Hotel Pvt Ltd", head: "Hotel",    amount: 38000 },
        { ref: "INV-002", vendor: "Sagar Caterers",         head: "Food",     amount: 22000 },
        { ref: "INV-003", vendor: "MP Stadium Trust",       head: "Ground",   amount:  8000 },
        { ref: "INV-004", vendor: "Dr. Rahul Sinha",        head: "Physio",   amount: 12000 },
    ],
};
const money = (n) => "₹" + Number(n).toLocaleString("en-IN");

/* ═══════════════════════ AESTHETIC · A — Corporate Formal ═══════════════════════ */
function VariantCorporate({ font }) {
    return (
        <div style={{ fontFamily: font }} className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between">
                <div>
                    <div className="text-sm font-medium text-slate-500 tracking-wide">{SAMPLE.claim_ref}</div>
                    <h3 className="text-2xl font-semibold text-slate-900 mt-1 leading-tight">{SAMPLE.scheme}</h3>
                    <div className="text-sm text-slate-600 mt-2">{SAMPLE.body} · Submitted {SAMPLE.submitted}</div>
                </div>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-sm font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> {SAMPLE.status}
                </span>
            </div>
            <div className="px-6 py-5 grid grid-cols-3 gap-6 border-b border-slate-200">
                <div>
                    <div className="text-sm text-slate-500 mb-1">Sanctioned Ceiling</div>
                    <div className="text-2xl font-semibold text-slate-900">{money(SAMPLE.ceiling)}</div>
                </div>
                <div>
                    <div className="text-sm text-slate-500 mb-1">Claimed Amount</div>
                    <div className="text-2xl font-semibold text-blue-700">{money(SAMPLE.amount)}</div>
                </div>
                <div>
                    <div className="text-sm text-slate-500 mb-1">Attached Invoices</div>
                    <div className="text-2xl font-semibold text-slate-900">{SAMPLE.invoices.length} · {money(SAMPLE.amount)}</div>
                </div>
            </div>
            <div className="px-6 py-5">
                <div className="text-sm font-medium text-slate-700 mb-3">Bundled Invoices</div>
                <table className="w-full text-base">
                    <thead>
                        <tr className="text-sm text-slate-500 border-b border-slate-200">
                            <th className="text-left py-2 font-medium">Ref</th><th className="text-left py-2 font-medium">Vendor</th><th className="text-left py-2 font-medium">Head</th><th className="text-right py-2 font-medium">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {SAMPLE.invoices.map((i) => (
                            <tr key={i.ref} className="border-b border-slate-100">
                                <td className="py-3 font-medium text-slate-700">{i.ref}</td>
                                <td className="py-3 text-slate-900">{i.vendor}</td>
                                <td className="py-3"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-sm">{i.head}</span></td>
                                <td className="py-3 text-right font-medium text-slate-900">{money(i.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3">
                <button className="h-11 px-5 border border-slate-300 rounded-md text-base font-medium text-slate-700 hover:bg-white flex items-center gap-2"><MessageSquare size={16}/> Discuss</button>
                <button className="h-11 px-5 border border-red-300 rounded-md text-base font-medium text-red-700 hover:bg-red-50 flex items-center gap-2"><X size={16}/> Reject</button>
                <button className="h-11 px-5 bg-blue-700 rounded-md text-base font-medium text-white hover:bg-blue-800 flex items-center gap-2"><Check size={16}/> Approve ₹80,000</button>
            </div>
        </div>
    );
}

/* ═══════════════════════ AESTHETIC · B — Institutional Warm ═══════════════════════ */
function VariantWarm({ font }) {
    return (
        <div style={{ fontFamily: font }} className="bg-[#faf6ed] border-2 border-[#d4b95c] overflow-hidden">
            <div className="px-6 py-5 border-b-2 border-[#d4b95c] bg-[#f5efdb] flex items-start justify-between">
                <div>
                    <div className="text-sm font-semibold text-[#7a5c1a] uppercase tracking-widest">{SAMPLE.claim_ref}</div>
                    <h3 className="text-2xl font-semibold text-[#264d3b] mt-1 leading-tight">{SAMPLE.scheme}</h3>
                    <div className="text-sm text-[#4a3a1a] mt-2">{SAMPLE.body} · Submitted {SAMPLE.submitted}</div>
                </div>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#7a1f2c] text-white text-sm font-semibold uppercase tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-white" /> {SAMPLE.status}
                </span>
            </div>
            <div className="px-6 py-5 grid grid-cols-3 gap-6 border-b border-[#d4b95c]/50">
                <div>
                    <div className="text-sm text-[#7a5c1a] uppercase tracking-widest mb-1">Ceiling</div>
                    <div className="text-2xl font-semibold text-[#264d3b]">{money(SAMPLE.ceiling)}</div>
                </div>
                <div>
                    <div className="text-sm text-[#7a5c1a] uppercase tracking-widest mb-1">Claimed</div>
                    <div className="text-2xl font-semibold text-[#7a1f2c]">{money(SAMPLE.amount)}</div>
                </div>
                <div>
                    <div className="text-sm text-[#7a5c1a] uppercase tracking-widest mb-1">Invoices</div>
                    <div className="text-2xl font-semibold text-[#264d3b]">{SAMPLE.invoices.length} · {money(SAMPLE.amount)}</div>
                </div>
            </div>
            <div className="px-6 py-5">
                <div className="text-sm font-semibold text-[#7a5c1a] uppercase tracking-widest mb-3">Bundled Invoices</div>
                <div className="space-y-2">
                    {SAMPLE.invoices.map((i) => (
                        <div key={i.ref} className="flex items-center justify-between py-2.5 px-3 bg-[#fbf9f0] border border-[#d4b95c]/40">
                            <div className="flex items-center gap-3">
                                <FileText size={16} className="text-[#7a5c1a]"/>
                                <div>
                                    <div className="text-base font-medium text-[#264d3b]">{i.vendor}</div>
                                    <div className="text-sm text-[#4a3a1a]">{i.ref} · {i.head}</div>
                                </div>
                            </div>
                            <div className="text-lg font-semibold text-[#7a1f2c]">{money(i.amount)}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="px-6 py-4 bg-[#f5efdb] flex justify-end gap-3">
                <button className="h-11 px-5 border-2 border-[#7a5c1a] text-[#7a5c1a] text-base font-semibold uppercase tracking-widest hover:bg-[#7a5c1a] hover:text-white flex items-center gap-2"><MessageSquare size={16}/> Discuss</button>
                <button className="h-11 px-5 border-2 border-[#7a1f2c] text-[#7a1f2c] text-base font-semibold uppercase tracking-widest hover:bg-[#7a1f2c] hover:text-white flex items-center gap-2"><X size={16}/> Reject</button>
                <button className="h-11 px-5 bg-[#264d3b] text-white text-base font-semibold uppercase tracking-widest hover:bg-[#1a3628] flex items-center gap-2"><Check size={16}/> Approve ₹80,000</button>
            </div>
        </div>
    );
}

/* ═══════════════════════ AESTHETIC · C — Modern SaaS Clean ═══════════════════════ */
function VariantSaas({ font }) {
    return (
        <div style={{ fontFamily: font }} className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 overflow-hidden ring-1 ring-slate-100">
            <div className="px-6 py-5 flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                        <div className="text-sm text-slate-500">{SAMPLE.claim_ref}</div>
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mt-2 leading-tight">{SAMPLE.scheme}</h3>
                    <div className="text-sm text-slate-500 mt-1">{SAMPLE.body} · {SAMPLE.submitted}</div>
                </div>
                <span className="px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold">{SAMPLE.status}</span>
            </div>
            <div className="px-6 py-4 grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-sm text-slate-500 mb-1">Ceiling</div>
                    <div className="text-2xl font-bold text-slate-900">{money(SAMPLE.ceiling)}</div>
                </div>
                <div className="rounded-xl bg-blue-50 p-4">
                    <div className="text-sm text-blue-700 mb-1">Claimed</div>
                    <div className="text-2xl font-bold text-blue-900">{money(SAMPLE.amount)}</div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4">
                    <div className="text-sm text-emerald-700 mb-1">Invoices</div>
                    <div className="text-2xl font-bold text-emerald-900">{SAMPLE.invoices.length} bundled</div>
                </div>
            </div>
            <div className="px-6 py-5">
                <div className="text-sm font-semibold text-slate-700 mb-3">Bundled Invoices</div>
                <div className="space-y-1.5">
                    {SAMPLE.invoices.map((i) => (
                        <div key={i.ref} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-slate-50 transition-colors">
                            <div>
                                <div className="text-base font-medium text-slate-900">{i.vendor}</div>
                                <div className="text-sm text-slate-500">{i.ref} · {i.head}</div>
                            </div>
                            <div className="text-lg font-semibold text-slate-900">{money(i.amount)}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="px-6 py-4 flex justify-end gap-2">
                <button className="h-11 px-5 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"><MessageSquare size={16}/> Discuss</button>
                <button className="h-11 px-5 rounded-lg text-base font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"><X size={16}/> Reject</button>
                <button className="h-11 px-5 rounded-lg bg-slate-900 text-white text-base font-semibold hover:bg-slate-800 shadow-sm flex items-center gap-2"><Check size={16}/> Approve ₹80,000</button>
            </div>
        </div>
    );
}

const RENDER = { corp: VariantCorporate, warm: VariantWarm, saas: VariantSaas };

/* ═════════════════════════════════ Page shell ═════════════════════════════════ */
export default function DesignLab() {
    const [font, setFont] = useState(FONTS[0]);
    return (
        <div className="min-h-screen bg-slate-100" style={{ fontFamily: font.stack }}>
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
                <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-6">
                    <Link to="/" className="flex items-center gap-2 text-slate-700 hover:text-slate-900" data-testid="design-lab-home">
                        <ArrowLeft size={18} /> <span className="text-sm">Back to app</span>
                    </Link>
                    <div className="h-6 w-px bg-slate-200" />
                    <div>
                        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Design Lab</div>
                        <h1 className="text-2xl font-bold text-slate-900">Typography & Aesthetic Sampler</h1>
                    </div>
                </div>
            </header>

            <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-10">
                {/* Guidance */}
                <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">How to use this page</h2>
                    <p className="text-base text-slate-700 leading-relaxed max-w-3xl">
                        Below you&apos;ll see the same <strong>Grant Claim Detail</strong> card rendered in three aesthetic
                        variants, using the font you pick from the swatch strip.
                        <span className="block mt-2 text-slate-600">
                            All samples use the <strong>Comfortable</strong> size rule you approved: 16px body,
                            18px inputs, 14px minimum labels. Compare the three cards visually and message back with
                            <em> &ldquo;A + IBM Plex Sans&rdquo;</em>, <em>&ldquo;B + Inter&rdquo;</em>, etc.
                        </span>
                    </p>
                </section>

                {/* Font picker */}
                <section>
                    <h2 className="text-xl font-bold text-slate-900 mb-4">1 · Pick a font family</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {FONTS.map((f) => (
                            <button key={f.key} onClick={() => setFont(f)}
                                data-testid={`font-swatch-${f.key}`}
                                className={"text-left rounded-xl p-5 border-2 transition-all " +
                                    (font.key === f.key ? "border-blue-600 bg-blue-50 shadow-md" : "border-slate-200 bg-white hover:border-slate-300")}
                                style={{ fontFamily: f.stack }}>
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <div className="text-xl font-semibold text-slate-900">{f.label}</div>
                                        <div className="text-sm text-slate-500">{f.sub}</div>
                                    </div>
                                    {font.key === f.key && <span className="text-blue-600 text-sm font-semibold">Selected</span>}
                                </div>
                                <div className="border-t border-slate-100 pt-3 space-y-1.5">
                                    <div className="text-2xl font-bold text-slate-900">MPCA · Grant Claim</div>
                                    <div className="text-base text-slate-700">The quick brown fox jumps over the lazy dog</div>
                                    <div className="text-sm text-slate-500">1234567890 · ₹1,12,000 · UTR AXISN20260219</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Aesthetic variants — side by side */}
                <section>
                    <h2 className="text-xl font-bold text-slate-900 mb-1">2 · Compare aesthetic directions</h2>
                    <p className="text-base text-slate-600 mb-5">
                        Same content, three completely different personalities. Now rendered in <strong>{font.label}</strong>.
                    </p>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" data-testid="aesthetic-samples-grid">
                        {AESTHETICS.map((a) => {
                            const Cmp = RENDER[a.key];
                            return (
                                <div key={a.key} data-testid={`aesthetic-sample-${a.key}`}>
                                    <div className="mb-3">
                                        <div className="text-lg font-bold text-slate-900">{a.label}</div>
                                        <div className="text-sm text-slate-600">{a.sub}</div>
                                    </div>
                                    <Cmp font={font.stack} />
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Size ladder reference */}
                <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-200" style={{ fontFamily: font.stack }}>
                    <h2 className="text-xl font-bold text-slate-900 mb-4">3 · The &ldquo;Comfortable&rdquo; size ladder</h2>
                    <p className="text-base text-slate-600 mb-4">
                        Every text size above these thresholds — no more <code className="px-1 py-0.5 rounded bg-slate-100 text-sm">text-[10px]</code> or <code className="px-1 py-0.5 rounded bg-slate-100 text-sm">text-[11px]</code> ever again.
                    </p>
                    <div className="space-y-2 divide-y divide-slate-100">
                        <div className="flex items-baseline gap-4 py-2"><span className="text-4xl font-bold text-slate-900 w-24 shrink-0">Aa</span><span className="text-4xl font-bold text-slate-900 leading-none">Hero H1 · 36 px · font-bold</span></div>
                        <div className="flex items-baseline gap-4 py-2"><span className="text-2xl font-semibold text-slate-800 w-24 shrink-0">Aa</span><span className="text-2xl font-semibold text-slate-800 leading-tight">Page H2 · 24 px · font-semibold</span></div>
                        <div className="flex items-baseline gap-4 py-2"><span className="text-xl font-semibold text-slate-800 w-24 shrink-0">Aa</span><span className="text-xl font-semibold text-slate-800 leading-tight">Section H3 · 20 px · font-semibold</span></div>
                        <div className="flex items-baseline gap-4 py-2"><span className="text-lg font-medium text-slate-700 w-24 shrink-0">Aa</span><span className="text-lg text-slate-700 leading-relaxed">Input · 18 px · Comfortable for eyes and touch</span></div>
                        <div className="flex items-baseline gap-4 py-2"><span className="text-base font-normal text-slate-700 w-24 shrink-0">Aa</span><span className="text-base text-slate-700 leading-relaxed">Body · 16 px · The default for every paragraph, table cell, and card body copy</span></div>
                        <div className="flex items-baseline gap-4 py-2"><span className="text-sm font-medium text-slate-600 w-24 shrink-0">Aa</span><span className="text-sm text-slate-600 leading-relaxed">Label / meta · 14 px · Lowest allowed size on the platform</span></div>
                    </div>
                </section>
            </main>
        </div>
    );
}
