/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
    theme: {
        extend: {
            fontFamily: {
                serif: ['"Nunito"', '"Fraunces"', "system-ui", "sans-serif"],
                sans: ['"Nunito"', "system-ui", "sans-serif"],
                mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            colors: {
                // ==== Institutional Warm Palette (Feb 2026) ====
                // Rebound to the DL palette from /app/frontend/src/lib/designSystem.jsx
                // so every page using the legacy `mpca-*` tokens instantly inherits
                // the tournament-section aesthetic (ivory + emerald + gold + oxblood).
                // Naming preserved for backwards-compat across 55+ pages.
                "mpca-green-dark": "#0D3B2E",     // DL.emerald — dominant dark
                "mpca-navy": "#0D3B2E",           // Alias → emerald (was BCCI navy)
                "mpca-cream": "#FBF8F1",          // DL.paper (card bg)
                "mpca-cream-dark": "#EDE5D3",     // DL.paperEdge (subtle border)
                "mpca-gray-light": "#EDE5D3",     // paperEdge tone (was cool navy-grey)
                "mpca-green-deep": "#0E1F1B",     // DL.ink — deepest ink
                "mpca-gold-dark": "#8A6420",      // Darker gold for high-contrast tokens
                "mpca-saffron": "#B88328",        // DL.gold (was #ff6a13 saffron)
                "mpca-green": "#1F2E28",          // DL.ink2 — secondary text
                "mpca-green-light": "#2E3B34",    // DL.ink3 — tertiary text
                "mpca-oxblood": "#8B1F1F",        // DL.danger — real oxblood red (was mis-labeled saffron)
                "mpca-burgundy-dark": "#8B1F1F",  // DL.danger
                "mpca-brass": "#B88328",          // DL.gold
                "mpca-brass-light": "#D4A017",    // Warm accent for backgrounds on dark
                "mpca-gold": "#B88328",           // DL.gold
                "mpca-gold-light": "#E8CE7A",     // Very light gold — subtle tints
                "mpca-ivory": "#F5EFE6",          // DL.ivory — page background
                "mpca-parchment": "#FBF8F1",      // DL.paper — card body
                "mpca-wood-dark": "#0E1F1B",      // DL.ink — deepest ink for footers
                "mpca-charcoal": "#0E1F1B",       // DL.ink
                "mpca-gray-dark": "#4C5750",      // DL.muted — secondary
                "mpca-gray": "#4C5750",           // DL.muted
                // Direct semantic aliases (kept for pages that reference them literally)
                "bcci-navy": "#0D3B2E",           // Historical alias → now emerald
                "saffron": "#B88328",             // Historical alias → now gold
                "marigold": "#D4A017",            // Kept marigold hue
                "maroon": "#8B1F1F",              // Real maroon/oxblood
                "warm-cream": "#F5EFE6",          // Alias for ivory
                // ==== HUD palette (design-preview only) ====
                "hud-base": "#0A1118",
                "hud-surface": "#111A24",
                "hud-elev": "#1A2634",
                "hud-panel": "#1E293B",
                "hud-border": "#334155",
                "hud-saffron": "#FF8A00",
                "hud-marigold": "#FFB703",
                "hud-crimson": "#E63946",
                "hud-pitch": "#2A9D8F",
                "hud-cyan": "#00B4D8",
                "hud-oxblood": "#4A0404",
                "hud-text": "#F8FAFC",
                "hud-text-2": "#94A3B8",
                "hud-text-3": "#64748B",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
            },
            keyframes: {
                "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
                "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
