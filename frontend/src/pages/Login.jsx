import { useNavigate } from "react-router-dom";
import { PERSONAS, useAuth } from "@/context/AuthContext";
import { ChevronRight, ShieldCheck, Building2, MapPin, Landmark } from "lucide-react";
import { MpcaEmblem } from "@/components/MpcaEmblem";

// Indian cricket palette per accent
const ACCENT_STYLES = {
    navy: {
        bg: "var(--mpca-green-dark)",
        text: "var(--mpca-ivory)",
        sub: "rgba(246,217,122,0.85)",
        accent: "var(--mpca-brass)",
        border: "rgba(255,106,19,0.7)",
        ring: "var(--mpca-oxblood)",
    },
    saffron: {
        bg: "var(--mpca-oxblood)",
        text: "var(--mpca-ivory)",
        sub: "rgba(251,247,237,0.9)",
        accent: "var(--mpca-gold-light)",
        border: "rgba(251,247,237,0.4)",
        ring: "var(--mpca-gold-light)",
    },
    marigold: {
        bg: "#d4a017",
        text: "var(--mpca-green-dark)",
        sub: "rgba(10,31,61,0.78)",
        accent: "var(--mpca-green-dark)",
        border: "rgba(10,31,61,0.4)",
        ring: "var(--mpca-oxblood)",
    },
    maroon: {
        bg: "var(--mpca-burgundy-dark)",
        text: "var(--mpca-ivory)",
        sub: "rgba(246,217,122,0.85)",
        accent: "var(--mpca-brass)",
        border: "rgba(233,185,73,0.5)",
        ring: "var(--mpca-brass)",
    },
    "navy-light": {
        bg: "var(--mpca-green-light)",
        text: "var(--mpca-ivory)",
        sub: "rgba(246,217,122,0.85)",
        accent: "var(--mpca-brass)",
        border: "rgba(233,185,73,0.5)",
        ring: "var(--mpca-oxblood)",
    },
    cream: {
        bg: "var(--mpca-ivory)",
        text: "var(--mpca-green-dark)",
        sub: "var(--mpca-gray-dark)",
        accent: "var(--mpca-oxblood)",
        border: "rgba(233,185,73,0.55)",
        ring: "var(--mpca-oxblood)",
    },
};

const TIER_ICONS = {
    State: Landmark,
    Division: Building2,
    District: MapPin,
    Public: ShieldCheck,
};

const PersonaCard = ({ persona, onSelect }) => {
    const s = ACCENT_STYLES[persona.accent] || ACCENT_STYLES.navy;
    const TierIcon = TIER_ICONS[persona.body_type] || ShieldCheck;
    const initials = persona.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("");

    return (
        <button
            onClick={() => onSelect(persona)}
            data-testid={`persona-${persona.id}-card`}
            className="group relative text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ minHeight: "340px", "--tw-ring-color": s.ring }}
        >
            <div
                className="absolute inset-0 border-2 transition-all duration-300 group-hover:border-mpca-oxblood"
                style={{
                    backgroundColor: s.bg,
                    borderColor: s.border,
                }}
            />

            {/* Top tricolour stripe */}
            <div className="absolute top-0 left-0 right-0 h-1 flex">
                <span className="flex-1" style={{ background: "var(--mpca-oxblood)" }} />
                <span className="flex-1" style={{ background: "var(--mpca-ivory)" }} />
                <span className="flex-1" style={{ background: "#138808" }} />
            </div>

            <div className="relative p-7 h-full flex flex-col pt-9" style={{ color: s.text }}>
                <div className="flex items-start justify-between">
                    <div
                        className="font-serif text-2xl leading-none w-12 h-12 flex items-center justify-center border-2 rounded-sm"
                        style={{ borderColor: s.border, color: s.accent }}
                    >
                        {initials}
                    </div>
                    <div className="flex items-center gap-2 overline" style={{ color: s.accent }}>
                        <TierIcon size={14} strokeWidth={1.75} />
                        <span className="text-[10px]">{persona.body_type}</span>
                    </div>
                </div>

                <div className="mt-7">
                    <div className="overline mb-1" style={{ color: s.sub, opacity: 0.7 }}>
                        {persona.honorific && persona.honorific + " ·"} {persona.title}
                    </div>
                    <div className="font-serif text-2xl leading-tight" style={{ color: s.text }}>
                        {persona.name}
                    </div>
                    <div className="text-xs mt-2 tracking-wider uppercase font-semibold" style={{ color: s.sub }}>
                        {persona.post}
                    </div>
                    {persona.body_name && (
                        <div className="mt-3 inline-block text-[10px] tracking-[0.18em] uppercase px-2 py-1 border" style={{ borderColor: s.border, color: s.accent }}>
                            {persona.body_name}
                        </div>
                    )}
                </div>

                <div className="mt-auto pt-5 border-t" style={{ borderColor: s.border }}>
                    <p className="text-xs leading-relaxed mb-4" style={{ color: s.sub }}>
                        {persona.scope}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {persona.privileges.slice(0, 3).map((p) => (
                            <span
                                key={p}
                                className="text-[9px] tracking-[0.15em] uppercase px-2 py-1 border font-semibold"
                                style={{ borderColor: s.border, color: s.accent }}
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                </div>

                <div
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1 text-[10px] tracking-[0.2em] uppercase font-bold"
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
            {/* Header — Navy with saffron underline */}
            <header className="bg-mpca-green-dark text-mpca-ivory px-8 md:px-16 py-6 border-b-4 border-mpca-oxblood">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <a href="/" className="flex items-center gap-3 group">
                        <MpcaEmblem className="w-10 h-12 text-mpca-brass" />
                        <div>
                            <div className="font-serif text-lg">MPCA</div>
                            <div className="overline text-[9px] !text-mpca-gold-light/80">
                                ERP · System of Records
                            </div>
                        </div>
                    </a>
                    <div className="flex items-center gap-2 text-xs tracking-wider text-mpca-gold-light/80">
                        <ShieldCheck size={14} strokeWidth={1.5} />
                        <span>Demo Mode · Select a Persona</span>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-8 md:px-16 py-16">
                <div className="text-center mb-14 stately-reveal">
                    <div className="overline mb-4">Authentication · Demonstration</div>
                    <h1 className="font-serif text-4xl md:text-5xl text-mpca-green-dark leading-tight">
                        Sign in to your <em className="text-mpca-oxblood not-italic">cricketing office</em>.
                    </h1>
                    <p className="mt-4 text-mpca-gray-dark max-w-2xl mx-auto">
                        Choose the body you represent — State HQ, Division, or District.
                        Each persona is scoped to the data and approvals appropriate to
                        their level in the MPCA hierarchy.
                    </p>
                    <div className="crest-divider mt-10 max-w-xs mx-auto" />
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stately-reveal" data-delay="2">
                    {PERSONAS.map((p) => (
                        <PersonaCard key={p.id} persona={p} onSelect={handleSelect} />
                    ))}
                </div>

                <div className="mt-16 text-center">
                    <div className="overline">A Footnote</div>
                    <p className="mt-3 text-sm text-mpca-gray-dark italic font-serif max-w-2xl mx-auto">
                        Demo personas are illustrative. Production will replace this with
                        MPCA-controlled credentials and MFA per the RBAC plan.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Login;
