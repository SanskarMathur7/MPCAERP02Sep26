import { useNavigate } from "react-router-dom";
import { PERSONAS, useAuth } from "@/context/AuthContext";
import { ChevronRight, ShieldCheck } from "lucide-react";

const PITCH_TEXTURE = "url('https://static.prod-images.emergentagent.com/jobs/152b2070-1a30-4f04-95c7-4d26fa8ac612/images/006d8e6e2750829d93b81c24cc15a67d5c4bd05efa0d02575d5bd2574bd85827.png')";
const WOOD_TEXTURE = "url('https://static.prod-images.emergentagent.com/jobs/152b2070-1a30-4f04-95c7-4d26fa8ac612/images/b98a340e69b7a7bf56b395768a44425db8c876edd0194e80d32af3cf0b913c33.png')";

const ACCENT_STYLES = {
    green: {
        bg: "var(--mpca-green-dark)",
        overlay: "rgba(15,41,30,0.85)",
        texture: PITCH_TEXTURE,
        text: "var(--mpca-ivory)",
        sub: "rgba(238,220,154,0.85)",
        accent: "var(--mpca-gold-light)",
        border: "rgba(197,160,89,0.6)",
    },
    oxblood: {
        bg: "var(--mpca-burgundy-dark)",
        overlay: "rgba(74,21,30,0.85)",
        texture: WOOD_TEXTURE,
        text: "var(--mpca-ivory)",
        sub: "rgba(238,220,154,0.85)",
        accent: "var(--mpca-gold-light)",
        border: "rgba(197,160,89,0.6)",
    },
    brass: {
        bg: "#a8842a",
        overlay: "rgba(168,132,42,0.8)",
        texture: WOOD_TEXTURE,
        text: "var(--mpca-green-dark)",
        sub: "rgba(15,41,30,0.75)",
        accent: "var(--mpca-green-dark)",
        border: "rgba(15,41,30,0.4)",
    },
    wood: {
        bg: "var(--mpca-wood-dark)",
        overlay: "rgba(28,20,15,0.8)",
        texture: WOOD_TEXTURE,
        text: "var(--mpca-ivory)",
        sub: "rgba(238,220,154,0.85)",
        accent: "var(--mpca-brass)",
        border: "rgba(197,160,89,0.5)",
    },
    ivory: {
        bg: "var(--mpca-ivory)",
        overlay: "rgba(253,251,247,0.6)",
        texture: "",
        text: "var(--mpca-green-dark)",
        sub: "var(--mpca-gray-dark)",
        accent: "var(--mpca-oxblood)",
        border: "rgba(197,160,89,0.6)",
    },
    parchment: {
        bg: "var(--mpca-parchment)",
        overlay: "rgba(244,241,234,0.5)",
        texture: "",
        text: "var(--mpca-green-dark)",
        sub: "var(--mpca-gray-dark)",
        accent: "var(--mpca-brass)",
        border: "rgba(197,160,89,0.5)",
    },
};

