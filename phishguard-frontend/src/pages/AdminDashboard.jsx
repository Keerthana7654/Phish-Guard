import { useEffect, useState } from "react";
import { adminApi } from "../api/client";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import ScoreBadge from "../components/ScoreBadge";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .getStats()
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load stats."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <p style={{ color: "var(--dangerous)" }}>{error}</p>
      </div>
    );
  }

  const chartData = {
    labels: ["Safe", "Moderate", "Suspicious", "Dangerous"],
    datasets: [
      {
        data: [stats.safeCount, stats.moderateCount, stats.suspiciousCount, stats.dangerousCount],
        backgroundColor: ["#16a34a", "#ca8a04", "#ea580c", "#dc2626"],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div className="page-container">
      <h1 style={{ fontSize: 24 }}>Admin Dashboard</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>Threat overview across all users.</p>

      <div className="stats-grid">
        <StatCard label="Total scans" value={stats.totalScans} />
        <StatCard label="Safe" value={stats.safeCount} color="var(--safe)" />
        <StatCard label="Moderate" value={stats.moderateCount} color="var(--moderate)" />
        <StatCard label="Suspicious" value={stats.suspiciousCount} color="var(--suspicious)" />
        <StatCard label="Dangerous" value={stats.dangerousCount} color="var(--dangerous)" />
      </div>

      <div className="two-col-grid">
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>Threat distribution</h3>
          <div style={{ maxWidth: 280, margin: "0 auto" }}>
            <Doughnut data={chartData} />
          </div>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>Most targeted domains</h3>
          {stats.mostTargetedDomains?.length ? (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
              {stats.mostTargetedDomains.map((d, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--card-border)",
                  }}
                >
                  <span style={{ wordBreak: "break-all" }}>{d.domain}</span>
                  <span style={{ color: "var(--muted)" }}>{d.count} scans</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>No suspicious/dangerous scans yet.</p>
          )}
        </div>
      </div>

      <div className="glass-card" style={{ padding: 24, marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Latest dangerous threats</h3>
        {stats.latestThreats?.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "8px 0" }}>Domain</th>
                <th>Score</th>
                <th>Detected</th>
              </tr>
            </thead>
            <tbody>
              {stats.latestThreats.map((t) => (
                <tr key={t.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "8px 0", wordBreak: "break-all" }}>{t.domain}</td>
                  <td><ScoreBadge level={t.level} score={t.score} /></td>
                  <td style={{ color: "var(--muted)" }}>{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No dangerous URLs detected yet.</p>
        )}
      </div>

      <AllScans />
    </div>
  );
}

function StatCard({ label, value, color = "var(--text)" }) {
  return (
    <div className="glass-card" style={{ padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}


/**
 * Every scan recorded by the backend, newest first, from every client —
 * the Chrome extension, the Android app, the web dashboard, any device.
 * Extension and app scans are anonymous (neither requires login), so they
 * show as "Anonymous" in the Scanned by column.
 */
function AllScans() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    adminApi
      .getAllHistory(page, 20)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || "Failed to load scan history."))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ marginTop: 0 }}>All scanned links</h3>
        {data && <span style={{ fontSize: 12, color: "var(--muted)" }}>{data.totalElements} total</span>}
      </div>
      {error && <p style={{ color: "var(--dangerous)", fontSize: 13 }}>{error}</p>}
      {loading ? (
        [...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 36, marginBottom: 8 }} />)
      ) : data?.content?.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "8px 8px 8px 0" }}>Link</th>
                <th>Result</th>
                <th>Scanned by</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.content.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "8px 8px 8px 0", maxWidth: 340, wordBreak: "break-all" }} title={e.url}>
                    {e.url.length > 70 ? e.url.slice(0, 70) + "…" : e.url}
                  </td>
                  <td><ScoreBadge level={e.level} score={e.score} /></td>
                  <td style={{ color: "var(--muted)" }}>{e.scannedBy || "Anonymous (extension / app)"}</td>
                  <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>No links have been scanned yet.</p>
      )}
      {data && data.totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center", alignItems: "center" }}>
          <button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Page {page + 1} of {data.totalPages}</span>
          <button className="btn btn-secondary" disabled={page + 1 >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
