import { Link } from "react-router-dom";
import { ChevronRight, ScrollText, Users, Vote, Landmark, Sparkles } from "lucide-react";
import { MpcaEmblem as MPCAEmblem, MpcaLogoMark } from "@/components/MpcaEmblem";

const PILLARS = [
    { icon: Users, label: "Membership & Players", note: "Register · Eligibility · BCCI sync" },
    { icon: ScrollText, label: "Constitution & Disclosures", note: "Article-wise · Auditable" },
    { icon: Vote, label: "AGM · Committee · Elections", note: "Quorum · Tenure · Cooling Period" },
    { icon: Landmark, label: "Finance & Grants", note: "District → Division → MPCA flow" },
    { icon: Sparkles, label: "Player Module & AI (Roadmap)", note: "Eligibility · OCR · Compliance" },
];

const Landing = () => {
    return (
        <div className="min-h-screen relative overflow-hidden" data-testid="landing-page">
            {/* Top crest banner */}
            <header className="absolute top-0 inset-x-0 z-20 px-8 md:px-16 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3 text-mpca-ivory">
                    <MPCAEmblem className="w-9 h-9 text-mpca-brass" />
                    <div className="leading-tight">
                        <div className="font-serif text-lg">MPCA</div>
                        <div className="overline text-[9px] text-mpca-gold-light/80">
                            Madhya Pradesh Cricket Association
                        </div>
                    </div>
                </div>
                <Link to="/login" data-testid="header-enter-btn" className="btn-heritage-secondary !text-mpca-gold-light !border-mpca-brass/60 hover:!bg-white/5">
                    Sign In
                    <ChevronRight size={14} strokeWidth={1.5} />
                </Link>
            </header>

            {/* HERO — Pitch Green Field */}
            <section
                className="relative min-h-screen flex items-center"
                style={{
                    backgroundImage: `linear-gradient(135deg, rgba(15,41,30,0.92) 0%, rgba(10,30,21,0.96) 60%, rgba(15,41,30,0.92) 100%), url('https://images.unsplash.com/photo-1512719994953-eabf50895df7?w=2000&q=85')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            >
                {/* Texture overlay */}
                <div
                    className="absolute inset-0 opacity-30 mix-blend-multiply"
                    style={{
                        backgroundImage:
                            "url('https://static.prod-images.emergentagent.com/jobs/152b2070-1a30-4f04-95c7-4d26fa8ac612/images/006d8e6e2750829d93b81c24cc15a67d5c4bd05efa0d02575d5bd2574bd85827.png')",
                        backgroundSize: "cover",
                    }}
                />
                {/* Subtle vignette */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-mpca-green-dark/80 pointer-events-none" />

                <div className="relative z-10 max-w-7xl mx-auto px-8 md:px-16 py-32 grid lg:grid-cols-12 gap-12 items-center w-full">
                    <div className="lg:col-span-7 stately-reveal text-mpca-ivory">
                        <div className="overline mb-6 !text-mpca-gold-light">
                            BCCI Affiliated · Est. 1957
                        </div>
                        <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl leading-[1.05] text-mpca-ivory">
                            From <em className="text-mpca-oxblood not-italic font-medium">Holkar</em><br />
                            to every <em className="text-mpca-gold-light not-italic font-medium">maidan</em><br />
                            of Madhya Pradesh.
                        </h1>
                        <p className="mt-8 max-w-xl text-mpca-ivory/85 text-lg leading-relaxed font-light">
                            The unified ERP of the Madhya Pradesh Cricket Association — BCCI HQ,
                            10 divisions, 54 districts — one ledger, one register, one source of truth
                            for selections, finances, tournaments, and compliance.
                        </p>

                        <div className="mt-12 flex flex-wrap items-center gap-4">
                            <Link to="/login" data-testid="hero-enter-btn" className="btn-heritage-primary">
                                Sign In
                                <ChevronRight size={14} strokeWidth={1.5} />
                            </Link>
                            <Link to="/disclosures-public" data-testid="hero-disclosures-btn" className="btn-heritage-secondary !text-mpca-gold-light !border-mpca-brass/60 hover:!bg-white/5">
                                Public Disclosures
                            </Link>
                        </div>

                        <div className="mt-16 grid grid-cols-3 gap-8 max-w-xl">
                            <div>
                                <div className="font-serif text-3xl text-mpca-oxblood">10</div>
                                <div className="overline text-[9px] mt-2 !text-mpca-ivory/60 !text-mpca-gold-light">Divisions</div>
                            </div>
                            <div>
                                <div className="font-serif text-3xl text-mpca-gold-light">54</div>
                                <div className="overline text-[9px] mt-2 !text-mpca-ivory/60 !text-mpca-gold-light">Districts</div>
                            </div>
                            <div>
                                <div className="font-serif text-3xl text-mpca-ivory">10</div>
                                <div className="overline text-[9px] mt-2 !text-mpca-ivory/60 !text-mpca-gold-light">Core Modules</div>
                            </div>
                        </div>
                    </div>

                    {/* Emblem panel */}
                    <div className="lg:col-span-5 flex justify-center stately-reveal" data-delay="2">
                        <div
                            className="relative p-12 border border-mpca-brass/30 max-w-md w-full"
                            style={{
                                backgroundImage:
                                    "url('https://static.prod-images.emergentagent.com/jobs/152b2070-1a30-4f04-95c7-4d26fa8ac612/images/b98a340e69b7a7bf56b395768a44425db8c876edd0194e80d32af3cf0b913c33.png')",
                                backgroundSize: "cover",
                                boxShadow: "0 0 0 1px rgba(197,160,89,0.15), 0 30px 60px -20px rgba(0,0,0,0.6)",
                            }}
                        >
                            <div className="absolute inset-0 bg-mpca-green-dark/70" />
                            <div className="relative flex flex-col items-center text-mpca-ivory">
                                <div className="w-32 h-32 bg-mpca-ivory rounded-full flex items-center justify-center p-3 shadow-2xl ring-1 ring-mpca-brass/40 emblem-pulse">
                                    <MpcaLogoMark className="w-full h-full object-contain" alt="MPCA Official Emblem" />
                                </div>
                                <div className="mt-6 overline !text-mpca-gold-light">
                                    Madhya Pradesh
                                </div>
                                <div className="mt-1 font-serif text-2xl text-mpca-ivory">
                                    Cricket Association
                                </div>
                                <div className="crest-divider w-full mt-5 mb-5" />
                                <div className="text-xs italic text-mpca-ivory/85 font-serif tracking-wider">
                                    "खेल भावना से, राष्ट्र सम्मान से"
                                </div>
                                <div className="overline text-[9px] mt-2 !text-mpca-gold-light/70">
                                    With Sport · With Honour
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* PILLARS */}
            <section className="bg-mpca-ivory py-24 md:py-32 px-8 md:px-16 relative">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16 stately-reveal">
                        <div className="overline mb-4">The System</div>
                        <h2 className="font-serif text-4xl md:text-5xl text-mpca-green-dark max-w-3xl mx-auto leading-tight">
                            Sixteen instruments of governance, bound into one ledger.
                        </h2>
                        <div className="crest-divider mt-10 max-w-xs mx-auto" />
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-px bg-mpca-brass/20 border border-mpca-brass/20">
                        {PILLARS.map((p, i) => (
                            <div
                                key={p.label}
                                className="bg-mpca-ivory p-8 hover:bg-mpca-parchment transition-colors duration-500 group stately-reveal"
                                data-delay={Math.min(i + 1, 5)}
                                data-testid={`pillar-${i}`}
                            >
                                <p.icon className="text-mpca-brass mb-6 group-hover:text-mpca-green-dark transition-colors duration-500" size={28} strokeWidth={1.25} />
                                <div className="font-serif text-xl text-mpca-green-dark leading-tight mb-2">
                                    {p.label}
                                </div>
                                <div className="text-xs text-mpca-gray-dark tracking-wide">
                                    {p.note}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* QUOTE STRIP */}
            <section className="bg-mpca-green-dark text-mpca-ivory py-20 px-8 md:px-16 relative overflow-hidden">
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage:
                            "url('https://static.prod-images.emergentagent.com/jobs/152b2070-1a30-4f04-95c7-4d26fa8ac612/images/006d8e6e2750829d93b81c24cc15a67d5c4bd05efa0d02575d5bd2574bd85827.png')",
                        backgroundSize: "cover",
                    }}
                />
                <div className="relative max-w-4xl mx-auto text-center">
                    <span className="font-serif text-7xl text-mpca-oxblood leading-none">"</span>
                    <blockquote className="font-serif text-2xl md:text-3xl italic leading-relaxed text-mpca-ivory mt-2">
                        From the maidans of every district to the floodlights at Holkar Stadium —
                        every signature, every selection, every rupee, accounted for.
                    </blockquote>
                    <div className="overline mt-8 !text-mpca-gold-light/90">
                        — Charter of the MPCA ERP
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-mpca-wood-dark text-mpca-ivory/70 py-12 px-8 md:px-16">
                <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <MPCAEmblem className="w-8 h-8 text-mpca-brass" />
                        <div>
                            <div className="font-serif text-mpca-ivory">MPCA · ERP System</div>
                            <div className="overline text-[9px] mt-1 !text-mpca-gold-light/60">
                                Version 1.0 · Phase I of V
                            </div>
                        </div>
                    </div>
                    <div className="text-xs tracking-wide">
                        © Madhya Pradesh Cricket Association · Affiliated to BCCI
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
