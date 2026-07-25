import React from "react";

/**
 * H8 · App-wide error boundary.
 *
 * Before this, a render-time throw in any page unmounted the whole React tree
 * and left the user staring at a blank white screen with no way to recover.
 * This boundary catches those errors, shows a friendly fallback with a reload
 * action, and keeps the failure contained to a recoverable state.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Surface for debugging; a real logger/telemetry sink can hook in here.
        // eslint-disable-next-line no-console
        console.error("Unhandled render error:", error, errorInfo);
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div
                role="alert"
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    background: "#f8fafc",
                    color: "#0f172a",
                }}
            >
                <div style={{ maxWidth: "460px", textAlign: "center" }}>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>
                        Something went wrong
                    </h1>
                    <p style={{ fontSize: "14px", color: "#475569", marginBottom: "20px" }}>
                        An unexpected error occurred while rendering this page. Your data is
                        safe. Please reload — if it keeps happening, contact the administrator.
                    </p>
                    <button
                        onClick={this.handleReload}
                        style={{
                            padding: "10px 20px",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#ffffff",
                            background: "#1e3a8a",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                        }}
                    >
                        Reload page
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
