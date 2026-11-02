import { useState } from "react";
import { urlApi } from "../api/client";
import ScoreBadge from "../components/ScoreBadge";
import ScoreBreakdown from "../components/ScoreBreakdown";
import { FiSearch } from "react-icons/fi";

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyze(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await urlApi.analyze(url);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not analyze that URL.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <h1 style={{ fontSize: 24 }}>Analyze a URL</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        Paste any link to get its live phishing risk score.
      </p>

      <form onSubmit={handleAnalyze} className="glass-card analyze-form">
        <input
          type="text"
          placeholder="https://example.com/login"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ whiteSpace: "nowrap" }}>
          <FiSearch size={14} style={{ marginRight: 6 }} />
          {loading ? "Scanning…" : "Analyze"}
        </button>
      </form>

      {loading && (
        <div className="glass-card" style={{ padding: 20, marginTop: 20 }}>
          <div className="skeleton" style={{ height: 20, width: "40%", marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 14, width: "80%", marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 14, width: "60%" }} />
        </div>
      )}

      {error && (
        <div className="glass-card" style={{ padding: 20, marginTop: 20, borderColor: "var(--dangerous)" }}>
          <p style={{ color: "var(--dangerous)", margin: 0 }}>{error}</p>
        </div>
      )}

      {result && !loading && (
        <div className="glass-card" style={{ padding: 24, marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>{result.domain}</p>
              <h2 style={{ margin: "4px 0" }}>{result.score}/100</h2>
            </div>
            <ScoreBadge level={result.level} />
          </div>
          <h4 style={{ marginBottom: 8 }}>Why:</h4>
          <ul style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
            {result.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <ScoreBreakdown breakdown={result.breakdown} />
        </div>
      )}
    </div>
  );
}
