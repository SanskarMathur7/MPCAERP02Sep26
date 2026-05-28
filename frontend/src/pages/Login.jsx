import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PERSONAS, useAuth } from "@/context/AuthContext";
import {
    ChevronRight, ShieldCheck, Building2, MapPin, Landmark,
    Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle,
} from "lucide-react";
import { MpcaEmblem, MpcaLogoMark } from "@/components/MpcaEmblem";
import CricketLoader from "@/components/CricketLoader";

const TIER_ICONS = {
    State: Landmark,
    Division: Building2,
    District: MapPin,
    Public: ShieldCheck,
};

// Compact persona chip — used in the quick-demo row underneath the form
const PersonaChip = ({ persona, onSelect, active }) => {
    const TierIcon = TIER_ICONS[persona.body_type] || ShieldCheck;
    const initials = persona.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("");
    return (
        <button
            type="button"
            onClick={() => onSelect(persona)}
            data-testid={`persona-chip-${persona.id}`}
            className={[
                "group relative flex items-center gap-3 w-full px-3.5 py-3 text-left",
                "border transition-all duration-200",
                "hover:border-mpca-oxblood hover:bg-mpca-parchment/60",
                "focus:outline-none focus:ring-2 focus:ring-mpca-oxblood/40",
                active
                    ? "border-mpca-oxblood bg-mpca-parchment/80 shadow-sm"
                    : "border-mpca-brass/40 bg-mpca-ivory",
            ].join(" ")}
        >
            <div
                className={[
                    "w-9 h-9 flex-shrink-0 flex items-center justify-center font-serif text-sm",
                    "border",
                    active
                        ? "bg-mpca-oxblood text-mpca-ivory border-mpca-oxblood"
                        : "bg-mpca-green-dark text-mpca-gold-light border-mpca-brass/40",
                ].join(" ")}
            >
                {initials}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-serif text-sm text-mpca-green-dark leading-tight truncate">
                    {persona.name}
                </div>
                <div className="text-[10px] tracking-wider uppercase text-mpca-gray-dark mt-0.5 flex items-center gap-1">
                    <TierIcon size={9} strokeWidth={2} />
                    <span className="truncate">{persona.title}</span>
                </div>
            </div>
            <ChevronRight
                size={14}
                strokeWidth={1.5}
                className={`flex-shrink-0 transition-colors ${
                    active ? "text-mpca-oxblood" : "text-mpca-gray/50 group-hover:text-mpca-oxblood"
                }`}
            />
        </button>
    );
};

