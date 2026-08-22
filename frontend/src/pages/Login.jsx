import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { MpcaEmblem, MpcaLogoMark } from "@/components/MpcaEmblem";
import { DL } from "@/lib/designSystem";
import { api } from "@/lib/api";

/**
 * Feb 2026 · Single JWT-based Login
 * ─────────────────────────────────
 * Redesigned from a persona-chip demo to a clean email + password form
 * backed by the /api/auth/login endpoint. Institutional Warm palette,
 * split-hero layout, no extra fields, no clutter.
 */

const formatErr = (detail) => {
    if (!detail) return "Something went wrong. Please try again.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
};


const Login = () => {
    const { loginWithCredentials } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!email.trim() || !password) {
            setError("Enter both your email and password to sign in.");
            return;
        }
        setSubmitting(true);
        try {
            const { data } = await api.post("/auth/login", {
                email: email.trim().toLowerCase(),
                password,
            });
            loginWithCredentials(data.access_token, data.user);
            navigate("/dashboard");
        } catch (err) {
            setError(formatErr(err?.response?.data?.detail) || err.message);
            setSubmitting(false);
        }
    };

    return (
        <div
            className="min-h-screen flex flex-col lg:flex-row"
            style={{ backgroundColor: DL.ivory, fontFamily: DL.fontBody, color: DL.ink }}
            data-testid="login-page"
        >
            {/* ───── LEFT · Brand pane ───── */}
            <aside
                className="relative lg:w-2/5 px-8 md:px-14 py-10 lg:py-16 flex flex-col justify-between overflow-hidden"
                style={{
                    background: `linear-gradient(160deg, ${DL.emerald} 0%, ${DL.ink} 60%, ${DL.ink2} 100%)`,
                    color: DL.paper,
                }}
            >
                {/* subtle field-lines overlay */}
                <div
                    aria-hidden
                    className="absolute inset-0 opacity-[0.06] pointer-events-none"
                    style={{
                        backgroundImage: "repeating-linear-gradient(115deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 42px)",
                    }}
                />

                {/* Top wordmark */}
                <div className="relative z-10">
                    <Link to="/" className="inline-flex items-center gap-3">
                        <MpcaEmblem className="w-10 h-12" style={{ color: DL.gold }} />
                        <div>
                            <div className="text-xl leading-none" style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper }}>MPCA</div>
                            <div
                                className="text-[9px] tracking-[0.28em] uppercase mt-1.5"
                                style={{ fontFamily: DL.fontMono, color: DL.gold, opacity: 0.85 }}
                            >
                                ERP · System of Records
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Centre — emblem + tagline */}
                <div className="relative z-10 my-10 lg:my-0 flex flex-col items-start max-w-md">
                    <div
                        className="w-24 h-24 rounded-full p-3 mb-7"
                        style={{
                            backgroundColor: DL.paper,
                            boxShadow: `0 22px 40px -18px rgba(0,0,0,0.55), inset 0 0 0 1px ${DL.gold}`,
                        }}
                    >
                        <MpcaLogoMark className="w-full h-full object-contain" />
                    </div>
                    <h2
                        className="text-3xl md:text-4xl leading-tight"
                        style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.paper, letterSpacing: "-0.01em" }}
                    >
                        The cricketing office of <span style={{ color: DL.gold }}>Madhya Pradesh</span>, online.
                    </h2>
                    <p className="mt-5 text-sm leading-relaxed" style={{ color: "rgba(251,248,241,0.72)" }}>
                        Sign in to the unified register — members, claims, tournaments, bank, and the
                        constitutional record — scoped to your office in the BCCI → MPCA → Division →
                        District hierarchy.
                    </p>
                    <div className="mt-7 flex items-center gap-3 text-[10px] tracking-[0.28em] uppercase" style={{ color: DL.gold, opacity: 0.75, fontFamily: DL.fontMono }}>
                        <span className="w-6 h-px" style={{ backgroundColor: DL.gold, opacity: 0.5 }} />
                        <span>khel bhavna se, rashtra sammaan se</span>
                    </div>
                </div>

                {/* Footer */}
                <div
                    className="relative z-10 flex items-center justify-between text-xs mt-10"
                    style={{ color: "rgba(251,248,241,0.55)", fontFamily: DL.fontMono }}
                >
                    <div>BCCI Affiliated · Est. 1957</div>
                    <div>v4.2.0</div>
                </div>
            </aside>

            {/* ───── RIGHT · Login form ───── */}
            <main
                className="lg:w-3/5 flex items-center justify-center px-6 sm:px-10 md:px-14 py-12 lg:py-16"
                style={{ backgroundColor: DL.ivory }}
            >
                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="mb-10" data-testid="login-form-header">
                        <div
                            className="text-[10px] tracking-[0.28em] uppercase mb-3"
                            style={{ fontFamily: DL.fontMono, color: DL.gold, fontWeight: 700 }}
                        >
                            / Authentication
                        </div>
                        <h1
                            className="text-4xl md:text-5xl leading-[1.05]"
                            style={{ fontFamily: DL.fontDisplay, fontWeight: 800, color: DL.ink, letterSpacing: "-0.02em" }}
                        >
                            Welcome<span style={{ color: DL.emerald }}>.</span>
                        </h1>
                        <p className="text-[13px] mt-3 leading-relaxed" style={{ color: DL.muted, fontWeight: 500 }}>
                            Sign in with your MPCA registrar credentials.
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form" noValidate>
                        {/* Email */}
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-[10px] tracking-[0.22em] uppercase mb-2"
                                style={{ fontFamily: DL.fontMono, color: DL.ink2, fontWeight: 700 }}
                            >
                                Email
                            </label>
                            <div className="relative">
                                <Mail size={16} strokeWidth={2} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: DL.muted }} />
                                <input
                                    id="email"
                                    type="email"
                                    autoFocus
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@mpca.in"
                                    autoComplete="email"
                                    disabled={submitting}
                                    data-testid="login-email-input"
                                    className="w-full pl-11 pr-4 py-3.5 text-[14px] outline-none transition-all rounded-md"
                                    style={{
                                        backgroundColor: DL.paper,
                                        border: `1.5px solid ${DL.ruleStrong}`,
                                        color: DL.ink,
                                        fontFamily: DL.fontBody,
                                        fontWeight: 600,
                                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
                                    }}
                                    onFocus={(e) => { e.currentTarget.style.borderColor = DL.emerald; e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.75), 0 0 0 3px ${DL.emeraldSoft}`; }}
                                    onBlur={(e) => { e.currentTarget.style.borderColor = DL.ruleStrong; e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.75)"; }}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label
                                htmlFor="password"
                                className="block text-[10px] tracking-[0.22em] uppercase mb-2"
                                style={{ fontFamily: DL.fontMono, color: DL.ink2, fontWeight: 700 }}
                            >
                                Password
                            </label>
                            <div className="relative">
                                <Lock size={16} strokeWidth={2} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: DL.muted }} />
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    disabled={submitting}
                                    data-testid="login-password-input"
                                    className="w-full pl-11 pr-12 py-3.5 text-[14px] outline-none transition-all rounded-md"
                                    style={{
                                        backgroundColor: DL.paper,
                                        border: `1.5px solid ${DL.ruleStrong}`,
                                        color: DL.ink,
                                        fontFamily: DL.fontBody,
                                        fontWeight: 600,
                                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
                                    }}
                                    onFocus={(e) => { e.currentTarget.style.borderColor = DL.emerald; e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.75), 0 0 0 3px ${DL.emeraldSoft}`; }}
                                    onBlur={(e) => { e.currentTarget.style.borderColor = DL.ruleStrong; e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.75)"; }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                                    style={{ color: DL.muted }}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    data-testid="login-password-toggle"
                                >
                                    {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div
                                className="flex items-start gap-2.5 text-[13px] px-4 py-3 rounded-md"
                                style={{ backgroundColor: "rgba(139,31,31,0.06)", border: `1px solid ${DL.danger}`, color: DL.danger }}
                                data-testid="login-error"
                            >
                                <AlertCircle size={15} strokeWidth={2.25} className="flex-shrink-0 mt-0.5" />
                                <span style={{ fontWeight: 600 }}>{error}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting}
                            data-testid="login-submit-btn"
                            className="group w-full flex items-center justify-center gap-2.5 py-4 text-[14px] tracking-wide transition-all rounded-md"
                            style={{
                                backgroundColor: submitting ? DL.ink2 : DL.emerald,
                                color: DL.paper,
                                fontFamily: DL.fontDisplay,
                                fontWeight: 800,
                                letterSpacing: "0.03em",
                                boxShadow: submitting ? "none" : `0 14px 28px -14px ${DL.emerald}, inset 0 1px 0 rgba(255,255,255,0.15)`,
                                cursor: submitting ? "wait" : "pointer",
                            }}
                            onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = DL.ink; }}
                            onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = DL.emerald; }}
                        >
                            <span>{submitting ? "Signing in…" : "Sign in"}</span>
                            {!submitting && <ArrowRight size={16} strokeWidth={2.5} className="transition-transform group-hover:translate-x-1" />}
                        </button>
                    </form>

                    {/* Footnote */}
                    <div
                        className="mt-10 text-center text-[11px] leading-relaxed"
                        style={{ color: DL.muted, fontFamily: DL.fontMono, letterSpacing: "0.05em" }}
                    >
                        Access is restricted to authorised MPCA office bearers.
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Login;
