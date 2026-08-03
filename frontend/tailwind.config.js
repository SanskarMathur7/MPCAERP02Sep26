/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
    theme: {
        extend: {
            fontFamily: {
                serif: ['"Fraunces"', '"Cormorant Garamond"', "Georgia", "serif"],
                sans: ['"Inter"', '"Bricolage Grotesque"', "system-ui", "sans-serif"],
                mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            colors: {
                // ==== Indian Cricket Palette ====
                // Tokens keep their existing names for backward-compat across the codebase,
                // but now resolve to BCCI-inspired colours (navy / saffron / marigold / maroon / cream).
                "mpca-green-dark": "#0a1f3d",     // BCCI Navy (dominant)
                "mpca-green": "#0e2747",          // Navy-2
                "mpca-green-light": "#163558",    // Navy-3
                "mpca-oxblood": "#ff6a13",        // Indian Saffron (high-pop accent)
                "mpca-burgundy-dark": "#7a1f2c",  // Maroon
                "mpca-brass": "#b8860b",          // Dark goldenrod (legible on cream)
                "mpca-brass-light": "#e9b949",   // Original marigold — for backgrounds/accents on dark
                "mpca-gold": "#d4a017",           // Marigold-Deep
                "mpca-gold-light": "#f6d97a",     // Marigold-Light
                "mpca-ivory": "#fbf7ed",          // Warm Cream
                "mpca-parchment": "#f1ead7",      // Cream
                "mpca-wood-dark": "#06122a",      // Ink (deeper than navy, for footers)
                "mpca-charcoal": "#1a1a1a",
                "mpca-gray-dark": "#3d4a5f",
                "mpca-gray": "#6b7a90",
                // Direct semantic aliases
                "bcci-navy": "#0a1f3d",
                "saffron": "#ff6a13",
                "marigold": "#e9b949",
                "maroon": "#7a1f2c",
                "warm-cream": "#fbf7ed",
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
