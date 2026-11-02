import { useEffect, useState } from "react";
import { historyApi } from "../api/client";
import ScoreBadge from "../components/ScoreBadge";

export default function History() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    historyApi
      .getMine(page, 15)
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="page-container">
      <h1 style={{ fontSize: 24 }}>Scan History</h1>
      <p style={{ color: "var(--muted)", marginBottom: 20 }}>Every URL you've analyzed.</p>

      <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 20 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8 }} />
            ))}
          </div>
        ) : data?.content?.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", borderBottom: "1px solid var(--card-border)" }}>
                <th style={{ padding: "12px 16px" }}>Domain</th>
                <th>Score</th>
                <th>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {data.content.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td style={{ padding: "12px 16px", wordBreak: "break-all" }}>{entry.domain}</td>
                  <td><ScoreBadge level={entry.level} score={entry.score} /></td>
                  <td style={{ color: "var(--muted)" }}>{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ padding: 20, color: "var(--muted)" }}>No scans yet — analyze a URL from the Dashboard.</p>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
          <button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span style={{ alignSelf: "center", color: "var(--muted)", fontSize: 13 }}>
            Page {page + 1} of {data.totalPages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={page + 1 >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
