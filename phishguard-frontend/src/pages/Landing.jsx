import { Link } from "react-router-dom";
import { FiShield, FiZap, FiEye, FiLock } from "react-icons/fi";

export default function Landing() {
  return (
    <div className="page-container" style={{ textAlign: "center", paddingTop: 60 }}>
      <FiShield size={56} color="var(--accent)" />
      <h1 className="landing-title">
        Real-Time Phishing <span style={{ color: "var(--accent)" }}>Link Analyzer</span>
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 16, maxWidth: 560, margin: "0 auto 32px" }}>
        PhishGuard scores any URL for phishing risk using typosquat detection,
        brand-impersonation heuristics, and optional live threat-intel lookups —
        the same engine that powers the Chrome extension.
      </p>
      <div className="landing-actions">
        <Link to="/register" className="btn btn-primary" style={{ padding: "12px 24px" }}>
          Get Started
        </Link>
        <Link to="/login" className="btn btn-secondary" style={{ padding: "12px 24px" }}>
          Login
        </Link>
      </div>

      <div className="feature-grid">
        <Feature icon={<FiZap />} title="Instant scoring" text="0–100 risk score across 9+ heuristic checks, no API keys required." />
        <Feature icon={<FiEye />} title="Live threat intel" text="Optional Google Safe Browsing, VirusTotal, AbuseIPDB, WHOIS lookups." />
        <Feature icon={<FiLock />} title="JWT-secured" text="Your scan history and admin analytics are protected behind auth." />
      </div>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return (
    <div className="glass-card" style={{ padding: 24, textAlign: "left" }}>
      <div style={{ color: "var(--accent)", marginBottom: 10 }}>{icon}</div>
      <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>{text}</p>
    </div>
  );
}