const PersonaCard = ({ persona, onSelect }) => {
    const s = ACCENT_STYLES[persona.accent];
    const initials = persona.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("");
    return (
        <button
            onClick={() => onSelect(persona)}
            data-testid={`persona-${persona.id}-card`}
            className="group relative text-left transition-all duration-500 hover:-translate-y-1 focus:outline-none"
            style={{ minHeight: "320px" }}
        >
            <div
                className="absolute inset-0 border transition-all duration-500 group-hover:border-mpca-gold"
                style={{
                    backgroundColor: s.bg,
                    backgroundImage: s.texture,
                    backgroundSize: "cover",
                    borderColor: s.border,
                }}
            />
            {s.texture && (
                <div
                    className="absolute inset-0"
                    style={{ backgroundColor: s.overlay }}
                />
            )}

            {/* Corner brass tacks */}
            <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.accent, opacity: 0.6 }} />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.accent, opacity: 0.6 }} />
            <span className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.accent, opacity: 0.6 }} />
            <span className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.accent, opacity: 0.6 }} />

            <div className="relative p-7 h-full flex flex-col" style={{ color: s.text }}>
                <div className="flex items-start justify-between">
                    <div
                        className="font-serif text-2xl leading-none w-12 h-12 flex items-center justify-center border"
                        style={{ borderColor: s.border, color: s.accent }}
                    >
                        {initials}
                    </div>
                    <div className="overline" style={{ color: s.accent }}>
                        Persona
                    </div>
                </div>

                <div className="mt-8">
                    <div className="overline mb-1" style={{ color: s.sub, opacity: 0.7 }}>
                        {persona.honorific && persona.honorific + " ·"}{" "}
                        {persona.title}
                    </div>
                    <div className="font-serif text-2xl leading-tight" style={{ color: s.text }}>
                        {persona.name}
                    </div>
                    <div className="text-xs mt-2 tracking-wider uppercase" style={{ color: s.sub }}>
                        {persona.post}
                    </div>
                </div>

                <div className="mt-auto pt-6 border-t" style={{ borderColor: s.border }}>
                    <p className="text-xs leading-relaxed mb-4" style={{ color: s.sub }}>
                        {persona.scope}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {persona.privileges.slice(0, 3).map((p) => (
                            <span
                                key={p}
                                className="text-[9px] tracking-[0.15em] uppercase px-2 py-1 border"
                                style={{ borderColor: s.border, color: s.accent }}
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                </div>

                <div
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase"
                    style={{ color: s.accent }}
                >
                    Sign In <ChevronRight size={12} />
                </div>
            </div>
        </button>
    );
};

const Login = () => {
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSelect = (persona) => {
        login(persona);
        if (persona.id === "public") {
            navigate("/disclosures");
        } else {
            navigate("/dashboard");
        }
    };

    return (
        <div className="min-h-screen bg-mpca-ivory relative" data-testid="login-page">
            {/* Header band */}
            <header className="bg-mpca-green-dark text-mpca-ivory px-8 md:px-16 py-6 border-b border-mpca-brass/30">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <a href="/" className="flex items-center gap-3 group">
                        <svg viewBox="0 0 64 64" className="w-9 h-9 text-mpca-brass" fill="none" strokeWidth={1.25}>
                            <circle cx="32" cy="32" r="30" stroke="currentColor" />
                            <line x1="26" y1="22" x2="26" y2="42" stroke="currentColor" />
                            <line x1="32" y1="22" x2="32" y2="42" stroke="currentColor" />
                            <line x1="38" y1="22" x2="38" y2="42" stroke="currentColor" />
                            <line x1="24" y1="22" x2="34" y2="22" stroke="currentColor" />
                            <line x1="30" y1="22" x2="40" y2="22" stroke="currentColor" />
                            <circle cx="46" cy="38" r="3" stroke="currentColor" fill="currentColor" fillOpacity="0.4" />
                        </svg>
                        <div>
                            <div className="font-serif text-lg">MPCA</div>
                            <div className="overline text-[9px] text-mpca-gold-light/70">
                                The Pavilion
                            </div>
                        </div>
                    </a>
                    <div className="flex items-center gap-2 text-xs tracking-wider text-mpca-gold-light/70">
                        <ShieldCheck size={14} strokeWidth={1.5} />
                        <span>Demo Mode · Select a Persona</span>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-8 md:px-16 py-16">
                <div className="text-center mb-14 stately-reveal">
                    <div className="overline mb-4">Authentication · Demo</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark leading-tight">
                        Choose your blazer pocket.
                    </h1>
                    <p className="mt-4 text-mpca-gray-dark max-w-2xl mx-auto">
                        For the demonstration phase, sign in by selecting one of the
                        association's roles. Gmail-based authentication will be enabled
                        in a forthcoming release.
                    </p>
                    <div className="crest-divider mt-10 max-w-xs mx-auto" />
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stately-reveal" data-delay="2">
                    {PERSONAS.map((p) => (
                        <PersonaCard key={p.id} persona={p} onSelect={handleSelect} />
                    ))}
                </div>

                <div className="mt-16 text-center">
                    <div className="overline">A Quiet Footnote</div>
                    <p className="mt-3 text-sm text-mpca-gray-dark italic font-serif max-w-2xl mx-auto">
                        Each persona is bound, by the constitution, to a different set of
                        privileges. In Phase 1 we extend uniform read-access; granular
                        RBAC will be enforced from Phase 2 onwards.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Login;
