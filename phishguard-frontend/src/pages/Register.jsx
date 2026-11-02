import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, password, fullName);
      navigate("/dashboard");
    } catch (err) {
      const details = err.response?.data?.details;
      const msg = details && typeof details === "object"
        ? Object.values(details)[0]
        : err.response?.data?.error;
      setError(msg || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 400, paddingTop: 60 }}>
      <div className="glass-card" style={{ padding: 32 }}>
        <h2 style={{ marginTop: 0 }}>Create your account</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Password (min 8 characters)</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <p style={{ color: "var(--dangerous)", fontSize: 13 }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Sign Up"}
          </button>
        </form>
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 18 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