const Login = () => {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [selectedPersona, setSelectedPersona] = useState(PERSONAS[0]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const proceedWith = (persona) => {
        setSubmitting(true);
        // Mimic a real sign-in handshake — gives the coin a beat to settle.
        setTimeout(() => {
            login(persona);
            if (persona.id === "public") {
                navigate("/disclosures");
            } else {
                navigate("/dashboard");
            }
        }, 1400);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError("");
        if (!email.trim() || !password.trim()) {
            setError("Please enter both your email and password to sign in.");
            return;
        }
        if (!selectedPersona) {
            setError("Please select a role before signing in.");
            return;
        }
        proceedWith(selectedPersona);
    };

    const handleQuickAccess = (persona) => {
        setSelectedPersona(persona);
        // Auto-fill the form to make the demo flow obvious
        if (persona.id !== "public") {
            const slug = persona.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
            setEmail(`${slug}@mpcaonline.com`);
            setPassword("••••••••");
        } else {
            setEmail("guest@public");
            setPassword("•••••");
        }
        setError("");
    };

    if (submitting) {
        return (
            <div className="min-h-screen cricket-pitch-bg text-mpca-ivory flex items-center justify-center" data-testid="login-loading">
                <div className="text-center max-w-md px-6">
                    <CricketLoader
                        size="lg"
                        onDark
                        mode="toss"
                        label={`Signing you in as ${selectedPersona.honorific} ${selectedPersona.name}…`}
                        sublabel="Verifying with the MPCA registrar"
                        testId="login-coin-loader"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col lg:flex-row bg-mpca-ivory" data-testid="login-page">
            {/* ───────── LEFT: Brand pane (navy + emblem + motto) ───────── */}
            <aside className="cricket-pitch-bg text-mpca-ivory lg:w-2/5 px-8 md:px-14 py-10 lg:py-16 flex flex-col justify-between relative">
                {/* Top — wordmark */}
                <div className="relative z-10">
                    <Link to="/" className="inline-flex items-center gap-3 group">
                        <MpcaEmblem className="w-10 h-12 text-mpca-gold-light" />
                        <div>
                            <div className="font-serif text-xl text-mpca-ivory leading-none">MPCA</div>
                            <div className="overline text-[9px] mt-1.5 !text-mpca-gold-light/70">
                                ERP · System of Records
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Centre — emblem + tagline */}
                <div className="relative z-10 my-10 lg:my-0 flex flex-col items-start max-w-md">
                    <div className="w-24 h-24 bg-mpca-ivory rounded-full p-3 mb-7 shadow-xl ring-1 ring-mpca-brass/30">
                        <MpcaLogoMark className="w-full h-full object-contain" />
                    </div>
                    <h2 className="font-serif text-3xl md:text-4xl leading-tight text-mpca-ivory">
                        The cricketing office of <em className="text-mpca-gold-light not-italic">Madhya Pradesh</em>, online.
                    </h2>
                    <p className="mt-5 text-sm text-mpca-ivory/70 leading-relaxed">
                        Sign in to access the unified register — members, claims, tournaments,
                        bank, and the constitutional record — scoped to your office in the
                        BCCI → MPCA → Division → District hierarchy.
                    </p>
                    <div className="mt-7 flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-mpca-gold-light/70">
                        <span className="w-6 h-px bg-mpca-gold-light/40" />
                        <span>"खेल भावना से, राष्ट्र सम्मान से"</span>
                    </div>
                </div>

                {/* Footer — affiliations */}
                <div className="relative z-10 flex items-center justify-between text-xs text-mpca-ivory/55 mt-10">
                    <div>BCCI Affiliated · Est. 1957</div>
                    <div className="font-mono">v4.1.0</div>
                </div>
            </aside>

            {/* ───────── RIGHT: Login form ───────── */}
            <main className="lg:w-3/5 flex items-center justify-center px-6 sm:px-10 md:px-14 py-10 lg:py-12 bg-mpca-ivory">
                <div className="w-full max-w-xl">
                    {/* Form header */}
                    <div className="mb-8" data-testid="login-form-header">
                        <div className="overline">Authentication</div>
                        <h1 className="font-serif text-3xl md:text-4xl text-mpca-green-dark mt-2 leading-tight">
                            Welcome back.
                        </h1>
                        <p className="text-sm text-mpca-gray-dark mt-2">
                            Sign in to your registrar account or use a demo persona to explore the system.
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
                        {/* Email */}
                        <div>
                            <label htmlFor="email" className="block text-[11px] tracking-[0.18em] uppercase text-mpca-gray-dark mb-2">
                                Registrar Email
                            </label>
                            <div className="relative">
                                <Mail
                                    size={16}
                                    strokeWidth={1.5}
                                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mpca-gray pointer-events-none"
                                />
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@mpcaonline.com"
                                    autoComplete="email"
                                    data-testid="login-email-input"
                                    className="w-full pl-10 pr-4 py-3 bg-mpca-ivory border border-mpca-brass/50 text-mpca-charcoal placeholder:text-mpca-gray/70 focus:outline-none focus:border-mpca-oxblood focus:ring-2 focus:ring-mpca-oxblood/20 transition-all font-sans"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="password" className="block text-[11px] tracking-[0.18em] uppercase text-mpca-gray-dark">
                                    Password
                                </label>
                                <button
                                    type="button"
                                    className="text-[11px] text-mpca-oxblood hover:underline tracking-wide"
                                    onClick={() => setError("Password recovery is not enabled in demo mode — use a quick-access persona below.")}
                                    data-testid="login-forgot-link"
                                >
                                    Forgot?
                                </button>
                            </div>
                            <div className="relative">
                                <Lock
                                    size={16}
                                    strokeWidth={1.5}
                                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mpca-gray pointer-events-none"
                                />
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    data-testid="login-password-input"
                                    className="w-full pl-10 pr-11 py-3 bg-mpca-ivory border border-mpca-brass/50 text-mpca-charcoal placeholder:text-mpca-gray/70 focus:outline-none focus:border-mpca-oxblood focus:ring-2 focus:ring-mpca-oxblood/20 transition-all font-sans"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-mpca-gray hover:text-mpca-green-dark"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    data-testid="login-password-toggle"
                                >
                                    {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                                </button>
                            </div>
                        </div>

                        {/* Selected role indicator */}
                        <div className="flex items-center justify-between bg-mpca-parchment/60 border border-mpca-brass/40 px-4 py-3">
                            <div>
                                <div className="text-[10px] tracking-[0.2em] uppercase text-mpca-gray-dark">
                                    Signing in as
                                </div>
                                <div className="font-serif text-mpca-green-dark mt-0.5" data-testid="login-selected-persona">
                                    {selectedPersona.honorific} {selectedPersona.name}
                                    <span className="text-mpca-gray-dark text-sm">
                                        {" · "}{selectedPersona.title}
                                    </span>
                                </div>
                            </div>
                            <div className="overline text-mpca-oxblood">
                                {selectedPersona.body_type === "Public" ? "Public" : selectedPersona.body_type}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div
                                className="flex items-start gap-2.5 text-sm text-mpca-burgundy-dark bg-mpca-burgundy-dark/5 border-l-2 border-mpca-burgundy-dark px-3 py-2.5"
                                data-testid="login-error"
                            >
                                <AlertCircle size={15} strokeWidth={1.75} className="flex-shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            data-testid="login-submit-btn"
                            className="w-full bg-mpca-green-dark hover:bg-mpca-green-light text-mpca-ivory font-serif text-base tracking-wide py-3.5 flex items-center justify-center gap-2 transition-colors border-2 border-mpca-green-dark hover:border-mpca-oxblood group"
                        >
                            <span>Sign in to the Registrar</span>
                            <ArrowRight size={16} strokeWidth={1.75} className="transition-transform group-hover:translate-x-1" />
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-8" data-testid="login-divider">
                        <div className="flex-1 h-px bg-mpca-brass/40" />
                        <div className="text-[10px] tracking-[0.25em] uppercase text-mpca-gray font-sans">
                            Or use a demo persona
                        </div>
                        <div className="flex-1 h-px bg-mpca-brass/40" />
                    </div>

                    {/* Persona quick-access grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="persona-quick-grid">
                        {PERSONAS.map((p) => (
                            <PersonaChip
                                key={p.id}
                                persona={p}
                                onSelect={handleQuickAccess}
                                active={selectedPersona.id === p.id}
                            />
                        ))}
                    </div>

                    {/* Footnote */}
                    <div className="mt-8 text-center text-[11px] text-mpca-gray italic font-serif">
                        Selecting a demo persona auto-fills the form. Click <strong>Sign In</strong> to enter the registrar.
                        Production will replace this with MPCA-issued credentials & MFA.
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Login;
