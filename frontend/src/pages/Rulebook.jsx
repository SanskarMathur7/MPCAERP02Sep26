import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Download, FileText, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import CricketLoader from "@/components/CricketLoader";

const API = process.env.REACT_APP_BACKEND_URL;

const Rulebook = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const { data: r } = await api.get("/rulebook");
                setData(r);
            } catch (e) {
                setError(e?.response?.data?.detail || e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <CricketLoader />;
    if (error) {
        return (
            <div className="space-y-4">
                <div className="overline">Article XIV · AI Rulebook</div>
                <div className="bulletin-card p-6 text-mpca-oxblood">{error}</div>
            </div>
        );
    }

    const modified = data.modified_at ? new Date(data.modified_at).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    }) : "—";

    return (
        <div className="space-y-8" data-testid="rulebook-page">
            <header className="space-y-3">
                <div className="overline">AI Rulebook · Approval Matrix</div>
                <h1 className="font-serif text-5xl text-mpca-green-dark leading-tight">
                    Grant Approval Matrix
                </h1>
                <p className="text-sm text-mpca-charcoal max-w-3xl leading-relaxed">
                    The source-of-truth rulebook the AI Gatekeeper reads on every grant claim submission. Every required document, every auto-reject trigger, and every decision code lives here. Edits to this file are picked up on the next claim — no code change required.
                </p>
            </header>

            <div className="bulletin-card p-6 flex flex-wrap items-center gap-4" data-testid="rulebook-meta-bar">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} strokeWidth={1.5} className="text-mpca-oxblood" />
                    <span className="text-xs font-semibold tracking-wider uppercase">Version</span>
                    <span className="font-mono text-xs text-mpca-charcoal">{data.version}</span>
                </div>
                <div className="text-mpca-brass/40">·</div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-wider uppercase">Last edited</span>
                    <span className="font-mono text-xs text-mpca-charcoal">{modified}</span>
                </div>
                <div className="text-mpca-brass/40">·</div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-wider uppercase">Size</span>
                    <span className="font-mono text-xs text-mpca-charcoal">{(data.size_bytes / 1024).toFixed(1)} KB</span>
                </div>

                <div className="ml-auto flex gap-2">
                    <a
                        href={`${API}/api/rulebook/download.pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="rulebook-download-pdf"
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wider uppercase border border-mpca-oxblood text-mpca-oxblood hover:bg-mpca-oxblood hover:text-mpca-ivory transition-colors"
                    >
                        <Download size={13} strokeWidth={1.5} />
                        PDF
                    </a>
                    <a
                        href={`${API}/api/rulebook/download.md`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="rulebook-download-md"
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wider uppercase border border-mpca-brass text-mpca-brass hover:bg-mpca-brass hover:text-mpca-ivory transition-colors"
                    >
                        <FileText size={13} strokeWidth={1.5} />
                        Markdown
                    </a>
                </div>
            </div>

            <article className="bulletin-card p-10 rulebook-prose" data-testid="rulebook-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {data.markdown}
                </ReactMarkdown>
            </article>

            <footer className="text-xs text-mpca-gray-dark border-t border-mpca-brass/20 pt-4">
                <BookOpen size={11} className="inline mr-2" strokeWidth={1.5} />
                Source: <code className="font-mono text-[10px] text-mpca-charcoal">{data.path}</code>
            </footer>
        </div>
    );
};

export default Rulebook;
