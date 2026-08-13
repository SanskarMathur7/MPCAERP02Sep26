// ─────────────────────────────────────────────────────────────────────
// MPCA Brand Marks
// ─────────────────────────────────────────────────────────────────────
// The Madhya Pradesh Cricket Association shared the official logo files
// with us in Aug 2026. We use them everywhere the ERP shows the MPCA
// mark — sidebar crest, login page, member cards, verify page,
// disclosures, and every printable form's letterhead.
//
// Files (served from /app/frontend/public/):
//   • /assets/mpca-logo.png   — canonical logo (emblem + "MPCA" wordmark, light bg)
//   • /assets/mpca-logo.jpg   — same, JPG variant
//   • /brand/mpca-logo.jpg    — canonical (mirror)
//   • /brand/mpca-emblem-dark.jpg — emblem-only variant on a dark background
//
// Two React exports:
//   <MpcaEmblem />   — small icon-sized mark, sized via className.
//                      Uses the emblem+wordmark JPG so tiny renders
//                      still read as "MPCA".
//   <MpcaLogoMark /> — larger official brand mark for public / print surfaces.
//
// Both accept `className` for sizing (e.g. "w-16 h-16 object-contain").

export const MpcaEmblem = ({ className = "", title = "MPCA Emblem" }) => (
    <img
        src="/assets/mpca-logo.png"
        alt={title}
        className={className}
        loading="lazy"
        decoding="async"
    />
);

export const MpcaLogoMark = ({ className = "", alt = "Madhya Pradesh Cricket Association" }) => (
    <img
        src="/assets/mpca-logo.png"
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
    />
);

export default MpcaEmblem;
