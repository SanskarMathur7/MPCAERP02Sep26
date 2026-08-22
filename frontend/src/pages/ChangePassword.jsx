import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, ShieldCheck, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DL } from "@/lib/designSystem";
import { api } from "@/lib/api";

/**
 * Feb 2026 · Iter 114 — Force-Reset Landing Page
 * ────────────────────────────────────────────────
 * Users with `force_password_reset = true` land here after login. They
 * cannot enter the dashboard until they've chosen their own password.
 * Also accessible voluntarily from the sidebar for anyone who wants to
 * rotate their password.
 */

const MIN_LEN = 8;

const formatErr = (detail) => {
    if (!detail) return "Something went wrong. Please try again.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
};

const ChangePassword = () => {
    const { persona, loginWithCredentials, logout } = useAuth();
    const navigate = useNavigate();

    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const forced = !!persona?.force_password_reset;

    const validate = () => {
        if (!currentPw) return "Enter your current password.";
        if (newPw.length < MIN_LEN) return `New password must be at least ${MIN_LEN} characters.`;
        if (newPw === currentPw) return "New password must differ from your current one.";
        if (newPw !== confirmPw) return "New password and confirmation do not match.";
        return "";
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        const v = validate();
        if (v) { setError(v); return; }
        setSubmitting(true);
        try {
            await api.post("/auth/change-password", {
                current_password: currentPw,
                new_password: newPw,
            });
            // Clear force_password_reset in the local persona copy so the
            // route guard stops redirecting here.
            const token = typeof window !== "undefined" && window.localStorage.getItem("mpca_token");
            if (persona && token) {
                loginWithCredentials(token, { ...persona, force_password_reset: false });
            }
            setSuccess(true);
            setTimeout(() => navigate("/dashboard", { replace: true }), 1400);
        } catch (err) {
            setError(formatErr(err?.response?.data?.detail) || err.message);
            setSubmitting(false);
        }
    };

    const handleSignOut = () => {
        logout();
        navigate("/login", { replace: true });
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4 py-10"
            style={{ backgroundColor: DL.ivory, fontFamily: DL.fontBody, color: DL.ink }}
            data-testid="change-password-page"
        >
            <div
                className="w-full max-w-[520px] rounded-2xl overflow-hidden"
                style={{
                    background: DL.paper,
                    border: `1px solid ${DL.rule}`,
                    boxShadow: "0 20px 48px rgba(14,31,27,0.18), 0 4px 12px rgba(14,31,27,0.08)",
                }}
            >
                {/* Emerald header slab */}
                <div
                    className="px-8 py-6"
                    style={{ background: `linear-gradient(135deg, ${DL.emerald} 0%, #0a2f24 100%)` }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <ShieldCheck size={20} style={{ color: DL.gold }} />
                        <span
                            className="text-[10.5px] font-bold uppercase tracking-[0.24em]"
                            style={{ fontFamily: DL.fontMono, color: DL.gold }}
                        >
                            {forced ? "Security · First-Time Sign-In" : "Account Security"}
                        </span>
                    </div>
                    <h1
                        className="text-white leading-tight"
                        style={{ fontFamily: DL.fontDisplay, fontWeight: 800, fontSize: "26px" }}
                        data-testid="change-password-title"
                    >
                        {forced ? "Set your own password" : "Change your password"}
                    </h1>
                    <p
                        className="text-[13.5px] mt-2"
                        style={{ color: "rgba(255,255,255,0.78)" }}
                    >
                        {forced
                            ? "Welcome to MPCA ERP. Before you enter the dashboard, please replace the shared default password with your own."
                            : "Choose a new password. Minimum 8 characters."}
                    </p>
                    {persona?.name && (
                        <div className="mt-4 text-[12px]" style={{ color: "rgba(255,255,255,0.65)", fontFamily: DL.fontMono }}>
                            Signed in as <span style={{ color: DL.gold }} data-testid="change-password-signed-in-as">{persona.name}</span> · {persona.email}
                        </div>
                    )}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
                    {success ? (
                        <div
                            className="p-4 rounded-md flex items-start gap-3"
                            style={{
                                background: "rgba(13,59,46,0.08)",
                                border: `1px solid ${DL.emerald}`,
                                color: DL.emerald,
                            }}
                            data-testid="change-password-success"
                        >
                            <ShieldCheck size={20} className="shrink-0 mt-0.5" />
                            <div>
                                <div className="font-bold text-[14px]">Password updated</div>
                                <div className="text-[12.5px] mt-0.5" style={{ color: DL.ink }}>
                                    Redirecting to your dashboard…
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Current password */}
                            <Field
                                label="Current password"
                                testid="change-password-current"
                                icon={<Lock size={16} />}
                                type={showCurrent ? "text" : "password"}
                                value={currentPw}
                                onChange={setCurrentPw}
                                trailing={
                                    <IconBtn onClick={() => setShowCurrent((v) => !v)} testid="change-password-toggle-current">
                                        {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </IconBtn>
                                }
                                placeholder={forced ? "The shared password you used to sign in" : "Your current password"}
                                autoComplete="current-password"
                                autoFocus
                            />

                            {/* New password */}
                            <Field
                                label={`New password (min ${MIN_LEN} characters)`}
                                testid="change-password-new"
                                icon={<Lock size={16} />}
                                type={showNew ? "text" : "password"}
                                value={newPw}
                                onChange={setNewPw}
                                trailing={
                                    <IconBtn onClick={() => setShowNew((v) => !v)} testid="change-password-toggle-new">
                                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </IconBtn>
                                }
                                placeholder="Choose a strong password"
                                autoComplete="new-password"
                            />

                            {/* Confirm */}
                            <Field
                                label="Confirm new password"
                                testid="change-password-confirm"
                                icon={<Lock size={16} />}
                                type={showNew ? "text" : "password"}
                                value={confirmPw}
                                onChange={setConfirmPw}
                                placeholder="Retype the new password"
                                autoComplete="new-password"
                            />

                            {error && (
                                <div
                                    className="p-3 rounded-md flex items-start gap-2 text-[13px]"
                                    style={{ background: "rgba(139,31,31,0.08)", border: `1px solid ${DL.oxblood}`, color: DL.oxblood }}
                                    data-testid="change-password-error"
                                >
                                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 rounded-md flex items-center justify-center gap-2 transition-transform disabled:opacity-50 hover:-translate-y-[1px]"
                                style={{
                                    background: DL.emerald,
                                    color: DL.paper,
                                    fontFamily: DL.fontDisplay,
                                    fontWeight: 800,
                                    fontSize: "14.5px",
                                    letterSpacing: "0.02em",
                                    boxShadow: "0 2px 6px rgba(13,59,46,0.28)",
                                }}
                                data-testid="change-password-submit"
                            >
                                {submitting ? "Saving…" : (forced ? "Set password & continue" : "Update password")}
                                {!submitting && <ArrowRight size={16} />}
                            </button>

                            {forced && (
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="w-full mt-2 py-2 rounded-md flex items-center justify-center gap-2 text-[12.5px] transition-colors"
                                    style={{ color: DL.muted, fontFamily: DL.fontMono }}
                                    data-testid="change-password-signout"
                                >
                                    <LogOut size={13} />
                                    Sign out instead
                                </button>
                            )}
                        </>
                    )}
                </form>
            </div>
        </div>
    );
};

const Field = ({ label, testid, icon, trailing, onChange, ...rest }) => (
    <label className="block">
        <span
            className="text-[11px] font-bold uppercase tracking-[0.16em] block mb-2"
            style={{ fontFamily: DL.fontMono, color: DL.ink2 }}
        >
            {label}
        </span>
        <span
            className="flex items-center gap-2 px-3 py-2.5 rounded-md focus-within:ring-2"
            style={{ background: DL.ivory, border: `1px solid ${DL.rule}`, color: DL.ink }}
        >
            <span style={{ color: DL.muted }}>{icon}</span>
            <input
                onChange={(e) => onChange(e.target.value)}
                className="flex-1 bg-transparent outline-none text-[14.5px]"
                style={{ fontFamily: DL.fontBody, color: DL.ink }}
                data-testid={`${testid}-input`}
                {...rest}
            />
            {trailing}
        </span>
    </label>
);

const IconBtn = ({ children, onClick, testid }) => (
    <button
        type="button"
        onClick={onClick}
        className="p-1 rounded transition-colors"
        style={{ color: DL.muted }}
        data-testid={testid}
    >
        {children}
    </button>
);

export default ChangePassword;
