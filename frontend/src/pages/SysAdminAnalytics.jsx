/**
 * SysAdminAnalytics.jsx — Iter 111 · Full performance + compliance console.
 * Tabs: Overview · Usage · Journeys · Health · Security · Compliance · Backups.
 * SysAdmin-only surface — every data call returns 403 for other roles.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PageShell, PageEyebrow, DL, embossedCard } from "@/lib/designSystem";
import {
    Activity, Server, Shield, Users, Database, Cloud, CheckCircle2, AlertTriangle, XCircle,
    Clock, TrendingUp, Route, HardDrive, Cpu, MemoryStick, RefreshCw, Play,
} from "lucide-react";

const TABS = [
    { id: "overview",   label: "Overview",   icon: TrendingUp },
    { id: "usage",      label: "Usage",      icon: Users },
    { id: "journeys",   label: "Journeys",   icon: Route },
    { id: "health",     label: "Health",     icon: Server },
    { id: "security",   label: "Security",   icon: Shield },
    { id: "compliance", label: "Compliance", icon: CheckCircle2 },
    { id: "backups",    label: "Backups",    icon: Cloud },
];

const statusColor = (s) => s === "pass" ? DL.emerald : s === "warn" ? DL.gold : DL.danger;
const statusIcon = (s) => s === "pass" ? CheckCircle2 : s === "warn" ? AlertTriangle : XCircle;

const KPI = ({ icon: Icon, label, value, sub, tone = "ink", testid }) => (
    <div data-testid={testid} style={{ ...embossedCard(), padding: 18, minWidth: 160, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: DL.muted }}>
            <Icon size={14} />
            <span style={{ fontFamily: DL.fontMono, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: tone === "danger" ? DL.danger : tone === "gold" ? DL.gold : DL.ink, lineHeight: 1 }}>
            {value}
        </div>
        {sub && <div style={{ fontSize: 12, color: DL.muted, marginTop: 6 }}>{sub}</div>}
    </div>
);

const formatUptime = (secs) => {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
};

// ═══════════════ Overview ═══════════════
function Overview({ data }) {
    if (!data) return <div>Loading…</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <KPI icon={Clock}    label="Uptime"          value={formatUptime(data.uptime_seconds)} sub={new Date(data.app_started_at).toLocaleString()} testid="sa-kpi-uptime" />
                <KPI icon={Users}    label="Users"           value={`${data.users_active}/${data.users_total}`} sub="active / total" testid="sa-kpi-users" />
                <KPI icon={Activity} label="Requests"        value={data.requests_total} sub={`${data.latency_p95_ms} ms · p95`} testid="sa-kpi-reqs" />
                <KPI icon={AlertTriangle} label="Error rate" value={`${data.error_rate_pct}%`} tone={data.error_rate_pct > 1 ? "danger" : "ink"} testid="sa-kpi-error" />
                <KPI icon={Route}    label="Audit 24h"       value={data.audit_events_24h} sub={`${data.audit_events_7d} in 7d`} testid="sa-kpi-audit" />
                <KPI icon={Shield}   label="Failed logins"   value={data.failed_logins_recent} tone={data.failed_logins_recent > 5 ? "gold" : "ink"} sub="rolling window" testid="sa-kpi-fail" />
            </div>
        </div>
    );
}

// ═══════════════ Usage ═══════════════
function Usage({ data }) {
    if (!data) return <div>Loading…</div>;
    const max = Math.max(...(data.top_users.map(u => u.events)), 1);
    const daySeries = data.events_per_day;
    const maxDay = Math.max(...daySeries.map(d => d.count), 1);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ ...embossedCard(), padding: 18 }} data-testid="sa-top-users">
                    <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Top users (last {data.days}d)</h3>
                    {data.top_users.map(u => (
                        <div key={u.actor} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ minWidth: 200, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.actor}</div>
                            <div style={{ flex: 1, height: 8, background: "rgba(14,31,27,0.08)", borderRadius: 4 }}>
                                <div style={{ width: `${100 * u.events / max}%`, height: "100%", background: DL.emerald, borderRadius: 4 }} />
                            </div>
                            <div style={{ fontFamily: DL.fontMono, fontSize: 12, fontWeight: 700, minWidth: 40, textAlign: "right" }}>{u.events}</div>
                        </div>
                    ))}
                </div>
                <div style={{ ...embossedCard(), padding: 18 }} data-testid="sa-top-actions">
                    <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Top actions</h3>
                    {data.top_actions.slice(0, 12).map(a => (
                        <div key={a.action} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, borderBottom: `1px solid ${DL.rule}` }}>
                            <span style={{ fontFamily: DL.fontMono }}>{a.action}</span>
                            <b>{a.count}</b>
                        </div>
                    ))}
                </div>
            </div>
            <div style={{ ...embossedCard(), padding: 18 }} data-testid="sa-events-per-day">
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Activity per day (last {data.days}d)</h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
                    {daySeries.map(d => (
                        <div key={d.date} title={`${d.date}: ${d.count}`}
                             style={{ flex: 1, background: DL.gold, height: `${100 * d.count / maxDay}%`, minHeight: 2, borderRadius: 2 }} />
                    ))}
                </div>
                <div style={{ fontSize: 11, color: DL.muted, marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                    <span>{daySeries[0]?.date}</span>
                    <span>{daySeries[daySeries.length - 1]?.date}</span>
                </div>
            </div>
            <div style={{ ...embossedCard(), padding: 18 }} data-testid="sa-recent-logins">
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Recent logins</h3>
                <table style={{ width: "100%", fontSize: 12 }}>
                    <thead>
                        <tr style={{ textAlign: "left", color: DL.muted, borderBottom: `1px solid ${DL.rule}` }}>
                            <th style={{ padding: 4 }}>When</th><th>Email</th><th>Role</th><th>IP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.recent_logins.slice().reverse().map((l, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${DL.rule}` }}>
                                <td style={{ padding: 4, fontFamily: DL.fontMono, fontSize: 11 }}>{new Date(l.at).toLocaleString()}</td>
                                <td>{l.email}</td>
                                <td style={{ fontFamily: DL.fontMono, fontSize: 11 }}>{l.role}</td>
                                <td style={{ fontFamily: DL.fontMono, fontSize: 11 }}>{l.ip}</td>
                            </tr>
                        ))}
                        {data.recent_logins.length === 0 && (
                            <tr><td colSpan={4} style={{ padding: 10, color: DL.muted, textAlign: "center" }}>No login data captured yet — will populate as users sign in.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ═══════════════ Journeys ═══════════════
function Journeys({ data }) {
    if (!data) return <div>Loading…</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="sa-journeys">
            <div style={{ fontSize: 13, color: DL.muted }}>{data.actors_seen} unique actors observed · showing top {data.journeys.length} by activity</div>
            {data.journeys.map((j, i) => (
                <div key={i} style={{ ...embossedCard(), padding: 14 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{j.actor}</div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {j.steps.map((s, k) => (
                            <span key={k} style={{
                                padding: "3px 8px", background: "rgba(13,59,46,0.10)",
                                border: `1px solid ${DL.emerald}`, color: DL.emerald,
                                borderRadius: 3, fontSize: 11, fontFamily: DL.fontMono, fontWeight: 700,
                            }} title={s.at}>
                                {s.action}
                            </span>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════ Health ═══════════════
function Health({ data }) {
    if (!data) return <div>Loading…</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <KPI icon={Cpu}       label="CPU"      value={`${data.cpu_percent}%`} tone={data.cpu_percent > 80 ? "danger" : "ink"} testid="sa-h-cpu" />
                <KPI icon={MemoryStick} label="Memory" value={`${data.memory.percent}%`} sub={`${data.memory.used_mb} / ${data.memory.total_mb} MB`} testid="sa-h-mem" />
                <KPI icon={HardDrive} label="Disk"     value={`${data.disk.percent}%`} sub={`${data.disk.used_gb} / ${data.disk.total_gb} GB`} testid="sa-h-disk" />
                <KPI icon={Activity}  label="Load 1m"  value={data.load_avg["1m"].toFixed(2)} sub={`5m ${data.load_avg["5m"].toFixed(2)} · 15m ${data.load_avg["15m"].toFixed(2)}`} testid="sa-h-load" />
                <KPI icon={Database}  label="DB Ping"  value={`${data.db_ping_ms}ms`} testid="sa-h-ping" />
                <KPI icon={Clock}     label="Uptime"   value={formatUptime(data.uptime_seconds)} testid="sa-h-uptime" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ ...embossedCard(), padding: 18 }} data-testid="sa-db-stats">
                    <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>MongoDB stats</h3>
                    <table style={{ width: "100%", fontSize: 13 }}>
                        <tbody>
                            <tr><td style={{ color: DL.muted, padding: 3 }}>Collections</td><td style={{ textAlign: "right", fontWeight: 700 }}>{data.db.collections}</td></tr>
                            <tr><td style={{ color: DL.muted, padding: 3 }}>Documents</td><td style={{ textAlign: "right", fontWeight: 700 }}>{data.db.objects?.toLocaleString()}</td></tr>
                            <tr><td style={{ color: DL.muted, padding: 3 }}>Indexes</td><td style={{ textAlign: "right", fontWeight: 700 }}>{data.db.indexes}</td></tr>
                            <tr><td style={{ color: DL.muted, padding: 3 }}>Data size</td><td style={{ textAlign: "right", fontWeight: 700 }}>{data.db.data_size_mb} MB</td></tr>
                            <tr><td style={{ color: DL.muted, padding: 3 }}>Storage size</td><td style={{ textAlign: "right", fontWeight: 700 }}>{data.db.storage_size_mb} MB</td></tr>
                            <tr><td style={{ color: DL.muted, padding: 3 }}>Index size</td><td style={{ textAlign: "right", fontWeight: 700 }}>{data.db.index_size_mb} MB</td></tr>
                        </tbody>
                    </table>
                </div>
                <div style={{ ...embossedCard(), padding: 18 }} data-testid="sa-top-routes">
                    <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Top routes</h3>
                    {data.top_routes.slice(0, 10).map(r => (
                        <div key={r.path} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, borderBottom: `1px solid ${DL.rule}` }}>
                            <span style={{ fontFamily: DL.fontMono, fontSize: 11 }}>{r.path}</span>
                            <span><b>{r.hits}</b>{r.errors > 0 && <span style={{ color: DL.danger, marginLeft: 6 }}>({r.errors} err)</span>}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div style={{ ...embossedCard(), padding: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Latency (ms)</h3>
                <div style={{ display: "flex", gap: 20 }}>
                    <div>avg: <b>{data.requests.latency_ms.avg}</b></div>
                    <div>p50: <b>{data.requests.latency_ms.p50}</b></div>
                    <div>p95: <b>{data.requests.latency_ms.p95}</b></div>
                    <div>p99: <b>{data.requests.latency_ms.p99}</b></div>
                    <div style={{ color: DL.muted }}>samples: {data.requests.latency_ms.samples}</div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════ Security ═══════════════
function Security({ data }) {
    if (!data) return <div>Loading…</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="sa-security">
            <div style={{ ...embossedCard(), padding: 20, display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{
                    width: 92, height: 92, borderRadius: "50%",
                    background: `conic-gradient(${data.score >= 80 ? DL.emerald : data.score >= 50 ? DL.gold : DL.danger} ${data.score * 3.6}deg, rgba(14,31,27,0.08) 0)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                    <div style={{ width: 72, height: 72, borderRadius: "50%", background: DL.paper, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 24 }}>
                        {data.score}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>Posture Score</div>
                    <div style={{ fontSize: 13, color: DL.muted }}>
                        {data.checks_pass} passed · {data.checks_warn} warn · <span style={{ color: DL.danger, fontWeight: 700 }}>{data.checks_fail} failing</span>
                    </div>
                </div>
            </div>
            <div style={{ ...embossedCard(), padding: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Controls</h3>
                {data.checks.map(c => {
                    const Icon = statusIcon(c.status);
                    return (
                        <div key={c.id} data-testid={`sa-check-${c.id}`} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${DL.rule}`, alignItems: "flex-start" }}>
                            <Icon size={16} color={statusColor(c.status)} style={{ marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
                                <div style={{ fontSize: 11, color: DL.muted }}>{c.detail}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {data.failed_logins_recent.length > 0 && (
                <div style={{ ...embossedCard(), padding: 18 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Recent failed logins</h3>
                    <table style={{ width: "100%", fontSize: 12 }}>
                        <tbody>
                            {data.failed_logins_recent.slice().reverse().slice(0, 15).map((f, i) => (
                                <tr key={i} style={{ borderBottom: `1px solid ${DL.rule}` }}>
                                    <td style={{ padding: 4, fontFamily: DL.fontMono, fontSize: 11 }}>{new Date(f.at).toLocaleString()}</td>
                                    <td>{f.email}</td>
                                    <td style={{ fontFamily: DL.fontMono, fontSize: 11 }}>{f.ip}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ═══════════════ Compliance ═══════════════
function Compliance({ data }) {
    if (!data) return <div>Loading…</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="sa-compliance">
            <div style={{ ...embossedCard(), padding: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Compliance controls</div>
                <div style={{ fontSize: 13, color: DL.muted, marginBottom: 12 }}>Score {data.score}/100 · covers audit, retention, encryption, backups.</div>
                {data.controls.map(c => {
                    const Icon = statusIcon(c.status);
                    return (
                        <div key={c.id} data-testid={`sa-control-${c.id}`} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${DL.rule}`, alignItems: "flex-start" }}>
                            <Icon size={16} color={statusColor(c.status)} style={{ marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
                                <div style={{ fontSize: 11, color: DL.muted, marginTop: 2 }}>{c.evidence}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════ Backups ═══════════════
function Backups({ data, onTrigger, triggering }) {
    if (!data) return <div>Loading…</div>;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="sa-backups">
            <div style={{ ...embossedCard(), padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Backup provider</div>
                    <div style={{ fontSize: 12, color: DL.muted, marginTop: 2 }}>{data.storage_provider}</div>
                </div>
                <button
                    data-testid="sa-trigger-backup"
                    onClick={onTrigger}
                    disabled={triggering}
                    style={{
                        padding: "10px 18px", background: DL.emerald, color: "#fff", border: `1px solid ${DL.emerald}`,
                        borderRadius: 4, fontWeight: 700, fontSize: 13, cursor: triggering ? "wait" : "pointer",
                        display: "inline-flex", alignItems: "center", gap: 6, opacity: triggering ? 0.6 : 1,
                    }}>
                    <Play size={13} /> {triggering ? "Queueing…" : "Trigger backup"}
                </button>
            </div>
            <div style={{ ...embossedCard(), padding: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Recent backups</h3>
                {data.backups.length === 0 ? (
                    <div style={{ color: DL.muted, fontSize: 13, padding: 12, textAlign: "center" }}>
                        No backups yet — trigger one to seed the log.
                    </div>
                ) : (
                    <table style={{ width: "100%", fontSize: 12 }}>
                        <thead>
                            <tr style={{ textAlign: "left", color: DL.muted, borderBottom: `1px solid ${DL.rule}` }}>
                                <th style={{ padding: 4 }}>ID</th><th>Kind</th><th>Started</th><th>By</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.backups.map(b => (
                                <tr key={b.id} style={{ borderBottom: `1px solid ${DL.rule}` }}>
                                    <td style={{ padding: 4, fontFamily: DL.fontMono, fontSize: 11 }}>{b.id}</td>
                                    <td>{b.kind}</td>
                                    <td style={{ fontFamily: DL.fontMono, fontSize: 11 }}>{new Date(b.started_at).toLocaleString()}</td>
                                    <td>{b.triggered_by}</td>
                                    <td><span style={{ color: DL.gold, fontWeight: 700 }}>{b.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{ marginTop: 12, fontSize: 11, color: DL.muted }}>{data.notes}</div>
            </div>
        </div>
    );
}

export default function SysAdminAnalytics() {
    const [tab, setTab] = useState("overview");
    const [data, setData] = useState({});
    const [err, setErr] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [triggering, setTriggering] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true); setErr(null);
        try {
            const [o, u, j, h, s, c, b] = await Promise.all([
                api.get("/sysadmin/overview"),
                api.get("/sysadmin/usage?days=30"),
                api.get("/sysadmin/journeys"),
                api.get("/sysadmin/system-health"),
                api.get("/sysadmin/security"),
                api.get("/sysadmin/compliance"),
                api.get("/sysadmin/backups"),
            ]);
            setData({
                overview: o.data, usage: u.data, journeys: j.data,
                health: h.data, security: s.data, compliance: c.data, backups: b.data,
            });
        } catch (e) {
            setErr(e?.response?.data?.detail || String(e));
        } finally { setRefreshing(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const triggerBackup = async () => {
        setTriggering(true);
        try {
            await api.post("/sysadmin/backups/trigger");
            const r = await api.get("/sysadmin/backups");
            setData(d => ({ ...d, backups: r.data }));
        } catch (e) {
            alert(e?.response?.data?.detail || String(e));
        } finally { setTriggering(false); }
    };

    return (
        <PageShell testid="sysadmin-analytics-shell">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <PageEyebrow title="System Analytics" meta="SysAdmin · Performance & Compliance" />
                <button
                    data-testid="sa-refresh"
                    onClick={load}
                    disabled={refreshing}
                    style={{
                        padding: "8px 14px", background: "transparent", border: `1px solid ${DL.rule}`,
                        borderRadius: 4, fontWeight: 700, fontSize: 13, cursor: refreshing ? "wait" : "pointer",
                        display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
                </button>
            </div>
            {err && <div style={{ padding: 12, color: DL.danger, fontWeight: 700 }} data-testid="sa-error">{err}</div>}

            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${DL.rule}`, flexWrap: "wrap" }}>
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            data-testid={`sa-tab-${t.id}`}
                            onClick={() => setTab(t.id)}
                            style={{
                                padding: "10px 16px", background: "transparent", border: "none",
                                borderBottom: active ? `2px solid ${DL.emerald}` : "2px solid transparent",
                                color: active ? DL.emerald : DL.muted,
                                fontWeight: 700, fontSize: 13, cursor: "pointer",
                                display: "inline-flex", alignItems: "center", gap: 6,
                            }}>
                            <Icon size={14} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === "overview"   && <Overview   data={data.overview} />}
            {tab === "usage"      && <Usage      data={data.usage} />}
            {tab === "journeys"   && <Journeys   data={data.journeys} />}
            {tab === "health"     && <Health     data={data.health} />}
            {tab === "security"   && <Security   data={data.security} />}
            {tab === "compliance" && <Compliance data={data.compliance} />}
            {tab === "backups"    && <Backups    data={data.backups} onTrigger={triggerBackup} triggering={triggering} />}
        </PageShell>
    );
}
