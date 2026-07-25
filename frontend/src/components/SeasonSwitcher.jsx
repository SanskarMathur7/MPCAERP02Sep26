import { useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Loader2 } from "lucide-react";
import { useSeason } from "@/context/SeasonContext";

/**
 * Sprint M27 · Season Switcher
 * ─────────────────────────────
 * Top-right dropdown that lets the user pivot the entire ERP to a different
 * cricketing season (Aug → Jul). Changing the season prompts a confirmation
 * because it re-fetches every data list on the current page (potentially
 * losing unsaved form state).
 */
const SeasonSwitcher = () => {
    const { season, setSeason, seasons } = useSeason();
    const [pendingSeason, setPendingSeason] = useState(null);
    const [applying, setApplying] = useState(false);

    const onDropdownChange = (e) => {
        const next = e.target.value;
        if (next && next !== season) setPendingSeason(next);
    };

    const confirm = () => {
        setApplying(true);
        setSeason(pendingSeason);
        // Small delay so the dropdown visibly reflects the new state before
        // React refetches. Then hard reload the current route by dispatching
        // a `season:changed` event that pages can listen to (or simply reload).
        setTimeout(() => {
            try { window.dispatchEvent(new CustomEvent("mpca:season-changed", { detail: pendingSeason })); } catch { /* noop */ }
            // Fallback — page reload guarantees every list refetches with the
            // new fiscal_cycle. This is the least-surprise UX; if the user
            // is on a heavy form it will lose work, hence the confirm above.
            window.location.reload();
        }, 100);
    };

    const cancel = () => setPendingSeason(null);

    return (
        <>
            <div className="flex items-center gap-1.5 border border-mpca-brass/40 bg-mpca-ivory px-2 py-1" data-testid="season-switcher">
                <CalendarClock size={12} className="text-mpca-brass" />
                <select
                    value={season}
                    onChange={onDropdownChange}
                    className="bg-transparent text-[11px] font-mono text-mpca-green-dark focus:outline-none pr-1 cursor-pointer"
                    aria-label="Cricketing season"
                    data-testid="season-switcher-select"
                >
                    {seasons.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            {pendingSeason && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed inset-0 bg-mpca-charcoal/60 z-[100] flex items-center justify-center p-4"
                    data-testid="season-confirm-backdrop"
                    onClick={() => !applying && cancel()}
                >
                    <div
                        className="bg-mpca-ivory max-w-md w-full border border-mpca-brass shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="season-confirm-modal"
                    >
                        <div className="bg-mpca-green-dark text-mpca-gold-light px-4 py-2">
                            <div className="overline text-[9px] opacity-80">MPCA · Season Change</div>
                            <div className="font-serif text-base">Switch cricketing season?</div>
                        </div>
                        <div className="p-4 text-[12px] text-mpca-charcoal space-y-2">
                            <p>
                                You are about to switch from{" "}
                                <b className="font-mono text-mpca-oxblood">{season}</b> to{" "}
                                <b className="font-mono text-mpca-oxblood">{pendingSeason}</b>.
                            </p>
                            <p className="text-mpca-gray-dark">
                                Every list, dashboard chart, tournament, calendar, budget and claim
                                will re-fetch scoped to <b>{pendingSeason}</b>. Any <b>unsaved
                                changes on this page will be lost</b>. Continue?
                            </p>
                        </div>
                        <div className="px-4 py-3 bg-mpca-cream/40 border-t border-mpca-brass/20 flex items-center justify-end gap-2">
                            <button
                                onClick={cancel}
                                disabled={applying}
                                className="text-[10px] uppercase tracking-widest border border-mpca-brass/40 text-mpca-brass px-3 py-1.5"
                                data-testid="season-confirm-cancel"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirm}
                                disabled={applying}
                                className="text-[10px] uppercase tracking-widest bg-mpca-oxblood text-mpca-ivory px-3 py-1.5 flex items-center gap-1"
                                data-testid="season-confirm-apply"
                            >
                                {applying ? <Loader2 size={11} className="animate-spin" /> : <CalendarClock size={11} />}
                                Switch to {pendingSeason}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default SeasonSwitcher;
